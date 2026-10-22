import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import type {Improvement} from '../src/types.ts';
import {isStandaloneImprovement,improvementSourceLabel,STANDALONE_IMPROVEMENT_SOURCES} from '../src/improvementTracking.ts';
import {filterImprovementList} from '../src/improvementList.ts';
import {describeAudit} from '../src/auditChanges.ts';
import {buildImprovementsExcel} from '../src/reports.ts';
import {reportingFixture} from './fpmc-reporting-fixture.ts';
const sources=[['seminar','研討會','Seminar'],['external_regulatory_impact','外部法規規則影響','External regulatory and rule impacts']] as const;

for(const [source,zh,en] of sources){
 test(`${source}: distinct standalone source with exact labels in current and historical views`,()=>{
  assert.equal(isStandaloneImprovement(source),true);
  assert(STANDALONE_IMPROVEMENT_SOURCES.includes(source));
  for(const [lang,label] of [['zh',zh],['en',en]] as const){
   assert.equal(improvementSourceLabel(source,lang),label);
   const audit=describeAudit({id:'qa',at:'2026-01-01',actorId:'qa-owner',actorName:'QA',action:'create',kind:'improvement',entityId:'qa-record',itemCodes:[],summary:'',operationId:'qa-operation',before:null,after:{source}},lang);
   assert(audit.changes.some(change=>change.after===label));
  }
 });
 test(`${source}: optional references and source filter never imply an external finding`,()=>{
  const state=reportingFixture(),base=state.improvements[0];
  state.improvements=[{...base,id:'standalone',source,itemIds:[]},{...base,id:'chapter-linked',source,itemIds:[],chapterIds:['chapter-TMSA']},state.improvements[3]];
  const before=JSON.stringify(state),ids=(filter:Parameters<typeof filterImprovementList>[1])=>filterImprovementList(state,filter).map(row=>row.id).sort();
  assert.deepEqual(ids({source}),['chapter-linked','standalone']);
  assert.deepEqual(ids({source,frameworkId:'TMSA'}),['chapter-linked']);
  assert.deepEqual(ids({source,chapterId:'chapter-DRYBMS'}),[]);
  assert.deepEqual(ids({source:'inspection:inspection-technical'}),[state.improvements[2].id]);
  assert.equal(JSON.stringify(state),before);
 });
}

test('17 synthetic legacy non_external records display the new label without rewriting identities or history',async()=>{
 const state=reportingFixture(),base=state.improvements[2];
 state.improvements=Array.from({length:17},(_,index)=>({...base,id:`legacy-${index}`,title:`Legacy ${index}`,content:{en:`Original content ${index}`,zh:`既有內容 ${index}`},plan:'',events:[]} as Improvement));
 const before=JSON.stringify(state),rows=filterImprovementList(state,{source:'non_external'});
 assert.equal(rows.length,17);assert.equal(new Set(rows.map(row=>row.id)).size,17);
 assert(rows.every(row=>improvementSourceLabel(row.source,'zh')==='內部管理需求'));
 const audit=describeAudit({id:'qa',at:'2026-01-01',actorId:'qa-owner',actorName:'QA',action:'create',kind:'improvement',entityId:base.id,itemCodes:[],summary:'',operationId:'qa',before:null,after:{source:'non_external'}},'zh',state);
 assert(audit.changes.some(change=>change.after==='內部管理需求'));
 const book=new ExcelJS.Workbook();await book.xlsx.load(await buildImprovementsExcel(state,rows.map(row=>row.id),'zh') as unknown as ExcelJS.Buffer);
 const sheet=book.worksheets[0],headers=sheet.getRow(4).values as string[],column=headers.indexOf('來源');assert(column>0);
 const labels:string[]=[];sheet.eachRow(row=>{if(row.number>4&&row.getCell(column).text)labels.push(row.getCell(column).text);});
 assert.equal(labels.length,17);assert(labels.every(label=>label==='內部管理需求'));
 assert.equal(improvementSourceLabel('non_external','en'),'Internal management needs');
 assert.equal(JSON.stringify(state),before);
});
