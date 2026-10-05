package com.aegis.controlroom.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "webhook_idempotency")
public class WebhookIdempotency {
    @Id
    @Column(name = "idempotency_key", length = 128)
    private String idempotencyKey;

    @Column(name = "external_ref", nullable = false, length = 100)
    private String externalRef;

    @Column(name = "processed_at")
    private Instant processedAt = Instant.now();

    public WebhookIdempotency() {}

    public WebhookIdempotency(String idempotencyKey, String externalRef) {
        this.idempotencyKey = idempotencyKey;
        this.externalRef = externalRef;
    }

    public String getIdempotencyKey() { return idempotencyKey; }
    public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }
    public String getExternalRef() { return externalRef; }
    public void setExternalRef(String externalRef) { this.externalRef = externalRef; }
    public Instant getProcessedAt() { return processedAt; }
    public void setProcessedAt(Instant processedAt) { this.processedAt = processedAt; }
}
