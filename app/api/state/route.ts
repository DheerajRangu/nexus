import {stateFor,error} from '../../../src/services/server';
export async function GET(req:Request){try{return Response.json(await stateFor(req),{headers:{'Cache-Control':'no-store'}});}catch(e){return error(e,503);}}
