import test from 'node:test';
import assert from 'node:assert/strict';
import {frameworkScore,inspectionScore,targetMean} from '../src/domain.ts';
import {inspectionSummary} from '../src/syncState.ts';
import {scoringFixture} from './tmsa14-fixture.ts';
test('current TMSA excludes company chapter 14 by default but retains its chapter row',()=>{
 const {state}=scoringFixture(),before=structuredClone(state),score=frameworkScore(state,'TMSA');
 assert.equal(score.score,4);assert.equal(score.totalChapters,1);assert.equal(score.rows.length,2);assert.equal(score.rows[1].score,0);assert.deepEqual(state,before);
});
test('explicit independent history policy reaches compact summaries',()=>{
 const {state,inspection}=scoringFixture();state.frameworks[0].includeTmsaChapter14=true;
 inspection.includeTmsaChapter14=false;assert.equal(inspectionScore(inspection).score,4);assert.equal(inspectionScore(inspectionSummary(inspection)).score,4);assert.equal(inspectionSummary(inspection).scoring.includeTmsaChapter14,false);
 inspection.includeTmsaChapter14=true;assert.equal(inspectionScore(inspectionSummary(inspection)).score,2);
});
test('excluded source gaps and unknown grades do not contaminate scope, but remain visible',()=>{
 const {state,inspection}=scoringFixture();state.items.find(i=>i.chapterId==='TMSA:14')!.sourceGap='Unresolved';inspection.snapshot.items.find(i=>i.chapterId==='TMSA:14')!.sourceGap='Unresolved';for(const r of inspection.results.filter(r=>r.itemId.startsWith('TMSA:14'))){r.response=null;r.reviewed=false;}
 assert.equal(frameworkScore(state,'TMSA').provisional,false);inspection.includeTmsaChapter14=false;assert.equal(inspectionScore(inspection).score,4);assert.equal(inspectionScore(inspection).provisional,false);assert.equal(inspectionScore(inspection).rows[1].provisional,true);
 inspection.includeTmsaChapter14=true;assert.equal(inspectionScore(inspection).score,null);assert.equal(inspectionScore(inspection).provisional,true);
});
test('current and target denominators use the same policy without hiding rows or rewriting targets',()=>{
 const {state,inspection}=scoringFixture(),targets={'TMSA:1':'3','TMSA:14':'bad'},before=structuredClone(targets);const score=frameworkScore(state,'TMSA');assert.equal(targetMean(score.rows,targets,'TMSA'),3);assert.deepEqual(targets,before);assert.equal(frameworkScore(state,'TMSA',['TMSA:14']).score,null);assert.equal(frameworkScore(state,'TMSA',[]).score,null);
 state.frameworks[0].includeTmsaChapter14=true;assert.equal(frameworkScore(state,'TMSA').score,2);assert.equal(frameworkScore(state,'TMSA').totalChapters,2);assert.equal(targetMean(frameworkScore(state,'TMSA').rows,targets,'TMSA'),null);assert.equal(inspectionScore(inspection).score,2);
});
test('chapter identity, not changed code or label, determines the company extension',()=>{
 const {state}=scoringFixture();state.chapters[1].code='Company extension';state.chapters[0].code='14';assert.equal(frameworkScore(state,'TMSA').score,4);
});
test('DRYBMS chapter 14 and its percentages never use the TMSA switch',()=>{
 const {state,inspection}=scoringFixture();state.chapters=state.chapters.map(c=>({...c,frameworkId:'DRYBMS'}));state.dryScores=state.chapters.map(c=>({id:c.id,version:1,createdAt:'',updatedAt:'',updatedBy:'',chapterId:c.id,levels:[100,100,100,100],note:''}));assert.equal(frameworkScore(state,'DRYBMS').totalChapters,2);assert.equal(frameworkScore(state,'DRYBMS').score,4);state.frameworks[0].includeTmsaChapter14=true;assert.equal(frameworkScore(state,'DRYBMS').score,4);
 inspection.frameworkId='DRYBMS';inspection.includeTmsaChapter14=false;inspection.snapshot.chapters=state.chapters;inspection.dryLevels=Object.fromEntries(state.dryScores.map(d=>[d.chapterId,d.levels]));assert.equal(inspectionScore(inspection).score,4);
});
test('legacy history includes chapter 14 independently of current global default',()=>{
 const {state,inspection}=scoringFixture();assert.equal(inspectionScore(inspection).score,2);assert.equal(inspectionScore(inspectionSummary(inspection)).score,2);assert.equal(frameworkScore(state,'TMSA').score,4);
});
