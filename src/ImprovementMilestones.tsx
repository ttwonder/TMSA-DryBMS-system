import { useEffect, useRef, useState } from 'react';
import type { Improvement, ImprovementMilestone, Language, Person } from './types';
import { applyMilestoneCommand, improvementPercent, milestoneCommandRows, milestoneEventText, milestoneProgress, milestoneSummary, type MilestoneCommand } from './improvementMilestones';
import { localToday } from './improvementTracking';

export function milestoneErrorText(code:string,lang:Language):string {
  const labels:Record<string,[string,string]>={
    INVALID_MILESTONE:['請填寫每個階段的目標，階段識別不可重複。','Enter every milestone goal; IDs must be unique.'],
    INVALID_MILESTONES:['階段資料不完整，請重新核對。','Check the milestone data.'],
    INVALID_MILESTONE_DATE:['每個階段須有有效預期日期；實際日期亦須有效。','Every stage needs a valid planned date; check actual dates too.'],
    MILESTONE_REASON_REQUIRED:['請填寫理由。','A reason is required.'],
    MILESTONE_DATE_MUST_BE_LATER:['延期日期須晚於目前預期日期。','The postponed date must be later than the current planned date.'],
    MILESTONE_ALREADY_ACHIEVED:['已達成階段不能延期或再次達成。','An achieved milestone cannot be postponed or achieved again.'],
    MILESTONE_NOT_ACHIEVED:['此階段尚未達成。','This milestone has not been achieved.'],
    MILESTONE_NO_CHANGE:['沒有變更，未增加歷史。','No change; no history added.'],
  };
  return labels[code]?.[lang==='zh'?0:1] ?? (lang==='zh'?'階段變更未套用，草稿保留，請核對。':'Milestone change was not applied; draft retained. Please check.');
}
export function MilestoneView({record,lang,people=[],pendingFrom}:{record:Improvement;lang:Language;people?:Person[];pendingFrom?:number}) {
  const t=(zh:string,en:string)=>lang==='zh'?zh:en;
  if(!record.milestones?.length && !record.milestoneEvents?.length)return null;
  return <section className="milestone-section milestone-readonly" aria-label={t('具體階段目標','Specific milestones')}>
    <div className="milestone-heading"><h3>{t('具體階段目標','Specific milestones')}</h3><strong>{record.milestones?.length?milestoneSummary(record,lang):t(`目前無階段；手動進度 ${record.percent}%`,`No current milestones; manual progress ${record.percent}%`)}</strong></div>
    {!!record.milestones?.length && <div className="milestone-table-scroll"><table className="milestone-table"><thead><tr><th>#</th><th>{t('階段目標','Milestone goal')}</th><th>{t('預期完成','Planned completion')}</th><th>{t('達成狀態／實際日期','Achievement / actual date')}</th></tr></thead><tbody>{record.milestones.map((row,index)=><tr key={row.id}><td>{index+1}</td><td className="milestone-goal-text">{row.goal}</td><td>{row.plannedDate}</td><td>{row.achievedDate?<><span className="status-pill closed">{t('已達成','Achieved')}</span> {row.achievedDate}{row.achievedDate>row.plannedDate&&<small className="milestone-late">{t('逾期達成','Achieved late')}</small>}</>:t('未達成','Not achieved')}</td></tr>)}</tbody></table></div>}
    {!!record.milestoneEvents?.length && <details className="milestone-history"><summary>{t('階段變更／延期歷史','Milestone changes / postponement history')} ({record.milestoneEvents.length})</summary>{record.milestoneEvents.map((event,index)=><article key={event.id}><small>{pendingFrom!==undefined&&index>=pendingFrom?t('本次草稿・尚未保存','Draft change · not saved'):`${event.at} · ${people.find(p=>p.id===event.by)?.name??event.by}`}</small><p>{milestoneEventText(event,lang)}</p></article>)}</details>}
  </section>;
}

type PendingAction={kind:'postpone'|'revoke'|'correct';milestoneId:string;date:string;reason:string;cascade:boolean};
export function MilestoneEditor({base,draft,onChange,lang,actorId,disabled=false,readOnly=false,people=[],onPendingChange}:{base:Improvement;draft:Improvement;onChange:(value:Improvement)=>void;lang:Language;actorId:string;disabled?:boolean;readOnly?:boolean;people?:Person[];onPendingChange?:(pending:boolean)=>void}) {
  const t=(zh:string,en:string)=>lang==='zh'?zh:en;
  const [action,setAction]=useState<PendingAction|null>(null),[error,setError]=useState('');
  const manualPercent=useRef(draft.percent);
  useEffect(()=>{onPendingChange?.(!!action);return()=>onPendingChange?.(false);},[!!action,onPendingChange]);
  const rows=draft.milestones??[],savedIds=new Set((base.milestones??[]).map(row=>row.id));
  const oldProgress=milestoneProgress(base),progress=milestoneProgress(draft);
  const identity=()=>({id:crypto.randomUUID(),at:new Date().toISOString(),by:actorId});
  const changeRows=(milestones:ImprovementMilestone[])=>{if(disabled||readOnly)return;if(!rows.length)manualPercent.current=draft.percent;setError('');onChange({...draft,milestones,percent:!milestones.length&&!base.milestones?.length?manualPercent.current:improvementPercent({...draft,milestones})});};
  const command=(value:MilestoneCommand)=>{
    if(disabled||readOnly)return;
    try { const next=applyMilestoneCommand(base,draft,value,identity);if(!next.milestones?.length&&!base.milestones?.length)next.percent=manualPercent.current;onChange(next);setAction(null);setError(''); }
    catch(cause){setError(milestoneErrorText(cause instanceof Error?cause.message:'',lang));}
  };
  const remove=(row:ImprovementMilestone,index:number)=>{
    if(disabled||readOnly)return;
    if(savedIds.has(row.id)&&!window.confirm(t(`移除第 ${index+1} 個已保存階段？達成率會重算，原內容及達成紀錄將保留於歷史；仍須確認保存才生效。`,`Remove saved milestone ${index+1}? Completion will be recalculated; its original content and achievements remain in history. Confirm save is still required.`)))return;
    const journaled=(draft.milestoneEvents??[]).some(e=>e.after.some(r=>r.id===row.id));
    if(!savedIds.has(row.id)&&!journaled) changeRows(rows.filter(r=>r.id!==row.id));
    else command({kind:'remove',milestoneId:row.id});
  };
  let preview:ImprovementMilestone[]|null=null;
  if(action?.kind==='postpone'&&action.reason.trim()) {
    try {preview=milestoneCommandRows(rows,{...action,date:action.date});}catch{/* Invalid drafts are displayed, never applied. */}
  }
  if(readOnly)return <MilestoneView record={draft} lang={lang} people={people} pendingFrom={base.milestoneEvents?.length??0}/>;
  const exceed=rows.some(row=>draft.targetDate&&row.plannedDate>draft.targetDate);
  return <section className="milestone-section" aria-label={t('具體階段目標','Specific milestones')}>
    <div className="milestone-heading"><h3>{t('具體階段目標','Specific milestones')}</h3><strong aria-live="polite">{rows.length?milestoneSummary(draft,lang):t('未設定階段，保留手動進度','No milestones; manual progress retained')}</strong><button type="button" className="btn primary small" disabled={disabled||!!action} onClick={()=>changeRows([...rows,{id:crypto.randomUUID(),goal:'',plannedDate:'',achievedDate:''}])}>{t('＋ 新增階段','＋ Add milestone')}</button></div>
    <p className="milestone-hint">{t('階段等權計算，並非工時比例。所有變更僅為草稿，按「確認保存」後才生效。','Stages count equally, not by effort. All changes remain drafts until Confirm save.')}</p>
    {(oldProgress.total!==progress.total || oldProgress.percent!==progress.percent) && <p className="notice milestone-preview" role="status">{t('保存後進度預覽：','Progress after save: ')}{oldProgress.total?milestoneSummary(base,lang):t(`手動 ${base.percent}%`,`Manual ${base.percent}%`)} → {progress.total?milestoneSummary(draft,lang):t(`手動 ${draft.percent}%`,`Manual ${draft.percent}%`)}</p>}
    {exceed&&<p className="notice milestone-warning">{t('有階段日期超過整項目標日期；總期限未自動改動，請在完整編輯中另行核對。','A milestone exceeds the overall target date. The overall deadline is unchanged; review it separately in Full edit.')}</p>}
    {error&&<p className="notice error" role="alert">{error}</p>}
    {!!rows.length&&<div className="milestone-table-scroll"><table className="milestone-table"><thead><tr><th>#</th><th>{t('階段目標','Milestone goal')}</th><th>{t('預期完成日期','Planned completion date')}</th><th>{t('已達成／實際日期','Achieved / actual date')}</th><th>{t('操作','Actions')}</th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.id} data-milestone-id={row.id}><td>{index+1}</td><td><textarea rows={2} aria-label={t(`階段 ${index+1} 目標`,`Milestone ${index+1} goal`)} disabled={disabled||!!action} value={row.goal} onChange={e=>changeRows(rows.map(r=>r.id===row.id?{...r,goal:e.target.value}:r))}/></td><td><input type="date" aria-label={t(`階段 ${index+1} 預期完成日期`,`Milestone ${index+1} planned date`)} disabled={disabled||!!action||savedIds.has(row.id)} value={row.plannedDate} onChange={e=>changeRows(rows.map(r=>r.id===row.id?{...r,plannedDate:e.target.value}:r))}/>{savedIds.has(row.id)&&<small className="milestone-hint">{t('改期請使用延期','Use Postpone to reschedule')}</small>}</td><td><label className="checkbox-field"><input type="checkbox" aria-label={t(`階段 ${index+1} 已達成`,`Milestone ${index+1} achieved`)} disabled={disabled||!!action} checked={!!row.achievedDate} onChange={e=>e.target.checked?command({kind:'achieve',milestoneId:row.id,date:localToday()}):setAction({kind:'revoke',milestoneId:row.id,date:'',reason:'',cascade:false})}/>{t('已達成','Achieved')}</label>{row.achievedDate&&<><time>{row.achievedDate}</time><button type="button" className="text-button milestone-correct" disabled={disabled||!!action} onClick={()=>setAction({kind:'correct',milestoneId:row.id,date:row.achievedDate,reason:'',cascade:false})} aria-label={t(`更正階段 ${index+1} 實際日期`,`Correct milestone ${index+1} actual date`)}>{t('更正日期','Correct date')}</button>{row.achievedDate>row.plannedDate&&<small className="milestone-late">{t('逾期達成','Achieved late')}</small>}</>}</td><td><div className="milestone-actions"><button type="button" className="btn warning small" disabled={disabled||!!action||!!row.achievedDate||!row.plannedDate} onClick={()=>setAction({kind:'postpone',milestoneId:row.id,date:'',reason:'',cascade:true})} aria-label={t(`延期階段 ${index+1}`,`Postpone milestone ${index+1}`)}>{t('延期','Postpone')}</button><button type="button" className="btn neutral small" disabled={disabled||!!action} onClick={()=>remove(row,index)} aria-label={t(`移除階段 ${index+1}`,`Remove milestone ${index+1}`)}>{t('移除','Remove')}</button></div></td></tr>)}</tbody></table></div>}
    {action&&<div className="milestone-action-panel" role="group" aria-label={action.kind==='postpone'?t('階段延期','Postpone milestone'):action.kind==='revoke'?t('撤銷達成','Revoke achievement'):t('更正實際日期','Correct actual date')}>
      <strong>{t('階段','Milestone')} {rows.findIndex(r=>r.id===action.milestoneId)+1} · {rows.find(r=>r.id===action.milestoneId)?.goal}</strong>
      {action.kind==='postpone'&&<p>{t('目前預期日期','Current planned date')}: {rows.find(r=>r.id===action.milestoneId)?.plannedDate}</p>}
      {action.kind!=='revoke'&&<label className="field">{action.kind==='postpone'?t('新的預期完成日期','New planned completion date'):t('實際達成日期','Actual achievement date')}<input type="date" disabled={disabled} value={action.date} onChange={e=>setAction({...action,date:e.target.value})}/></label>}
      {action.kind!=='correct'&&<label className="field">{t('理由（必填）','Reason (required)')}<textarea rows={2} disabled={disabled} value={action.reason} onChange={e=>setAction({...action,reason:e.target.value})}/></label>}
      {action.kind==='postpone'&&<label className="checkbox-field"><input type="checkbox" disabled={disabled} checked={action.cascade} onChange={e=>setAction({...action,cascade:e.target.checked})}/>{t('後續未達成階段同步順延','Shift subsequent unachieved milestones by the same number of days')}</label>}
      {preview&&<div className="milestone-date-preview" aria-label={t('順延日期預覽','Postponement date preview')}>{preview.flatMap((row,index)=>row.plannedDate!==rows[index].plannedDate?[<p key={row.id}>{index+1}. {row.goal}: {rows[index].plannedDate} → <strong>{row.plannedDate}</strong></p>]:[])}{preview.some(r=>draft.targetDate&&r.plannedDate>draft.targetDate)&&<p className="milestone-warning">{t('順延後超過整項目標日期；總期限保持不變。','The revised schedule exceeds the overall deadline; it will remain unchanged.')}</p>}</div>}
      <div className="page-actions"><button type="button" className="btn neutral small" disabled={disabled} onClick={()=>{setAction(null);setError('');}}>{t('取消此操作','Cancel this change')}</button><button type="button" className="btn primary small" disabled={disabled} onClick={()=>command({...action})}>{t('套用至草稿','Apply to draft')}</button></div>
    </div>}
    {!!draft.milestoneEvents?.length&&<details className="milestone-history"><summary>{t('階段變更／延期歷史','Milestone changes / postponement history')} ({draft.milestoneEvents.length})</summary>{draft.milestoneEvents.map((event,index)=><article key={event.id}><small>{index<(base.milestoneEvents?.length??0)?`${event.at} · ${people.find(p=>p.id===event.by)?.name??event.by}`:t('本次草稿・尚未保存','Draft change · not saved')}</small><p>{milestoneEventText(event,lang)}</p></article>)}</details>}
  </section>;
}
