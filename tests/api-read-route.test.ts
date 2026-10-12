import assert from 'node:assert/strict';
import test from 'node:test';
import {createApiClient} from '../src/api.ts';

// Real client request-shape and deadline tests with controlled transport.
// These do not establish hosted database recovery.
test('only full-state reads select the explicit six-argument bounded read route',async()=>{
 const original=globalThis.fetch;const calls:Record<string,unknown>[]=[];
 globalThis.fetch=async(_url,init)=>{calls.push(JSON.parse(String(init?.body)));return Response.json({ok:true,data:{}});};
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  await api.rpc('read');await api.status();await api.rpc('current_user');
  assert.equal(calls[0].p_action,'read');assert.equal(calls[0].p_import_mode,false);assert.equal(calls[0].p_read_mode,true);
  for(const body of calls.slice(1)){assert.equal('p_import_mode' in body,false);assert.equal('p_read_mode' in body,false);}
 }finally{globalThis.fetch=original;}
});

test('a slow full-state response body stays bounded at sixty seconds without replay',async t=>{
 const original=globalThis.fetch;let requests=0;let signal:AbortSignal|undefined;t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async(_url,init)=>{
  requests++;signal=init?.signal as AbortSignal;
  return {ok:true,json:()=>new Promise((resolve,reject)=>{
   signal?.addEventListener('abort',()=>reject(new DOMException('Controlled abort','AbortError')),{once:true});
   setTimeout(()=>resolve({ok:true,data:{controlled:true}}),30000);
  })} as Response;
 };
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  const outcome=api.rpc('read').then(value=>({value,error:null}),error=>({value:null,error}));
  await Promise.resolve();t.mock.timers.tick(20000);assert.equal(signal?.aborted,false,'Read transfer must not inherit the ordinary twenty-second deadline.');
  t.mock.timers.tick(10000);const result=await outcome;assert.equal(result.error,null);assert.deepEqual(result.value,{controlled:true});assert.equal(requests,1);
 }finally{globalThis.fetch=original;t.mock.timers.reset();}
});

test('a full-state read aborts at sixty seconds without fallback or replay',async t=>{
 const original=globalThis.fetch;let requests=0;let signal:AbortSignal|undefined;t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async(_url,init)=>new Promise((_resolve,reject)=>{
  requests++;signal=init?.signal as AbortSignal;signal?.addEventListener('abort',()=>reject(new DOMException('Controlled abort','AbortError')),{once:true});
 });
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  const outcome=api.rpc('read').then(value=>({value,error:null}),error=>({value:null,error}));
  t.mock.timers.tick(59999);assert.equal(signal?.aborted,false);t.mock.timers.tick(1);const result=await outcome;
  assert.equal(signal?.aborted,true);assert.equal(result.error?.code,'NETWORK_UNKNOWN');assert.equal(requests,1);
 }finally{globalThis.fetch=original;t.mock.timers.reset();}
});

test('an absent bounded-read backend fails closed instead of replaying the old route',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({code:'PGRST202',message:'controlled missing function'},{status:404});};
 try{const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});await assert.rejects(api.rpc('read'),e=>(e as {code?:string}).code==='HTTP_404');assert.equal(calls,1);}
 finally{globalThis.fetch=original;}
});
