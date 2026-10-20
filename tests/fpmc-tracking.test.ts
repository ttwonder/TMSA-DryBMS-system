import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import type {PlatformState, Improvement} from '../src/types.ts';
import {filterImprovementList, improvementPage, withImprovementListView} from '../src/improvementList.ts';
import {validProposedDate, localToday, latestImprovementEvent, improvementSourceLabel} from '../src/improvementTracking.ts';
import {compactBlankLines} from '../src/standardText.ts';
const {layoutFixture}=createRequire(import.meta.url)('../scripts/layout-fixture.mjs') as {layoutFixture:()=>PlatformState};
// Supplementary boundaries. Behavioral RED/GREEN is retained from the original App/native runner.
const fixture=()=>{const s=layoutFixture(),row=s.improvements[0];s.improvements=[
 {...structuredClone(row),id:'start',source:'management_review',proposedDate:'2026-01-01',itemIds:[],status:'open'},
 {...structuredClone(row),id:'end',source:'management_review',proposedDate:'2026-01-31',itemIds:[],status:'closed'},
 {...structuredClone(row),id:'before',source:'management_review',proposedDate:'2025-12-31',itemIds:[]},
 {...structuredClone(row),id:'legacy',source:'management_review',itemIds:[]},
 {...structuredClone(row),id:'directive',source:'management_directive',proposedDate:'2026-01-01'},
 {...structuredClone(row),id:'self',source:'non_external',proposedDate:'2026-01-01'},
 ] as Improvement[];return s;};
const ids=(rows:Improvement[])=>rows.map(r=>r.id).sort();
test('FPMC-U-source-and-inclusive-independent-date-range-no-legacy-inference',()=>{const s=fixture(),before=JSON.stringify(s);assert.deepEqual(ids(filterImprovementList(s,{source:'management_review',proposedFrom:'2026-01-01',proposedTo:'2026-01-31'})),['end','start']);assert.equal(filterImprovementList(s,{source:'management_review'}).length,4);assert.equal(filterImprovementList(s,{source:'management_review',proposedFrom:'2026-02-01'}).length,0);assert.equal(filterImprovementList(s,{source:'management_review',proposedFrom:'2026-02-01',proposedTo:'2026-01-31'}).length,0);assert.equal(JSON.stringify(s),before);});
test('FPMC-U-framework-only-real-links-status-source-date-AND',()=>{const s=fixture();assert.deepEqual(ids(filterImprovementList(s,{source:'management_review',proposedFrom:'2026-01-01',proposedTo:'2026-01-31',status:'open'})),['start']);assert.equal(filterImprovementList(s,{source:'management_review',frameworkId:'TMSA'}).length,0);assert.equal(filterImprovementList(s,{source:'management_review',chapterId:s.chapters[0].id}).length,0);assert.equal(filterImprovementList(s,{source:'management_review',frameworkId:'all'}).length,4);assert.equal(filterImprovementList(s,{source:'management_directive'}).length,1);});
test('FPMC-U-date-sort-same-IDs-view-and-page-retain-filter',()=>{const s=fixture(),f={source:'management_review' as const,proposedFrom:'2026-01-01',proposedTo:'2026-01-31'};assert.deepEqual(filterImprovementList(s,f).map(r=>r.id),['end','start']);assert.deepEqual(ids(improvementPage(filterImprovementList(s,f),1).rows),['end','start']);const next=withImprovementListView(f,'unfinished');assert.equal(next.source,f.source);assert.equal(next.proposedFrom,f.proposedFrom);assert.deepEqual(ids(filterImprovementList(s,next)),['start']);});
for(const date of ['','2024-02-29','2026-01-31','0001-01-01','9999-12-31'])test(`FPMC-U-valid-date-${date||'empty'}`,()=>assert.equal(validProposedDate(date),true));
for(const date of ['2026-02-29','0000-01-01','2026-2-1','2026-13-01','2026-01-32','2026-01-01T00:00:00Z',' 2026-01-01'])test(`FPMC-U-invalid-date-${date}`,()=>assert.equal(validProposedDate(date),false));
test('FPMC-U-new-local-draft-date-not-UTC',()=>{const d=new Date(2026,0,1,0,1);assert.equal(localToday(d),'2026-01-01');});
test('FPMC-U-latest-event-real-instant-then-append-not-record-metadata',()=>{const event=(id:string,at:string)=>({id,at,by:id,content:id,status:'open' as const,percent:0});const events=[event('a','2026-02-01T10:00:00Z'),event('b','2026-02-01T18:00:00+08:00'),event('old-appended','2026-01-01T00:00:00Z')];const before=JSON.stringify(events);assert.equal(latestImprovementEvent({events})?.id,'b');assert.equal(JSON.stringify(events),before);assert.equal(latestImprovementEvent({events:[]}),undefined);assert.equal(latestImprovementEvent({events:[event('a',''),event('b','')]})?.id,'b');});
test('FPMC-U-compaction-preserves-nonempty-line-bytes-and-boundaries',()=>{const raw='\r\n  1. Text  \r\n \r\n\t二、繁中\n\nlast';assert.equal(compactBlankLines(raw),'  1. Text  \n\t二、繁中\nlast');});
test('FPMC-U-new-source-labels-are-not-self-proposed',()=>{assert.equal(improvementSourceLabel('management_review','zh'),'管理審查會議');assert.equal(improvementSourceLabel('management_directive','zh'),'管理層指令');assert.equal(improvementSourceLabel('management_review','en'),'Management review meeting');assert.equal(improvementSourceLabel('management_directive','en'),'Management directive');});
