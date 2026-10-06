# AEGIS model card (hackathon)

**Disclaimer:** All metrics and training outputs are **pipeline demo only, synthetic data**. They are not clinical claims and must not be used for real dispatch decisions.

## Authority

Spring Boot owns operational state and transactions. FastAPI only suggests. On AI failure Spring returns `aiStatus=FALLBACK` and continues with deterministic rules.

## Intake structuring (`aegis-nlp-intake-v1`)

- Rule-based keyword extraction from operator notes.
- Notes are untrusted; embedded instructions are stripped (`actionTaken=NONE`).
- Output always requires `humanConfirmationRequired=true`.

## ETA correction (`aegis-eta-regressor-v1`)

- Synthetic trips, fixed seed, mission-grouped time-ordered split.
- Reports MAE vs uncorrected ETA and a coarse error distribution.
- Retraining with the same seed produces identical metrics JSON.

## Demand forecast (`aegis-demand-forecast-v1`)

- Returns `status: "insufficient data"` (no real historical series loaded).

## Explanation (`aegis-explain-v1`)

- Returns ranked reasons, `dataFreshnessSeconds`, and `modelVersion` only. Suggests; never acts.
