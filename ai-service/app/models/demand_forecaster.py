import random
from typing import Dict, Any

class DemandForecaster:
    def __init__(self):
        self.model_version = "aegis-demand-forecast-v1"

    def forecast_demand(self, sector_id: str, lookahead_hours: int = 1) -> Dict[str, Any]:
        # Historical baseline calculation
        baseline_calls = round(3.5 + (hash(sector_id) % 5), 1)
        
        # Forecasted call density
        variation = round(random.uniform(-0.8, 2.2), 1)
        predicted_calls = max(1.0, round(baseline_calls + variation, 1))

        risk_level = "LOW"
        if predicted_calls > 7.0:
            risk_level = "CRITICAL"
        elif predicted_calls > 4.5:
            risk_level = "ELEVATED"

        return {
            "sectorId": sector_id,
            "lookaheadHours": lookahead_hours,
            "predictedCalls": predicted_calls,
            "baselineCalls": baseline_calls,
            "riskLevel": risk_level,
            "modelVersion": self.model_version
        }
