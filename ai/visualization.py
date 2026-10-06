"""Readable dual video overlays at original resolution."""
import cv2
import numpy as np

def draw(frame,tracks,pedestrians,objects,road,lanes,metrics,intelligence,full=True):
    image=frame.copy();height,width=image.shape[:2]
    if full:
        tint=image.copy();tint[road['mask']>0]=(80,145,45)
        image=cv2.addWeighted(image,.9,tint,.1,0)
        contours,_=cv2.findContours(road['mask'],cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(image,contours,-1,(100,190,100),1)
        for lane in lanes:cv2.polylines(image,[np.asarray(lane['polygon'],np.int32)],True,(220,180,40),2)
        for track in tracks+pedestrians:
            x1,y1,x2,y2=map(int,track['box']);color=(120,230,100) if track['type']!='person' else (230,200,90)
            cv2.rectangle(image,(x1,y1),(x2,y2),color,2)
            cv2.putText(image,f'{track["type"].upper()} #{track["trackId"]} {track["confidence"]:.2f}',(x1,max(18,y1-6)),cv2.FONT_HERSHEY_SIMPLEX,.45,color,1)
            trail=[entry['center'] for entry in track.get('history',[])][-30:]
            if len(trail)>1:cv2.polylines(image,[np.asarray(trail,np.int32)],False,color,1)
        for item in objects:
            x1,y1,x2,y2=map(int,item['box'])
            cv2.rectangle(image,(x1,y1),(x2,y2),(40,175,240),2)
            label=('? ' if item['experimental'] else '')+item['type'].replace('_',' ')+f' {item["confidence"]:.2f}'
            cv2.putText(image,label,(x1,max(18,y1-6)),cv2.FONT_HERSHEY_SIMPLEX,.42,(40,175,240),1)
    lines=['AEGIS OMNIVISION',intelligence['condition'],f'Traffic {intelligence["trafficLevel"]} | Vehicles {metrics["vehicleCount"]} | Occupancy {metrics["roadOccupancy"]:.0%}',f'Motion {metrics["averageMotion"]:.1f} px/sec | Health {intelligence["roadHealthScore"]}/100 (heuristic)']
    if not full:lines=lines[:2]
    font_scale=max(.4,min(.7,width/1800));line_height=max(20,round(font_scale*42))
    panel_height=line_height*len(lines)+12;panel_width=min(width,max(320,round(width*.59)))
    panel=image.copy();cv2.rectangle(panel,(0,0),(panel_width,panel_height),(18,15,10),-1)
    image=cv2.addWeighted(panel,.8,image,.2,0)
    for index,text in enumerate(lines):cv2.putText(image,text,(12,24+index*line_height),cv2.FONT_HERSHEY_SIMPLEX,font_scale,(220,238,230),1)
    return image
