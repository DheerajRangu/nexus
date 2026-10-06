package com.aegis.controlroom.routing;

import java.util.Optional;

public interface RoadGraphProvider {
    default String providerName() {
        return getClass().getSimpleName();
    }

    default boolean simulated() {
        return true;
    }

    /**
     * Returns a verified route avoiding blocked edges, or empty if none exists.
     * Must never invent a path when blocked edges leave no alternative.
     */
    Optional<GraphRoute> routeAvoidingBlocks(
            double originLat, double originLng,
            double destLat, double destLng);
}
