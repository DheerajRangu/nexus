"""Perception adapters. Masks and confidences are measured model outputs."""
from pathlib import Path
from typing import Any
import cv2
import numpy as np

class RoadSegmenter:
    def __init__(self, model_path: Path, device: str = 'cpu'):
        import torch
        from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor
        self.torch = torch
        self.device = device
        self.processor = SegformerImageProcessor.from_pretrained(str(model_path), local_files_only=True)
        self.model = SegformerForSemanticSegmentation.from_pretrained(str(model_path),local_files_only=True).to(device).eval()

    def predict(self, frame: np.ndarray, size: int = 512) -> dict[str, Any]:
        torch = self.torch
        height, width = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        inputs = self.processor(images=rgb, size={'height':size,'width':size},return_tensors='pt').to(self.device)
        with torch.inference_mode():
            logits = self.model(**inputs).logits
            # Work at an economical mask resolution, preserving original coordinates through resize.
            logits = torch.nn.functional.interpolate(logits,size=(max(1,round(height*384/width)),384),mode='bilinear',align_corners=False)
            probabilities = logits.softmax(dim=1)
            labels = probabilities.argmax(dim=1)[0].cpu().numpy()
            road_probability = probabilities[0,0].cpu().numpy()
        road = (labels == 0).astype(np.uint8)
        touching = cv2.dilate(road,np.ones((15,15),np.uint8))
        # Vehicles cover the road surface; add only vehicle pixels connected to predicted road.
        vehicles = np.isin(labels,[13,14,15,16,17,18]).astype(np.uint8)
        support = road | (vehicles & touching)
        support = cv2.morphologyEx(support,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
        components, ids, stats, _ = cv2.connectedComponentsWithStats(support)
        keep = np.zeros_like(support)
        for component in range(1,components):
            if stats[component,cv2.CC_STAT_AREA] >= support.size*.005: keep[ids==component] = 1
        mask = cv2.resize(keep,(width,height),interpolation=cv2.INTER_NEAREST)
        coverage = float(keep.mean())
        confidence = float(road_probability[road.astype(bool)].mean()) if road.any() else 0.0
        return {'mask':mask,'confidence':confidence,'coverage':coverage,'method':'SegFormer Cityscapes',
                'reliable':coverage>=.025 and confidence>=.5,
                'sidewalkMask':cv2.resize((labels==1).astype(np.uint8),(width,height),interpolation=cv2.INTER_NEAREST)}

class EvidenceDetector:
    def __init__(self, world_path: Path, custom_path: Path | None = None):
        from ultralytics import YOLO, YOLOWorld
        self.experimental = custom_path is None
        self.model = YOLO(str(custom_path)) if custom_path else YOLOWorld(str(world_path))
        self.model_name = Path(custom_path or world_path).name

    def predict(self,frame: np.ndarray,size:int,confidence:float,device:str) -> list[dict[str,Any]]:
        output=self.model.predict(frame,imgsz=size,conf=confidence,device=device,verbose=False)[0]
        return [{'type':self.model.names[int(cls)],'confidence':float(conf),'box':list(map(float,box)),
                 'experimental':self.experimental} for box,cls,conf in zip(output.boxes.xyxy.cpu().tolist(),output.boxes.cls.cpu().tolist(),output.boxes.conf.cpu().tolist())]


def point_in_mask(center: tuple[float,float], mask: np.ndarray) -> bool:
    x,y=map(round,center)
    return 0<=y<mask.shape[0] and 0<=x<mask.shape[1] and bool(mask[y,x])


def mask_occupancy(boxes:list[list[float]],mask:np.ndarray) -> float:
    height,width=mask.shape
    small=cv2.resize(mask,(min(width,640),max(1,round(height*min(width,640)/width))),interpolation=cv2.INTER_NEAREST)
    occupied=np.zeros_like(small)
    sx,sy=small.shape[1]/width,small.shape[0]/height
    for x1,y1,x2,y2 in boxes:
        a,b,c,d=round(x1*sx),round(y1*sy),round(x2*sx),round(y2*sy)
        occupied[max(0,b):min(small.shape[0],d),max(0,a):min(small.shape[1],c)]=1
    return float(np.count_nonzero(occupied & small)/max(1,np.count_nonzero(small)))

class OpticalFlow:
    def __init__(self): self.previous=None;self.time=None
    def update(self,frame:np.ndarray,mask:np.ndarray,time:float) -> dict[str,float | bool]:
        width,height=320,max(1,round(frame.shape[0]*320/frame.shape[1]))
        gray=cv2.resize(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),(width,height))
        road=cv2.resize(mask,(width,height),interpolation=cv2.INTER_NEAREST).astype(bool)
        if self.previous is None or time<=self.time:
            self.previous=gray;self.time=time
            return {'roadMotionPxSec':0.,'cameraMotionPxSec':0.,'available':False}
        flow=cv2.calcOpticalFlowFarneback(self.previous,gray,None,.5,3,15,3,5,1.2,0)
        factor=frame.shape[1]/width/(time-self.time)
        background=~road
        camera=np.median(flow[background],axis=0) if background.sum()>100 else np.zeros(2)
        # Relative flow removes approximate camera translation, not rotation or perspective changes.
        relative=flow-camera
        magnitude=np.linalg.norm(relative,axis=2)*factor
        road_motion=float(np.percentile(magnitude[road],75)) if road.any() else 0.
        camera_motion=float(np.linalg.norm(camera)*factor)
        self.previous=gray;self.time=time
        return {'roadMotionPxSec':road_motion,'cameraMotionPxSec':camera_motion,'available':True}

class LaneGeometry:
    """Experimental lane regions from persistent painted line evidence, never invented lane count."""
    def __init__(self): self.candidate=None;self.since=0.;self.lanes=[]
    def update(self,frame:np.ndarray,mask:np.ndarray,time:float) -> list[dict[str,Any]]:
        height,width=frame.shape[:2]
        small=cv2.resize(frame,(640,max(1,round(height*640/width))))
        sh,sw=small.shape[:2]
        road=cv2.resize(mask,(sw,sh),interpolation=cv2.INTER_NEAREST)
        hsv=cv2.cvtColor(small,cv2.COLOR_BGR2HSV)
        painted=(((hsv[:,:,1]<55)&(hsv[:,:,2]>170))|((hsv[:,:,0]>15)&(hsv[:,:,0]<40)&(hsv[:,:,1]>80))).astype(np.uint8)*255
        edges=cv2.Canny(painted,60,180);edges[road==0]=0;edges[:round(sh*.2)]=0
        lines=cv2.HoughLinesP(edges,1,np.pi/180,35,minLineLength=max(25,sh//8),maxLineGap=30)
        intercepts=[]
        if lines is not None:
            for x1,y1,x2,y2 in np.asarray(lines).reshape(-1,4):
                if abs(y2-y1)<max(20,abs(x2-x1)*.3):continue
                slope=(x2-x1)/(y2-y1)
                bottom=x1+(sh*.9-y1)*slope
                if 0<bottom<sw:intercepts.append((bottom,slope))
        clusters=[]
        for x,slope in sorted(intercepts):
            if not clusters or x-clusters[-1][0]>sw*.06:clusters.append([x,slope])
        signature=tuple(round(x/(sw*.06)) for x,_ in clusters)
        if signature!=self.candidate:self.candidate=signature;self.since=time
        if len(clusters)<2 or len(clusters)>8 or time-self.since<1.5:
            # Do not keep stale lane geometry when markings disappear.
            self.lanes=[];return []
        lanes=[]
        for i,((left,ls),(right,rs)) in enumerate(zip(clusters,clusters[1:])):
            if right-left<sw*.07:continue
            top_y=sh*.55;bottom_y=sh*.9
            lt=max(0,min(sw,left+(top_y-bottom_y)*ls));rt=max(0,min(sw,right+(top_y-bottom_y)*rs))
            if lt>=rt:continue
            polygon=[[lt/sw*width,top_y/sh*height],[rt/sw*width,top_y/sh*height],[right/sw*width,bottom_y/sh*height],[left/sw*width,bottom_y/sh*height]]
            lanes.append({'id':f'L{i+1}','polygon':polygon,'method':'painted-line geometry','experimental':True})
        self.lanes=lanes;return lanes
