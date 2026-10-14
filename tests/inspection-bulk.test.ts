import test from 'node:test';
import assert from 'node:assert/strict';
import {allInspectionCompliant,bulkInspectionGrading,emptyInspectionResult} from '../src/inspectionEditing.ts';
import type {Inspection,StandardItem} from '../src/types.ts';

const fixture=():Inspection=>{
 const base={version:1,createdAt:'',updatedAt:'',updatedBy:''};
 const items=['c1','c2'].flatMap(chapterId=>([1,2,3,4] as const).map(level=>({...base,id:`${chapterId}-${level}`,frameworkId:'TMSA',chapterId,code:`${chapterId}.${level}`,level,order:level,active:true,kpi:{en:'Frozen',zh:'固定'},guidance:{en:'Original guidance',zh:'原指引'},departmentIds:[],sources:[{source:'Synthetic',rawItem:'RAW KEEP'}]} as StandardItem)));
 items.push({...items[1],id:'c1-gap',code:'c1.2-gap',sourceGap:'Missing first fragment'}, {...items[5],id:'c2-gap',code:'c2.2-gap',sourceGap:'Missing other chapter'});
 const results=items.map(item=>({...emptyInspectionResult(item.id),response:'no' as const,conformity:'partial' as const,reviewed:true,observation:{en:`Observation ${item.id}`,zh:`觀察 ${item.id}`},recommendation:{en:`Recommendation ${item.id}`,zh:`建議 ${item.id}`}}));
 results.push({...results[0],itemId:'historical-extra-result'});
 return {...base,id:'stable',frameworkId:'TMSA',title:'Synthetic history',organization:'QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:{...base,id:'TMSA',name:{en:'Synthetic',zh:'合成'},description:{en:'QA',zh:'測試'},scoring:'tmsa-stage',active:true,sourceVersion:'synthetic',scopeLabel:{en:'Synthetic',zh:'合成'}},chapters:[],items,scoringVersion:'frozen'},results,findings:[{id:'stable-finding',classification:'general',itemIds:[items[0].id],observation:{en:'Finding',zh:'發現'},recommendation:{en:'Recommendation',zh:'建議'},sources:[{source:'Synthetic raw',rawItem:'DO NOT CHANGE'}]}],dryLevels:{c1:[50,null,75,25]}} as Inspection;
};
for(const level of [1,2,3,4] as const)test(`Stage ${level} compliant changes only exact chapter and level, retaining all other results`,()=>{
 const original=fixture(),before=structuredClone(original);
 const result=allInspectionCompliant(original,{chapterId:'c1',level});
 const target=`c1-${level}`;
 assert.equal(result.record.results.find(r=>r.itemId===target)?.response,'yes');
 assert.deepEqual(result.record.results.filter(r=>r.itemId!==target),original.results.filter(r=>r.itemId!==target));
 assert.deepEqual(result.skipped.map(i=>({id:i.id,reason:i.sourceGap})),level===2?[{id:'c1-gap',reason:'Missing first fragment'}]:[]);
 assert.deepEqual(result.record.snapshot,original.snapshot);assert.deepEqual(result.record.findings,original.findings);assert.deepEqual(result.record.dryLevels,original.dryLevels);
 for(const row of result.record.results){const old=original.results.find(r=>r.itemId===row.itemId)!;assert.deepEqual(row.observation,old.observation);assert.deepEqual(row.recommendation,old.recommendation);}
 assert.deepEqual(original,before);
});
for(const scope of [undefined,{chapterId:'c1'}])test(`negative bulk ${scope?'chapter':'entire inspection'} explicitly sets No/none/reviewed including source gaps`,()=>{
 const original=fixture(),before=structuredClone(original);
 original.results[0]={...original.results[0],response:null,reviewed:false};
 const input=structuredClone(original),result=bulkInspectionGrading(original,'none',scope);
 const targets=new Set(original.snapshot.items.filter(i=>!scope||i.chapterId===scope.chapterId).map(i=>i.id));
 assert.deepEqual(result.skipped,[]);
 assert.deepEqual(result.record.results,original.results.map(row=>targets.has(row.itemId)?{...row,response:'no',conformity:'none',reviewed:true}:row));
 assert.deepEqual({...result.record,results:before.results},{...original,results:before.results});
 assert.deepEqual(original,input);
});
test('bulk fills only missing in-scope results and retains skipped absence, prose and result order',()=>{
 const original=fixture();original.results=original.results.filter(r=>!['c1-2','c1-gap','c2-2'].includes(r.itemId));
 const yes=allInspectionCompliant(original,{chapterId:'c1',level:2});
 assert.deepEqual(yes.record.results.slice(0,-1),original.results);assert.equal(yes.record.results.at(-1)?.itemId,'c1-2');
 assert(!yes.record.results.some(r=>r.itemId==='c1-gap'||r.itemId==='c2-2'));
 const no=bulkInspectionGrading(original,'none',{chapterId:'c1',level:2});
 assert.deepEqual(no.record.results.slice(0,-2),original.results);assert.deepEqual(no.record.results.slice(-2).map(r=>({id:r.itemId,response:r.response,conformity:r.conformity,reviewed:r.reviewed})),['c1-2','c1-gap'].map(id=>({id,response:'no',conformity:'none',reviewed:true})));
});
test('empty scope and all-skipped scope are identity no-ops; resolved gaps can become Yes',()=>{
 const original=fixture();
 for(const conformity of ['all','none'] as const)assert.equal(bulkInspectionGrading(original,conformity,{chapterId:'absent'}).record,original);
 assert.equal(allInspectionCompliant(original,{chapterId:'c1',level:99 as StandardItem['level']}).record,original);
 original.snapshot.items=original.snapshot.items.filter(i=>i.id==='c1-gap');
 assert.equal(allInspectionCompliant(original).record,original);
 original.snapshot.items[0].sourceGapResolved=true;
 const result=allInspectionCompliant(original);assert.deepEqual(result.skipped,[]);assert.equal(result.record.results.find(r=>r.itemId==='c1-gap')?.response,'yes');
 assert.deepEqual(result.record.results.filter(r=>r.itemId!=='c1-gap'),original.results.filter(r=>r.itemId!=='c1-gap'));
});
test('whole-inspection Yes retains out-of-snapshot results and reports every unresolved gap',()=>{
 const original=fixture(),result=allInspectionCompliant(original);
 assert.deepEqual(result.skipped.map(i=>i.id),['c1-gap','c2-gap']);
 assert.deepEqual(result.record.results.at(-1),original.results.at(-1));
 for(const row of result.record.results){const item=original.snapshot.items.find(i=>i.id===row.itemId);if(!item||item.sourceGap)assert.deepEqual(row,original.results.find(r=>r.itemId===row.itemId));else assert.equal(row.response,'yes');}
});
