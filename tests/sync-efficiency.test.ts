import assert from 'node:assert/strict';
import test from 'node:test';
import {createApiClient} from '../src/api.ts';
const marker='sync-check-v1:'+'a'.repeat(64);
const user={id:'qa',version:1,createdAt:'',updatedAt:'',updatedBy:'',username:'qa',name:'Synthetic',departmentId:'marine',role:'operator' as const,active:true,hasPassword:false};
const settings={id:'settings',version:1,createdAt:'',updatedAt:'',updatedBy:'',departments:[],rolePermissions:{},siteGateConfigured:true};
const initial=()=>({user,versions:{'person:qa':1,'settings:settings':1},records:[{kind:'person',body:user},{kind:'settings',body:settings}],auditLogs:[],serverTime:'2026-01-01',snapshotToken:'performance-v1:baseline',baseline:true,metadataToken:'metadata',historyMode:'readonly-summary-v1',controlSummary:{cycles:0,provenance:0},syncMarker:marker});
const client=()=>{const a=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic'});a.user=user;a.sessionToken='synthetic';return a;};
test('original Api sync warms with token-only check and reuses exact state reference',async()=>{
 const old=globalThis.fetch,actions:string[]=[];globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));actions.push(b.p_action);if(b.p_action==='sync_check'){assert.deepEqual(b.p_payload,{syncMarker:marker});return Response.json({ok:true,data:{syncMarker:marker,unchanged:true,historyMode:'readonly-summary-v1'}});}return Response.json({ok:true,data:initial()});};
 try{const api=client();const first=await api.sync!(),next=await api.sync!();assert.deepEqual(actions,['sync','sync_check']);assert.equal(next,first);assert.equal(api.cachedState!(),first);}finally{globalThis.fetch=old;}
});

const reply=(data:unknown)=>Response.json({ok:true,data});
const check=(more:object={})=>({syncMarker:marker,unchanged:true,historyMode:'readonly-summary-v1',...more});
const wait=()=>new Promise<void>(r=>setTimeout(r,10));
test('changed check fetches original delta, ignores check marker as later authority',async()=>{
 const old=globalThis.fetch,actions:string[]=[];let n=0;
 globalThis.fetch=async(_u,init)=>{const b=JSON.parse(String(init?.body));actions.push(b.p_action);if(b.p_action==='sync_check')return reply(check({unchanged:false,syncMarker:'sync-check-v1:'+'b'.repeat(64)}));return reply(n++?{...initial(),baseline:false,records:[],syncMarker:'sync-check-v1:'+'c'.repeat(64)}:initial());};
 try{const api=client(),first=await api.sync!(),next=await api.sync!();assert.notEqual(first,next);assert.deepEqual(actions,['sync','sync_check','sync']);}finally{globalThis.fetch=old;}
});
for(const [name,value,code] of [
 ['missing marker',{unchanged:true,historyMode:'readonly-summary-v1'},'CHECK_INVALID'],
 ['invalid marker',check({syncMarker:'bad'}),'CHECK_INVALID'],
 ['different unchanged marker',check({syncMarker:'sync-check-v1:'+'b'.repeat(64)}),'MARKER_MISMATCH'],
 ['missing coverage',check({historyMode:undefined}),'COVERAGE_MISMATCH'],
 ['wrong scope',check({viewScope:'management_viewer'}),'SCOPE_MISMATCH'],
 ['body injected',check({records:[]}),'CHECK_INVALID']
] as const)test('check fails closed: '+name,async()=>{
 const old=globalThis.fetch;let n=0;globalThis.fetch=async()=>reply(n++?value:initial());
 try{const a=client(),first=await a.sync!();await assert.rejects(a.sync!(),new RegExp(code));assert.equal(a.cachedState!(),first);assert.equal(n,2);}finally{globalThis.fetch=old;}
});
test('baseline missing marker supports old backend; malformed marker does not',async()=>{
 const old=globalThis.fetch,actions:string[]=[];let malformed=false;globalThis.fetch=async(_u,init)=>{actions.push(JSON.parse(String(init?.body)).p_action);const e=initial();if(malformed)e.syncMarker='';else delete (e as {syncMarker?:string}).syncMarker;return reply(e);};
 try{const a=client();await a.sync!();await a.sync!();assert.deepEqual(actions,['sync','sync']);malformed=true;await assert.rejects(a.sync!(),/SYNC_MARKER_INVALID/);}finally{globalThis.fetch=old;}
});
test('supported baseline cannot silently lose marker and cannot accept incomplete vector',async()=>{
 const old=globalThis.fetch;let n=0,broken=false;globalThis.fetch=async(_u,init)=>{const b=JSON.parse(String(init?.body));if(b.p_action==='sync_check')return reply(check({unchanged:false}));const e=initial();if(n++){if(broken)e.versions={} as typeof e.versions;else delete (e as {syncMarker?:string}).syncMarker;}return reply(e);};
 try{const a=client();await a.sync!();await assert.rejects(a.sync!(),/MARKER_MISSING/);broken=true;await assert.rejects(a.sync!(),/VECTOR_MISMATCH/);}finally{globalThis.fetch=old;}
});
for(const code of ['INVALID_PERFORMANCE_ROUTE','SESSION_INVALID','FORBIDDEN','HTTP_403','NETWORK_UNKNOWN'])test('narrow old-backend fallback: '+code,async()=>{
 const old=globalThis.fetch,actions:string[]=[];globalThis.fetch=async(_u,init)=>{const b=JSON.parse(String(init?.body));actions.push(b.p_action);return b.p_action==='sync_check'?Response.json({ok:false,code}):reply(initial());};
 try{const a=client();await a.sync!();if(code==='INVALID_PERFORMANCE_ROUTE'){await a.sync!();assert.deepEqual(actions,['sync','sync_check','sync']);}else {await assert.rejects(a.sync!(),new RegExp(code));assert.deepEqual(actions,['sync','sync_check']);}}finally{globalThis.fetch=old;}
});
test('warm checks singleflight, and published baseline cannot be mutated',async()=>{
 const old=globalThis.fetch;let n=0;globalThis.fetch=async()=>{await wait();return reply(n++?check():initial());};
 try{const a=client(),first=await a.sync!();const x=a.sync!(),y=a.sync!();assert.equal(x,y);assert.equal(await x,first);assert.equal(n,2);assert.throws(()=>{first.people[0].name='mutated';},TypeError);assert.equal(a.cachedState!()!.people[0].name,'Synthetic');}finally{globalThis.fetch=old;}
});
test('ACK during held unchanged check publishes canonical primary and related immediately',async()=>{
 const old=globalThis.fetch;let release!:()=>void;const gate=new Promise<void>(r=>release=r);let n=0;
 const next={...user,version:2,name:'ACK'},nextSettings={...settings,version:2};
 globalThis.fetch=async(_u,init)=>{const b=JSON.parse(String(init?.body));if(b.p_action==='sync_check'){await gate;return reply(check());}if(b.p_action==='save')return reply({record:next,related:[{kind:'settings',body:nextSettings}]});return reply(n++?{...initial(),versions:{'person:qa':2,'settings:settings':2},user:next,baseline:false,records:[],snapshotToken:'fresh',syncMarker:'sync-check-v1:'+'d'.repeat(64)}:initial());};
 try{const a=client();await a.sync!();const pending=a.sync!();await wait();await a.save('person',next,1,{resourceKey:'person:qa',token:'test'} as never);assert.equal(a.cachedState!()!.people[0].name,'ACK');assert.equal(a.cachedState!()!.settings.version,2);assert.equal(a.cachedState!()!.snapshotToken,'');release();const s=await pending;assert.equal(s.people[0].name,'ACK');assert.equal(s.snapshotToken,'fresh');}finally{release();globalThis.fetch=old;}
});
test('identity switch fences held check and leaves successor baseline intact',async()=>{
 const old=globalThis.fetch;let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 globalThis.fetch=async(_u,init)=>{const b=JSON.parse(String(init?.body));if(b.p_action==='sync_check'){await gate;return reply(check());}return reply(initial());};
 try{const a=client();await a.sync!();const pending=a.sync!();await wait();a.sessionToken='successor';const successor=await a.sync!();release();await assert.rejects(pending,/STALE_SESSION/);assert.equal(a.cachedState!(),successor);}finally{release();globalThis.fetch=old;}
});

for(const visibleChanged of [false,true])test('GM explicit export refreshes strict token only when visible baseline unchanged: '+visibleChanged,async()=>{
 const old=globalThis.fetch,actions:string[]=[];let n=0;
 const gm={...user,role:'management_viewer' as const};
 globalThis.fetch=async(_u,init)=>{const b=JSON.parse(String(init?.body));actions.push(b.p_action);if(b.p_action==='sync_check')return reply(check({viewScope:'management_viewer'}));if(b.p_action==='export_authorize'){assert.equal(b.p_payload.snapshotToken,'strict-current');return reply({snapshotToken:'strict-current'});}return reply({...initial(),user:gm,records:[{kind:'person',body:gm},{kind:'settings',body:settings}],viewScope:'management_viewer',controlSummary:{},snapshotToken:n++?'strict-current':'strict-before',syncMarker:visibleChanged&&n>1?'sync-check-v1:'+'f'.repeat(64):marker});};
 try{const a=client();a.user=gm;const first=await a.sync!();assert.equal(await a.sync!(),first);const p=a.authorizeExport({kind:'framework',format:'pdf',frameworkId:'TMSA',ids:['qa'],snapshotToken:first.snapshotToken});if(visibleChanged){await assert.rejects(p,/SNAPSHOT_STALE/);assert(!actions.includes('export_authorize'));}else {await p;assert.deepEqual(actions,['sync','sync_check','sync','export_authorize']);}}finally{globalThis.fetch=old;}
});
test('GM forced export refresh waits for check singleflight and fences identity switch',async()=>{
 const old=globalThis.fetch;let release!:()=>void;const hold=new Promise<void>(r=>release=r),gm={...user,role:'management_viewer' as const};let exports=0;
 globalThis.fetch=async(_u,init)=>{const b=JSON.parse(String(init?.body));if(b.p_action==='sync_check'){await hold;return reply(check({viewScope:'management_viewer'}));}if(b.p_action==='export_authorize'){exports++;return reply({});}return reply({...initial(),user:gm,records:[{kind:'person',body:gm},{kind:'settings',body:settings}],viewScope:'management_viewer',controlSummary:{}});};
 try{const a=client();a.user=gm;const first=await a.sync!();const pending=a.sync!();const exporting=a.authorizeExport({kind:'framework',format:'pdf',frameworkId:'TMSA',ids:['qa'],snapshotToken:first.snapshotToken});a.sessionToken='other';release();await assert.rejects(pending,/STALE_SESSION/);await assert.rejects(exporting,/STALE_SESSION/);assert.equal(exports,0);}finally{release();globalThis.fetch=old;}
});

test('marker-capable baseline rejects malformed metadata and export token',async()=>{
 const old=globalThis.fetch;
 try{for(const field of ['metadataToken','snapshotToken']){globalThis.fetch=async()=>reply({...initial(),[field]:123});await assert.rejects(client().sync!(),/SYNC_MARKER_INVALID/);}}finally{globalThis.fetch=old;}
});
