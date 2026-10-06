from typing import Dict, Any


class DemandForecaster:
    """Hackathon stub: real historical demand series is not available."""

    def __init__(self):
        self.model_version = "aegis-demand-forecast-v1"

    def forecast_demand(self, sector_id: str, lookahead_hours: int = 1) -> Dict[str, Any]:
        return {
            "sectorId": sector_id,
            "lookaheadHours": lookahead_hours,
            "status": "insufficient data",
            "predictedCalls": None,
            "baselineCalls": None,
            "riskLevel": "UNKNOWN",
            "modelVersion": self.model_version,
            "disclaimer": "pipeline demo only, synthetic data — no production demand series loaded",
        }
