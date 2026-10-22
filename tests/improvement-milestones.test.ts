import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/improvementMilestones.ts';
import type { Improvement, ImprovementMilestone } from '../src/types.ts';
const row=(id:string,date='2026-11-10',actual=''):ImprovementMilestone=>({id,goal:`Goal ${id}`,plannedDate:date,achievedDate:actual});
const record=(rows?:ImprovementMilestone[],percent=65)=>({milestones:rows,percent,status:'in_progress',events:[],milestoneEvents:[]} as unknown as Improvement);
let seq=0;const meta=()=>({id:`event-${++seq}`,at:'2026-10-23T01:00:00Z',by:'qa'});

test('milestones: legacy percent, equal-count progress and real 100% only',()=>{
 assert.equal(m.improvementPercent(record(undefined,65)),65);assert.equal(m.improvementPercent(record([],65)),65);
 assert.equal(m.improvementPercent(record([row('a','2026-01-01','2026-01-01'),row('b'),row('c')])),33);
 const many=Array.from({length:201},(_,i)=>row(String(i),'2026-01-01',i===200?'':'2026-01-01'));
 assert.equal(m.improvementPercent(record(many)),99);many[200].achievedDate='2026-01-01';assert.equal(m.improvementPercent(record(many)),100);
});
test('milestones: reject null, duplicate ids, empty goal and impossible dates',()=>{
 assert.notEqual(m.milestoneRecordIssue(record(null as unknown as ImprovementMilestone[])),'');
 for(const rows of [[row('a'),row('a')],[{...row('a'),goal:' \n '}],[row('a','2026-02-29')],[row('a','2026-11-10','2026-04-31')],[row('a','')]])assert.notEqual(m.milestoneRowsIssue(rows),'');
 assert.equal(m.milestoneRowsIssue([row('leap','2028-02-29')]),'');
});
test('milestones: postpone replays exact calendar delta, skips prior and completed, retains overall deadline',()=>{
 const base={...record([row('prior','2026-11-01'),row('current'),row('done','2026-11-20','2026-11-19'),row('later','2026-11-30')],25),targetDate:'2026-11-30'};
 const unchanged=JSON.stringify(base);const draft=m.applyMilestoneCommand(base,base,{kind:'postpone',milestoneId:'current',date:'2026-11-17',reason:'Vendor delay',cascade:true},meta);
 assert.deepEqual(draft.milestones!.map(r=>r.plannedDate),['2026-11-01','2026-11-17','2026-11-20','2026-12-07']);assert.equal(draft.targetDate,base.targetDate);
 assert.equal(JSON.stringify(base),unchanged);assert.equal(m.milestoneHistoryIssue(base,draft),'');
 const next=m.applyMilestoneCommand(base,draft,{kind:'postpone',milestoneId:'current',date:'2026-11-20',reason:'Second delay',cascade:false},meta);
 assert.equal(next.milestones![3].plannedDate,'2026-12-07');assert.equal(next.milestoneEvents!.length,2);assert.equal(m.milestoneHistoryIssue(base,next),'');
 assert.throws(()=>m.applyMilestoneCommand(base,base,{kind:'postpone',milestoneId:'current',date:'2026-11-17',reason:' ',cascade:true},meta),/REASON/);
 assert.throws(()=>m.applyMilestoneCommand(base,base,{kind:'postpone',milestoneId:'done',date:'2026-12-01',reason:'x',cascade:true},meta),/ACHIEVED/);
 assert.throws(()=>m.applyMilestoneCommand(base,base,{kind:'postpone',milestoneId:'current',date:'2026-11-01',reason:'x',cascade:true},meta),/LATER/);
});
test('milestones: late achievement never cascades, correct and reasoned revoke append history',()=>{
 const base=record([row('a'),row('b','2026-11-20')],0);
 let d=m.applyMilestoneCommand(base,base,{kind:'achieve',milestoneId:'a',date:'2026-11-18'},meta);
 assert.equal(d.percent,50);assert.equal(d.milestones![1].plannedDate,'2026-11-20');
 d=m.applyMilestoneCommand(base,d,{kind:'correct',milestoneId:'a',date:'2026-11-16'},meta);
 assert.throws(()=>m.applyMilestoneCommand(base,d,{kind:'revoke',milestoneId:'a',reason:''},meta),/REASON/);
 d=m.applyMilestoneCommand(base,d,{kind:'revoke',milestoneId:'a',reason:'Selected wrong stage'},meta);
 assert.equal(d.percent,0);assert.equal(d.milestoneEvents!.length,3);assert.equal(m.milestoneHistoryIssue(base,d),'');
});
test('milestones: checkpoint conversion, additions, removal history and no-op without backfill',()=>{
 const legacy=record(undefined,65);delete legacy.milestoneEvents;const noChange=m.checkpointMilestones(legacy,legacy,meta);assert.equal(noChange,legacy);
 let d=m.checkpointMilestones(legacy,{...legacy,milestones:[row('a'),row('b')]},meta);assert.equal(d.percent,0);assert.equal(m.milestoneHistoryIssue(legacy,d),'');
 d=m.applyMilestoneCommand(legacy,d,{kind:'achieve',milestoneId:'a',date:'2026-11-11'},meta);
 const saved=structuredClone(d);const removed=m.applyMilestoneCommand(saved,saved,{kind:'remove',milestoneId:'a'},meta);
 assert.equal(removed.percent,0);assert.equal(removed.milestoneEvents!.at(-1)!.before[0].achievedDate,'2026-11-11');assert.equal(m.milestoneHistoryIssue(saved,removed),'');
 const empty=m.applyMilestoneCommand(saved,removed,{kind:'remove',milestoneId:'b'},meta);assert.deepEqual(empty.milestones,[]);assert.equal(empty.percent,0);assert.equal(m.milestoneHistoryIssue(saved,empty),'');
});
test('milestones: no unlogged edits, forged prefix, reordered rows or dates bypassing postponement',()=>{
 const legacy=record(undefined,0);const saved=m.checkpointMilestones(legacy,{...legacy,milestones:[row('a'),row('b')]},meta);
 assert.notEqual(m.milestoneHistoryIssue(saved,{...saved,milestones:[row('a','2026-12-01'),row('b')]}),'');
 assert.notEqual(m.milestoneHistoryIssue(saved,{...saved,milestoneEvents:[]}), '');
 assert.throws(()=>m.checkpointMilestones(saved,{...saved,milestones:[row('b'),row('a')]},meta),/PLAN/);
 assert.throws(()=>m.checkpointMilestones(saved,{...saved,milestones:[row('a','2026-12-01'),row('b')]},meta),/PLAN/);
 const d=m.checkpointMilestones(saved,{...saved,milestones:[{...row('a'),goal:'Changed\nFull text'},row('b'),row('c','2026-12-01')]},meta);
 assert.equal(m.milestoneHistoryIssue(saved,d),'');assert.equal(d.milestones![0].goal,'Changed\nFull text');
 const tampered=structuredClone(d);tampered.milestoneEvents!.at(-1)!.before[0].goal='spoof';assert.notEqual(m.milestoneHistoryIssue(saved,tampered),'');
});
