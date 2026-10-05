# AEGIS AI/ML Service - Model Cards & Architecture

## Architecture Overview
Spring Boot is the authoritative owner of operational data and transactions. FastAPI acts strictly as an advisory prediction & decision-support service. If FastAPI is unreachable or degraded, Spring Boot seamlessly falls back to deterministic rule-based algorithms without failing emergency operations.

## Runtime & Environment Specs
- **Python Version**: Python 3.14.4 (matches `ai-service/Dockerfile` `python:3.14-slim`)
- **Key Dependencies**: `fastapi==0.110.0`, `pandas`, `scikit-learn`, `pytest`, `httpx`
- **Data Provenance Notice**: Synthetic pipeline demo metrics only.

---

## 1. Intake Structuring Engine (`aegis-nlp-intake-v1`)
- **Task**: Extract structured clinical & operational fields from freeform 108 operator call notes.
- **Input**: `operatorNotes` (text), `callerLanguage` (str).
- **Output**: 
  - `chiefComplaint`: Category (e.g. `CARDIAC_ARREST`, `TRAUMA`, `STROKE`, `RESPIRATORY`, `OBSTETRIC`)
  - `triagePriority`: Priority level (`P1_CRITICAL`, `P2_URGENT`, `P3_STANDARD`)
  - `requiredEquipment`: List (e.g. `["VENTILATOR", "DEFIBRILLATOR", "OXYGEN"]`)
  - `patientAge`: Optional int
  - `patientGender`: Optional str
  - `confidenceScore`: Float (0.0 to 1.0)
- **Safety Control**: Requires human operator sign-off before case dispatch creation. Treated as untrusted input.

---

## 2. ETA Correction Regressor (`aegis-eta-regressor-v1`)
- **Task**: Correct raw traffic matrix ETAs using historical trip telemetry (weather, time of day, road type, urban density, driver speed profile).
- **Model Architecture**: Gradient Boosted Decision Tree / Random Forest Regressor (`scikit-learn`).
- **Baseline Comparison**: Uncorrected OSRM / Google Matrix ETA vs. ML Corrected ETA.
- **Evaluation Strategy**: Mission-grouped, chronological train-test split (no future-data leakage).
- **Metrics**: 
  - Mean Absolute Error (MAE): `~1.45 mins` (vs baseline `3.82 mins`)
  - 95th Percentile Error Bound: `< 3.2 mins`
- **Fallback**: If confidence is low or input features out-of-bounds, returns uncorrected traffic matrix ETA + 15% buffer.

---

## 3. Urban Demand Forecaster (`aegis-demand-forecast-v1`)
- **Task**: Predict emergency call density per geographic sector in 1-hour lookahead windows.
- **Baseline**: Historical rolling seasonal average count.
- **Model**: Time-series features + Poisson/Random Forest Regressor.
- **Usage**: Heatmap overlays for proactive ambulance positioning.

---

## 4. Explanation & Decision Support Engine (`aegis-explain-v1`)
- **Task**: Generate human-interpretable rationale for ambulance dispatch shortlist and hospital matching ranking.
- **Output Example**:
```json
{
  "recommendations": [
    {
      "ambulanceId": "AMB-108-NORTH-04",
      "compositeScore": 0.94,
      "reasons": [
        "Closest ALS capability match with active ventilator (3.2 km)",
        "ETA corrected for heavy traffic: 7.2 mins",
        "Driver shift active and location ping fresh (4 sec ago)"
      ],
      "dataFreshnessSeconds": 4,
      "modelVersion": "aegis-eta-regressor-v1"
    }
  ]
}
```
