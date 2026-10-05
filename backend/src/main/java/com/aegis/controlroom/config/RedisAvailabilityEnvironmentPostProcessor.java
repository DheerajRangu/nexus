package com.aegis.controlroom.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.util.Map;

/**
 * Redis is optional. When aegis.redis.enabled is false (the default), Redis
 * auto-configuration is excluded so startup does not require a Redis server.
 * PostgreSQL remains the authority for operational state.
 */
public class RedisAvailabilityEnvironmentPostProcessor implements EnvironmentPostProcessor {

    private static final String EXCLUDE =
            "org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration,"
                    + "org.springframework.boot.autoconfigure.data.redis.RedisRepositoriesAutoConfiguration";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        boolean enabled = environment.getProperty("aegis.redis.enabled", Boolean.class, Boolean.FALSE);
        if (!enabled) {
            environment.getPropertySources().addFirst(new MapPropertySource(
                    "aegisRedisDisabled",
                    Map.of("spring.autoconfigure.exclude", EXCLUDE)));
        }
    }
}
