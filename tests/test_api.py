import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from backend.main import app, AnalysisOptions
from backend.database import Base,engine

@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client
    with engine.begin() as connection:
        connection.execute(Base.metadata.tables['videos'].delete())

def test_health_and_unknown_video(client):
    assert client.get('/api/health').json()['status']=='online'
    assert client.get('/api/videos/not-a-video/status').status_code==404

def test_invalid_uploads(client):
    assert client.post('/api/videos/upload',files={'file':('payload.exe',b'abc')}).status_code==415
    assert client.post('/api/videos/upload',files={'file':('empty.mp4',b'')}).status_code==422
    assert client.post('/api/videos/upload',files={'file':('corrupt.mp4',b'not a video')}).status_code==422

def test_decodable_upload_and_metadata(client,tmp_path):
    path=tmp_path/'test.mp4'
    writer=cv2.VideoWriter(str(path),cv2.VideoWriter_fourcc(*'mp4v'),10,(160,100))
    for i in range(10): writer.write(np.zeros((100,160,3),np.uint8))
    writer.release()
    response=client.post('/api/videos/upload',files={'file':('../../road.mp4',path.read_bytes(),'video/mp4')})
    assert response.status_code==200
    value=response.json();video_id=value['id']
    assert value['info']['filename']=='road.mp4'
    assert value['info']['durationSeconds']==1
    assert client.get(f'/api/videos/{video_id}/thumbnail').status_code==200
    assert client.get(f'/api/videos/{video_id}/summary').status_code==409
    assert client.post(f'/api/videos/{video_id}/analyze',json={'mode':'UNKNOWN'}).status_code==422

def test_bad_roi():
    for points in [[(0,0),(1,1),(.5,.5)],[(0,0),(2,0),(1,1)],[(0,0),(1,1),(0,1),(1,0)]]:
        with pytest.raises(ValueError): AnalysisOptions(roi=points)

def test_optional_api_auth(client,monkeypatch):
    monkeypatch.setenv('AEGIS_API_KEY','test-only-key')
    assert client.get('/api/videos').status_code==401
    assert client.get('/api/videos',headers={'X-API-Key':'test-only-key'}).status_code==200
    assert client.get('/api/health').status_code==200


def test_websocket_reports_persisted_state(client,tmp_path):
    from backend.database import Session,Video
    with Session.begin() as db:
        db.add(Video(id='ws-test',info={},configuration={},state={'status':'complete','progress':100,'stage':'Analysis complete'}))
    with client.websocket_connect('/ws/analysis/ws-test') as ws:
        state=ws.receive_json()
        assert state['type']=='ANALYSIS_PROGRESS'
        assert state['progress']==100
        assert state['status']=='complete'

def test_roi_save_is_validated_and_persisted(client):
    from backend.database import Session,Video,get_video
    with Session.begin() as db:
        db.add(Video(id='roi-test',info={},configuration={},state={'status':'ready','progress':0}))
    polygon=[[0,.5],[1,.5],[1,1],[0,1]]
    assert client.post('/api/config/roi',json={'videoId':'roi-test','roi':polygon}).status_code==200
    assert get_video('roi-test')['configuration']['roi']==polygon
    assert client.post('/api/config/roi',json={'videoId':'roi-test','roi':[[0,0],[1,1]]}).status_code==422

def test_missing_model_becomes_failed_job(client,monkeypatch):
    import ultralytics
    from backend.database import Session,Video,get_video
    from backend.processor import process
    def missing(*args,**kwargs): raise FileNotFoundError('Vehicle weights unavailable')
    monkeypatch.setattr(ultralytics,'YOLO',missing)
    with Session.begin() as db:
        db.add(Video(id='missing-model-test',info={},configuration={},state={'status':'queued','progress':0}))
    process('missing-model-test')
    state=get_video('missing-model-test')['state']
    assert state['status']=='failed'
    assert 'weights unavailable' in state['error']
