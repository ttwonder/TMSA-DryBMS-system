import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient,RpcError,validateTargetAck,type SharedTargetRequest} from '../src/api.ts';
const request:SharedTargetRequest={frameworkId:'TMSA',targets:{chapter:3},expectedVersion:2,leaseToken:'synthetic-only',operationId:'goal-unit-original'};
test('company goal transport uses immutable performance route and never automatically replays unknown save',async()=>{
 const original=globalThis.fetch;const actions:string[]=[];
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));actions.push(body.p_action);assert.equal(body.p_sync_mode,'performance-v1');if(body.p_action==='target_claim'){assert.deepEqual(body.p_payload,{frameworkId:'TMSA'});return new Response(JSON.stringify({ok:true,data:{resourceKey:'framework:TMSA'}}));}assert.deepEqual(body.p_payload,request);throw new TypeError('controlled transport failure');};
 try{const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});await api.rpc('target_claim',{frameworkId:'TMSA'});await assert.rejects(api.rpc('target_save',request),e=>e instanceof RpcError&&e.code==='NETWORK_UNKNOWN');assert.deepEqual(actions,['target_claim','target_save']);}finally{globalThis.fetch=original;}
});
test('goal ACK binds exact framework operation revision and complete target map',()=>{
 const ack={frameworkId:'TMSA',operationId:request.operationId,record:{id:'TMSA',version:3,scoreTargets:{chapter:3}}};assert.deepEqual(validateTargetAck(ack,request),ack);
 for(const invalid of [{...ack,frameworkId:'DRYBMS'},{...ack,operationId:'different'},{...ack,record:{...ack.record,id:'DRYBMS'}},{...ack,record:{...ack.record,version:2}},{...ack,record:{...ack.record,scoreTargets:{chapter:4}}},{...ack,record:{...ack.record,scoreTargets:{chapter:3,extra:1}}},{...ack,record:{...ack.record,scoreTargets:{}}}])assert.throws(()=>validateTargetAck(invalid,request),e=>e instanceof RpcError&&e.code==='INVALID_RESPONSE');
 const unknown={...request,frameworkId:'DRYBMS' as const,targets:{chapter:null}};assert.equal(validateTargetAck({frameworkId:'DRYBMS',operationId:unknown.operationId,record:{id:'DRYBMS',version:3,scoreTargets:{chapter:null}}},unknown).record.scoreTargets?.chapter,null);
});
