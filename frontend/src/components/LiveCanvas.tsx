import {useEffect,useRef} from 'react';
import type {LivePacket} from '../types';
export function LiveCanvas({packet,intelligence,preview,onRendered,isCurrent}:{packet:LivePacket|null;intelligence:boolean;preview?:string;onRendered:(packet:LivePacket|null)=>void;isCurrent:(packet:LivePacket)=>boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),rendered=useRef(onRendered);rendered.current=onRendered;const current=useRef(isCurrent);current.current=isCurrent;
 useEffect(()=>{
  if(!packet&&!preview)return;let cancelled=false;const image=new Image();
  image.onload=()=>{if(cancelled)return;if(packet&&!current.current(packet)){rendered.current(null);return}const el=canvas.current;if(!el)return;const ctx=el.getContext('2d');if(!ctx)return;
   el.width=packet?.width||image.width;el.height=packet?.height||image.height;ctx.drawImage(image,0,0,el.width,el.height);
   if(packet){const scale=el.width/1280;ctx.lineWidth=Math.max(1.5,scale*2);ctx.font=`${Math.max(13,scale*16)}px ui-monospace, monospace`;
    const polygon=(points:number[][])=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath()};
    if(intelligence){ctx.fillStyle='rgba(86,224,166,.09)';ctx.strokeStyle='rgba(116,228,180,.55)';for(const points of packet.roadPolygons){polygon(points);ctx.fill();ctx.stroke()}
     for(const lane of packet.lanes){ctx.fillStyle=lane.status==='BLOCKED'?'rgba(255,96,71,.16)':'rgba(100,186,232,.05)';ctx.strokeStyle=lane.status==='BLOCKED'?'#ff8069':'#90c6db';polygon(lane.polygon);ctx.fill();ctx.stroke();const p=lane.polygon[3];ctx.fillStyle='#e4f6ed';ctx.fillText(`${lane.id} · ${lane.status}`,p[0]+5,p[1]-8)}
    }
    for(const track of packet.tracks){if(!intelligence&&track.type!=='person'&&track.state!=='STOPPED')continue;
     const [x1,y1,x2,y2]=track.box;const color=track.state==='STOPPED'?'#e9bd78':track.type==='person'?'#f9cf75':'#83efd0';ctx.strokeStyle=color;ctx.fillStyle=color;
     if(intelligence){const history=track.history.slice(-30);history.forEach((p,i)=>{if(!i)return;ctx.globalAlpha=i/history.length;ctx.beginPath();ctx.moveTo(...history[i-1].center as [number,number]);ctx.lineTo(...p.center as [number,number]);ctx.stroke()});ctx.globalAlpha=1}
     ctx.strokeRect(x1,y1,x2-x1,y2-y1);const label=`${track.displayId} · ${track.type.toUpperCase()}`;const width=ctx.measureText(label).width+10;const ly=Math.max(20,y1-5);ctx.fillStyle='rgba(9,23,25,.83)';ctx.fillRect(x1,ly-17,width,21);ctx.fillStyle=color;ctx.fillText(label,x1+5,ly);
     if(intelligence){ctx.font=`${Math.max(11,scale*13)}px ui-monospace, monospace`;ctx.fillText(`${track.state}${track.lane?' · '+track.lane:''}`,x1+3,y2+16);ctx.font=`${Math.max(13,scale*16)}px ui-monospace, monospace`}
    }
    for(const object of packet.objects){if(!intelligence&&!packet.intelligence.hazards?.includes(object.type))continue;const [x1,y1,x2,y2]=object.box;ctx.strokeStyle='#f2b76e';ctx.fillStyle='#f2b76e';ctx.strokeRect(x1,y1,x2-x1,y2-y1);ctx.fillText(`${object.experimental?'? ':''}${object.type.replaceAll('_',' ')} ${Math.round(object.confidence*100)}%`,x1,Math.max(20,y1-5))}
    ctx.fillStyle='rgba(7,18,21,.8)';ctx.fillRect(14,14,Math.min(el.width-28,560),34);ctx.fillStyle='#d9f4e8';ctx.fillText(`AEGIS LIVE · ${packet.videoTimestamp.toFixed(2)}s · ${packet.intelligence.condition}`,24,37);
   }
   rendered.current(packet);
  };image.onerror=()=>rendered.current(null);image.src=packet?`data:image/jpeg;base64,${packet.image}`:preview!;
  return()=>{cancelled=true};
 },[packet,intelligence,preview]);
 return <canvas ref={canvas} className="live-canvas" aria-label="Synchronized live AI road feed"/>;
}
