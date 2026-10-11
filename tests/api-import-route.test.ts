import assert from 'node:assert/strict';
import test from 'node:test';
import {createApiClient} from '../src/api.ts';
import type {SeedBundle} from '../src/types.ts';
const seed:SeedBundle={schemaVersion:1,frameworks:[],chapters:[],items:[],assessments:[],improvements:[],inspections:[],dryScores:[],cycles:[],provenance:[],sourceManifest:[],importNote:{zh:'路由測試',en:'Route fixture'}};

test('only initial import selects the bounded import overload on the same RPC URL',async()=>{
 const original=globalThis.fetch;const calls:{url:string;body:Record<string,unknown>}[]=[];
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),body:JSON.parse(String(init?.body))});return Response.json({ok:true,data:{imported:0}});};
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  await api.importSeed(seed);await api.status();
  assert.equal(calls[0].url,'http://127.0.0.1:1/rest/v1/rpc/compliance_rpc');
  assert.equal(calls[0].body.p_action,'import_seed');assert.equal(calls[0].body.p_import_mode,true);
  assert.deepEqual((calls[0].body.p_payload as {seed:SeedBundle}).seed,seed);
  assert.equal(calls[1].body.p_action,'bootstrap_status');assert.equal('p_import_mode' in calls[1].body,false);
 }finally{globalThis.fetch=original;}
});
