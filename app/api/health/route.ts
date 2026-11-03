import {database} from '../../../lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{await (await database()).query('SELECT 1');return Response.json({ready:true},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({ready:false},{status:503,headers:{'Cache-Control':'no-store'}});}}
