"""Live controls and evidence tests use deterministic perception, never downloaded models."""
import json
import time
from pathlib import Path
from types import SimpleNamespace
import cv2
import numpy as np
from fastapi.testclient import TestClient
from ai.brain import RoadBrain
from ai.live import MotionTracker
from backend import live
from backend.main import app
from backend.processor import OMNI


def test_latest_frame_replaces_pending_work():
    buffer=live.LatestFrame()
    for i in range(100):buffer.put(i)
    assert buffer.take()==99
    assert buffer.take() is None
    assert buffer.dropped==99


def test_tracking_propagates_and_associates_identity():
    tracker=MotionTracker(3)
    rng=np.random.default_rng(4)
    frame=rng.integers(0,256,(120,180,3),dtype=np.uint8)
    first=tracker.update(frame,0,[{'type':'car','confidence':.9,'box':[40,40,80,80]}])[0]
    shifted=cv2.warpAffine(frame,np.float32([[1,0,3],[0,1,0]]),(180,120))
    propagated=tracker.update(shifted,.1)[0]
    assert propagated['trackId']==first['trackId']
    assert 41<propagated['box'][0]<45
    corrected=tracker.update(shifted,.2,[{'type':'car','confidence':.9,'box':[43,40,83,80]}])[0]
    assert corrected['displayId']=='S03-VEH-0001'
    assert not tracker.update(shifted,2)
    reset=MotionTracker(4).update(frame,2,[{'type':'car','confidence':.9,'box':[40,40,80,80]}])[0]
    assert reset['displayId']!='S03-VEH-0001'


class FakePipeline:
    def __init__(self,bundle,mode,segment):
        self.brain=RoadBrain(OMNI,{'objects':None,'road':'test mask','gaps':[]});self.road=None;self.lanes=[]
    def analyze(self,frame,t):
        time.sleep(.035)
        self.road={'mask':np.ones(frame.shape[:2],np.uint8),'reliable':True,'confidence':.9,'coverage':1.,'method':'test mask'}
        metrics=dict(timestampSeconds=t,vehicleCount=0,roadOccupancy=0.,averageMotion=0.,stoppedVehicles=0,stoppedRatio=0.,trafficScore=0.,trafficLevel='CLEAR')
        scene=self.brain.update(t,metrics,[],[],None,self.road,{'cameraMotionPxSec':0,'roadMotionPxSec':0,'available':True},[])
        return dict(metrics=metrics,intelligence=scene,tracks=[],objects=[],roadPolygons=[],lanes=[],detectionFrame=True,adaptiveCompute=False)


def next_frame(ws):
    for _ in range(100):
        message=ws.receive_json()
        assert not message.get('error'),message
        if message['type']=='frame':
            ws.send_json({'command':'ack'})
            return message
    raise AssertionError('No streamed frame')


def test_play_pause_seek_stop_and_incremental_report(tmp_path,monkeypatch):
    monkeypatch.setattr(live,'get_models',lambda:SimpleNamespace(device='test'))
    monkeypatch.setattr(live,'LivePipeline',FakePipeline)
    filename=tmp_path/'test.mp4'
    writer=cv2.VideoWriter(str(filename),cv2.VideoWriter_fourcc(*'mp4v'),20,(160,90))
    for i in range(80):writer.write(np.full((90,160,3),i*2,np.uint8))
    writer.release()
    with TestClient(app) as client:
        with filename.open('rb') as file:uploaded=client.post('/api/videos/upload',files={'file':('test.mp4',file,'video/mp4')}).json()
        sid=client.post('/api/live/sessions',json={'videoId':uploaded['id'],'mode':'FAST'}).json()['sessionId']
        with client.websocket_connect('/ws/vision/'+sid) as ws:
            assert ws.receive_json()['status']=='ready'
            ws.send_json({'command':'play'});frame=next_frame(ws)
            assert frame['frameNumber']==round(frame['videoTimestamp']*20)
            assert frame['intelligence']['timestampSeconds']==round(frame['videoTimestamp'],3)
            assert frame['performance']['streamLatencyMs']<500
            ws.send_json({'command':'pause'})
            while ws.receive_json().get('status')!='paused':pass
            before=live.sessions[sid].processed;time.sleep(.12)
            assert live.sessions[sid].processed==before
            ws.send_json({'command':'seek','timestamp':2.5});seeked=next_frame(ws)
            assert seeked['segment']==2
            assert 2.45<=seeked['videoTimestamp']<=2.55
            assert live.sessions[sid].status=='paused'
            assert client.get(f'/api/live/{sid}/report').json()['segments'][-1]['segment']==2
            ws.send_json({'command':'stop'})
            while ws.receive_json().get('status')!='stopped':pass
            assert live.sessions[sid].position==0
        assert live.sessions[sid].closed.is_set()


def test_event_snapshot_package_deduplicates_and_has_provenance(tmp_path,monkeypatch):
    monkeypatch.setattr(live,'ROOT',tmp_path)
    session=SimpleNamespace(id='a'*32,video=None,source_name='test',status='live',segments=[],processed=1,frames=live.LatestFrame())
    memory=live.EventMemory(session);pipeline=FakePipeline(None,'FAST',1)
    frame=np.random.default_rng(1).integers(0,255,(90,160,3),dtype=np.uint8)
    packet=pipeline.analyze(frame,0);packet.update(videoTimestamp=0,segment=1)
    memory.record(frame,packet,pipeline)
    event={'eventType':'HAZARD_FIRE','title':'Fire evidence needs review','severity':'HIGH','confidence':.8,'details':{'evidence':'test fixture'}}
    memory.add(event,packet);memory.add(event,packet)
    hazards=[e for e in memory.events if e['eventType']=='HAZARD_FIRE']
    assert len(hazards)==1
    packet=pipeline.analyze(frame,2.1);packet.update(videoTimestamp=2.1,segment=1)
    memory.record(frame,packet,pipeline)
    folder=tmp_path/'videos/sessions'/session.id/'events'/hazards[0]['eventId']
    assert (folder/'event_raw.jpg').is_file() and (folder/'event_annotated.jpg').is_file()
    assert (folder/'before_raw.jpg').is_file() and (folder/'after_raw.jpg').is_file()
    metadata=json.loads((folder/'metadata.json').read_text())
    assert metadata['confidenceType']=='detector score'
    assert metadata['evidence']['event']['whyThisFrame']
    assert metadata['description']


def test_source_clock_never_repeats_frames_and_reaches_end(tmp_path,monkeypatch):
    monkeypatch.setattr(live,'get_models',lambda:SimpleNamespace(device='test'))
    monkeypatch.setattr(live,'LivePipeline',FakePipeline)
    filename=tmp_path/'short.mp4';writer=cv2.VideoWriter(str(filename),cv2.VideoWriter_fourcc(*'mp4v'),10,(160,90))
    for i in range(10):writer.write(np.full((90,160,3),i*20,np.uint8))
    writer.release()
    with TestClient(app) as client:
        with filename.open('rb') as f:video=client.post('/api/videos/upload',files={'file':('short.mp4',f,'video/mp4')}).json()
        sid=client.post('/api/live/sessions',json={'videoId':video['id']}).json()['sessionId'];numbers=[]
        with client.websocket_connect('/ws/vision/'+sid) as ws:
            ws.receive_json();ws.send_json({'command':'play'})
            while True:
                msg=ws.receive_json()
                if msg['type']=='frame':numbers.append(msg['frameNumber']);ws.send_json({'command':'ack'})
                if msg.get('status')=='ended':break
            assert numbers and numbers==sorted(set(numbers))
            assert len(numbers)<=10
            assert client.get(f'/api/live/{sid}/report').json()['complete']


def test_camera_input_is_bounded_and_pauses(tmp_path,monkeypatch):
    monkeypatch.setattr(live,'get_models',lambda:SimpleNamespace(device='test'))
    monkeypatch.setattr(live,'LivePipeline',FakePipeline)
    with TestClient(app) as client:
        sid=client.post('/api/live/sessions',json={}).json()['sessionId']
        with client.websocket_connect('/ws/vision/'+sid) as ws:
            ws.receive_json();ws.send_json({'command':'play'})
            while ws.receive_json().get('status')!='live':pass
            jpeg=cv2.imencode('.jpg',np.zeros((90,160,3),np.uint8))[1].tobytes();ws.send_bytes(jpeg)
            assert next_frame(ws)['width']==160
            ws.send_bytes(b'not an image')
            assert ws.receive_json()['type']=='error'
            ws.send_json({'command':'pause'})
            while ws.receive_json().get('status')!='paused':pass
            prior=live.sessions[sid].processed;ws.send_bytes(jpeg);time.sleep(.1)
            assert live.sessions[sid].processed==prior


def test_important_file_event_clip_is_decodable(tmp_path,monkeypatch):
    monkeypatch.setattr(live,'ROOT',tmp_path)
    upload=tmp_path/'videos/uploads';upload.mkdir(parents=True)
    source=upload/'source.mp4';writer=cv2.VideoWriter(str(source),cv2.VideoWriter_fourcc(*'mp4v'),10,(160,90))
    for i in range(60):writer.write(np.full((90,160,3),i*3,np.uint8))
    writer.release()
    session=SimpleNamespace(id='b'*32,video={'info':{'storedName':'source.mp4'}},source_name='test',status='live',segments=[],processed=1,frames=live.LatestFrame())
    memory=live.EventMemory(session)
    event={'eventId':'EVT-00001','timestampSeconds':2.,'severity':'WARNING'}
    memory.schedule_clip(event,6.)
    path=tmp_path/'videos/sessions'/session.id/'events/EVT-00001/clip.mp4'
    deadline=time.monotonic()+8
    while not path.exists() and time.monotonic()<deadline:time.sleep(.05)
    assert path.exists()
    cap=cv2.VideoCapture(str(path))
    try:
        assert cap.read()[0]
        assert cap.get(cv2.CAP_PROP_FRAME_COUNT)>=50
    finally:cap.release()
    assert event['clip']['annotation'].startswith('original source')
