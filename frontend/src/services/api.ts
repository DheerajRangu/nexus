export async function api<T>(path:string,options?:RequestInit):Promise<T>{
 const response=await fetch(path,options);
 if(!response.ok){const error=await response.json().catch(()=>({detail:response.statusText}));throw new Error(typeof error.detail==='string'?error.detail:JSON.stringify(error.detail));}
 return response.json();
}
export const timestamp=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
export const percentage=(value:number|undefined)=>value===undefined?'—':`${Math.round(value*100)}%`;
