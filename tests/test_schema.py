import pytest
from backend.schemas import AnalysisSummary

def example():
    return dict(video='road.mp4',durationSeconds=10,totalUniqueVehicles=2,vehicleBreakdown={'car':2},averageTrafficScore=.2,peakTrafficScore=.4,peakVehicleCount=2,averageOccupancy=.1,peakOccupancy=.3,averageMotion=12,finalTrafficLevel='LOW',analysisSeconds=5,model='yolo26n.pt',tracker='bytetrack.yaml',mode='BALANCED',limitations=['No calibrated speed'])

def test_summary_has_unavailable_features_as_null():
    summary=AnalysisSummary.model_validate(example())
    assert summary.model_dump()['emergencyRoadScore'] is None
    assert summary.model_dump()['constructionDetected'] is None
    assert 'averageTrafficScore' in AnalysisSummary.model_json_schema()['properties']

def test_out_of_range_and_invented_feature_rejected():
    for change in [{'averageOccupancy':1.1},{'averageMotion':float('nan')},{'emergencyRoadScore':90}]:
        with pytest.raises(ValueError): AnalysisSummary.model_validate({**example(),**change})
