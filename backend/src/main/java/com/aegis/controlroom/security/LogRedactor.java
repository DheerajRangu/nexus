package com.aegis.controlroom.security;

import java.util.regex.Pattern;

public final class LogRedactor {

    private static final Pattern PHONE = Pattern.compile("\\+?\\d[\\d\\s\\-]{8,}\\d");
    private static final Pattern BEARER = Pattern.compile("(?i)bearer\\s+[A-Za-z0-9\\-._~+/=]+");
    private static final Pattern TOKEN = Pattern.compile("\\btk_[A-Za-z0-9]+");

    private LogRedactor() {}

    public static String redact(String message) {
        if (message == null) {
            return null;
        }
        String redacted = PHONE.matcher(message).replaceAll("********");
        redacted = BEARER.matcher(redacted).replaceAll("Bearer ********");
        return TOKEN.matcher(redacted).replaceAll("********");
    }
}
