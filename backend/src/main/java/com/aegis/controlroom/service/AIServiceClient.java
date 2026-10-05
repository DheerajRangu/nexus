package com.aegis.controlroom.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
public class AIServiceClient {

    @Value("${aegis.ai-service.url:http://localhost:8000/api/v1}")
    private String aiServiceUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    public Map<String, Object> parseNotesNLP(String rawNotes) {
        try {
            Map<String, Object> req = new HashMap<>();
            req.put("operatorNotes", rawNotes);
            req.put("callerLanguage", "en");

            return restTemplate.postForObject(aiServiceUrl + "/ai/intake/structure", req, Map.class);
        } catch (Exception e) {
            // Deterministic Rule Fallback
            Map<String, Object> fallback = new HashMap<>();
            String text = rawNotes.toLowerCase();
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
            return fallback;
        }
    }

    public Double predictCorrectedETA(Double baseDistKm, Double baseEtaMins, String trafficLevel) {
        try {
            Map<String, Object> req = new HashMap<>();
            req.put("originLat", 12.97);
            req.put("originLng", 77.59);
            req.put("destLat", 12.98);
            req.put("destLng", 77.60);
            req.put("baseDistanceKm", baseDistKm);
            req.put("baseEtaMins", baseEtaMins);
            req.put("trafficLevel", trafficLevel);
            req.put("timeOfDayHour", 14);

            Map<String, Object> resp = restTemplate.postForObject(aiServiceUrl + "/ai/eta/predict", req, Map.class);
            if (resp != null && resp.containsKey("correctedEtaMins")) {
                return ((Number) resp.get("correctedEtaMins")).doubleValue();
            }
        } catch (Exception ignored) {}
        
        // Fallback
        double mult = "HEAVY".equalsIgnoreCase(trafficLevel) ? 1.4 : 1.2;
        return Math.round(baseEtaMins * mult * 10.0) / 10.0;
    }
}
