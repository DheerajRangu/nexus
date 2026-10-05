package com.aegis.controlroom.service;

import com.aegis.controlroom.dto.TelemetryPingDto;
import com.aegis.controlroom.model.Ambulance;
import com.aegis.controlroom.repository.AmbulanceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class TelemetryService {

    private final AmbulanceRepository ambulanceRepository;
    private final WebSocketNotificationService webSocketNotificationService;

    public TelemetryService(AmbulanceRepository ambulanceRepository,
                            WebSocketNotificationService webSocketNotificationService) {
        this.ambulanceRepository = ambulanceRepository;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    @Transactional
    public Ambulance processTelemetryPing(TelemetryPingDto ping) {
        Ambulance amb = ambulanceRepository.findById(ping.getAmbulanceId())
                .orElseThrow(() -> new IllegalArgumentException("Ambulance not found: " + ping.getAmbulanceId()));

        amb.setLatitude(ping.getLatitude());
        amb.setLongitude(ping.getLongitude());
        amb.setTelemetryUpdatedAt(Instant.now());
        if (ping.getStatus() != null) {
            amb.setStatus(ping.getStatus());
        }

        Ambulance saved = ambulanceRepository.save(amb);
        webSocketNotificationService.broadcastEvent("/topic/telemetry", "AMBULANCE_TELEMETRY_UPDATED", saved.getAmbulanceId(), saved);
        return saved;
    }
}
