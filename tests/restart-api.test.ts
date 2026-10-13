import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient,RpcError,validateRestartAck} from '../src/api.ts';
const request={frameworkId:'TMSA' as const,operationId:'restart-unit-original'},record={id:'assessment-one',itemId:'item-one',version:2,createdAt:'2026-01-01',updatedAt:'2026-01-02',updatedBy:'test-owner',reviewed:false,response:'yes' as const,conformity:'all' as const,selfAssessment:{en:'retained',zh:'保留'},evidence:{en:'retained',zh:'保留'},departmentIds:[],assigneeIds:[],executionStatus:'not_started' as const,sources:[]};
const ack={...request,changedCount:1,records:[record]};
test('restart transport is one immutable performance-route request; unknown result is not automatically replayed',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;const wire=JSON.parse(String(init?.body));assert.equal(wire.p_action,'restart_updates');assert.equal(wire.p_sync_mode,'performance-v1');assert.deepEqual(wire.p_payload,request);throw new TypeError('controlled transport failure');};
 try{const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});await assert.rejects(api.rpc('restart_updates',request),e=>e instanceof RpcError&&e.code==='NETWORK_UNKNOWN');assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('restart acknowledgement requires exact original operation/framework, exact count and distinct unchecked rows',()=>{
 assert.deepEqual(validateRestartAck(ack,request),ack);
 for(const invalid of [{...ack,operationId:'another'},{...ack,frameworkId:'DRYBMS'},{...ack,changedCount:2},{...ack,records:[{...record,reviewed:true}]},{...ack,changedCount:2,records:[record,record]},{...ack,changedCount:2,records:[record,{...record,id:'another-id'}]},{...ack,records:[{...record,version:0}]}])assert.throws(()=>validateRestartAck(invalid,request),e=>e instanceof RpcError&&e.code==='INVALID_RESPONSE');
 assert.deepEqual(validateRestartAck({...request,changedCount:0,records:[]},request),{...request,changedCount:0,records:[]});
});
