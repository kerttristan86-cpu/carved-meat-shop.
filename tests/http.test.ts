import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readJson} from '../lib/http';
test('empty server failures produce a useful sign-in error',async()=>{await assert.rejects(()=>readJson(new Response(null,{status:500})),/server could not complete/i);assert.deepEqual(await readJson(Response.json({ok:true})),{ok:true});});
