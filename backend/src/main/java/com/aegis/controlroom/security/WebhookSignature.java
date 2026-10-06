package com.aegis.controlroom.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

public final class WebhookSignature {

    private WebhookSignature() {}

    public static boolean matches(String secret, String timestamp, String rawBody, String provided) {
        if (secret == null || secret.isBlank() || timestamp == null || timestamp.isBlank()
                || rawBody == null || provided == null || provided.isBlank()) {
            return false;
        }
        long epoch;
        try {
            epoch = Long.parseLong(timestamp);
        } catch (NumberFormatException ex) {
            return false;
        }
        long skew = Math.abs(Instant.now().getEpochSecond() - epoch);
        if (skew > 300) {
            return false;
        }
        String expected = "sha256=" + hmacHex(secret, timestamp + "." + rawBody);
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8));
    }

    static String hmacHex(String secret, String payload) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            return "";
        }
    }
}
