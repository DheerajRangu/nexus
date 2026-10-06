package com.aegis.controlroom.service;

import com.aegis.controlroom.model.OutboxEvent;
import com.aegis.controlroom.repository.OutboxEventRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Component
public class OutboxPublisherJob {

    private final OutboxEventRepository outboxEventRepository;
    private final WebSocketNotificationService webSocketNotificationService;
    private final ObjectMapper objectMapper;

    public OutboxPublisherJob(OutboxEventRepository outboxEventRepository,
                              WebSocketNotificationService webSocketNotificationService,
                              ObjectMapper objectMapper) {
        this.outboxEventRepository = outboxEventRepository;
        this.webSocketNotificationService = webSocketNotificationService;
        this.objectMapper = objectMapper;
    }

    @Scheduled(fixedDelayString = "${aegis.outbox.publish-delay-ms:2000}")
    @Transactional
    public void publishPending() {
        List<OutboxEvent> pending = outboxEventRepository.findByPublishedFalseOrderByOccurredAtAsc();
        for (OutboxEvent row : pending) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> envelope = objectMapper.readValue(row.getPayload(), Map.class);
                webSocketNotificationService.broadcastEnvelope("/topic/events", envelope);
                row.setPublished(true);
                row.setPublishedAt(Instant.now());
                outboxEventRepository.save(row);
            } catch (Exception ignored) {
                // leave unpublished for retry
            }
        }
    }
}
