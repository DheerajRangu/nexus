package com.aegis.dispatch.api;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class ApiModels {
  private ApiModels() {}
  public record DispatchRequest(@NotBlank String ambulanceId, @PositiveOrZero long entityVersion, @NotBlank @Size(max=120) String idempotencyKey) {}
  public record ReassignRequest(@NotBlank String ambulanceId, @PositiveOrZero long entityVersion, @NotBlank @Size(max=500) String reason, @NotBlank @Size(max=120) String idempotencyKey) {}
  public record PickupCorrectionRequest(@DecimalMin("-90.0") @DecimalMax("90.0") double latitude, @DecimalMin("-180.0") @DecimalMax("180.0") double longitude, @NotBlank String address, String landmark, String accessInstructions, @NotBlank String source, Double accuracyMeters, @NotBlank @Size(max=500) String justification, @PositiveOrZero long entityVersion) {}
  public record TelemetryUpload(@NotBlank String ambulanceId, String missionId, @NotBlank String trackingSessionId, @PositiveOrZero long sequenceNumber, @NotNull Instant capturedAt, @DecimalMin("-90.0") @DecimalMax("90.0") double latitude, @DecimalMin("-180.0") @DecimalMax("180.0") double longitude, @DecimalMin("0.0") @NotNull Double accuracyMeters, @DecimalMin("0.0") @DecimalMax("360.0") Double bearingDegrees, @DecimalMin("0.0") Double speedMps, @NotBlank String schemaVersion) {}
  public record EventEnvelope(String eventId, String eventType, String schemaVersion, long entityVersion, Instant occurredAt, Object payload) {}
  public record Snapshot(Map<String,Object> value) {}
  public record FailureRequest(@NotBlank String mode) {}
  public record OperationalProblemRequest(@NotBlank @Size(max=80) String category, @NotBlank @Size(max=1000) String detail) {}
  public record PushTokenRequest(@NotBlank @Size(max=512) String token, @NotBlank @Size(max=30) String platform) {}
}
