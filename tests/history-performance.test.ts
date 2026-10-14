import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectionScore} from '../src/domain.ts';
import {inspectionSummary,mergeSync} from '../src/syncState.ts';
import {createApiClient} from '../src/api.ts';
import type {Inspection} from '../src/types.ts';
const base={id:'frozen',version:1,createdAt:'',updatedAt:'',updatedBy:''};
const inspection=(fw:'TMSA'|'DRYBMS'):Inspection=>({...base,frameworkId:fw,title:'Frozen',organization:'QA',date:'2026-01-01',type:'formal',status:'final',imported:false,snapshot:{framework:{...base,id:fw,name:{en:fw,zh:fw},description:{en:'QA',zh:'QA'},scoring:fw==='TMSA'?'tmsa-stage':'drybms-guidance',active:true,sourceVersion:'frozen',scopeLabel:{en:'QA',zh:'QA'}},scoringVersion:'original',chapters:[{...base,id:'c',frameworkId:fw,active:true,order:1,code:'1',name:{en:'QA',zh:'QA'}}],items:[{...base,id:'i',chapterId:'c',frameworkId:fw,active:true,level:1,code:'1.1',order:1,departmentIds:[],kpi:{en:'full immutable body',zh:''},guidance:{en:'full source',zh:''},sources:[]}]},results:[{itemId:'i',response:'yes',conformity:'all',reviewed:true,observation:{en:'full observation',zh:''},recommendation:{en:'full recommendation',zh:''}}],findings:[],...(fw==='DRYBMS'?{dryLevels:{c:[100,100,75,50]}}:{})} as Inspection);
for(const fw of ['TMSA','DRYBMS'] as const)test(`${fw} exact frozen projection preserves complete/null/gap scoring`,()=>{
 const i=inspection(fw);for(const variant of [i,{...i,results:[]},{...i,snapshot:{...i.snapshot,items:i.snapshot.items.map(x=>({...x,sourceGap:'unresolved',sourceGapResolved:false}))}}]){const summary=inspectionSummary(variant);assert(!('snapshot' in summary));assert(!('kpi' in summary.scoring.snapshot.items[0]));assert.deepEqual(inspectionScore(summary),inspectionScore(variant));}
});
test('compact history carries only authoritative finding IDs and classifications, not narratives',()=>{
 const i=inspection('TMSA');i.findings=[{id:'linked',itemIds:['i'],classification:'finding',observation:{en:'PRIVATE narrative',zh:''},recommendation:{en:'PRIVATE advice',zh:''},sources:[]},{id:'ofi',itemIds:['i'],classification:'ofi',observation:{en:'PRIVATE OFI',zh:''},recommendation:{en:'',zh:''},sources:[]}];
 const before=JSON.stringify(i),summary=inspectionSummary(i);assert.deepEqual((summary as unknown as {findingClassifications:unknown}).findingClassifications,{linked:'finding',ofi:'ofi'});assert(!JSON.stringify(summary).includes('PRIVATE'));assert.equal(JSON.stringify(i),before);
});
const person={...base,id:'actor',username:'qa',name:'QA',departmentId:'qa',role:'owner' as const,active:true,hasPassword:true};
const envelope=(i:Inspection)=>({historyMode:'readonly-summary-v1',controlSummary:{cycles:7,provenance:9},metadataToken:'epoch',baseline:true,user:person,versions:{'person:actor':1,'settings:settings':1,'inspection:frozen':i.version},records:[{kind:'person',body:person},{kind:'settings',body:{...base,id:'settings',departments:[],rolePermissions:{},siteGateConfigured:true}},{kind:'inspection',body:inspectionSummary(i)}],auditLogs:[],snapshotToken:'performance-v1:qa',serverTime:''});
test('explicit summary coverage rejects full body in a thin envelope',()=>{const i=inspection('TMSA'),e=envelope(i);assert.throws(()=>mergeSync(null,{...e,records:e.records.map(r=>r.kind==='inspection'?{...r,body:i}:r)} as never),/HISTORY_COVERAGE/);});
test('legacy summaries remain hydratable but present classification metadata must match exactly',async()=>{
 const old=globalThis.fetch,i=inspection('TMSA');i.findings=[{id:'linked',itemIds:['i'],classification:'finding',observation:{en:'Source',zh:''},recommendation:{en:'',zh:''},sources:[]}];
 try{for(const mode of ['legacy','tampered'] as const){
  const e=envelope(i),summary=e.records.find(r=>r.kind==='inspection')!.body as unknown as {findingClassifications?:Record<string,string>};
  if(mode==='legacy')delete summary.findingClassifications;else summary.findingClassifications={linked:'ofi'};
  globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));return Response.json({ok:true,data:b.p_action==='sync'?e:{inspection:i,metadataToken:'epoch'}});};
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic'});api.sessionToken='A';api.user=person;const s=await api.sync!();
  if(mode==='legacy')assert.deepEqual(await api.hydrateInspection!(s.inspections[0]),i);else await assert.rejects(()=>api.hydrateInspection!(s.inspections[0]),/DETAIL_SUMMARY_MISMATCH/);
 }}finally{globalThis.fetch=old;}
});

test('hydration singleflight returns exact full body and refuses errors or old epochs',async()=>{
 const old=globalThis.fetch,i=inspection('TMSA');let count=0,release!:()=>void;let held=false;const gate=new Promise<void>(r=>release=r);
 globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));if(b.p_action==='sync')return Response.json({ok:true,data:envelope(i)});if(b.p_action==='inspection_detail'){count++;if(held)await gate;return Response.json({ok:true,data:{inspection:i,metadataToken:'epoch'}});}return Response.json({ok:true,data:{}});};
 try{const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic'});api.sessionToken='A';api.user=person;const s=await api.sync!(),summary=s.inspections[0];const [a,b]=await Promise.all([api.hydrateInspection!(summary),api.hydrateInspection!(summary)]);assert.equal(count,1);assert.deepEqual(a,i);assert.deepEqual(b,i);held=true;const late=api.hydrateInspection!(summary);await new Promise(r=>setTimeout(r,5));api.sessionToken='B';release();await assert.rejects(late,/STALE_SESSION|STALE_DETAIL/);assert.equal(api.cachedState!(),null);}finally{release();globalThis.fetch=old;}
});
