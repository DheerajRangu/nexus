from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.schemas.pydantic_models import (
    IntakeRequest, IntakeResponse,
    ETARequest, ETAPredictionResponse,
    DemandForecastRequest, DemandForecastResponse,
    ExplanationRequest, ExplanationResponse
)
from app.models.nlp_intake import NLPIntakeParser
from app.models.eta_regressor import ETARegressor
from app.models.demand_forecaster import DemandForecaster
from app.models.explanation_engine import ExplanationEngine

app = FastAPI(
    title="AEGIS AI/ML Microservice API",
    description="Non-mutating advisory AI microservice providing NLP intake structuring, ETA regression correction, demand forecasting, and decision explanations.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

nlp_parser = NLPIntakeParser()
eta_regressor = ETARegressor()
demand_forecaster = DemandForecaster()
explanation_engine = ExplanationEngine()

@app.get("/health")
def health_check():
    return {"status": "UP", "service": "aegis-ai-service", "version": "1.0.0"}

@app.post("/api/v1/ai/intake/structure", response_model=IntakeResponse)
def structure_intake(req: IntakeRequest):
    res = nlp_parser.parse_notes(req.operatorNotes, req.callerLanguage)
    return res

@app.post("/api/v1/ai/eta/predict", response_model=ETAPredictionResponse)
def predict_eta(req: ETARequest):
    res = eta_regressor.predict_eta(req.baseDistanceKm, req.baseEtaMins, req.trafficLevel, req.timeOfDayHour)
    return res

@app.get("/api/v1/ai/demand/forecast", response_model=DemandForecastResponse)
def forecast_demand(sectorId: str = "SECTOR-CENTRAL-01", lookaheadHours: int = 1):
    res = demand_forecaster.forecast_demand(sectorId, lookaheadHours)
    return res

@app.post("/api/v1/ai/explain/recommendations", response_model=ExplanationResponse)
def explain_recommendations(req: ExplanationRequest):
    dict_candidates = [c.model_dump() for c in req.candidates]
    res = explanation_engine.generate_explanations(req.emergencyId, dict_candidates)
    return res

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
