package com.aegis.controlroom.repository;

import com.aegis.controlroom.model.WebhookIdempotency;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WebhookIdempotencyRepository extends JpaRepository<WebhookIdempotency, String> {
}
