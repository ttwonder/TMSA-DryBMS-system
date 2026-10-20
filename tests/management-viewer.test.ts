import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPABILITIES, DEFAULT_PERMISSIONS, hasPermission} from '../src/domain.ts';
import type {Role} from '../src/types.ts';
import {mergeSync,type SyncEnvelope} from '../src/syncState.ts';

test('management viewer can view management and export but never gains write capabilities',()=>{
  const user={role:'management_viewer' as Role,active:true};
  for(const capability of CAPABILITIES){
    assert.equal(hasPermission(DEFAULT_PERMISSIONS,user,capability),['enterManagement','exportReports'].includes(capability),capability);
  }
});

test('inactive management viewer has no capability; ordinary roles retain their policy',()=>{
  for(const capability of CAPABILITIES)assert.equal(hasPermission(DEFAULT_PERMISSIONS,{role:'management_viewer' as Role,active:false},capability),false);
  assert.equal(hasPermission(DEFAULT_PERMISSIONS,{role:'admin',active:true},'manageUsers'),true);
  assert.equal(hasPermission(DEFAULT_PERMISSIONS,{role:'operator',active:true},'editAssessments'),true);
  assert.equal(hasPermission(DEFAULT_PERMISSIONS,{role:'operator',active:true},'enterManagement'),false);
});

const entity={id:'viewer',version:1,createdAt:'',updatedAt:'',updatedBy:''};
const viewer={...entity,username:'Synthetic viewer',name:'Synthetic viewer',departmentId:'management',role:'management_viewer' as const,active:true,hasPassword:true};
const restrictedEnvelope=()=>({user:viewer,viewScope:'management_viewer',versions:{'person:viewer':1,'settings:settings':1},records:[{kind:'person',body:viewer},{kind:'settings',body:{...entity,id:'settings',departments:[],rolePermissions:DEFAULT_PERMISSIONS,siteGateConfigured:true}}],historyMode:'readonly-summary-v1',controlSummary:{},auditLogs:[],cycles:[],provenance:[],serverTime:'',snapshotToken:'restricted',baseline:true}) as unknown as SyncEnvelope;
test('original sync merge accepts server-restricted baseline and retains scope through warm delta',()=>{
  const envelope=restrictedEnvelope();
  const first=mergeSync(null,envelope);
  assert.equal((first as {viewScope?:string}).viewScope,'management_viewer');
  assert.deepEqual(first.improvements,[]);
  assert.deepEqual('controlSummary' in first?first.controlSummary:null,{});
  const next=mergeSync(first,{...envelope,baseline:false,records:[]});
  assert.equal((next as {viewScope?:string}).viewScope,'management_viewer');
});
test('viewer sync fails closed for missing scope, private rows or cross-role cache',()=>{
  const envelope=restrictedEnvelope();
  assert.throws(()=>mergeSync(null,{...envelope,viewScope:undefined,controlSummary:{cycles:0,provenance:0}} as SyncEnvelope),/SCOPE/);
  assert.throws(()=>mergeSync(null,{...envelope,records:[...envelope.records,{kind:'improvement',body:entity}]}),/SCOPE/);
  assert.throws(()=>mergeSync(null,{...envelope,auditLogs:[{id:'private'}]} as SyncEnvelope),/SCOPE/);
  const ordinary={...envelope,user:{...viewer,role:'operator' as const},viewScope:undefined,controlSummary:{cycles:0,provenance:0},records:envelope.records.map(r=>r.kind==='person'?{...r,body:{...viewer,role:'operator'}}:r)} as SyncEnvelope;
  const base=mergeSync(null,ordinary);
  assert.throws(()=>mergeSync(base,{...envelope,baseline:false,records:[]}),/SCOPE/);
});
