export function checkoutError(error:Error&{definite?:boolean}){return error.message+(error.definite?'':' If the connection failed, retry checkout to confirm the original request.');}
export async function readJson(response:Response){
 const body=await response.text();
 try{return JSON.parse(body);}catch{throw new Error(response.ok?'The server returned an incomplete response. Please retry.':'The server could not complete the request. Please retry; if this continues, check the server database configuration.');}
}
