package com.aegis.controlroom.service;

import com.aegis.controlroom.model.GreenCorridorSignal;
import com.aegis.controlroom.repository.GreenCorridorRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class GreenCorridorService {

    private final GreenCorridorRepository greenCorridorRepository;
    private final WebSocketNotificationService webSocketNotificationService;

    public GreenCorridorService(GreenCorridorRepository greenCorridorRepository,
                                WebSocketNotificationService webSocketNotificationService) {
        this.greenCorridorRepository = greenCorridorRepository;
        this.webSocketNotificationService = webSocketNotificationService;
    }

    public List<GreenCorridorSignal> getAllSignals() {
        return greenCorridorRepository.findAll();
    }

    @Transactional
    public GreenCorridorSignal updateSignalState(String junctionId, String newState, String missionId) {
        GreenCorridorSignal signal = greenCorridorRepository.findById(junctionId)
                .orElseThrow(() -> new IllegalArgumentException("Signal junction not found: " + junctionId));

        signal.setCurrentState(newState);
        if (missionId != null) {
            signal.setActiveMissionId(missionId);
        }
        signal.setUpdatedAt(Instant.now());

        GreenCorridorSignal saved = greenCorridorRepository.save(signal);
        webSocketNotificationService.broadcastEvent("/topic/signals", "SIGNAL_STATE_CHANGED", junctionId, saved);
        return saved;
    }
}
