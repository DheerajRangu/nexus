from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class IntakeRequest(BaseModel):
    operatorNotes: str = Field(..., description="Raw text recorded by call operator")
    callerLanguage: str = Field(default="en", description="Language code")


class IntakeResponse(BaseModel):
    chiefComplaint: str
    triagePriority: str
    requiredEquipment: List[str]
    patientAge: Optional[int] = None
    patientGender: Optional[str] = None
    confidenceScore: float
    modelVersion: str = "aegis-nlp-intake-v1"
    humanConfirmationRequired: bool = True
    injectionAttemptDetected: bool = False
    actionTaken: str = "NONE"


class ETARequest(BaseModel):
    originLat: float
    originLng: float
    destLat: float
    destLng: float
    baseDistanceKm: float
    baseEtaMins: float
    trafficLevel: str = Field(default="MODERATE", description="LOW, MODERATE, HEAVY, SEVERE")
    timeOfDayHour: int = Field(default=14, description="Hour of day (0-23)")


class ETAPredictionResponse(BaseModel):
    uncorrectedEtaMins: float
    correctedEtaMins: float
    trafficDelayMins: float
    maeMarginMins: float
    modelVersion: str = "aegis-eta-regressor-v1"
    baselineComparison: str
    disclaimer: str = "pipeline demo only, synthetic data"


class DemandForecastRequest(BaseModel):
    sectorId: str
    lookaheadHours: int = 1


class DemandForecastResponse(BaseModel):
    sectorId: str
    lookaheadHours: int
    status: str = "insufficient data"
    predictedCalls: Optional[float] = None
    baselineCalls: Optional[float] = None
    riskLevel: str = "UNKNOWN"
    modelVersion: str = "aegis-demand-forecast-v1"
    disclaimer: Optional[str] = None


class CandidateEvaluation(BaseModel):
    id: str
    type: str  # "AMBULANCE" or "HOSPITAL"
    baseEtaMins: float
    distanceKm: float
    capabilityMatch: bool = True


class ExplanationRequest(BaseModel):
    emergencyId: str
    candidates: List[CandidateEvaluation]


class ExplanationResponse(BaseModel):
    emergencyId: str
    rankedRationales: List[Dict[str, Any]]
    dataFreshnessSeconds: int = 5
    modelVersion: str = "aegis-explain-v1"
