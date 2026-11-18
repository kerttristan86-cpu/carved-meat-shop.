import { authentication } from "../../../../lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
async function handle(req:Request){try{return await (await authentication()).handler(req);}catch(e){console.error('Authentication unavailable:',e instanceof Error?e.message:'Unknown error');return Response.json({message:'Sign-in is temporarily unavailable. The server could not open its database; check the server configuration and process lock.'},{status:503});}}
