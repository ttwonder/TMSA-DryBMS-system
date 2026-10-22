import type { Improvement, ImprovementMilestone, MilestoneEvent, Language } from './types.ts';
import { validProposedDate } from './improvementTracking.ts';

export function milestoneProgress(record: Pick<Improvement, 'milestones' | 'percent'>) {
  const rows = record.milestones ?? [], total = rows.length;
  const achieved = rows.filter(row => !!row.achievedDate).length;
  return { total, achieved, percent: total ? achieved === total ? 100 : Math.min(99, Math.round(achieved * 100 / total)) : record.percent };
}
export const improvementPercent = (record: Pick<Improvement, 'milestones' | 'percent'>) => milestoneProgress(record).percent;
export function milestoneRowsIssue(rows: ImprovementMilestone[]): string {
  if (!Array.isArray(rows)) return 'INVALID_MILESTONES';
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Object.keys(row).some(key => !['id','goal','plannedDate','achievedDate'].includes(key)) || typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id) || typeof row.goal !== 'string' || !row.goal.trim()) return 'INVALID_MILESTONE';
    ids.add(row.id);
    if (typeof row.plannedDate !== 'string' || !row.plannedDate || !validProposedDate(row.plannedDate) || typeof row.achievedDate !== 'string' || !validProposedDate(row.achievedDate)) return 'INVALID_MILESTONE_DATE';
  }
  return '';
}
export function milestoneRecordIssue(record: Pick<Improvement,'milestones'|'percent'|'status'>): string {
  const issue = milestoneRowsIssue(record.milestones === undefined ? [] : record.milestones);
  if (issue) return issue;
  const progress = milestoneProgress(record);
  if (progress.total && record.status === 'closed' && progress.achieved !== progress.total) return 'MILESTONES_INCOMPLETE';
  if (progress.total && record.percent !== progress.percent) return 'MILESTONE_PERCENT_MISMATCH';
  return '';
}

type EventIdentity = Pick<MilestoneEvent,'id'|'at'|'by'>;
export type MilestoneCommand = { kind:Exclude<MilestoneEvent['kind'],'plan'>; milestoneId:string; date?:string; reason?:string; cascade?:boolean };
const stable = (value:unknown):string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
const same = (a:unknown,b:unknown) => stable(a) === stable(b);
const requireRows = (rows:ImprovementMilestone[]) => { const issue=milestoneRowsIssue(rows); if(issue) throw new Error(issue); };
const dateMs = (date:string) => new Date(`${date}T00:00:00Z`).getTime();
function moveDate(date:string,days:number):string {
  const value = new Date(dateMs(date) + days * 86400000).toISOString().slice(0,10);
  if (!validProposedDate(value)) throw new Error('INVALID_MILESTONE_DATE');
  return value;
}
/** Pure preview and replay; date-only UTC arithmetic avoids DST elapsed-hour drift. */
export function milestoneCommandRows(rows:ImprovementMilestone[],command:MilestoneCommand):ImprovementMilestone[] {
  requireRows(rows);
  const index=rows.findIndex(row=>row.id===command.milestoneId);
  if(index<0) throw new Error('MILESTONE_NOT_FOUND');
  const current=rows[index],after=structuredClone(rows);
  if(command.kind==='remove') return after.filter(row=>row.id!==command.milestoneId);
  if(command.kind==='revoke') {
    if(!current.achievedDate) throw new Error('MILESTONE_NOT_ACHIEVED');
    if(!command.reason?.trim()) throw new Error('MILESTONE_REASON_REQUIRED');
    after[index].achievedDate='';return after;
  }
  const date=command.date??'';
  if(!date || !validProposedDate(date)) throw new Error('INVALID_MILESTONE_DATE');
  if(command.kind==='postpone') {
    if(current.achievedDate) throw new Error('MILESTONE_ALREADY_ACHIEVED');
    if(!command.reason?.trim()) throw new Error('MILESTONE_REASON_REQUIRED');
    if(date<=current.plannedDate) throw new Error('MILESTONE_DATE_MUST_BE_LATER');
    const days=(dateMs(date)-dateMs(current.plannedDate))/86400000;
    after.forEach((row,i)=>{if(i===index || command.cascade && i>index && !row.achievedDate) row.plannedDate=moveDate(row.plannedDate,days);});
  } else if(command.kind==='achieve' || command.kind==='correct') {
    if(command.kind==='achieve' && current.achievedDate) throw new Error('MILESTONE_ALREADY_ACHIEVED');
    if(command.kind==='correct' && !current.achievedDate) throw new Error('MILESTONE_NOT_ACHIEVED');
    after[index].achievedDate=date;
  } else throw new Error('INVALID_MILESTONE_ACTION');
  if(same(after,rows)) throw new Error('MILESTONE_NO_CHANGE');
  return after;
}
function planIssue(before:ImprovementMilestone[],after:ImprovementMilestone[],savedIds:Set<string>,seenIds:Set<string>):string {
  if(after.length<before.length) return 'INVALID_MILESTONE_PLAN';
  for(let i=0;i<after.length;i++) {
    const old=before[i],row=after[i];
    if(old ? row.id!==old.id || row.achievedDate!==old.achievedDate || savedIds.has(old.id) && row.plannedDate!==old.plannedDate : seenIds.has(row.id) || !!row.achievedDate) return 'INVALID_MILESTONE_PLAN';
  }
  return '';
}
/** Verify the append-only journal and all causal before/after snapshots. */
export function milestoneHistoryIssue(base:Improvement,draft:Improvement):string {
  try {
    const oldEvents=base.milestoneEvents??[],events=draft.milestoneEvents===undefined?oldEvents:draft.milestoneEvents;
    if(!Array.isArray(events) || events.length<oldEvents.length || !same(events.slice(0,oldEvents.length),oldEvents)) return 'MILESTONE_HISTORY_APPEND_ONLY';
    let rows=structuredClone(base.milestones??[]);requireRows(rows);
    const savedIds=new Set(rows.map(row=>row.id)),seenIds=new Set([...savedIds,...oldEvents.flatMap(e=>[...e.before,...e.after].map(row=>row.id))]);
    const eventIds=new Set(oldEvents.map(e=>e.id));
    for(const event of events.slice(oldEvents.length)) {
      if(!event || !event.id || eventIds.has(event.id) || typeof event.reason!=='string' || typeof event.cascade!=='boolean' || typeof event.milestoneId!=='string' || typeof event.at!=='string' || typeof event.by!=='string') return 'INVALID_MILESTONE_EVENT';
      eventIds.add(event.id);requireRows(event.before);requireRows(event.after);
      if(!same(rows,event.before) || same(rows,event.after)) return 'MILESTONE_HISTORY_MISMATCH';
      if(event.kind==='plan') {
        if(event.milestoneId || event.reason || event.cascade) return 'INVALID_MILESTONE_PLAN';
        const issue=planIssue(rows,event.after,savedIds,seenIds);if(issue)return issue;
      } else {
        if(event.kind!=='postpone' && event.cascade || !['revoke','postpone'].includes(event.kind) && event.reason) return 'INVALID_MILESTONE_EVENT';
        const target=event.after.find(row=>row.id===event.milestoneId);
        const expected=milestoneCommandRows(rows,{kind:event.kind,milestoneId:event.milestoneId,date:event.kind==='postpone'?target?.plannedDate:target?.achievedDate,reason:event.reason,cascade:event.cascade});
        if(!same(expected,event.after)) return 'MILESTONE_HISTORY_MISMATCH';
      }
      rows=event.after;rows.forEach(row=>seenIds.add(row.id));
    }
    if(!same(rows,draft.milestones===undefined?base.milestones??[]:draft.milestones)) return 'MILESTONE_HISTORY_MISMATCH';
    return '';
  } catch(error) { return error instanceof Error?error.message:'INVALID_MILESTONE_EVENT'; }
}
export function checkpointMilestones(base:Improvement,draft:Improvement,identity:()=>EventIdentity):Improvement {
  const rows=draft.milestones??[];requireRows(rows);
  const events=draft.milestoneEvents??base.milestoneEvents??[];
  const before=events.length>(base.milestoneEvents?.length??0)?events.at(-1)!.after:base.milestones??[];
  if(same(rows,before)) return draft;
  const event:MilestoneEvent={...identity(),kind:'plan',milestoneId:'',reason:'',cascade:false,before:structuredClone(before),after:structuredClone(rows)};
  const result={...draft,milestoneEvents:[...events,event],percent:improvementPercent(draft)};
  const issue=milestoneHistoryIssue(base,result);if(issue) throw new Error(issue);
  return result;
}
export function applyMilestoneCommand(base:Improvement,draft:Improvement,command:MilestoneCommand,identity:()=>EventIdentity):Improvement {
  const prepared=checkpointMilestones(base,draft,identity),before=prepared.milestones??[];
  const after=milestoneCommandRows(before,command);
  const event:MilestoneEvent={...identity(),kind:command.kind,milestoneId:command.milestoneId,reason:command.reason??'',cascade:command.cascade??false,before:structuredClone(before),after:structuredClone(after)};
  const result={...prepared,milestones:after,milestoneEvents:[...(prepared.milestoneEvents??[]),event],percent:improvementPercent({...prepared,milestones:after})};
  const issue=milestoneHistoryIssue(base,result);if(issue) throw new Error(issue);
  return result;
}
export function milestoneSummary(record:Pick<Improvement,'milestones'|'percent'>,lang:Language):string {
  const p=milestoneProgress(record);
  return lang==='zh'?`已達成 ${p.achieved}／${p.total} 個階段｜完成率 ${p.percent}%`:`Achieved ${p.achieved}/${p.total} milestones | ${p.percent}% complete`;
}
export function milestoneEventText(event:MilestoneEvent,lang:Language):string {
  const labels={plan:['調整階段計劃','Plan revised'],achieve:['階段達成','Milestone achieved'],correct:['更正實際日期','Actual date corrected'],revoke:['撤銷達成','Achievement revoked'],postpone:['階段延期','Milestone postponed'],remove:['移除階段（保留歷史）','Milestone removed (history retained)']};
  const title=labels[event.kind][lang==='zh'?0:1];
  const rows=[...event.after,...event.before.filter(old=>!event.after.some(row=>row.id===old.id))];
  const lines=rows.flatMap(row=>{
    const old=event.before.find(v=>v.id===row.id),next=event.after.find(v=>v.id===row.id);
    if(old && next && same(old,next))return [];
    const goal=old && next && old.goal!==next.goal?`${old.goal} → ${next.goal}`:row.goal;
    return [`${goal}\n${lang==='zh'?'預期':'Planned'}: ${old?.plannedDate||'—'} → ${next?.plannedDate||'—'} · ${lang==='zh'?'實際':'Actual'}: ${old?.achievedDate||'—'} → ${next?.achievedDate||'—'}`];
  });
  return [title,...lines,event.reason?`${lang==='zh'?'理由':'Reason'}: ${event.reason}`:''].filter(Boolean).join('\n');
}
