import cv2
import numpy as np
import yaml
from pathlib import Path
from ai.brain import PersistentEvidence,RoadBrain
from ai.perception import mask_occupancy,OpticalFlow,point_in_mask
from ai.engine import traffic
from backend.processor import CONFIG

CONFIGURATION=yaml.safe_load((Path(__file__).parents[1]/'config/omnivision.yaml').read_text())

def road():return {'mask':np.ones((100,100),np.uint8),'confidence':.8,'coverage':1.,'reliable':True,'method':'test mask'}
def metrics(time,motion=30,count=8,occupied=.3,stopped=0,score=.3):return dict(timestampSeconds=time,vehicleCount=count,averageMotion=motion,roadOccupancy=occupied,stoppedRatio=stopped,stoppedVehicles=round(count*stopped),trafficScore=score,trafficLevel='LOW')
def object_(kind='construction_cone',confidence=.9):return {'type':kind,'confidence':confidence,'box':[20,20,40,40],'experimental':True}
def brain():return RoadBrain(CONFIGURATION,{'objects':'test detector','gaps':[]})
FLOW={'roadMotionPxSec':10,'cameraMotionPxSec':0,'available':True}

def test_mask_union_clipping():
    mask=np.zeros((100,100),np.uint8);mask[:,:50]=1
    assert point_in_mask((25,50),mask)
    assert not point_in_mask((75,50),mask)
    assert mask_occupancy([[0,0,50,100],[0,0,50,100]],mask)==1
    assert mask_occupancy([[60,0,100,100]],mask)==0

def test_one_frame_and_one_cone_do_not_confirm_construction():
    persistence=PersistentEvidence(2,3)
    assert not persistence.update([object_()],0,road()['mask'])
    assert not persistence.update([],1,road()['mask'])
    b=brain()
    for time in range(8):result=b.update(time,metrics(time),[],[],[object_()],road(),FLOW,[])
    assert result['constructionDetected'] is False
    assert not any(f['kind']=='construction' for f in result['findings'])

def test_combined_persistent_construction_and_explainable_score():
    b=brain()
    detections=[object_('excavator'),object_('construction_sign'),object_()]
    for time in range(8):result=b.update(time,metrics(time),[],[],detections,road(),FLOW,[])
    assert result['constructionDetected'] is True
    assert result['constructionScore']>.55
    assert any(f['kind']=='construction' for f in result['findings'])
    assert result['scorePenalties']['construction']>0
    assert result['routingDecision']=='REQUIRES_VERIFICATION'
    assert 'not confirmed' in result['understanding']
    assert result['observationConfidence']==.9

def test_two_stopped_vehicles_are_not_accident():
    b=brain();tracks=[dict(trackId=i,type='car',center=[20+i*10,40],box=[10+i*10,20,30+i*10,50],motionPxSec=0,stationarySeconds=10,history=[]) for i in [1,2]]
    for time in range(8):result=b.update(time,metrics(time,motion=0,count=2,stopped=1),tracks,[],[],road(),FLOW,[])
    assert result['incidentSuspected'] is False
    assert result['incidentConfidence'] is None
    assert result['lanes']==[]

def test_sustained_motion_collapse_generates_anomaly_but_not_invented_cause():
    b=brain()
    for time in range(20):
        result=b.update(time,metrics(time,motion=40 if time<10 else 2,score=.2 if time<10 else .75),[],[],[],road(),FLOW,[])
    assert any(e['eventType']=='SUDDEN_TRAFFIC_DISRUPTION' for e in b.events)
    assert result['cause']=='UNRESOLVED'
    assert result['predictionRisk'] is None
    assert result['trend']=='WORSENING'

def test_hazard_outside_road_does_not_affect_score():
    mask=np.zeros((100,100),np.uint8);mask[:,:10]=1
    sample={**road(),'mask':mask};b=brain()
    for time in range(8):result=b.update(time,metrics(time),[],[],[object_('fire')],sample,FLOW,[])
    assert not result['hazards']
    assert result['scorePenalties']['hazards']==0

def test_count_alone_cannot_make_fast_traffic_severe():
    assert traffic(100,.6,0,80,CONFIG)<.4
    assert traffic(20,.6,1,0,CONFIG)>.8

def test_optical_flow_has_real_movement_and_warmup():
    flow=OpticalFlow();random=np.random.default_rng(4)
    frame=random.integers(0,256,(100,100,3),dtype=np.uint8)
    mask=np.ones((100,100),np.uint8)
    assert flow.update(frame,mask,0)['available'] is False
    moved=cv2.warpAffine(frame,np.float32([[1,0,2],[0,1,0]]),(100,100))
    result=flow.update(moved,mask,1)
    assert result['available']
    assert result['roadMotionPxSec']>1

def test_lane_line_shapes_supported_across_opencv_versions(monkeypatch):
    from ai.perception import LaneGeometry
    lines=np.asarray([[10,20,10,90],[80,20,80,90]],dtype=np.int32)
    for shape in [lines,lines.reshape(-1,1,4)]:
        monkeypatch.setattr(cv2,'HoughLinesP',lambda *args,**kwargs:shape)
        geometry=LaneGeometry()
        geometry.update(np.zeros((100,100,3),np.uint8),np.ones((100,100),np.uint8),0)
        result=geometry.update(np.zeros((100,100,3),np.uint8),np.ones((100,100),np.uint8),2)
        assert isinstance(result,list)
