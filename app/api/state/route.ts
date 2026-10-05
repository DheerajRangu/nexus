import {stateFor,error,cors,apiError} from '../../../src/services/server';
export async function OPTIONS(req:Request){return new Response(null,{headers:cors(req)});}
export async function GET(req:Request){try{return Response.json(await stateFor(req),{headers:{'Cache-Control':'no-store',...cors(req)}});}catch(e){return apiError(req,e,503);}}
