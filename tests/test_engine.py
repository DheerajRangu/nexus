import pytest
from ai.engine import Tracks, inside, occupancy, traffic, level
from backend.processor import CONFIG

def test_roi_edges_and_exclusion():
    assert inside((5,5),[(0,0),(10,0),(10,10),(0,10)])
    assert inside((0,5),[(0,0),(10,0),(10,10),(0,10)])
    assert not inside((11,5),[(0,0),(10,0),(10,10),(0,10)])

def test_occupancy_clips_and_does_not_double_count():
    polygon=[(0,0),(10,0),(10,10),(0,10)]
    assert occupancy([[0,0,5,10],[0,0,5,10]],polygon,10,10)==pytest.approx(.5)
    assert occupancy([[-10,-10,20,20]],polygon,10,10)==pytest.approx(1)

def test_empty_road_clear_and_congestion_severe():
    assert traffic(0,0,0,0,CONFIG)==0
    score=traffic(40,1,1,0,CONFIG)
    assert score==pytest.approx(1)
    assert level(score,CONFIG['traffic_thresholds'])=='SEVERE'
    assert level(.2,CONFIG['traffic_thresholds'])=='LOW'

def test_tracking_unique_motion_and_stop_duration():
    t=Tracks()
    t.update(1,'car',(0,0),0,.9,[0,0,10,10],5)
    moving=t.update(1,'car',(10,0),1,.9,[0,0,10,10],5)
    assert moving['motionPxSec']==10
    for second in range(2,6): stopped=t.update(1,'car',(10,0),second,.9,[0,0,10,10],5)
    assert stopped['stationarySeconds']==4
    assert len(t.unique)==1
    assert t.update(1,'car',(10,0),10,.9,[0,0,10,10],5)['stationarySeconds']==0

def test_transient_scores_do_not_flip_event_state():
    from ai.engine import TrafficSmoother
    smoother=TrafficSmoother(seconds=.1,persistence=1)
    thresholds=[.2,.4,.6,.8]
    assert smoother.update(.1,0,thresholds)[1]=='CLEAR'
    assert smoother.update(.9,.1,thresholds)[1]=='CLEAR'
    assert smoother.update(.1,.2,thresholds)[1]=='CLEAR'
    for i in range(3,25): score,state=smoother.update(.9,i/10,thresholds)
    assert state=='SEVERE'
    assert 0<=score<=1
