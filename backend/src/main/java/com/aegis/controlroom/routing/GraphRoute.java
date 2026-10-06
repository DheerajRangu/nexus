package com.aegis.controlroom.routing;

public record GraphRoute(
        double distanceKm,
        double etaMins,
        String encodedPolyline,
        int avoidedRoadblocks,
        String provider,
        boolean simulated,
        java.util.List<RoutePoint> points
) {
    public GraphRoute(double distanceKm, double etaMins, String encodedPolyline,
                      int avoidedRoadblocks, String provider, boolean simulated) {
        this(distanceKm, etaMins, encodedPolyline, avoidedRoadblocks, provider, simulated, java.util.List.of());
    }
}
