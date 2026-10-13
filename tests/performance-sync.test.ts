import assert from 'node:assert/strict';
import test from 'node:test';
import {createApiClient} from '../src/api.ts';
import {mergeAcknowledgement,mergeSync} from '../src/syncState.ts';
import type {PlatformState,ApiClient,Lease} from '../src/types.ts';
const entity={id:'qa',version:1,createdAt:'',updatedAt:'',updatedBy:''};
const user={...entity,username:'qa',name:'Synthetic',departmentId:'marine',role:'operator' as const,active:true,hasPassword:false};
const state={frameworks:[],chapters:[],items:[],assessments:[{...entity,itemId:'qa-item',selfAssessment:{en:'old',zh:''}}],improvements:[],inspections:[],people:[user],settings:{...entity,id:'settings',departments:[],rolePermissions:{},siteGateConfigured:true},dryScores:[],auditLogs:[],cycles:[],provenance:[],serverTime:'',snapshotToken:'baseline'} as unknown as PlatformState;
const envelope=(s:PlatformState)=>({user,versions:{'person:qa':1,'settings:settings':1,'assessment:qa':s.assessments[0].version},records:[{kind:'person',body:user},{kind:'settings',body:s.settings},{kind:'assessment',body:s.assessments[0]}],cycles:[],provenance:[],auditLogs:[],serverTime:'',snapshotToken:s.snapshotToken,baseline:true});
const sync=(api:ApiClient)=>(api.sync?api.sync():api.read());
const wait=()=>new Promise(r=>setTimeout(r,10));
test('App sync contract coalesces concurrent callers into one authority read',async()=>{
 const old=globalThis.fetch;let reads=0;globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));if(['read','sync'].includes(b.p_action)){reads++;await wait();return Response.json({ok:true,data:b.p_action==='sync'?envelope(state):state});}return Response.json({ok:true,data:user});};
 try{const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic'});api.sessionToken='synthetic-session';api.user=user;await Promise.all([sync(api),sync(api),sync(api)]);assert.equal(reads,1);}finally{globalThis.fetch=old;}
});
test('held pre-ACK read cannot restore an older body or a stale token',async()=>{
 const old=globalThis.fetch;let hold=false,release!:()=>void;const gate=new Promise<void>(r=>release=r);let current=structuredClone(state);let reads=0;
 globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));if(['read','sync'].includes(b.p_action)){reads++;const captured=structuredClone(current);if(hold){hold=false;await gate;}return Response.json({ok:true,data:b.p_action==='sync'?envelope(captured):captured});}if(b.p_action==='save'){current.assessments[0]={...current.assessments[0],version:2,selfAssessment:{en:'ack',zh:''}};current.snapshotToken='fresh';return Response.json({ok:true,data:b.p_sync_mode?{record:current.assessments[0],related:[]}:current.assessments[0]});}return Response.json({ok:true,data:user});};
 try{const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic'});api.sessionToken='s';api.user=user;await sync(api);hold=true;const pending=sync(api);await wait();const l={resourceKey:'item:qa-item',token:'t'} as Lease;await api.save('assessment',current.assessments[0],1,l);release();const result=await pending;assert.equal(result.assessments[0].version,2);assert.equal(result.snapshotToken,'fresh');assert.equal(reads,3);}finally{release();globalThis.fetch=old;}
});
test('confirmed merges are monotonic and cannot carry an old snapshot token',()=>{const newer={...state.assessments[0],version:2};const s=mergeAcknowledgement(state,'assessment',newer);assert.equal(s.snapshotToken,'');assert.equal(mergeAcknowledgement(s,'assessment',state.assessments[0]).assessments[0].version,2);});
test('delta before a complete baseline fails closed and vector/body mismatch fails closed',()=>{assert.throws(()=>mergeSync(null,{...envelope(state),baseline:false} as never),/BASELINE_REQUIRED/);assert.throws(()=>mergeSync(null,{...envelope(state),versions:{}} as never),/VECTOR_MISMATCH/);});
test('a new vector entry without its canonical body cannot certify a complete snapshot',()=>{assert.throws(()=>mergeSync(state,{...envelope(state),baseline:false,records:[],versions:{...envelope(state).versions,'item:new-missing':1}} as never),/VECTOR_MISMATCH/);});
test('unchanged heavy control metadata remains complete without retransmission',()=>{const cached={...state,cycles:[{history:'complete'}],provenance:[{source:'complete'}]};const e={...envelope(cached),baseline:false,records:[]};delete (e as {cycles?:unknown[]}).cycles;delete (e as {provenance?:unknown[]}).provenance;const merged=mergeSync(cached,e as never);assert('cycles' in merged);assert.deepEqual(merged.cycles,cached.cycles);assert.deepEqual(merged.provenance,cached.provenance);assert.throws(()=>mergeSync(null,{...e,baseline:true} as never),/BASELINE_INCOMPLETE/);});
