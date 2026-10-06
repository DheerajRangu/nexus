"""Live source clock, bounded latest-frame slots, synchronized packets and incremental evidence."""
import asyncio
import base64
import copy
import json
import math
import os
import threading
import time
import uuid
import subprocess
from concurrent.futures import ThreadPoolExecutor
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
from backend.road_report import road_story, printable_report
from pydantic import BaseModel
from ai.live import LivePipeline, ModelBundle
from ai.visualization import draw
from backend.database import get_video
from backend.processor import ROOT

router=APIRouter();sessions={};sessions_lock=threading.Lock();model_lock=threading.Lock();models=None
MAX_FRAME_BYTES=2*1024*1024
clip_executor=ThreadPoolExecutor(max_workers=1,thread_name_prefix="aegis-evidence")

def get_models():
    global models
    with model_lock:
        if models is None:models=ModelBundle()
        return models

class LatestFrame:
    """Single bounded slot; a new frame replaces an unconsumed frame."""
    def __init__(self):self.value=None;self.dropped=0;self.lock=threading.Lock()
    def put(self,value):
        with self.lock:
            if self.value is not None:self.dropped+=1
            self.value=value
    def take(self):
        with self.lock:value=self.value;self.value=None;return value
    def clear(self):
        with self.lock:self.value=None

class EventMemory:
    def __init__(self,session):
        self.session=session;self.root=ROOT/'videos/sessions'/session.id;self.root.mkdir(parents=True,exist_ok=True)
        self.events=[];self.packages={};self.buffer=deque(maxlen=30);self.pending=[];self.brain_cursor=0
        self.clip_jobs=set();self.last_frame=-10.;self.last_metrics=None;self.last_change=-10.;self.last_access=None;self.timeline=[];self.last_timeline=-10.
    def record(self,frame,packet,pipeline):
        t=packet['videoTimestamp'];segment=packet['segment'];metrics=packet['metrics'];scene=packet['intelligence']
        for event in self.events:
            if event['segment']!=segment or event['state']=='ENDED' or event['severity']=='INFO':continue
            signature=(scene['trafficLevel'],scene['trend'],tuple((l['id'],l['status']) for l in scene['lanes']),round(scene['emergencyAccessScore']/10))
            if event.get('_signature')!=list(signature) and t-event.get('_lastUpdate',event['timestampSeconds'])>=2:
                event['_signature']=list(signature);event['_lastUpdate']=t
                event['state']='WORSENING' if scene['trend']=='WORSENING' else 'IMPROVING' if scene['trend']=='IMPROVING' else 'ACTIVE'
                event['story'].append({'time':t,'description':scene['understanding'],'trafficLevel':scene['trafficLevel'],'emergencyAccess':scene['emergencyAccessScore']})
                event['story']=event['story'][-32:]
                event['trafficReaction']={'observedTrafficLevel':scene['trafficLevel'],'trend':scene['trend'],'merging':sum(e['eventType']=='LANE_CHANGE' and e['segment']==segment and t-e['timestampSeconds']<5 for e in self.events),'causality':'association only; causal effect unresolved'}
        # Bounded evidence window: JPEG snapshots at <=5 Hz, never all video frames.
        if t-self.last_frame>=.2 or t<self.last_frame:
            raw=cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,85])[1].tobytes()
            annotated=cv2.imencode('.jpg',draw(frame,packet['tracks'],[],packet['objects'],pipeline.road,pipeline.lanes,metrics,scene),[cv2.IMWRITE_JPEG_QUALITY,85])[1].tobytes()
            sharp=float(cv2.Laplacian(cv2.resize(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),(320,180)),cv2.CV_64F).var())
            confidence=float(np.mean([x['confidence'] for x in packet['tracks']])) if packet['tracks'] else 0.
            self.buffer.append({'time':t,'segment':segment,'raw':raw,'annotated':annotated,'quality':math.log1p(sharp)+confidence,
                'reason':'Sharpness, visible scene context and measured object scores','tracks':packet['tracks'],'scene':scene})
            self.last_frame=t
        while self.buffer and (self.buffer[0]['segment']!=segment or t-self.buffer[0]['time']>4):self.buffer.popleft()
        if t-self.last_timeline>=1 or t<self.last_timeline:
            self.timeline.append({**metrics,'segment':segment,'roadHealthScore':scene['roadHealthScore'],'emergencyAccessScore':scene['emergencyAccessScore']});self.last_timeline=t
        fresh=pipeline.brain.events[self.brain_cursor:];self.brain_cursor=len(pipeline.brain.events)
        for event in fresh:self.add(event,packet)
        if self.last_metrics and t-self.last_change>=3:
            prior=self.last_metrics
            if metrics['vehicleCount']>=prior['vehicleCount']+max(4,round(prior['vehicleCount']*.4)):
                self.add({'eventType':'DENSITY_INCREASE','title':'Visible vehicle density increased','severity':'NOTICE','details':{'before':prior['vehicleCount'],'after':metrics['vehicleCount']}},packet);self.last_change=t
            if self.last_access is not None and self.last_access-scene['emergencyAccessScore']>=15 and not scene.get('roadBlocked') and not scene.get('accidentAftermath'):
                self.add({'eventType':'ACCESS_CHANGE','title':'Visual emergency-access estimate decreased','severity':'WARNING','details':{'before':self.last_access,'after':scene['emergencyAccessScore'],'experimental':True}},packet);self.last_change=t
        if self.last_metrics is None or t-self.last_change>=3:self.last_metrics=metrics.copy();self.last_access=scene['emergencyAccessScore'];self.last_change=t
        for event_id,start,seg in list(self.pending):
            if seg!=segment or t-start>=2:
                self.finalize(event_id,start,seg);self.pending.remove((event_id,start,seg))
        for event in self.events:
            if event["segment"]==segment and event["severity"] in {"WARNING","CRITICAL"} and t-event["timestampSeconds"]>=5:
                self.schedule_clip(event,t)
        # Persist incrementally; report is available before playback ends.
        self.persist(packet)
    def add(self,event,packet):
        t=packet['videoTimestamp'];kind=event['eventType'];segment=packet['segment']
        severity={'MEDIUM':'NOTICE','HIGH':'WARNING','LOW':'INFO'}.get(event.get('severity','INFO'),event.get('severity','INFO'))
        if kind.startswith('POSSIBLE_INCIDENT') or kind in {'HAZARD_FIRE','HAZARD_ACCIDENT_AFTERMATH_SCENE','HAZARD_CRASHED_VEHICLE','GRIDLOCK_OBSERVED'}:severity='CRITICAL'
        end=kind=='EVENT_ENDED'
        active_kind=event.get('details',{}).get('eventType') if end else kind
        ongoing=next((e for e in reversed(self.events) if e['eventType']==active_kind and e['segment']==segment and e['state']!='ENDED'),None)
        if end and ongoing:
            ongoing.update(state='ENDED',endTime=t);ongoing['story'].append({'time':t,'description':event['title']});return
        if ongoing and kind!='ROAD_CONDITION_CHANGED' and t-ongoing['timestampSeconds']<3:return
        event_id=f'EVT-{len(self.events)+1:05}'
        description=event.get('title',kind)+'. '+packet['intelligence']['understanding']
        entry={**event,'eventId':event_id,'timestampSeconds':round(event.get('timestampSeconds',t),3),'segment':segment,
            'severity':severity,'confidence':event.get('confidence'),'confidenceType':'visual similarity' if event.get('details',{}).get('scope')=='scene' else 'detector score' if event.get('confidence') is not None else 'uncalibrated rule evidence',
            'state':'DETECTED' if severity in {'WARNING','CRITICAL'} else 'STABLE','peakTime':t,'endTime':None,
            'description':description,'observed':event.get('details',{}),'inference':packet['intelligence']['cause'],
            'recommendation':packet['intelligence']['recommendation'],'emergencyAccess':packet['intelligence']['emergencyAccessScore'],
            'lane':event.get('details',{}).get('lane'),'sceneGraph':packet['intelligence']['sceneGraph'],
            'involvedTracks':[tr['displayId'] for tr in packet['tracks'] if tr['trackId'] in event.get('details',{}).get('trackIds',[event.get('details',{}).get('trackId')])],
            'trafficAtDetection':packet['metrics'],'affectedLanes':[l['id'] for l in packet['lanes'] if l['status']=='BLOCKED'],
            'story':[{'time':t,'description':event.get('title',kind)}],'evidence':{}}
        self.events.append(entry)
        if severity in {'WARNING','CRITICAL'}:
            self.pending.append((event_id,t,segment));self.finalize(event_id,t,segment,partial=True)
        if getattr(self.session,'camera_id',None):
            from backend.vision_bridge import publish
            publish(self.session.camera_id,self.session.id,entry)
        with (self.root/'transcript.jsonl').open('a') as handle:handle.write(json.dumps(entry)+'\n')
    def finalize(self,event_id,t,segment,partial=False):
        event=next(e for e in self.events if e['eventId']==event_id)
        candidates=[f for f in self.buffer if f['segment']==segment and abs(f['time']-t)<=2.1]
        if not candidates:return
        best=max(candidates,key=lambda x:x['quality']);before=min(candidates,key=lambda x:x['time']);after=max(candidates,key=lambda x:x['time'])
        folder=self.root/'events'/event_id;folder.mkdir(parents=True,exist_ok=True)
        chosen={'event':best,'before':before}
        if not partial and after['time']>t:chosen['after']=after
        for role,item in chosen.items():
            for suffix in ['raw','annotated']:(folder/f'{role}_{suffix}.jpg').write_bytes(item[suffix])
            event['evidence'][role]={'timestampSeconds':item['time'],'image':f'/api/live/{self.session.id}/events/{event_id}/{role}_annotated.jpg?t={item["time"]:.3f}',
                'raw':f'/api/live/{self.session.id}/events/{event_id}/{role}_raw.jpg?t={item["time"]:.3f}','whyThisFrame':item['reason']}
        boxes=[np.asarray(tr['box']) for tr in best['tracks'] if tr['stationarySeconds']>1]
        if boxes:
            image=cv2.imdecode(np.frombuffer(best['raw'],np.uint8),cv2.IMREAD_COLOR);h,w=image.shape[:2]
            bounds=np.vstack(boxes);x1,y1=np.maximum(0,bounds[:,:2].min(axis=0)-40).astype(int);x2,y2=np.minimum([w,h],bounds[:,2:].max(axis=0)+40).astype(int)
            if x2>x1 and y2>y1:cv2.imwrite(str(folder/'context_crop.jpg'),image[y1:y2,x1:x2]);event['evidence']['crop']={'image':f'/api/live/{self.session.id}/events/{event_id}/context_crop.jpg'}
        event.update(peakTime=best['time'],state='ACTIVE' if partial else 'STABLE')
        event['story'].append({'time':after['time'],'description':'Evidence window still collecting' if partial else 'Before, event and observed aftermath evidence selected'})
        (folder/'metadata.json').write_text(json.dumps(event,indent=2));(folder/'description.json').write_text(json.dumps({'observed':event['observed'],'inferred':event['inference'],'description':event['description'],'recommendation':event['recommendation']},indent=2))
    def schedule_clip(self,event,observed_until):
        if not self.session.video or event['eventId'] in self.clip_jobs:return
        self.clip_jobs.add(event['eventId']);event_id=event['eventId']
        source=ROOT/'videos/uploads'/self.session.video['info']['storedName']
        folder=self.root/'events'/event_id;folder.mkdir(parents=True,exist_ok=True)
        start=max(0,event['timestampSeconds']-5);end=min(observed_until,event['timestampSeconds']+5)
        if end<=start:return
        def encode():
            import imageio_ffmpeg
            target=folder/'clip.mp4';temp=folder/'clip.pending.mp4'
            try:
                subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-ss',str(start),'-i',str(source),'-t',str(end-start),'-an','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-movflags','+faststart',str(temp)],check=True,capture_output=True,timeout=60)
                temp.replace(target)
            except (subprocess.SubprocessError,OSError):temp.unlink(missing_ok=True)
        clip_executor.submit(encode)
        event['clip']={'url':f'/api/live/{self.session.id}/events/{event_id}/clip.mp4','startTime':start,'endTime':end,'annotation':'original source; annotated event images supplied separately'}
    def reset(self):
        for event_id,t,seg in self.pending:self.finalize(event_id,t,seg)
        self.pending=[];self.buffer.clear();self.brain_cursor=0;self.last_metrics=None;self.last_frame=-10.;self.last_timeline=-10.
        for event in self.events:
            if event['state']!='ENDED':event.update(state='ENDED',endReason='Playback segment ended; continued identity not established')
    def persist(self,packet):
        scene=packet['intelligence']
        important=[e for e in self.events if e['severity']!='INFO']
        report={'sessionId':self.session.id,'source':self.session.source_name,'status':self.session.status,'complete':self.session.status=='ended',
            'coverageNote':'Sampled live observations only. Skipped frames and manual seeks leave gaps; track IDs are segment-local.',
            'segments':self.session.segments,'processedFrames':self.session.processed,'droppedFrames':self.session.frames.dropped,
            'summary':road_story(scene,self.events),'keyFindings':list(dict.fromkeys(e.get('title',e['eventType']) for e in important))[-8:],
            'currentState':scene,'events':self.events,'trafficEvolution':self.timeline,'limitations':scene['limitations'],
            'trackHistory':'tracks.jsonl','stateHistory':'states.jsonl'}
        temp=self.root/'report.tmp';temp.write_text(json.dumps(report,indent=2));temp.replace(self.root/'report.json')
        with (self.root/'states.jsonl').open('a') as f:f.write(json.dumps({'videoTimestamp':packet['videoTimestamp'],'segment':packet['segment'],'metrics':packet['metrics'],'intelligence':scene})+'\n')
        with (self.root/'tracks.jsonl').open('a') as f:f.write(json.dumps({'videoTimestamp':packet['videoTimestamp'],'segment':packet['segment'],'tracks':[{k:v for k,v in tr.items() if k!='history'} for tr in packet['tracks']]})+'\n')

class LiveSession:
    def __init__(self,video,mode,configured_camera=False,camera_id=None):
        self.camera_id=camera_id
        self.id=uuid.uuid4().hex;self.video=video;self.mode=mode;self.configured_camera=configured_camera;self.source_name='Configured CCTV camera' if configured_camera else video['info']['filename'] if video else 'Browser camera'
        self.frames=LatestFrame();self.output=LatestFrame();self.lock=threading.RLock();self.closed=threading.Event()
        self.status='ready';self.playing=False;self.position=0.;self.generation=0;self.segment=1;self.segments=[]
        self.anchor=time.monotonic();self.anchor_time=0.;self.processed=0;self.error=None;self.memory=EventMemory(self)
        self.preview_requested=False;self.command_event=threading.Event();self.eof_generation=None;self.pipeline=None;self.last_packet=None
        self.decoder_thread=threading.Thread(target=self.decode_camera if configured_camera else self.decode,daemon=True) if video or configured_camera else None
        self.worker_thread=threading.Thread(target=self.process,daemon=True)
        if self.decoder_thread:self.decoder_thread.start()
        self.worker_thread.start()
    def command(self,command,timestamp=None):
        with self.lock:
            if command=='play':
                if self.status=='ended':self.position=0.;self.generation+=1;self.segment+=1
                self.playing=True;self.status='initializing' if self.pipeline is None else 'live';self.anchor=time.monotonic();self.anchor_time=self.position
            elif command=='pause':
                self.position=self.clock();self.playing=False;self.status='paused';self.generation+=1;self.frames.clear();self.output.clear()
            elif command in {'seek','stop'}:
                self.position=0. if command=='stop' else min(max(0.,float(timestamp)),max(0,self.duration-.001))
                self.generation+=1;self.segment+=1;self.anchor=time.monotonic();self.anchor_time=self.position
                self.frames.clear();self.output.clear();self.eof_generation=None
                if command=='stop':self.playing=False;self.preview_requested=False;self.status='stopped'
                else:self.preview_requested=not self.playing;self.status='live' if self.playing else 'paused'
            self.command_event.set()
    @property
    def duration(self):return self.video['info']['durationSeconds'] if self.video else 0.
    def clock(self):return min(self.duration,self.anchor_time+time.monotonic()-self.anchor) if self.video and self.playing else self.position
    def decode(self):
        cap=cv2.VideoCapture(str(ROOT/'videos/uploads'/self.video['info']['storedName']));fps=self.video['info']['fps'];generation=-1;index=0
        try:
            while not self.closed.is_set():
                with self.lock:
                    active=(self.playing or self.preview_requested) and self.status!='initializing';gen=self.generation;target=self.clock();segment=self.segment
                if not active:self.command_event.wait(.03);self.command_event.clear();continue
                wanted=min(self.video['info']['frameCount']-1,int(target*fps))
                if gen!=generation or wanted-index>fps*.5:
                    cap.set(cv2.CAP_PROP_POS_FRAMES,wanted);index=wanted;generation=gen
                if index>wanted:
                    if index>=self.video['info']['frameCount']:self.eof_generation=gen
                    self.closed.wait(.005);continue
                ok,frame=cap.read()
                if not ok:self.eof_generation=gen;self.closed.wait(.02);continue
                self.frames.put((gen,segment,index,index/fps,time.monotonic(),frame));index+=1
        finally:cap.release()
    def decode_camera(self):
        source=os.environ['AEGIS_CAMERA_SOURCE']
        source=int(source) if source.isdigit() else source
        capture=None;index=0
        try:
            while not self.closed.is_set():
                if not self.playing or self.status=='initializing':
                    if capture:capture.release();capture=None
                    self.closed.wait(.02);continue
                if capture is None:
                    capture=cv2.VideoCapture(source);capture.set(cv2.CAP_PROP_BUFFERSIZE,1)
                    if not capture.isOpened():raise RuntimeError('Configured camera could not be opened')
                ok,frame=capture.read()
                if not ok:raise RuntimeError('Configured camera stopped delivering frames')
                if not self.playing:continue
                height,width=frame.shape[:2]
                if width>1280:frame=cv2.resize(frame,(1280,round(height*1280/width)))
                timestamp=time.monotonic()-self.anchor+self.anchor_time
                self.position=timestamp;self.frames.put((self.generation,self.segment,index,timestamp,time.monotonic(),frame));index+=1
        except Exception as exc:self.error=str(exc);self.playing=False;self.status='error'
        finally:
            if capture:capture.release()
    def camera_frame(self,data):
        if len(data)>MAX_FRAME_BYTES:raise ValueError('Camera frame exceeds 2 MB')
        if not self.playing or self.status=='initializing':return
        image=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR)
        if image is None or image.shape[0]*image.shape[1]>1920*1080:raise ValueError('Camera frame must be a valid JPEG no larger than 1920×1080')
        stamp=time.monotonic()-self.anchor+self.anchor_time
        self.position=stamp;self.frames.put((self.generation,self.segment,self.processed,stamp,time.monotonic(),image))
    def process(self):
        bundle=None;segment=-1
        try:
            while not self.closed.is_set():
                if not (self.playing or self.preview_requested):self.closed.wait(.02);continue
                if bundle is None:
                    bundle=get_models()
                    with self.lock:self.anchor=time.monotonic();self.anchor_time=self.position;self.status='live' if self.playing else 'paused'
                if segment!=self.segment:
                    self.memory.reset();self.pipeline=LivePipeline(bundle,self.mode,self.segment);segment=self.segment
                    self.segments.append({'segment':segment,'startTime':self.position,'trackIdentity':'local to this segment'})
                item=self.frames.take()
                if item is None:
                    if self.eof_generation==self.generation and self.last_packet:
                        self.playing=False;self.status='ended';self.position=self.duration
                        for event in self.memory.events:
                            if event['severity'] in {'WARNING','CRITICAL'}:self.memory.schedule_clip(event,self.last_packet['videoTimestamp'])
                        self.memory.reset();self.memory.persist(self.last_packet)
                    self.closed.wait(.005);continue
                gen,seg,number,stamp,decoded,frame=item
                if gen!=self.generation or seg!=segment:continue
                started=time.monotonic()
                with model_lock:packet=self.pipeline.analyze(frame,stamp)
                elapsed=time.monotonic()-started
                # Pause/seek during inference invalidates the completed frame and its metadata.
                if gen!=self.generation or not (self.playing or self.preview_requested):continue
                self.processed+=1;self.segments[-1]['lastObservedTime']=stamp
                packet.update(type='frame',frameNumber=number,videoTimestamp=round(stamp,4),serverTimestamp=datetime.now(timezone.utc).isoformat(),
                    segment=seg,generation=gen,width=frame.shape[1],height=frame.shape[0],sessionId=self.id,
                    performance={'sourceFPS':self.video['info']['fps'] if self.video else None,'processingFPS':round(1/max(.001,elapsed),1),
                        'inferenceLatencyMs':round(elapsed*1000,1),'streamLatencyMs':round((time.monotonic()-decoded)*1000,1),
                        'droppedFrames':self.frames.dropped,'device':bundle.device,'outputDroppedFrames':self.output.dropped})
                self.memory.record(frame,packet,self.pipeline)
                jpeg=cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,78])[1]
                packet.update(image=base64.b64encode(jpeg).decode(),events=copy.deepcopy(self.memory.events),timeline=list(self.memory.timeline[-300:]))
                packet['performance']['streamLatencyMs']=round((time.monotonic()-decoded)*1000,1)
                packet['performance']['sourceLagMs']=round(max(0,self.clock()-stamp)*1000,1) if self.video else packet['performance']['streamLatencyMs']
                self.last_packet=packet;self.output.put(packet);self.preview_requested=False
        except Exception as exc:
            import logging
            logging.getLogger('aegis').exception('live_session_failed');self.error=str(exc);self.status='error';self.playing=False
        finally:
            if self.last_packet:self.memory.persist(self.last_packet)
    def close(self):self.playing=False;self.closed.set();self.command_event.set()

class SessionRequest(BaseModel):
    videoId:str|None=None
    mode:str='SMART'
    source:str='browser'
    cameraId:str|None=None

def check_key(value):
    if os.getenv('AEGIS_API_KEY') and value!=os.getenv('AEGIS_API_KEY'):raise HTTPException(401,'Invalid API key')

@router.get('/api/live/sources')
def sources():return {'browserCamera':True,'configuredCamera':bool(os.getenv('AEGIS_CAMERA_SOURCE'))}

@router.post('/api/live/sessions')
async def create_session(options:SessionRequest,request: Request):
    if options.cameraId:
        from backend.emergency_api import require
        from backend.emergency_store import read_city
        from backend.emergency_service import find
        require(request,{'CONTROL_ROOM_OPERATOR'})
        find(read_city(),'cameras',options.cameraId)
    # Middleware dependency for HTTP authentication is attached by main.py.
    if options.source not in {'browser','configured'}:raise HTTPException(422,'Unknown camera source')
    if options.source=='configured' and (options.videoId or not os.getenv('AEGIS_CAMERA_SOURCE')):raise HTTPException(422,'Configured camera is not available')
    if options.mode not in {'FAST','SMART','MAX'}:raise HTTPException(422,'Mode must be FAST, SMART or MAX')
    video=get_video(options.videoId) if options.videoId else None
    if options.videoId and not video:raise HTTPException(404,'Video not found')
    with sessions_lock:
        active=[s for s in sessions.values() if not s.closed.is_set()]
        if len(active)>=2:raise HTTPException(429,'Two live sessions are already open. Stop an existing session first.')
        session=LiveSession(video,options.mode,options.source=='configured',options.cameraId);sessions[session.id]=session
        # Inactive session objects expire; saved artifacts remain accessible on disk.
        for key,s in list(sessions.items()):
            if s.closed.is_set():sessions.pop(key,None)
    return {'sessionId':session.id,'durationSeconds':session.duration,'source':session.source_name,'websocket':f'/ws/vision/{session.id}'}

@router.websocket('/ws/vision/{session_id}')
async def vision(ws:WebSocket,session_id:str):
    try:check_key(ws.headers.get('x-api-key'))
    except HTTPException:await ws.close(code=1008);return
    session=sessions.get(session_id)
    if not session:await ws.close(code=1008);return
    await ws.accept();ack=asyncio.Event();ack.set();last_status=None
    async def receive():
        while True:
            message=await ws.receive()
            if message['type']=='websocket.disconnect':return
            if message.get('bytes') is not None:
                if session.video or session.configured_camera:continue
                try:session.camera_frame(message['bytes'])
                except ValueError as exc:await ws.send_json({'type':'error','message':str(exc)})
            elif message.get('text'):
                try:
                    data=json.loads(message['text']);command=data.get('command')
                    if command=='ack':ack.set();continue
                    if command not in {'play','pause','seek','stop'}:raise ValueError('Unknown playback command')
                    stamp=data.get('timestamp',0)
                    if command=='seek' and (not isinstance(stamp,(int,float)) or not math.isfinite(stamp)):raise ValueError('Invalid seek timestamp')
                    if command=='seek' and not session.video:raise ValueError('Camera sources cannot seek')
                    session.command(command,stamp);ack.set()
                except (ValueError,TypeError) as exc:await ws.send_json({'type':'error','message':str(exc)})
    receiver=asyncio.create_task(receive())
    try:
        while not receiver.done():
            state=(session.status,session.generation,session.error)
            if state!=last_status:
                await ws.send_json({'type':'status','status':session.status,'generation':session.generation,'segment':session.segment,
                    'timestamp':session.position,'duration':session.duration,'error':session.error});last_status=state
            if ack.is_set():
                packet=session.output.take()
                if packet and packet['generation']==session.generation:
                    ack.clear();await asyncio.wait_for(ws.send_json(packet),timeout=2)
            await asyncio.sleep(.01)
        await receiver
    except (WebSocketDisconnect,RuntimeError,asyncio.TimeoutError):pass
    finally:
        receiver.cancel();session.close()


def saved_path(session_id,name):
    if len(session_id)!=32 or any(c not in '0123456789abcdef' for c in session_id):raise HTTPException(404,'Session not found')
    path=ROOT/'videos/sessions'/session_id/name
    if not path.is_file():raise HTTPException(404,'Evidence is not available yet')
    return path

@router.get('/api/live/{session_id}/report')
def report(session_id:str):return json.loads(saved_path(session_id,'report.json').read_text())

@router.get('/api/live/{session_id}/export/{kind}')
def export(session_id:str,kind:str):
    names={'json':'report.json','transcript':'transcript.jsonl','tracks':'tracks.jsonl','states':'states.jsonl'}
    if kind not in names:raise HTTPException(404,'Unknown export')
    if kind=='transcript':
        data=report(session_id)
        return Response(''.join(json.dumps(e)+'\n' for e in data['events']),media_type='application/x-ndjson',headers={'Content-Disposition':'attachment; filename="transcript.jsonl"'})
    return FileResponse(saved_path(session_id,names[kind]),filename=names[kind])

@router.get('/api/live/{session_id}/events/{event_id}/{filename}')
def evidence(session_id:str,event_id:str,filename:str):
    if not event_id.startswith('EVT-') or not event_id[4:].isdigit():raise HTTPException(404,'Event not found')
    if filename not in {'event_raw.jpg','event_annotated.jpg','before_raw.jpg','before_annotated.jpg','after_raw.jpg','after_annotated.jpg','context_crop.jpg','clip.mp4','metadata.json','description.json'}:raise HTTPException(404,'Unknown evidence file')
    return FileResponse(saved_path(session_id,f'events/{event_id}/{filename}'))

@router.get('/api/live/{session_id}/print',response_class=HTMLResponse)
def print_report(session_id:str):
    return printable_report(report(session_id))
