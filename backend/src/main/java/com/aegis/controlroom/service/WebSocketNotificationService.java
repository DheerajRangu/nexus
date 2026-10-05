package com.aegis.controlroom.service;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class WebSocketNotificationService {
    private final SimpMessagingTemplate messagingTemplate;

    public WebSocketNotificationService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void broadcastEvent(String topic, String eventType, String aggregateId, Object payload) {
        Map<String, Object> event = new HashMap<>();
        event.put("eventId", "evt-" + UUID.randomUUID().toString().substring(0, 8));
        event.put("eventType", eventType);
        event.put("aggregateId", aggregateId);
        event.put("timestamp", System.currentTimeMillis());
        event.put("payload", payload);

        messagingTemplate.convertAndSend(topic, event);
    }
}
