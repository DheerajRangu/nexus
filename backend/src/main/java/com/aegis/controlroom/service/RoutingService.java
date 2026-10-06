package com.aegis.controlroom.service;

import com.aegis.controlroom.model.AuditEvent;
import com.aegis.controlroom.model.RouteVersion;
import com.aegis.controlroom.repository.AuditEventRepository;
import com.aegis.controlroom.repository.RouteVersionRepository;
import com.aegis.controlroom.routing.GraphRoute;
import com.aegis.controlroom.routing.RoadGraphProvider;
import com.aegis.controlroom.routing.RoutingProviderUnavailableException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class RoutingService {

    private final RoadGraphProvider roadGraphProvider;
    private final RouteVersionRepository routeVersionRepository;
    private final AuditEventRepository auditEventRepository;
    private final WebSocketNotificationService webSocketNotificationService;

    @Value("${aegis.routing.recalc-eta-delta-mins:2.0}")
    private double recalcEtaDeltaMins;

    public RoutingService(RoadGraphProvider roadGraphProvider,
                          RouteVersionRepository routeVersionRepository,
                          AuditEventRepository auditEventRepository,
                          WebSocketNotificationService webSocketNotificationService) {
        this.roadGraphProvider = roadGraphProvider;
        this.routeVersionRepository = routeVersionRepository;
        this.auditEventRepository = auditEventRepository;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    /**
     * Marker-only map pins are not routing restrictions. Only RoadGraphProvider
     * may exclude blocked edges. No verified alternative -> alert, no invented route.
     */
    @Transactional
    public Map<String, Object> calculateRoute(
            String missionId,
            String leg,
            double originLat, double originLng,
            double destLat, double destLng) {

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("leg", leg);
        result.put("origin", Map.of("lat", originLat, "lng", originLng));
        result.put("destination", Map.of("lat", destLat, "lng", destLng));

        Optional<GraphRoute> route;
        try {
            route = roadGraphProvider.routeAvoidingBlocks(originLat, originLng, destLat, destLng);
        } catch (RoutingProviderUnavailableException exception) {
            result.put("routeAvailable", false);
            result.put("status", "ROUTING_PROVIDER_UNAVAILABLE");
            result.put("simulated", roadGraphProvider.simulated());
            result.put("provider", roadGraphProvider.providerName());
            result.put("operatorAlert", exception.getMessage());
            webSocketNotificationService.broadcastEvent("/topic/alerts", "routing.provider_unavailable", missionId, result);
            return result;
        }

        if (route.isEmpty()) {
            result.put("routeAvailable", false);
            result.put("simulated", roadGraphProvider.simulated());
            result.put("provider", roadGraphProvider.providerName());
            result.put("operatorAlert", "NO_VERIFIED_ALTERNATIVE: verified roadblocks block the available route options; no route invented");
            AuditEvent alert = new AuditEvent();
            alert.setEventId("aud-" + UUID.randomUUID().toString().substring(0, 8));
            alert.setEventType("ROUTING_NO_ALTERNATIVE");
            alert.setActorRole("SYSTEM");
            alert.setAggregateId(missionId != null ? missionId : "unscoped");
            alert.setAggregateType("MISSION");
            alert.setDetails("Roadblock with no verified alternative for leg=" + leg);
            auditEventRepository.save(alert);
            webSocketNotificationService.broadcastEvent("/topic/alerts", "routing.no_alternative", missionId, result);
            return result;
        }

        GraphRoute g = route.get();
        result.put("routeAvailable", true);
        result.put("distanceKm", g.distanceKm());
        result.put("estimatedDurationMins", g.etaMins());
        result.put("encodedPolyline", g.encodedPolyline());
        result.put("points", g.points());
        result.put("provider", g.provider());
        result.put("simulated", g.simulated());
        result.put("avoidedRoadblocksCount", g.avoidedRoadblocks());

        if (missionId != null) {
            Optional<RouteVersion> prev = routeVersionRepository.findFirstByMissionIdOrderByVersionNumberDesc(missionId);
            int nextVersion = prev.map(r -> r.getVersionNumber() + 1).orElse(1);
            boolean shouldPersist = prev.isEmpty()
                    || Math.abs(prev.get().getEstimatedDurationMins() - g.etaMins()) >= recalcEtaDeltaMins;
            if (shouldPersist) {
                RouteVersion rv = new RouteVersion();
                rv.setRouteId("rte-" + UUID.randomUUID().toString().substring(0, 8));
                rv.setMissionId(missionId);
                rv.setVersionNumber(nextVersion);
                rv.setEncodedPolyline(g.encodedPolyline());
                rv.setDistanceKm(g.distanceKm());
                rv.setEstimatedDurationMins(g.etaMins());
                rv.setAvoidedRoadblocksCount(g.avoidedRoadblocks());
                routeVersionRepository.save(rv);
                result.put("routeVersion", nextVersion);
            } else {
                result.put("routeVersion", prev.get().getVersionNumber());
                result.put("recalcSkipped", true);
            }
        }
        return result;
    }

    public Map<String, Object> calculateRoute(double originLat, double originLng, double destLat, double destLng) {
        return calculateRoute(null, "GENERIC", originLat, originLng, destLat, destLng);
    }
}
