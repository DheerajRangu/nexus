export type Point={latitude:number;longitude:number};
export type Event={eventId:string;type:string;incidentId:string|null;occurredAt:string;details:Record<string,unknown>};
export type Incident={id:string;patientId:string;patientName:string;age:number;phone:string;location:Point;emergencyType:string;severity:string;status:string;version:number;ambulanceId:string|null;assignmentId:string|null;hospitalId:string|null;routeId:string|null;corridorId:string|null;etaSeconds:number|null;distanceMeters:number|null;timeline:Event[];vitals:Record<string,string|number>;dispatchCandidates?:Candidate[];hospitalRankings?:HospitalRanking[]};
export type Ambulance={id:string;driverId:string;status:string;location:Point;equipment:string[];crew:string[];capacity:number;ready:boolean;sequence:number;lastLocationAt:string;heading:number;speed:number};
export type Hospital={id:string;name:string;location:Point;icuBeds:number;generalBeds:number;traumaBeds:number;erAvailable:boolean;doctors:number;workload:number;diversion:boolean;equipment:string[];specialists:string[];reservations:string[]};
export type Candidate={ambulanceId:string;eligible:boolean;etaSeconds:number;distanceMeters:number;exclusionReasons:string[];reasons:string[]};
export type HospitalRanking={hospitalId:string;name:string;eligible:boolean;score:number;etaSeconds:number;availableIcuBeds:number;exclusionReasons:string[];reasons:string[]};
export type Route={id:string;incidentId:string;version:number;geometry:Point[];etaSeconds:number;distanceMeters:number;provider:string;candidateId:string;blocked:boolean;reasons:string[]};
export type RoadEvent=Point&{id:string;type:string;severity:string;description:string;source:string;cameraId?:string;affectedIncidentIds:string[];evidenceImage?:string;active:boolean};
export type Camera={id:string;name:string;roadName:string;location:Point;lastEventId:string|null};
export type Corridor={id:string;incidentId:string;status:string;version:number;routeId:string;signals:{id:string;location:Point;etaSeconds:number;state:string;windowSeconds:number;simulation:boolean}[]};
export type City={revision:number;simulation:boolean;incidents:Incident[];ambulances:Ambulance[];hospitals:Hospital[];assignments:{id:string;incidentId:string;status:string;receivedAt?:string|null;acknowledgedAt?:string|null;acknowledgementDeadlineAt?:string}[];routes:Route[];roadEvents:RoadEvent[];cameras:Camera[];corridors:Corridor[];events:Event[]};
export type Operator={role:string;resourceId:string|null};
export async function core<T>(path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<T>{
 const response=await fetch(path,{method,credentials:'include',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const value=await response.json();if(!response.ok)throw Error(typeof value.detail==='string'?value.detail:value.detail?.message||value.message||'Unable to update emergency state');return value as T;
}
export const emptyCity:City={revision:0,simulation:false,incidents:[],ambulances:[],hospitals:[],assignments:[],routes:[],roadEvents:[],cameras:[],corridors:[],events:[]};
