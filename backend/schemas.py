from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class AnalysisSummary(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    video: str
    durationSeconds: float = Field(gt=0)
    totalUniqueVehicles: int = Field(ge=0)
    vehicleBreakdown: dict[str,int]
    averageTrafficScore: float = Field(ge=0,le=1)
    peakTrafficScore: float = Field(ge=0,le=1)
    peakVehicleCount: int = Field(ge=0)
    averageOccupancy: float = Field(ge=0,le=1)
    peakOccupancy: float = Field(ge=0,le=1)
    averageMotion: float = Field(ge=0)
    finalTrafficLevel: Literal['CLEAR','LOW','MODERATE','HEAVY','SEVERE']
    analysisSeconds: float = Field(ge=0)
    model: str
    tracker: str
    mode: Literal['FAST','BALANCED','DEEP','ACCURATE']
    constructionDetected: bool | None = None
    accidentSuspected: bool | None = None
    emergencyRoadScore: None = None
    intelligence: dict | None = None
    limitations: list[str]
