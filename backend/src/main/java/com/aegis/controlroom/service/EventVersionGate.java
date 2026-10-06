package com.aegis.controlroom.service;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Client-side reconnect helper: drop duplicates and older entityVersion values.
 */
@Component
public class EventVersionGate {

    private final Map<String, Integer> held = new ConcurrentHashMap<>();

    public boolean accept(String aggregateId, int entityVersion) {
        Integer current = held.get(aggregateId);
        if (current != null && entityVersion <= current) {
            return false;
        }
        held.put(aggregateId, entityVersion);
        return true;
    }

    public void seed(String aggregateId, int entityVersion) {
        held.put(aggregateId, entityVersion);
    }

    public void clear() {
        held.clear();
    }
}
