package com.aegis.controlroom.security;

public record AegisPrincipal(String userId, String role, String scope) {}
