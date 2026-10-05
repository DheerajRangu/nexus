package com.aegis.controlroom.service;

import com.aegis.controlroom.model.Roadblock;
import com.aegis.controlroom.repository.RoadblockRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Service
public class RoutingService {

    private final RoadblockRepository roadblockRepository;

    public RoutingService(RoadblockRepository roadblockRepository) {
        this.roadblockRepository = roadblockRepository;
    }

    public Map<String, Object> calculateRoute(double originLat, double originLng, double destLat, double destLng) {
        List<Roadblock> activeRoadblocks = roadblockRepository.findByExpiresAtAfterAndVerifiedTrue(Instant.now());

        boolean containsRoadblock = false;
        String blockedSource = null;

        for (Roadblock rb : activeRoadblocks) {
            double distToOrigin = calculateDistanceKm(rb.getLatitude(), rb.getLongitude(), originLat, originLng);
            double distToDest = calculateDistanceKm(rb.getLatitude(), rb.getLongitude(), destLat, destLng);

            // Check if roadblock falls within route path corridor
            if (distToOrigin < 0.5 || distToDest < 0.5 || isPointNearLine(rb.getLatitude(), rb.getLongitude(), originLat, originLng, destLat, destLng)) {
                containsRoadblock = true;
                blockedSource = rb.getSource();
                break;
            }
        }

        double baseDistKm = calculateDistanceKm(originLat, originLng, destLat, destLng) * 1.25; // City road curvature factor
        double baseEtaMins = (baseDistKm / 35.0) * 60.0;

        Map<String, Object> routeResult = new HashMap<>();
        routeResult.put("origin", Map.of("lat", originLat, "lng", originLng));
        routeResult.put("destination", Map.of("lat", destLat, "lng", destLng));
        routeResult.put("distanceKm", Math.round(baseDistKm * 100.0) / 100.0);
        routeResult.put("estimatedDurationMins", Math.round(baseEtaMins * 10.0) / 10.0);
        routeResult.put("routeVersion", 1);

        if (containsRoadblock) {
            routeResult.put("hasRoadblockObstruction", true);
            routeResult.put("roadblockAlert", "ACTIVE ROADBLOCK ENCOUNTERED: " + blockedSource + ". Rerouting via alternate arterial corridor.");
            routeResult.put("detourDistanceKm", Math.round((baseDistKm + 1.8) * 100.0) / 100.0);
            routeResult.put("detourDurationMins", Math.round((baseEtaMins + 4.5) * 10.0) / 10.0);
        } else {
            routeResult.put("hasRoadblockObstruction", false);
        }

        return routeResult;
    }

    private double calculateDistanceKm(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371;
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private boolean isPointNearLine(double px, double py, double x1, double y1, double x2, double y2) {
        double dist = Math.abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1) /
                Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));
        return dist < 0.005; // ~500m proximity
    }
}
