import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import type {Improvement,PlatformState} from '../src/types.ts';
import {STANDALONE_IMPROVEMENT_SOURCES,isStandaloneImprovement,improvementSourceLabel} from '../src/improvementTracking.ts';
import {filterImprovementList,withImprovementListView} from '../src/improvementList.ts';
import {describeAudit} from '../src/auditChanges.ts';
const {layoutFixture}=createRequire(import.meta.url)('../scripts/layout-fixture.mjs') as {layoutFixture:()=>PlatformState};
const meetings=[['vessel_safety_meeting','船舶安全會議','Vessel safety meeting'],['company_safety_meeting','公司安全會議','Company safety meeting']] as const;

test('standalone source vocabulary extends the existing choices in order',()=>{
 assert.deepEqual(STANDALONE_IMPROVEMENT_SOURCES,['management_review','management_directive','vessel_safety_meeting','company_safety_meeting']);
 for(const source of STANDALONE_IMPROVEMENT_SOURCES)assert.equal(isStandaloneImprovement(source),true);
 for(const source of ['external','non_external'] as const)assert.equal(isStandaloneImprovement(source),false);
});
for(const [source,zh,en] of meetings){
 test(`${source} uses the exact bilingual source labels, including audit details`,()=>{
  assert.equal(improvementSourceLabel(source,'zh'),zh);assert.equal(improvementSourceLabel(source,'en'),en);
  for(const [lang,label] of [['zh',zh],['en',en]] as const){
   const out=describeAudit({id:'qa-log',at:'2026-01-01',actorId:'owner',actorName:'QA',action:'create',kind:'improvement',entityId:'meeting',itemCodes:[],summary:'create',operationId:'qa-operation',before:null,after:{source}},lang);
   assert(out.changes.some(change=>change.after===label));
  }
 });
 test(`${source} list/report filtering uses the stored source, optional links and AND conditions`,()=>{
  const state=layoutFixture(),base=state.improvements[0],item=state.items.find(row=>row.frameworkId==='TMSA')!;
  state.improvements=([
   {...base,id:'unlinked',source,itemIds:[],status:'open',proposedDate:'2026-01-01'},
   {...base,id:'linked',source,itemIds:[item.id],status:'open',proposedDate:'2026-01-02'},
   {...base,id:'closed',source,itemIds:[],status:'closed',proposedDate:'2026-01-03'},
   {...base,id:'other-meeting',source:meetings.find(row=>row[0]!==source)![0],itemIds:[item.id]},
   {...base,id:'old-source',source:'management_review',itemIds:[]},
  ] as Improvement[]);
  const before=structuredClone(state),ids=(rows:Improvement[])=>rows.map(row=>row.id).sort();
  assert.deepEqual(ids(filterImprovementList(state,{source})),['closed','linked','unlinked']);
  assert.deepEqual(ids(filterImprovementList(state,{source,frameworkId:'TMSA'})),['linked']);
  assert.deepEqual(ids(filterImprovementList(state,withImprovementListView({source},'unfinished'))),['linked','unlinked']);
  assert.deepEqual(ids(filterImprovementList(state,{source,proposedFrom:'2026-01-02',proposedTo:'2026-01-02'})),['linked']);
  assert.deepEqual(filterImprovementList(state,{source,proposedFrom:'2026-02-01'}),[]);
  assert.deepEqual(state,before);
 });
}
test('unknown historical source labels retain their stored evidence',()=>assert.equal(improvementSourceLabel('legacy-source' as Improvement['source'],'zh'),'legacy-source'));
