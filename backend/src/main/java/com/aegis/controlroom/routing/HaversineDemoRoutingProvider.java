package com.aegis.controlroom.routing;

import org.springframework.stereotype.Component;

@Component
public class HaversineDemoRoutingProvider implements RoutingProvider {

    private static final double AVG_SPEED_KMH = 35.0;

    @Override
    public RouteEstimate estimate(double originLat, double originLng, double destLat, double destLng) {
        double dist = haversineKm(originLat, originLng, destLat, destLng);
        double eta = (dist / AVG_SPEED_KMH) * 60.0;
        return new RouteEstimate(
                Math.round(dist * 100.0) / 100.0,
                Math.round(eta * 10.0) / 10.0,
                "HaversineDemoRoutingProvider",
                true);
    }

    static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
