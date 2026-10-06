package com.aegis.controlroom.routing;

import com.aegis.controlroom.model.Roadblock;
import com.aegis.controlroom.repository.RoadblockRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/** Google Routes API integration. The API key is only used by this backend. */
@Component
@ConditionalOnProperty(prefix = "aegis.routing", name = "provider", havingValue = "google")
public class GoogleRoutesProvider implements RoadGraphProvider {
    private static final String COMPUTE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
    private static final String FIELD_MASK = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline";

    private final RestClient restClient;
    private final RoadblockRepository roadblockRepository;
    private final String apiKey;
    private final long cacheTtlNanos;
    private final ConcurrentHashMap<RouteKey, CacheEntry> cache = new ConcurrentHashMap<>();

    public GoogleRoutesProvider(@Qualifier("googleRoutesRestClient") RestClient restClient,
                                RoadblockRepository roadblockRepository,
                                @Value("${aegis.google-maps.routes-api-key:}") String apiKey,
                                @Value("${aegis.routing.cache-ttl-seconds:15}") long cacheTtlSeconds) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("AEGIS_ROUTING_PROVIDER=google requires GOOGLE_MAPS_API_KEY in the backend environment");
        }
        this.restClient = restClient;
        this.roadblockRepository = roadblockRepository;
        this.apiKey = apiKey;
        this.cacheTtlNanos = Math.max(0, cacheTtlSeconds) * 1_000_000_000L;
    }

    @Override
    public Optional<GraphRoute> routeAvoidingBlocks(double originLat, double originLng,
                                                     double destLat, double destLng) {
        RouteKey key = RouteKey.of(originLat, originLng, destLat, destLng);
        long now = System.nanoTime();
        CacheEntry cached = cache.get(key);
        if (cached != null && cached.expiresAtNanos() > now) return cached.route();
        if (cached != null) cache.remove(key, cached);

        Optional<GraphRoute> calculated = requestRoute(originLat, originLng, destLat, destLng);
        if (cacheTtlNanos > 0) {
            if (cache.size() >= 1024) cache.clear();
            cache.put(key, new CacheEntry(calculated, now + cacheTtlNanos));
        }
        return calculated;
    }

    private Optional<GraphRoute> requestRoute(double originLat, double originLng,
                                              double destLat, double destLng) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("origin", waypoint(originLat, originLng));
        request.put("destination", waypoint(destLat, destLng));
        request.put("travelMode", "DRIVE");
        request.put("routingPreference", "TRAFFIC_AWARE");
        request.put("departureTime", Instant.now().truncatedTo(ChronoUnit.SECONDS).toString());
        request.put("computeAlternativeRoutes", true);

        JsonNode response;
        try {
            response = restClient.post()
                    .uri(COMPUTE_ROUTES_URL)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-Goog-Api-Key", apiKey)
                    .header("X-Goog-FieldMask", FIELD_MASK)
                    .body(request)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientException exception) {
            throw new RoutingProviderUnavailableException(
                    "Google Maps routing is unavailable. Check the Routes API key, API access, billing, and network.", exception);
        }

        List<Roadblock> activeBlocks = roadblockRepository.findByExpiresAtAfterAndVerifiedTrue(Instant.now());
        JsonNode routes = response == null ? null : response.path("routes");
        if (routes == null || !routes.isArray()) return Optional.empty();

        int avoidedBlocks = 0;
        for (Roadblock block : activeBlocks) {
            if (intersects(block, originLat, originLng, destLat, destLng)) avoidedBlocks++;
        }
        for (JsonNode route : routes) {
            String encodedPolyline = route.path("polyline").path("encodedPolyline").asText("");
            List<RoutePoint> points = decodePolyline(encodedPolyline);
            if (points.size() < 2 || intersectsAny(activeBlocks, points)) continue;

            double distanceKm = route.path("distanceMeters").asDouble() / 1000.0;
            double durationSeconds = parseDurationSeconds(route.path("duration").asText());
            return Optional.of(new GraphRoute(
                    round(distanceKm, 2),
                    round(durationSeconds / 60.0, 1),
                    encodedPolyline,
                    avoidedBlocks,
                    providerName(),
                    false,
                    points));
        }
        return Optional.empty();
    }

    private record RouteKey(int originLat, int originLng, int destLat, int destLng) {
        private static RouteKey of(double originLat, double originLng, double destLat, double destLng) {
            return new RouteKey((int) Math.round(originLat * 1e5), (int) Math.round(originLng * 1e5),
                    (int) Math.round(destLat * 1e5), (int) Math.round(destLng * 1e5));
        }
    }

    private record CacheEntry(Optional<GraphRoute> route, long expiresAtNanos) { }

    @Override
    public String providerName() {
        return "GoogleRoutesAPI";
    }

    @Override
    public boolean simulated() {
        return false;
    }

    private static Map<String, Object> waypoint(double latitude, double longitude) {
        return Map.of("location", Map.of("latLng", Map.of("latitude", latitude, "longitude", longitude)));
    }

    private static double parseDurationSeconds(String duration) {
        if (duration == null || !duration.endsWith("s")) {
            throw new IllegalStateException("Google Routes API returned a duration in an unexpected format");
        }
        return Double.parseDouble(duration.substring(0, duration.length() - 1));
    }

    private static boolean intersectsAny(List<Roadblock> blocks, List<RoutePoint> points) {
        for (Roadblock block : blocks) {
            for (int i = 1; i < points.size(); i++) {
                RoutePoint a = points.get(i - 1);
                RoutePoint b = points.get(i);
                if (distancePointToSegmentKm(block.getLatitude(), block.getLongitude(),
                        a.latitude(), a.longitude(), b.latitude(), b.longitude()) <= radiusKm(block)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean intersects(Roadblock block, double originLat, double originLng,
                                      double destLat, double destLng) {
        return distancePointToSegmentKm(block.getLatitude(), block.getLongitude(), originLat, originLng,
                destLat, destLng) <= radiusKm(block);
    }

    private static double radiusKm(Roadblock block) {
        return (block.getRadiusMeters() == null ? 100.0 : block.getRadiusMeters()) / 1000.0;
    }

    private static double distancePointToSegmentKm(double pLat, double pLng,
                                                   double aLat, double aLng, double bLat, double bLng) {
        double meanLatRadians = Math.toRadians((aLat + bLat) / 2.0);
        double xScale = Math.cos(meanLatRadians);
        double ax = aLng * xScale;
        double ay = aLat;
        double bx = bLng * xScale;
        double by = bLat;
        double px = pLng * xScale;
        double py = pLat;
        double dx = bx - ax;
        double dy = by - ay;
        double lengthSquared = dx * dx + dy * dy;
        double t = lengthSquared == 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));
        return HaversineDemoRoutingProvider.haversineKm(pLat, pLng,
                ay + t * dy, (ax + t * dx) / xScale);
    }

    private static List<RoutePoint> decodePolyline(String encoded) {
        List<RoutePoint> points = new ArrayList<>();
        int index = 0;
        int latitude = 0;
        int longitude = 0;
        while (index < encoded.length()) {
            int[] decodedLatitude = decodeValue(encoded, index);
            latitude += decodedLatitude[0];
            index = decodedLatitude[1];
            int[] decodedLongitude = decodeValue(encoded, index);
            longitude += decodedLongitude[0];
            index = decodedLongitude[1];
            points.add(new RoutePoint(latitude / 1e5, longitude / 1e5));
        }
        return points;
    }

    private static int[] decodeValue(String encoded, int start) {
        int result = 0;
        int shift = 0;
        int index = start;
        int chunk;
        do {
            if (index >= encoded.length() || shift > 30) {
                throw new IllegalStateException("Google Routes API returned an invalid encoded polyline");
            }
            chunk = encoded.charAt(index++) - 63;
            result |= (chunk & 0x1f) << shift;
            shift += 5;
        } while (chunk >= 0x20);
        int delta = (result & 1) != 0 ? ~(result >> 1) : result >> 1;
        return new int[]{delta, index};
    }

    private static double round(double value, int digits) {
        double factor = Math.pow(10, digits);
        return Math.round(value * factor) / factor;
    }
}
