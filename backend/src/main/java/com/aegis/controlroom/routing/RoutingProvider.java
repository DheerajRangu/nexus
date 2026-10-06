package com.aegis.controlroom.routing;

public interface RoutingProvider {
    RouteEstimate estimate(double originLat, double originLng, double destLat, double destLng);
}
