package com.aegis.controlroom.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
public class AIServiceClient {

    private final RestTemplate restTemplate;
    private final String aiServiceUrl;
    private final int maxRetries;
    private volatile boolean forceFallback;

    public AIServiceClient(
            @Qualifier("aiRestTemplate") RestTemplate restTemplate,
            @Value("${aegis.ai-service.url:http://localhost:8000/api/v1}") String aiServiceUrl,
            @Value("${aegis.ai-service.max-retries:1}") int maxRetries) {
        this.restTemplate = restTemplate;
        this.aiServiceUrl = aiServiceUrl.endsWith("/")
                ? aiServiceUrl.substring(0, aiServiceUrl.length() - 1)
                : aiServiceUrl;
        this.maxRetries = Math.max(0, maxRetries);
    }

    public void setForceFallback(boolean forceFallback) {
        this.forceFallback = forceFallback;
    }

    public boolean isForceFallback() {
        return forceFallback;
    }

    public Map<String, Object> parseNotesNLP(String rawNotes) {
        if (forceFallback) {
            return deterministicFallback(rawNotes, new IllegalStateException("aiDown injection"));
        }
        Map<String, Object> req = new HashMap<>();
        req.put("operatorNotes", rawNotes);
        req.put("callerLanguage", "en");

        int attempts = maxRetries + 1;
        Exception last = null;
        for (int i = 0; i < attempts; i++) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> resp = restTemplate.postForObject(
                        aiServiceUrl + "/ai/intake/structure", req, Map.class);
                if (resp == null) {
                    throw new IllegalStateException("empty AI response");
                }
                Map<String, Object> ok = new LinkedHashMap<>(resp);
                ok.put("aiStatus", "OK");
                ok.putIfAbsent("humanConfirmationRequired", true);
                return ok;
            } catch (Exception e) {
                last = e;
            }
        }
        return deterministicFallback(rawNotes, last);
    }

    public Map<String, Object> predictCorrectedETA(
            Double baseDistKm, Double baseEtaMins, String trafficLevel) {
        Map<String, Object> req = new HashMap<>();
        req.put("originLat", 12.97);
        req.put("originLng", 77.59);
        req.put("destLat", 12.98);
        req.put("destLng", 77.60);
        req.put("baseDistanceKm", baseDistKm);
        req.put("baseEtaMins", baseEtaMins);
        req.put("trafficLevel", trafficLevel);
        req.put("timeOfDayHour", 14);

        int attempts = maxRetries + 1;
        for (int i = 0; i < attempts; i++) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> resp = restTemplate.postForObject(
                        aiServiceUrl + "/ai/eta/predict", req, Map.class);
                if (resp != null && resp.containsKey("correctedEtaMins")) {
                    Map<String, Object> ok = new LinkedHashMap<>(resp);
                    ok.put("aiStatus", "OK");
                    return ok;
                }
            } catch (Exception ignored) {
            }
        }
        double mult = "HEAVY".equalsIgnoreCase(trafficLevel) ? 1.4 : 1.2;
        Map<String, Object> fallback = new LinkedHashMap<>();
        fallback.put("uncorrectedEtaMins", baseEtaMins);
        fallback.put("correctedEtaMins", Math.round(baseEtaMins * mult * 10.0) / 10.0);
        fallback.put("aiStatus", "FALLBACK");
        fallback.put("modelVersion", "deterministic-fallback-v1");
        return fallback;
    }

    private Map<String, Object> deterministicFallback(String rawNotes, Exception cause) {
        Map<String, Object> fallback = new LinkedHashMap<>();
        String text = rawNotes == null ? "" : rawNotes.toLowerCase();
        if (text.contains("cardiac") || text.contains("chest pain")) {
            fallback.put("chiefComplaint", "CARDIAC_ARREST");
            fallback.put("triagePriority", "P1_CRITICAL");
            fallback.put("requiredEquipment", List.of("BASIC_LIFE_SUPPORT", "DEFIBRILLATOR", "OXYGEN"));
        } else if (text.contains("accident") || text.contains("bleeding")) {
            fallback.put("chiefComplaint", "TRAUMA");
            fallback.put("triagePriority", "P2_URGENT");
            fallback.put("requiredEquipment", List.of("BASIC_LIFE_SUPPORT", "OXYGEN", "STRETCHER"));
        } else {
            fallback.put("chiefComplaint", "GENERAL_EMERGENCY");
            fallback.put("triagePriority", "P3_STANDARD");
            fallback.put("requiredEquipment", List.of("BASIC_LIFE_SUPPORT"));
        }
        fallback.put("confidenceScore", 0.70);
        fallback.put("modelVersion", "deterministic-fallback-v1");
        fallback.put("humanConfirmationRequired", true);
        fallback.put("aiStatus", "FALLBACK");
        fallback.put("actionTaken", "NONE");
        if (cause != null) {
            fallback.put("fallbackReason", cause.getClass().getSimpleName());
        }
        return fallback;
    }
}
