import {useState} from 'react';
import {GoogleCityMap} from './GoogleCityMap';
import type {City,Incident,Point} from './services/ecosystem';
export function OperationsMap({city,incident,onIncident,onCamera}:{city:City;incident?:Incident;onIncident:(id:string)=>void;onCamera:(id:string)=>void}){
 const [focus,setFocus]=useState<Point|null>(null);const [googleFailed,setGoogleFailed]=useState(false);
 const route=city.routes.find(r=>r.id===incident?.routeId);const ambulance=city.ambulances.find(a=>a.id===incident?.ambulanceId);
 const points=[...city.ambulances.map(a=>a.location),...city.hospitals.map(h=>h.location),...city.cameras.map(c=>c.location),...city.roadEvents.map(e=>({latitude:e.latitude,longitude:e.longitude})),...(incident?[incident.location]:[])];
 const fallback=focus||incident?.location||points[0]||{latitude:12.9716,longitude:77.5946};
 // The existing citizen map supplies Google Maps when configured and a local
 // geographic preview otherwise; overlays use the same latitude/longitude data.
 const minLat=Math.min(...points.map(p=>p.latitude),fallback.latitude)-.003,maxLat=Math.max(...points.map(p=>p.latitude),fallback.latitude)+.003;
 const minLon=Math.min(...points.map(p=>p.longitude),fallback.longitude)-.003,maxLon=Math.max(...points.map(p=>p.longitude),fallback.longitude)+.003;
 const xy=(p:Point)=>({left:`${8+84*(p.longitude-minLon)/(maxLon-minLon)}%`,top:`${8+84*(maxLat-p.latitude)/(maxLat-minLat)}%`});
 if(import.meta.env.VITE_GOOGLE_MAPS_API_KEY&&!googleFailed)return <GoogleCityMap city={city} incident={incident} onIncident={onIncident} onCamera={onCamera} onFailure={()=>setGoogleFailed(true)}/>;
 return <div className="operations-map"><span style={{position:"absolute",top:12,left:12,fontSize:11}}>DEMO GEOGRAPHIC NETWORK · registered locations</span><div className="fleet-map-list">{city.ambulances.map(a=><button key={a.id} onClick={()=>setFocus(a.location)}>{a.id} · {a.status.replaceAll('_',' ')}</button>)}{city.cameras.map(c=><button key={c.id} onClick={()=>onCamera(c.id)}>📷 {c.name}</button>)}</div><svg className="city-geometry" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Shared city geographic network">{route&&<polyline fill="none" stroke="#87edb0" strokeWidth=".7" points={route.geometry.map(p=>`${parseFloat(xy(p).left)},${parseFloat(xy(p).top)}`).join(' ')}/>}</svg>{city.hospitals.map(h=><button className="geo-marker hospital" style={xy(h.location)} key={h.id} title={`${h.name} · ICU ${h.icuBeds-h.reservations.length}`} onClick={()=>setFocus(h.location)}>H</button>)}{city.ambulances.map(a=><button className="geo-marker ambulance" style={xy(a.location)} key={a.id} title={a.id} onClick={()=>setFocus(a.location)}>🚑</button>)}{city.incidents.filter(e=>!['COMPLETED','CANCELLED'].includes(e.status)).map(e=><button className="geo-marker patient" style={xy(e.location)} key={e.id} onClick={()=>onIncident(e.id)}>SOS</button>)}{city.roadEvents.filter(e=>e.active).map(e=><span className="geo-marker hazard" style={xy(e)} key={e.id} title={e.description}>⚠</span>)}{city.cameras.map(c=><button className="geo-marker camera" style={xy(c.location)} key={c.id} onClick={()=>onCamera(c.id)}>📷</button>)}</div>
}
