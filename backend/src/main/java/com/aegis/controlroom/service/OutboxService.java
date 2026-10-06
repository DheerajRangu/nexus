package com.aegis.controlroom.service;

import com.aegis.controlroom.model.OutboxEvent;
import com.aegis.controlroom.repository.OutboxEventRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class OutboxService {

    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    public OutboxService(OutboxEventRepository outboxEventRepository, ObjectMapper objectMapper) {
        this.outboxEventRepository = outboxEventRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Persist outbox row in the caller's transaction (same TX as the state change).
     */
    @Transactional
    public OutboxEvent enqueue(String type, String aggregateId, int entityVersion, Object payload) {
        try {
            Map<String, Object> envelope = new LinkedHashMap<>();
            String eventId = "evt-" + UUID.randomUUID().toString().substring(0, 12);
            envelope.put("eventId", eventId);
            envelope.put("type", type);
            envelope.put("aggregateId", aggregateId);
            envelope.put("entityVersion", entityVersion);
            envelope.put("occurredAt", Instant.now().toString());
            envelope.put("payload", payload);

            OutboxEvent row = new OutboxEvent();
            row.setEventId(eventId);
            row.setType(type);
            row.setAggregateId(aggregateId);
            row.setEntityVersion(entityVersion);
            row.setOccurredAt(Instant.now());
            row.setPayload(objectMapper.writeValueAsString(envelope));
            row.setPublished(false);
            return outboxEventRepository.save(row);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to write outbox event", e);
        }
    }
}
