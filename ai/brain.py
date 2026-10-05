"""Evidence-grounded scene reasoning. Rule scores are not accident probabilities."""
from collections import Counter, deque
from typing import Any
import math
import numpy as np
from ai.engine import inside
from ai.perception import mask_occupancy, point_in_mask

TRAFFIC_NAMES={'CLEAR':'FREE FLOW','LOW':'LIGHT','MODERATE':'MODERATE','HEAVY':'HEAVY','SEVERE':'SEVERE'}

def overlap(a:list[float],b:list[float]) -> float:
    x=max(0,min(a[2],b[2])-max(a[0],b[0]));y=max(0,min(a[3],b[3])-max(a[1],b[1]))
    union=(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-x*y
    return x*y/max(1,union)

class PersistentEvidence:
    def __init__(self,seconds:float,min_observations:int):
        self.seconds=seconds;self.minimum=min_observations;self.history=deque()
    def update(self,detections:list[dict],time:float,mask:np.ndarray) -> dict[str,dict]:
        relevant=[]
        for item in detections:
            if item.get('scope')=='scene':
                relevant.append({**item,'onRoad':False});continue
            x1,y1,x2,y2=item['box']
            # Include signs/barriers immediately beside the road, but discount peripheral detections.
            on_road=point_in_mask(((x1+x2)/2,y2-1),mask) or point_in_mask(((x1+x2)/2,(y1+y2)/2),mask)
            adjacent=point_in_mask(((x1+x2)/2,min(mask.shape[0]-1,y2+mask.shape[0]*.025)),mask)
            if on_road or adjacent:relevant.append({**item,'onRoad':on_road})
        self.history.append((time,relevant))
        while self.history and time-self.history[0][0]>max(6,self.seconds*2):self.history.popleft()
        output={}
        for kind in {d['type'] for _,items in self.history for d in items}:
            sightings=[(t,[d for d in items if d['type']==kind]) for t,items in self.history if any(d['type']==kind for d in items)]
            if len(sightings)<self.minimum or sightings[-1][0]-sightings[0][0]<self.seconds or time-sightings[-1][0]>1.5:continue
            # Require evidence in a majority of recent observations; isolated flashes cannot confirm.
            if len(sightings)/len(self.history)<.6:continue
            latest=sightings[-1][1]
            output[kind]={'count':len(latest),'confidence':float(np.mean([d['confidence'] for _,items in sightings for d in items])),
                          'firstSeen':sightings[0][0],'lastSeen':sightings[-1][0],'boxes':[d['box'] for d in latest if d.get('box') is not None],
                          'scope':latest[0].get('scope','object'),
                          'experimental':any(d['experimental'] for d in latest),'observations':len(sightings),
                          'onRoad':any(d['onRoad'] for d in latest)}
        return output

class RoadBrain:
    def __init__(self,config:dict,capabilities:dict):
        self.config=config;self.capabilities=capabilities
        self.evidence=PersistentEvidence(config['evidence_persistence_seconds'],config['evidence_min_observations'])
        self.history=deque();self.events=[];self.active={};self.pending={};self.last_object_time=-1.;self.objects={}
        self.previous_tracks={};self.pair_signals={};self.last_status=None;self.gridlock_since=None
        self.status_candidate=None;self.status_since=0.

    def event(self,key:str,time:float,title:str,details:dict,severity:str='INFO',confidence:float|None=None) -> None:
        self.events.append({'eventId':f'EVT-{len(self.events)+1:05}','timestampSeconds':round(time,3),'eventType':key,
                            'title':title,'severity':severity,'confidence':confidence,'details':details})

    def persist(self,key:str,present:bool,time:float,title:str,details:dict,severity:str='MEDIUM',seconds:float=2,confidence:float|None=None) -> bool:
        if present:
            self.pending.setdefault(key,time)
            if time-self.pending[key]>=seconds:
                if key not in self.active:
                    self.active[key]={'start':self.pending[key],'lastSeen':time,'title':title}
                    self.event(key,time,title,details,severity,confidence)
                self.active[key]['lastSeen']=time
                return True
        else:
            self.pending.pop(key,None)
            if key in self.active and time-self.active[key]['lastSeen']>=2:
                prior=self.active.pop(key)
                self.event('EVENT_ENDED',time,f'{prior["title"]} no longer observed',{'eventType':key,'startedAt':prior['start']})
        return False

    def update(self,time:float,metrics:dict,tracks:list[dict],pedestrians:list[dict],objects:list[dict]|None,
               road:dict,flow:dict,lanes:list[dict]) -> dict[str,Any]:
        mask=road['mask'];motion=metrics['averageMotion'];score=metrics['trafficScore'];stopped_ratio=metrics['stoppedRatio']
        if objects is not None:
            confirmed=self.evidence.update(objects,time,mask)
            # A moving camera or brief weak match must not clear an established
            # scene finding instantly. Only confirmed evidence gets this grace.
            for kind,item in self.objects.items():
                if item.get('scope')=='scene' and kind not in confirmed and time-item['lastSeen']<=2.5:
                    confirmed[kind]=item
            self.objects=confirmed;self.last_object_time=time
        if time-self.last_object_time>2.5:self.objects={}
        evidence=self.objects
        construction={key:value for key,value in evidence.items() if key in self.config['construction_weights']}
        construction_score=min(1.,sum(self.config['construction_weights'][k]*min(4,v['count'])*v['confidence'] for k,v in construction.items()))
        strong={'excavator','road_roller','road_digging','bulldozer','crane','lane_closed_sign'}
        construction_present='construction_scene' in evidence or (construction_score>=self.config['construction_threshold'] and (bool(set(construction)&strong) or len(construction)>=3))
        has_construction=self.persist('CONSTRUCTION_EVIDENCE',construction_present,time,'Construction detected',{'evidence':construction,'score':construction_score},confidence=float(np.mean([v['confidence'] for v in construction.values()])) if construction else None,seconds=0)
        hazards={k:v for k,v in evidence.items() if k in self.config['hazard_weights'] and (v['onRoad'] or k in {'road_closure_scene','accident_aftermath_scene'})}
        road_blocked=bool(set(hazards)&{'road_closure_scene','road_block','road_barrier','temporary_barricade','fallen_tree'})
        accident_aftermath=bool(set(hazards)&{'accident_aftermath_scene','crashed_vehicle'})
        hazard_score=min(1.,sum(self.config['hazard_weights'][k]*v['confidence'] for k,v in hazards.items()))
        titles={'road_closure_scene':'Road blockage detected','accident_aftermath_scene':'Accident aftermath detected','crashed_vehicle':'Damaged vehicle detected','road_block':'Road blockage detected'}
        for kind,item in hazards.items():self.persist('HAZARD_'+kind.upper(),True,time,titles.get(kind,f'{kind.replace("_"," ").capitalize()} detected'),{'evidence':item,'scope':item.get('scope','object')},'HIGH',seconds=0,confidence=item['confidence'])
        for key in list(self.active):
            if key.startswith('HAZARD_') and key[7:].lower() not in hazards:self.persist(key,False,time,'',{})
        self.history.append({**metrics,'time':time})
        while self.history and time-self.history[0]['time']>max(30,self.config['trend_window_seconds']*2):self.history.popleft()
        old=[m for m in self.history if time-m['time']>=3]
        baseline=old[:max(1,len(old)//2)]
        baseline_motion=float(np.median([m['averageMotion'] for m in baseline])) if baseline else motion
        camera_unstable=flow['cameraMotionPxSec']>8
        collapse=bool(time>=5 and baseline_motion>12 and motion<baseline_motion*.3 and metrics['vehicleCount']>=3 and not camera_unstable)
        disruption=self.persist('SUDDEN_TRAFFIC_DISRUPTION',collapse,time,'Sudden traffic-flow disruption',{'beforeMotionPxSec':baseline_motion,'afterMotionPxSec':motion,'vehicleCount':metrics['vehicleCount']},'HIGH')
        trend='INSUFFICIENT HISTORY';slope=None
        if len(self.history)>5 and self.history[-1]['time']-self.history[0]['time']>=5:
            sample=[m for m in self.history if time-m['time']<=self.config['trend_window_seconds']]
            slope=float(np.polyfit([m['time']-sample[0]['time'] for m in sample],[m['trafficScore'] for m in sample],1)[0])
            trend='WORSENING' if slope>.006 else 'IMPROVING' if slope<-.006 else 'STABLE'
        projection=None
        if slope is not None and self.history[-1]['time']-self.history[0]['time']>=10:
            projection={'horizonSeconds':60,'projectedTrafficScore':max(0.,min(1.,score+slope*60)),
                        'method':'linear extrapolation of recent measured traffic score','experimental':True,
                        'interpretation':'traffic-score projection, not congestion probability'}
        gridlock=stopped_ratio>=.85 and metrics['roadOccupancy']>=.45 and metrics['vehicleCount']>=4
        is_gridlock=self.persist('GRIDLOCK_OBSERVED',gridlock,time,'Persistent gridlock pattern',{'stoppedRatio':stopped_ratio,'occupancy':metrics['roadOccupancy']},'HIGH',seconds=8)
        traffic_level='GRIDLOCK' if is_gridlock else TRAFFIC_NAMES[metrics['trafficLevel']]
        lane_results=[];wrong_way=[]
        for lane in lanes:
            members=[t for t in tracks if inside(t['center'],lane['polygon'])]
            occupied=mask_occupancy([t['box'] for t in members],self.lane_mask(mask,lane['polygon']))
            barriers=[box for k,v in evidence.items() if k in {'road_block','road_barrier','temporary_barricade','fallen_tree','excavator'} for box in v['boxes'] if inside(((box[0]+box[2])/2,box[3]-1),lane['polygon'])]
            obstruction=mask_occupancy(barriers,self.lane_mask(mask,lane['polygon']))
            avg=float(np.mean([t['motionPxSec'] for t in members])) if members else 0.
            stopped=sum(t['stationarySeconds']>=3 for t in members)
            potential_block=obstruction>.2 and (not members or stopped/max(1,len(members))>.7)
            blocked=self.persist('LANE_RESTRICTION_'+lane['id'],potential_block,time,f'{lane["id"]} may be obstructed',{'obstructionCoverage':obstruction,'experimentalGeometry':True},'HIGH',seconds=3)
            lane_state='BLOCKED' if blocked else 'CONGESTED' if stopped/max(1,len(members))>.5 and len(members)>=2 else 'SLOW' if members and avg<5 else 'FLOWING' if members else 'UNKNOWN'
            lane_results.append({**lane,'status':lane_state,'vehicleCount':len(members),'averageMotion':avg,'occupancy':occupied,'obstructionCoverage':obstruction,'reasons':['Persistent object evidence occupies an estimated lane region'] if blocked else []})
            moving=[t for t in members if t['motionPxSec']>5 and len(t.get('history',[]))>=5]
            vectors=[]
            for t in moving:
                history=t['history'];a=history[max(0,len(history)-10)];b=history[-1]
                vec=np.asarray(b['center'])-np.asarray(a['center']);norm=np.linalg.norm(vec)
                if norm>10:vectors.append((t,vec/norm))
            if len(vectors)>=4 and not camera_unstable:
                dominant=np.median([v for _,v in vectors],axis=0);norm=np.linalg.norm(dominant)
                if norm>.7:
                    for track,vector in vectors:
                        key=f'WRONG_WAY_{track["trackId"]}'
                        reversed_=float(np.dot(vector,dominant/norm))<-.8
                        if self.persist(key,reversed_,time,'Vehicle opposes observed lane flow',{'trackId':track['trackId'],'lane':lane['id'],'experimental':True},'HIGH',seconds=3):wrong_way.append({'trackId':track['trackId'],'lane':lane['id'],'experimental':True})
        unusual=[]
        moving_others=sum(t['motionPxSec']>12 for t in tracks)
        for track in tracks:
            unexpected=track['stationarySeconds']>=8 and moving_others>=3 and stopped_ratio<.4 and not camera_unstable
            if self.persist(f'UNUSUAL_STOP_{track["trackId"]}',unexpected,time,'Isolated vehicle remains stationary',{'trackId':track['trackId'],'stationarySeconds':track['stationarySeconds'],'movingVehiclesNearby':moving_others},seconds=2):unusual.append(track['trackId'])
        incident_pairs=[]
        for i,a in enumerate(tracks):
            for b in tracks[i+1:]:
                key=tuple(sorted([a['trackId'],b['trackId']]))
                pa=self.previous_tracks.get(a['trackId']);pb=self.previous_tracks.get(b['trackId'])
                if pa and pb and overlap(a['box'],b['box'])>.18 and a['motionPxSec']<3 and b['motionPxSec']<3 and pa['motionPxSec']>12 and pb['motionPxSec']>12:
                    before=math.dist(pa['center'],pb['center']);now=math.dist(a['center'],b['center'])
                    if now<before and not camera_unstable:self.pair_signals[key]=time
                signal=key in self.pair_signals and time-self.pair_signals[key]<10 and a['stationarySeconds']>=2 and b['stationarySeconds']>=2
                if self.persist('POSSIBLE_INCIDENT_'+str(key),signal,time,'Possible vehicle interaction requires review',{'trackIds':list(key),'evidence':['Converging overlap','Sudden movement drop','Persistent stopping'],'confidenceType':'rule evidence, not collision probability'},'HIGH',seconds=1):incident_pairs.append(list(key))
        self.pair_signals={k:v for k,v in self.pair_signals.items() if time-v<15}
        for key in list(self.active):
            if time-self.active[key]['lastSeen']>5:
                prior=self.active.pop(key);self.pending.pop(key,None)
                self.event('EVENT_ENDED',time,f'{prior["title"]} no longer observed',{'eventType':key,'startedAt':prior['start']})
        self.previous_tracks={t['trackId']:{'center':list(t['center']),'motionPxSec':t['motionPxSec']} for t in tracks}
        people=[p for p in pedestrians if p.get('stationarySeconds',0)>=2]
        pedestrian_alert=self.persist('PEDESTRIANS_IN_DRIVABLE_REGION',len(people)>=2,time,'People persist in the drivable region',{'count':len(people),'interpretation':'Crossing/worker/obstruction context is unresolved'},seconds=3)
        anomalies=[]
        if disruption:anomalies.append({'type':'UNKNOWN_ROAD_ANOMALY','title':'Traffic flow collapsed relative to earlier observations','evidence':[f'Motion fell from {baseline_motion:.1f} to {motion:.1f} px/sec'],'confidence':None})
        if unusual:anomalies.append({'type':'UNUSUAL_STOP','title':'Isolated stopped vehicle among moving traffic','trackIds':unusual,'confidence':None})
        construction_area=mask_occupancy([box for item in construction.values() for box in item['boxes']],mask) if has_construction else 0.
        hazard_area=mask_occupancy([box for item in hazards.values() for box in item['boxes']],mask)
        lane_restricted=sum(l['status']=='BLOCKED' for l in lane_results)
        penalties={'traffic':round(score*45,1),'construction':round(min(18,construction_area*35+construction_score*8) if has_construction else 0,1),'hazards':round(hazard_score*30,1),'potentialIncidents':15 if incident_pairs else 0,'laneRestriction':round(15*lane_restricted/max(1,len(lane_results)),1)}
        health=round(max(0,100-sum(penalties.values())))
        access=round(max(0,health-stopped_ratio*10-(8 if disruption else 0)))
        if road_blocked:access=min(access,20)
        elif accident_aftermath:access=min(access,45)
        # A visual heuristic cannot establish physical ambulance clearance or legal right of way.
        access_label='EXCELLENT' if access>=90 else 'GOOD' if access>=75 else 'USABLE' if access>=55 else 'POOR' if access>=35 else 'AVOID'
        primary='CRITICAL HAZARD EVIDENCE' if 'fire' in hazards else 'POSSIBLE COLLISION' if incident_pairs else 'ROAD BLOCKAGE DETECTED' if road_blocked else 'ACCIDENT AFTERMATH DETECTED' if accident_aftermath else 'POSSIBLE ROAD RESTRICTION' if lane_restricted else 'CONSTRUCTION DETECTED' if has_construction else 'TRAFFIC DISRUPTION' if disruption else 'NO VEHICLES OBSERVED' if metrics['vehicleCount']==0 else traffic_level+' OBSERVED'
        findings=[{'kind':'traffic','title':traffic_level,'description':f'{metrics["vehicleCount"]} visible vehicles, {metrics["roadOccupancy"]:.0%} approximate road occupancy, {motion:.1f} px/sec movement.'}]
        if has_construction:findings.append({'kind':'construction','title':'Construction detected','description':'Road construction activity is visible across repeated scene observations.' if 'construction_scene' in construction else ', '.join(f'{v["count"]} {k.replace("_"," ")}' for k,v in construction.items()),'confidence':float(np.mean([v['confidence'] for v in construction.values()])),'confidenceType':'detector score, not calibrated scene probability','experimental':any(v['experimental'] for v in construction.values())})
        for kind,item in hazards.items():findings.append({'kind':'hazard','title':titles.get(kind,kind.replace('_',' ').capitalize()),'description':f'Sustained scene evidence across {item["observations"]} observations.' if item.get('scope')=='scene' else f'Object evidence overlaps the road across {item["observations"]} observations.','confidence':item['confidence'],'confidenceType':'visual similarity' if item.get('scope')=='scene' else 'detector score','experimental':item['experimental']})
        if incident_pairs:findings.append({'kind':'incident','title':'Possible incident','description':'Overlapping trajectories with sudden stopping persisted. Review the video; collision is not confirmed.','confidence':None,'experimental':True})
        if pedestrian_alert:findings.append({'kind':'pedestrian','title':'People within the drivable region','description':f'{len(people)} persistent pedestrian tracks; crossing intent is unknown.'})
        emergency={k:v for k,v in evidence.items() if k in {'emergency_vehicle','fire_vehicle','police_vehicle'}}
        for kind,item in emergency.items():
            title={'emergency_vehicle':'Possible ambulance','fire_vehicle':'Possible fire vehicle','police_vehicle':'Possible police vehicle'}[kind]
            matching=[t for t in tracks if any(overlap(t['box'],box)>.3 for box in item['boxes'])]
            behavior='Stationary or slowing' if matching and np.mean([t['motionPxSec'] for t in matching])<5 else 'Moving' if matching else 'Motion association unresolved'
            findings.append({'kind':'emergency','title':title,'description':behavior+' in the predicted road region. Active emergency response is not established.','confidence':item['confidence'],'experimental':item['experimental']})
            self.persist('EMERGENCY_VEHICLE_EVIDENCE_'+kind.upper(),True,time,title,{'evidence':item,'motionAssociation':behavior},'MEDIUM',seconds=0,confidence=item['confidence'])
        if wrong_way:findings.append({'kind':'wrong-way','title':'Direction anomaly','description':f'{len(wrong_way)} vehicles oppose the dominant motion of an estimated lane.','experimental':True})
        if camera_unstable:findings.append({'kind':'quality','title':'Camera motion affects interpretation','description':'Measured background movement may bias pixel speed and trajectory events.'})
        text=f'{traffic_level.capitalize()} is observed in the visible road region, with {metrics["vehicleCount"]} vehicles and {metrics["roadOccupancy"]:.0%} approximate occupancy. '
        cause='UNRESOLVED';links=[{'from':'Tracked vehicles','relation':'occupy','to':'Predicted road'},{'from':'Occupancy + movement + stopping','relation':'support','to':traffic_level+' traffic assessment'}]
        if has_construction:
            text+='Persistent construction objects overlap the predicted road area. This may contribute to reduced flow; a causal lane closure is not confirmed. '
            cause='CONSTRUCTION MAY CONTRIBUTE';links.append({'from':'Persistent construction evidence','relation':'may affect','to':'Traffic flow'})
        if hazards:text+='Road-overlapping hazard evidence needs manual verification. '
        if road_blocked:
            text='Road blockage detected: persistent closure or obstruction evidence is visible. '+text
            cause='ROAD BLOCKAGE'
        if accident_aftermath:
            text='Accident aftermath detected: visible vehicle damage suggests a prior collision. '+text
            cause='ACCIDENT AFTERMATH'
        if incident_pairs:text='Possible collision detected: converging vehicle trajectories were followed by sudden stopping. '+text
        if metrics['vehicleCount']==0 and not hazards and not has_construction:
            text='No vehicles are currently tracked. Road access has not been established. '
        if disruption:text+=f'Movement has dropped from an earlier {baseline_motion:.1f} to {motion:.1f} px/sec. The cause is unresolved. '
        if trend not in {'INSUFFICIENT HISTORY','STABLE'}:text+=f'The measured traffic-score trend is {trend.lower()}. '
        if not road['reliable']:text+='Road-region quality is uncertain; review the segmentation or use the expert override. '
        recommendation='REVIEW BEFORE EMERGENCY ROUTING' if access>=55 else 'CONSIDER ALTERNATIVE ROUTE — VERIFY FIRST'
        if hazards or incident_pairs:recommendation='POTENTIAL HAZARD — MANUAL REVIEW REQUIRED'
        if road_blocked:recommendation='AVOID ROAD — ROAD BLOCKAGE DETECTED'
        elif accident_aftermath or incident_pairs:recommendation='USE ALTERNATE ROUTE — INCIDENT DETECTED'
        if self.status_candidate!=primary:self.status_candidate=primary;self.status_since=time
        urgent=bool(hazards or incident_pairs or has_construction or lane_restricted or disruption)
        if self.last_status!=primary and (self.last_status is None or urgent or time-self.status_since>=1.5):
            # Specific incident events already describe the evidence. Avoid a second
            # transcript card saying the same thing as a generic condition change.
            if not urgent:
                self.event('ROAD_CONDITION_CHANGED',time,primary,{'previous':self.last_status,'current':primary,'trafficScore':score})
            self.last_status=primary
        confidence_items=[v['confidence'] for v in construction.values()]+[v['confidence'] for v in hazards.values()]
        return {'timestampSeconds':round(time,3),'condition':primary,'understanding':text.strip(),'trafficLevel':traffic_level,'trend':trend,
                'trendSlopePerSecond':slope,'predictionRisk':None,'trafficProjection':projection,'findings':findings,'constructionDetected':has_construction if self.capabilities.get('objects') else None,
                'constructionScore':construction_score,'evidence':evidence,'hazards':list(hazards),'lanes':lane_results,'anomalies':anomalies,'wrongWay':wrong_way,
                'roadBlocked':road_blocked,'accidentAftermath':accident_aftermath,'incidentSuspected':bool(incident_pairs),'incidentConfidence':None,'roadHealthScore':health,'emergencyAccessScore':access,'accessLabel':access_label,
                'scoreBasis':'EXPERIMENTAL VISUAL HEURISTIC — not validated ambulance passability','scorePenalties':penalties,'recommendation':recommendation,
                'routingDecision':'REQUIRES_VERIFICATION','cause':cause,'sceneGraph':links,'observationConfidence':float(np.mean(confidence_items)) if confidence_items else None,
                'confidenceType':'mean detector score; not a calibrated road-safety probability','roadRegion':{k:v for k,v in road.items() if k not in {'mask','sidewalkMask'}},
                'flow':flow,'activeEvents':list(self.active.values()),'coverage':self.capabilities,
                'incidentMemory':{'conditionChanges':[{'time':e['timestampSeconds'],'condition':e['details'].get('current')} for e in self.events if e['eventType']=='ROAD_CONDITION_CHANGED'],
                                  'firstObservationSeconds':self.history[0]['time'],'latestObservationSeconds':time,'eventsObserved':len(self.events)},
                'limitations':['Emergency access and road health are heuristic scores, not clearance certification.',
                    'Open-vocabulary construction/hazard labels are experimental and can miss or misclassify objects.',
                    'Lane geometry is inferred only where markings persist; lane widths and closed-road certainty are unresolved.',
                    'No calibrated speed, accident probability, or 60-second prediction probability is claimed.']}

    @staticmethod
    def lane_mask(mask:np.ndarray,polygon:list[list[float]]) -> np.ndarray:
        import cv2
        result=np.zeros_like(mask);cv2.fillPoly(result,[np.asarray(polygon,np.int32)],1)
        return result & mask
