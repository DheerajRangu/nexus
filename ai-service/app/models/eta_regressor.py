import json
import os
from typing import Dict, Any

DISCLAIMER = "pipeline demo only, synthetic data"


class ETARegressor:
    def __init__(self):
        self.model_version = "aegis-eta-regressor-v1"
        self.mae = 1.45
        metrics_path = os.path.join(
            os.path.dirname(__file__), "..", "data", "..", "model_artifacts", "eta_metrics.json"
        )
        metrics_path = os.path.normpath(metrics_path)
        if os.path.isfile(metrics_path):
            with open(metrics_path, encoding="utf-8") as f:
                m = json.load(f)
                self.mae = float(m.get("mae_ml_mins", self.mae))

    def predict_eta(
        self, base_distance_km: float, base_eta_mins: float, traffic_level: str, time_of_day_hour: int
    ) -> Dict[str, Any]:
        traffic_multipliers = {
            "LOW": 1.05,
            "MODERATE": 1.25,
            "HEAVY": 1.55,
            "SEVERE": 1.90,
        }
        mult = traffic_multipliers.get(traffic_level.upper(), 1.25)

        if 8 <= time_of_day_hour <= 10 or 17 <= time_of_day_hour <= 20:
            mult += 0.15

        corrected_eta = round(base_eta_mins * mult, 1)
        traffic_delay = round(corrected_eta - base_eta_mins, 1)

        return {
            "uncorrectedEtaMins": base_eta_mins,
            "correctedEtaMins": corrected_eta,
            "trafficDelayMins": traffic_delay,
            "maeMarginMins": self.mae,
            "modelVersion": self.model_version,
            "baselineComparison": (
                f"Corrected ETA vs uncorrected matrix; MAE margin {self.mae} mins "
                f"({DISCLAIMER})"
            ),
            "disclaimer": DISCLAIMER,
        }
