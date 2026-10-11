import assert from 'node:assert/strict';
import test from 'node:test';
import {createApiClient} from '../src/api.ts';
import type {SeedBundle} from '../src/types.ts';

// Client timing regression only. Controlled transport responses are not hosted
// import evidence; the real-provider read-only timing receipts are kept privately.
const timingOnlySeed:SeedBundle={schemaVersion:1,frameworks:[],chapters:[],items:[],assessments:[],improvements:[],inspections:[],dryScores:[],cycles:[],provenance:[],sourceManifest:[],importNote:{zh:'計時測試資料',en:'Timing-only fixture'}};

test('initial seed import can complete after the ordinary 20-second request window',async t=>{
 const original=globalThis.fetch;const signals:AbortSignal[]=[];const requests:unknown[]=[];
 t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async(_url,init)=>new Promise<Response>((resolve,reject)=>{
  const signal=init?.signal;assert.ok(signal);signals.push(signal);requests.push(JSON.parse(String(init?.body)));
  signal.addEventListener('abort',()=>reject(new DOMException('Controlled transport abort','AbortError')),{once:true});
  setTimeout(()=>resolve(Response.json({ok:true,data:{imported:0}})),30000);
 });
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  const pending=api.importSeed(timingOnlySeed);
  // Capture rejection before advancing the deterministic clock so RED cannot
  // create an unhandled promise rejection or trigger a second request.
  const outcome=pending.then(value=>({value,error:null}),error=>({value:null,error}));
  assert.equal(signals.length,1);
  t.mock.timers.tick(20000);
  assert.equal(signals[0].aborted,false,'The original 20-second deadline aborts a still-valid initial upload.');
  t.mock.timers.tick(10000);
  const result=await outcome;assert.equal(result.error,null);assert.deepEqual(result.value,{imported:0});
  assert.equal(requests.length,1,'Initial import must not gain automatic replay.');
 }finally{globalThis.fetch=original;t.mock.timers.reset();}
});

test('ordinary status requests still stop at 20 seconds',async t=>{
 const original=globalThis.fetch;const signals:AbortSignal[]=[];
 t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async(_url,init)=>new Promise<Response>((_resolve,reject)=>{
  const signal=init?.signal;assert.ok(signal);signals.push(signal);
  signal.addEventListener('abort',()=>reject(new DOMException('Controlled transport abort','AbortError')),{once:true});
 });
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  const outcome=api.status().then(value=>({value,error:null}),error=>({value:null,error}));
  t.mock.timers.tick(19999);assert.equal(signals[0].aborted,false);
  t.mock.timers.tick(1);const result=await outcome;
  assert.equal(signals[0].aborted,true);assert.equal(result.error?.code,'NETWORK_UNKNOWN');
  assert.equal(signals.length,1);
 }finally{globalThis.fetch=original;t.mock.timers.reset();}
});

test('initial import remains bounded at 180 seconds without automatic replay',async t=>{
 const original=globalThis.fetch;const signals:AbortSignal[]=[];
 t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async(_url,init)=>new Promise<Response>((_resolve,reject)=>{
  const signal=init?.signal;assert.ok(signal);signals.push(signal);
  signal.addEventListener('abort',()=>reject(new DOMException('Controlled transport abort','AbortError')),{once:true});
 });
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  const outcome=api.importSeed(timingOnlySeed).then(value=>({value,error:null}),error=>({value:null,error}));
  t.mock.timers.tick(179999);assert.equal(signals[0].aborted,false);
  t.mock.timers.tick(1);const result=await outcome;
  assert.equal(signals[0].aborted,true);assert.equal(result.error?.code,'NETWORK_UNKNOWN');
  assert.equal(signals.length,1,'An unknown import outcome must not dispatch another import.');
 }finally{globalThis.fetch=original;t.mock.timers.reset();}
});

test('late initial import response cannot publish after the session changes',async t=>{
 const original=globalThis.fetch;let requests=0;
 t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async()=>new Promise<Response>(resolve=>{
  requests++;setTimeout(()=>resolve(Response.json({ok:true,data:{imported:0}})),30000);
 });
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  const outcome=api.importSeed(timingOnlySeed).then(value=>({value,error:null}),error=>({value:null,error}));
  // There is no synthetic logged-in session; logout only advances the actual
  // client epoch, without calling another endpoint or changing cloud state.
  await api.logout();t.mock.timers.tick(30000);
  const result=await outcome;assert.equal(result.value,null);assert.equal(result.error?.code,'STALE_SESSION');
  assert.equal(requests,1);
 }finally{globalThis.fetch=original;t.mock.timers.reset();}
});
