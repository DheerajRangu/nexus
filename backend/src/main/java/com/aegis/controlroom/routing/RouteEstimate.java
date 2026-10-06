package com.aegis.controlroom.routing;

public record RouteEstimate(
        double distanceKm,
        double etaMins,
        String provider,
        boolean simulated
) {}
