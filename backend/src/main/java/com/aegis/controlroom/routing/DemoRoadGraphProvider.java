package com.aegis.controlroom.routing;

import com.aegis.controlroom.model.Roadblock;
import com.aegis.controlroom.repository.RoadblockRepository;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Demo stub. Labels every successful route SIMULATED.
 * When a verified, non-expired roadblock intersects the corridor, returns empty
 * (no invented detour).
 */
@Component
@ConditionalOnProperty(prefix = "aegis.routing", name = "provider", havingValue = "demo", matchIfMissing = true)
public class DemoRoadGraphProvider implements RoadGraphProvider {

    private final RoadblockRepository roadblockRepository;

    public DemoRoadGraphProvider(RoadblockRepository roadblockRepository) {
        this.roadblockRepository = roadblockRepository;
    }

    @Override
    public Optional<GraphRoute> routeAvoidingBlocks(
            double originLat, double originLng, double destLat, double destLng) {
        List<Roadblock> blocks = roadblockRepository.findByExpiresAtAfterAndVerifiedTrue(Instant.now());
        int intersecting = 0;
        for (Roadblock rb : blocks) {
            if (intersects(rb, originLat, originLng, destLat, destLng)) {
                intersecting++;
            }
        }
        if (intersecting > 0) {
            return Optional.empty();
        }
        double dist = HaversineDemoRoutingProvider.haversineKm(originLat, originLng, destLat, destLng) * 1.25;
        double eta = (dist / 35.0) * 60.0;
        return Optional.of(new GraphRoute(
                Math.round(dist * 100.0) / 100.0,
                Math.round(eta * 10.0) / 10.0,
                encodePolyline(originLat, originLng, destLat, destLng),
                0,
                "DemoRoadGraphProvider",
                true,
                List.of(new RoutePoint(originLat, originLng), new RoutePoint(destLat, destLng))));
    }

    private static String encodePolyline(double originLat, double originLng, double destLat, double destLng) {
        StringBuilder encoded = new StringBuilder();
        long previousLat = 0;
        long previousLng = 0;
        for (double[] point : new double[][]{{originLat, originLng}, {destLat, destLng}}) {
            long lat = Math.round(point[0] * 1e5);
            long lng = Math.round(point[1] * 1e5);
            encodeValue(lat - previousLat, encoded);
            encodeValue(lng - previousLng, encoded);
            previousLat = lat;
            previousLng = lng;
        }
        return encoded.toString();
    }

    private static void encodeValue(long value, StringBuilder output) {
        long shifted = value < 0 ? ~(value << 1) : value << 1;
        while (shifted >= 0x20) {
            output.append((char) ((0x20 | (shifted & 0x1f)) + 63));
            shifted >>= 5;
        }
        output.append((char) (shifted + 63));
    }

    private static boolean intersects(Roadblock rb, double oLat, double oLng, double dLat, double dLng) {
        double radiusKm = (rb.getRadiusMeters() != null ? rb.getRadiusMeters() : 100.0) / 1000.0;
        return distancePointToSegmentKm(rb.getLatitude(), rb.getLongitude(), oLat, oLng, dLat, dLng) <= radiusKm;
    }

    /** Approx closest-point distance from roadblock center to the origin→dest segment (km). */
    private static double distancePointToSegmentKm(
            double pLat, double pLng, double aLat, double aLng, double bLat, double bLng) {
        double abLat = bLat - aLat;
        double abLng = bLng - aLng;
        double abLen2 = abLat * abLat + abLng * abLng;
        if (abLen2 < 1e-18) {
            return HaversineDemoRoutingProvider.haversineKm(pLat, pLng, aLat, aLng);
        }
        double t = ((pLat - aLat) * abLat + (pLng - aLng) * abLng) / abLen2;
        t = Math.max(0.0, Math.min(1.0, t));
        return HaversineDemoRoutingProvider.haversineKm(pLat, pLng, aLat + t * abLat, aLng + t * abLng);
    }
}
