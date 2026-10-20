import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {findingClassifications, findingClassificationLabel, isActionableFinding} from './findingClassification';
import type { BiText, Finding, FrameworkId, Improvement, Inspection, InspectionResult, PageProps, BrowseState, ReadonlyInspectionSummary } from './types';
import { bi, currentIncludesTmsa14, hasPermission, inspectionIncludesTmsa14, inspectionScore, newBase, openIssuesFor } from './domain';
import { BilingualText, EditorNotice, Empty, Modal, MultiSelect, PageHeading, departmentOptions } from './ui';
import { departmentAssigneeOptions } from './departmentAssignees';
import { useRecordEditor } from './useRecordEditor';
import { Tmsa14Switch } from './Tmsa14Scope';
import { withHydratedInspection } from './syncState';
import { localToday } from './improvementTracking';
import { improvementValidation, ImprovementTextarea } from './Improvements';
import {bulkInspectionGrading,changeInspectionResult,inspectionChapterStatus} from './inspectionEditing';
import type {InspectionGradingScope} from './inspectionEditing';

export function createInspectionDraft(state: BrowseState, frameworkId: FrameworkId): Inspection {
  const framework = state.frameworks.find(row => row.id === frameworkId && row.active);
  if (!framework) throw new Error('ACTIVE_FRAMEWORK_REQUIRED');
  const chapters = state.chapters.filter(row => row.active && row.frameworkId === frameworkId).sort((a, b) => a.order - b.order);
  const chapterIds = new Set(chapters.map(row => row.id));
  const items = state.items.filter(row => row.active && row.frameworkId === frameworkId && chapterIds.has(row.chapterId)).sort((a, b) => a.order - b.order);
  if (!chapters.length || !items.length) throw new Error('EMPTY_FRAMEWORK');
  return { ...newBase(), frameworkId, title: '', organization: '', date: '', type: 'formal', status: 'draft', snapshot: structuredClone({ framework, chapters, items, scoringVersion: frameworkId === 'TMSA' ? 'company-20-equal-stage-v1' : 'drybms-guidance-v1.1-p7' }), results: items.map(item => ({ itemId: item.id, response: null, conformity: 'none', reviewed: false, observation: { en: '', zh: '' }, recommendation: { en: '', zh: '' } })), findings: [], imported: false, ...(frameworkId==='TMSA'?{includeTmsaChapter14:currentIncludesTmsa14(state)}:{}), ...(frameworkId === 'DRYBMS' ? { dryLevels: Object.fromEntries(chapters.map(chapter => [chapter.id, [null, null, null, null]])) } : {}) };
}
export function reviseInspection(record: Inspection): Inspection {
  if (record.status !== 'final') throw new Error('FINAL_INSPECTION_REQUIRED');
  return structuredClone(record);
}
export function improvementFromFinding(record: Inspection, finding: Finding): Improvement {
  if (!isActionableFinding(finding.classification)) throw new Error('FINDING_NOT_ACTIONABLE');
  if (!finding.itemIds.length) throw new Error('FINDING_ITEMS_REQUIRED');
  const items = record.snapshot.items.filter(item => finding.itemIds.includes(item.id));
  return { ...newBase(), title: `${finding.observation.en}\n${finding.observation.zh}`, content: structuredClone(finding.observation), itemIds: [...finding.itemIds], departmentIds: [...new Set(items.flatMap(item => item.departmentIds))], assigneeIds: [], source: 'external', proposedDate: localToday(), inspectionId: record.id, findingId: finding.id, sourceKey: `${record.id}:${finding.id}`, urgency: 'medium', status: 'open', percent: 0, targetDate: '', plan: finding.recommendation.en || finding.recommendation.zh, events: [], closedAt: null, closedBy: null, sources: structuredClone(finding.sources) };
}

// Findings share frozen snapshot options; text edits must not rewrite every checkbox.
const FindingItems = memo(function FindingItems({label, options, selected, findingId, onChange}: {label: string; options: {id: string; label: string}[]; selected: string[]; findingId: string; onChange: (findingId: string, itemIds: string[]) => void}) {
  return <MultiSelect label={label} options={options} selected={selected} onChange={itemIds => onChange(findingId, itemIds)} />;
});

export default function Inspections(ctx: PageProps) {
  const { state, t } = ctx;
  const editor = useRecordEditor<Inspection>(ctx, 'inspection');
  const actionEditor = useRecordEditor<Improvement>(ctx, 'improvement');
  const [framework, setFramework] = useState<FrameworkId>('TMSA');
  const [filters, setFilters] = useState({ framework: '', from: '', to: '', type: '', query: '' });
  const [view, setView] = useState<Inspection | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const detailGeneration = useRef(0), detailOwner = useRef({api:ctx.api,session:ctx.api.sessionToken,actor:ctx.user.id});
  if(detailOwner.current.api!==ctx.api||detailOwner.current.session!==ctx.api.sessionToken||detailOwner.current.actor!==ctx.user.id){detailGeneration.current++;detailOwner.current={api:ctx.api,session:ctx.api.sessionToken,actor:ctx.user.id};}
  useEffect(()=>()=>{detailGeneration.current++;},[]);
  const hydrate = async (summary: Inspection | ReadonlyInspectionSummary) => {
    const g=++detailGeneration.current,owner=detailOwner.current;setDetailBusy(true);
    try {
      const full=summary.version===0&&'snapshot' in summary?summary:ctx.api.hydrateInspection?await ctx.api.hydrateInspection(summary):(await ctx.api.read()).inspections.find(i=>i.id===summary.id);
      if(g!==detailGeneration.current||owner!==detailOwner.current||ctx.api.sessionToken!==owner.session)return null;
      if(!full||full.version!==summary.version)throw Error('STALE_DETAIL');
      return full;
    } catch(error){if(g===detailGeneration.current)ctx.notify(error instanceof Error?error.message:String(error),'error');return null;}
    finally{if(g===detailGeneration.current)setDetailBusy(false);}
  };
  const [chapterId, setChapterId] = useState<string | null>('');
  const [validation, setValidation] = useState('');
  const [actionError, setActionError] = useState('');
  const [exporting, setExporting] = useState(false);
  const record = editor.draft || view;
  const findingItemOptions = useMemo(() => record?.snapshot.items.map(item => ({ id: item.id, label: `${item.code} · ${bi(item.kpi, ctx.lang)}` })) ?? [], [record?.snapshot.items, ctx.lang]);
  const chapterScores = useMemo(() => new Map(record ? inspectionScore(record).rows.map(row => [row.chapterId, row] as const) : []), [record]);
  const readonly = !editor.draft;
  const controlsDisabled = readonly || editor.busy || editor.pendingUnknown;
  const canManage = hasPermission(state.settings.rolePermissions, ctx.user, 'manageInspections');
  const canExport = hasPermission(state.settings.rolePermissions, ctx.user, 'exportReports');
  const canCreateAction = hasPermission(state.settings.rolePermissions, ctx.user, 'createImprovements');
  const visible = useMemo(() => state.inspections.filter(row => (!filters.framework || row.frameworkId === filters.framework) && (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to) && (!filters.type || row.type === filters.type) && (!filters.query || `${row.organization} ${row.title}`.toLocaleLowerCase().includes(filters.query.trim().toLocaleLowerCase()))).sort((a, b) => b.date.localeCompare(a.date)), [state.inspections, filters]);
  const patch = (value: Partial<Inspection>) => {if(editor.busy||editor.pendingUnknown)return;editor.setDraft(old => old ? { ...old, ...value } : old);};
  const scoreText = (inspection: Inspection | ReadonlyInspectionSummary) => {
    const score = inspectionScore(inspection);
    if (score.score === null) return t('未完整記分（不是0分）', 'Not fully graded (not zero)');
    return `${score.score.toFixed(2)} / 4${score.provisional ? ` · ${t('暫估／来源缺口', 'Provisional / source gaps')}` : ''}`;
  };
  const show = async (summary: Inspection | ReadonlyInspectionSummary) => { if (editor.draft || actionEditor.draft || editor.busy) return;const inspection=await hydrate(summary);if(!inspection)return;setView(inspection);setChapterId(inspection.snapshot.chapters[0]?.id || '');setValidation(''); };
  const edit = async (summary: Inspection | ReadonlyInspectionSummary,revision=false) => {const full=await hydrate(summary);if(!full)return;const inspection=revision?reviseInspection(full):full;setView(null);setValidation('');setChapterId(inspection.snapshot.chapters[0]?.id || '');await editor.open(inspection);};
  const create = async () => { try { await edit(createInspectionDraft(state, framework)); } catch (error) { ctx.notify(error instanceof Error ? error.message : String(error), 'error'); } };
  const closeEditor = () => { if (editor.busy || actionEditor.draft) return; if (editor.isDirty && !window.confirm(t('放棄檢查草稿？取消不會保存。', 'Discard the inspection draft? Cancel does not save.'))) return; detailGeneration.current++;setView(null); void editor.cancel(); };
  const updateResult = (itemId: string, changes: Partial<InspectionResult>) => {
    if (!editor.draft) return;
    const current = editor.draft.results.find(row => row.itemId === itemId) || { itemId, response: null, conformity: 'none', reviewed: false, observation: { en: '', zh: '' }, recommendation: { en: '', zh: '' } };
    const item=editor.draft.snapshot.items.find(row=>row.id===itemId);if(!item)return;
    try{const next=changeInspectionResult(current,changes,item);patch({ results: editor.draft.results.some(row => row.itemId === itemId) ? editor.draft.results.map(row => row.itemId === itemId ? next : row) : [...editor.draft.results,next] });}catch{setValidation(t('來源缺口未補齊，不可設為全符合。','Resolve source gaps before marking full conformity.'));}
  };
  const updateFinding = (findingId: string, changes: Partial<Finding>) => {
    if (!editor.draft || editor.busy || editor.pendingUnknown) return;
    patch({ findings: editor.draft.findings.map(finding => finding.id === findingId ? { ...finding, ...changes } : finding) });
  };
  // Forward to the current draft/guards; memoization must not retain an old editor closure.
  const findingUpdater = useRef(updateFinding);
  findingUpdater.current = updateFinding;
  const changeFindingItems = useCallback((findingId: string, itemIds: string[]) => findingUpdater.current(findingId, { itemIds }), []);
  const addFinding = (itemId: string) => {
    if (!editor.draft || editor.busy || editor.pendingUnknown) return;
    const result = editor.draft.results.find(row => row.itemId === itemId);
    patch({ findings: [...editor.draft.findings, { id: crypto.randomUUID(), itemIds: [itemId], classification: 'general', observation: structuredClone(result?.observation || { en: '', zh: '' }), recommendation: structuredClone(result?.recommendation || { en: '', zh: '' }), sources: [] }] });
    setChapterId(null);
  };
  const importAssessment = () => {
    if (!editor.draft || !window.confirm(t('這只會帶入目前自評，不代表外部稽核已確認。確定覆蓋此草稿的逐項評定？', 'This copies current self-assessment, not audit evidence. Replace this draft’s item grading?'))) return;
    const current = editor.draft;
    patch({ results: current.snapshot.items.map(item => { const assessment = state.assessments.find(row => row.itemId === item.id); const old = current.results.find(row => row.itemId === item.id); return { itemId: item.id, response: assessment?.response ?? null, conformity: assessment?.conformity ?? 'none', reviewed: assessment?.reviewed ?? false, observation: old?.observation || { en: '', zh: '' }, recommendation: old?.recommendation || { en: '', zh: '' } }; }), ...(current.frameworkId === 'DRYBMS' ? { dryLevels: Object.fromEntries(current.snapshot.chapters.map(chapter => [chapter.id, structuredClone(state.dryScores.find(row => row.chapterId === chapter.id)?.levels || [null, null, null, null])])) } : {}), scoreNote: { en: 'Grading explicitly copied from current self-assessment by the editor; this is not external audit confirmation.', zh: '編輯者明確由目前自評帶入評定；此操作並非外部稽核確認。' } });
  };
  const markBulk=(conformity:'all'|'none',scope?:InspectionGradingScope)=>{if(!editor.draft||controlsDisabled)return;const result=bulkInspectionGrading(editor.draft,conformity,scope);editor.setDraft(result.record);const details=result.skipped.map(i=>`${i.code}: ${i.sourceGap}`);setValidation(result.skipped.length?t(`略過 ${result.skipped.length} 筆：來源缺口未補齊（${details.join('；')}），保留原評定。`,`Skipped ${result.skipped.length} unresolved source-gap items (${details.join('; ')}); original grading retained.`):'');};
  const save = async (finalize: boolean) => {
    if (!editor.draft) return;
    if (!editor.draft.title.trim() || !editor.draft.organization.trim() || !editor.draft.date) { setValidation(t('請填寫標題、檢查組織及日期。', 'Enter the title, inspection organization and date.')); return; }
    if (editor.draft.results.some(result => result.response === 'yes' && (result.conformity !== 'all' || editor.draft!.snapshot.items.some(item => item.id === result.itemId && item.sourceGap && !item.sourceGapResolved)))) { setValidation(t('Yes必須全符合，且不能用Yes掩蓋未補齊來源缺口。請明確選擇符合程度。', 'Yes requires full conformity and cannot cover an unresolved source gap. Select the conformity explicitly.')); return; }
    if (editor.draft.findings.some(finding => !finding.observation.en.trim() && !finding.observation.zh.trim())) { setValidation(t('每筆檢查發現需填寫觀察內容。', 'Each finding requires observation content.')); return; }
    if (finalize) {
      if (!window.confirm(t('發布後將納入上一次檢查，仍可直接修訂，原版本留存於操作歷史。未完整評定不推定Yes。確認發布？', 'Publication includes this inspection in the last-inspection summary. Direct edits remain available with prior versions in audit history. Unknown grades never imply Yes. Publish?'))) return;
      if(editor.draft.version===0&&!await editor.save('create',{keepOpen:true}))return;
      await editor.save('finalize');
    } else await editor.save(editor.draft.version === 0 ? 'create' : 'update',{keepOpen:true});
  };
  const exportPdf = async (inspection: Inspection | ReadonlyInspectionSummary) => {
    setExporting(true);
    try {
      const canonical = await ctx.api.authorizeExport({ format: 'pdf', kind: 'inspection', ids: [inspection.id], frameworkId: inspection.frameworkId, snapshotToken: state.snapshotToken, filters: { inspectionId: inspection.id } });
      if (!canonical.inspections.some(row => row.id === inspection.id)) throw new Error('EXPORT_RECORD_NOT_AVAILABLE');
      const { downloadInspectionPdf } = await import('./reports');
      await downloadInspectionPdf(canonical, inspection.id, ctx.lang);
      ctx.notify(t('PDF已產生並啟動下載。', 'PDF generated and download started.'), 'success');
    } catch (error) { ctx.notify(error instanceof Error ? error.message : String(error), 'error'); }
    finally { setExporting(false); }
  };
  const createAction = async (inspection: Inspection, finding: Finding) => {
    const existing = state.improvements.find(row => row.sourceKey === `${inspection.id}:${finding.id}` || row.inspectionId === inspection.id && row.findingId === finding.id);
    if (existing) { ctx.navigate('improvements', existing.id); return; }
    const summary = state.inspections.find(row => row.id === inspection.id);
    const canonical = summary?await hydrate(summary):null;
    const originalFinding = canonical?.findings.find(row => row.id === finding.id);
    if (!canonical || !originalFinding || editor.isDirty) { ctx.notify(t('請先保存檢查發現，再由已保存來源建立改善。', 'Save the finding first, then create an action from the saved source.'), 'error'); return; }
    try { setActionError(''); await actionEditor.open(improvementFromFinding(canonical, originalFinding)); }
    catch (error) { ctx.notify(error instanceof Error ? error.message : String(error), 'error'); }
  };
  const saveAction = async () => {
    if (!actionEditor.draft) return;
    const issue = improvementValidation(actionEditor.draft, {...ctx,state:record?withHydratedInspection(state,record):state});
    if (issue) { setActionError(issue); return; }
    if (!window.confirm(t('確認建立此發現的唯一改善記錄？', 'Create the single improvement record for this finding?'))) return;
    await actionEditor.save('create');
  };
  const findingLabel = (value: Finding['classification']) => findingClassificationLabel(value,ctx.lang);
  const showSources = (finding: Finding) => <div className="notice">{finding.warning && <p className="notice warning">{finding.warning}</p>}{finding.sources.map((source, index) => <p key={index} className="preserve-lines">{[source.source, source.file, source.sheet, source.cell, source.pages?.join(', '), source.rawItem, source.note].filter(Boolean).join(' · ')}</p>)}</div>;
  const showingFindings = chapterId === null;
  const chapter = showingFindings ? undefined : record?.snapshot.chapters.find(row => row.id === chapterId) || record?.snapshot.chapters[0];

  return <>
    <PageHeading title={t('歷史檢查記錄', 'Inspection history')} subtitle={t('檢查快照與目前自評獨立。公司TMSA按此份納入分章等權；DRYBMS按30主題四級減權。納入範圍未完整逐項評定不產生成績。', 'Inspection snapshots are independent of current self-assessment. Company TMSA equally weights this inspection’s included chapters; DRYBMS uses 30 themes with four-level weighting. Incomplete included-scope grading has no complete score.')} actions={canManage && <><label className="field">{t('新檢查框架', 'New inspection framework')}<select value={framework} onChange={e => setFramework(e.target.value as FrameworkId)}><option>TMSA</option><option>DRYBMS</option></select></label><button className="btn primary" disabled={!!record || editor.busy || !!editor.backup} onClick={() => void create()}>{t('新增檢查', 'New inspection')}</button></>} />
    <div className="toolbar"><label className="field">{t('框架', 'Framework')}<select value={filters.framework} onChange={e => setFilters({ ...filters, framework: e.target.value })}><option value="">{t('全部', 'All')}</option><option>TMSA</option><option>DRYBMS</option></select></label><label className="field">{t('起日', 'From')}<input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label><label className="field">{t('迄日', 'To')}<input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label><label className="field">{t('檢查類型', 'Inspection type')}<select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option value="">{t('全部', 'All')}</option><option value="formal">{t('正式', 'Formal')}</option><option value="informal">{t('非正式', 'Informal')}</option></select></label><label className="field">{t('組織／標題關鍵字', 'Organization / title keyword')}<input value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} /></label><button className="btn neutral" onClick={() => setFilters({ framework: '', from: '', to: '', type: '', query: '' })}>{t('清除篩選', 'Clear filters')}</button></div>
    {detailBusy && <div role="status" className="notice">{t('載入完整檢查快照…','Loading complete inspection snapshot…')}</div>}
    <EditorNotice error={record ? '' : editor.error} lost={editor.lost} />
    {!record&&editor.backup&&<div className="notice warning">{t('有本機未完成檢查草稿（不是雲端已保存）。','An unfinished local inspection draft is available (not cloud-saved).')} <button className="btn warning" onClick={()=>void editor.restore()}>{t('恢復本機草稿','Restore local draft')}</button> <button className="btn neutral" onClick={()=>{if(window.confirm(t('確定放棄本機草稿？不會更改伺服器。','Discard local draft? The server is unchanged.')))void editor.cancel();}}>{t('放棄本機草稿','Discard local draft')}</button></div>}
    {!visible.length ? <Empty>{t('尚無符合篩選的檢查。', 'No matching inspections.')}</Empty> : <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('檢查／組織', 'Inspection / organization')}</th><th>{t('框架／日期', 'Framework / date')}</th><th>{t('類型／狀態', 'Type / status')}</th><th>{t('快照成績', 'Snapshot score')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>{visible.map(inspection => <tr key={inspection.id}><td><button className="text-button" onClick={() => show(inspection)}>{inspection.title}</button><br />{inspection.organization}{inspection.imported && <small> · {t('來源匯入', 'Imported source')}</small>}{inspection.supersedesId && <small> · {t('修訂副本', 'Revision copy')}</small>}</td><td>{inspection.frameworkId}<br />{inspection.date}</td><td>{inspection.type === 'formal' ? t('正式', 'Formal') : t('非正式', 'Informal')}<br /><span className={`status-pill ${inspection.status}`}>{inspection.status === 'final' ? t('已發布', 'Published') : t('草稿', 'Draft')}</span></td><td>{scoreText(inspection)}{inspection.frameworkId==='TMSA'&&<small>{inspectionIncludesTmsa14(inspection)?t('納入第14章','Chapter 14 included'):t('不納入第14章','Chapter 14 excluded')}</small>}</td><td><div className="page-actions"><button className="btn neutral" onClick={() => show(inspection)}>{t('查看', 'View')}</button>{canManage && <button className="btn primary" disabled={!!record || editor.busy || !!editor.backup} onClick={() => void edit(inspection, inspection.status === 'final')}>{inspection.status === 'final' ? t('直接修改', 'Edit directly') : t('編輯草稿', 'Edit draft')}</button>}{canExport && <button className="btn neutral" disabled={exporting} onClick={() => void exportPdf(inspection)}>{t('匯出PDF', 'Export PDF')}</button>}</div></td></tr>)}</tbody></table></div>}
    {record && <Modal title={readonly ? t('檢查快照（唯讀）', 'Inspection snapshot (read-only)') : t('編輯檢查記錄', 'Edit inspection record')} wide onClose={closeEditor}>
      <EditorNotice error={editor.error || validation} lost={editor.lost} />
      {editor.localNotice&&<p role="status" className="notice">{editor.localNotice}</p>}{!readonly&&(editor.lost||editor.pendingUnknown)&&<button className="btn warning" disabled={editor.busy} onClick={()=>void editor.recover()}>{t('核對／重新取得編輯鎖','Recheck / reacquire edit lock')}</button>}
      <div className="notice">{record.frameworkId} · {record.snapshot.scoringVersion} · {record.snapshot.chapters.length} {t('章節', 'chapters')} · {record.snapshot.items.length} Items · {scoreText(record)}{record.supersedesId && <p>{t('取代的原快照（仍保留）', 'Original snapshot (retained)')}: {record.supersedesId}</p>}{record.scoreNote && <BilingualText value={record.scoreNote} />}</div>
      {record.frameworkId==='TMSA'&&<div className="scoring-scope page-actions"><Tmsa14Switch t={t} included={inspectionIncludesTmsa14(record)} disabled={controlsDisabled} onClick={()=>patch({includeTmsaChapter14:!inspectionIncludesTmsa14(record)})}/><small>{t('僅此份檢查；編輯後須按「保存檢查」。','This inspection only; use Save inspection to persist edits.')} · {inspectionScore(record).totalChapters} {t('計分分章','scoring chapters')}</small></div>}
      <div className="form-grid"><label className="field">{t('標題', 'Title')}<input disabled={controlsDisabled} value={record.title} onChange={e => patch({ title: e.target.value })} /></label><label className="field">{t('檢查組織', 'Inspection organization')}<input disabled={controlsDisabled} value={record.organization} onChange={e => patch({ organization: e.target.value })} /></label><label className="field">{t('檢查日期', 'Inspection date')}<input disabled={controlsDisabled} type="date" value={record.date} onChange={e => patch({ date: e.target.value })} /></label><label className="field">{t('類型', 'Type')}<select disabled={controlsDisabled} value={record.type} onChange={e => patch({ type: e.target.value as Inspection['type'] })}><option value="formal">{t('正式', 'Formal')}</option><option value="informal">{t('非正式', 'Informal')}</option></select></label></div>
      {!readonly && <div className="notice warning"><p>{t('所有Item初始為未知。由目前自評帶入是明確使用者操作，並非稽核證據或外部確認。', 'All items start unknown. Copying current self-assessment is an explicit user action, not audit evidence or external confirmation.')}</p><button className="btn warning" disabled={controlsDisabled} onClick={importAssessment}>{t('明確從目前自評帶入', 'Explicitly copy current self-assessment')}</button> <button className="btn primary" disabled={controlsDisabled} onClick={()=>markBulk('all')}>{t('一鍵全符合','Mark all compliant')}</button> <button className="btn warning" disabled={controlsDisabled} onClick={()=>markBulk('none')}>{t('一鍵全不符合','Mark all non-compliant')}</button>{record.frameworkId==='DRYBMS'&&<p>{t('四級百分比仍需明確填寫，不由逐項Yes推算。','Enter the four level percentages explicitly; item Yes does not infer percentages.')}</p>}</div>}
      <nav className="chapter-navigation" aria-label={t('檢查章節', 'Inspection chapters')}>{record.snapshot.chapters.map(row => {
        const status=inspectionChapterStatus(record,row.id);
        const label=status.incomplete?t('未完整評定','Incomplete grading'):status.color==='green'?t('全部符合','All compliant'):status.color==='red'?t('全部不符合','All non-compliant'):t('部分符合','Partly compliant');
        const score=chapterScores.get(row.id);
        const chapterScoreText=status.incomplete||score?.score==null?t('未完整記分','Not fully graded'):`${score.score.toFixed(2)} / 4${score.provisional?` · ${t('暫估／來源缺口','Provisional / source gaps')}`:''}`;
        return <button key={row.id} className={`btn ${chapter?.id === row.id ? 'primary' : 'neutral'}`} onClick={() => setChapterId(row.id)}><span className={`inspection-status ${status.color}`} title={label}>●</span>{row.code} · {bi(row.name, ctx.lang)} · {label}<span className="inspection-chapter-score"> · {t('分數','Score')}: {chapterScoreText}{score?.includedInTotal===false&&` · ${t('不納入總分','Excluded from total')}`}</span></button>;
      })}<button className={`btn ${showingFindings ? 'primary' : 'neutral'}`} onClick={() => setChapterId(null)}>{t('缺陷／改善建議', 'Findings / recommendations')}</button></nav>
      {chapter && <><h3><BilingualText value={chapter.name} /></h3>{!readonly && <div className="inspection-chapter-actions" role="group" aria-label={t('本章批次評定','Chapter bulk grading')}>{([1,2,3,4] as const).map(level=><button key={level} className="btn neutral" disabled={controlsDisabled||!record.snapshot.items.some(item=>item.chapterId===chapter.id&&item.level===level)} onClick={()=>markBulk('all',{chapterId:chapter.id,level})}>{t(`Stage ${level} 全符合`,`Stage ${level} all compliant`)}</button>)}<button className="btn warning" disabled={controlsDisabled||!record.snapshot.items.some(item=>item.chapterId===chapter.id)} onClick={()=>markBulk('none',{chapterId:chapter.id})}>{t('本章一鍵全不符合','Mark chapter non-compliant')}</button></div>}{record.frameworkId === 'DRYBMS' && <div className="form-grid">{['Basic', 'Intermediate', 'Advanced', 'Excellence'].map((level, index) => <label className="field" key={level}>{level} %<select disabled={controlsDisabled} value={record.dryLevels?.[chapter.id]?.[index] ?? ''} onChange={e => { const levels = [...(record.dryLevels?.[chapter.id] || [null, null, null, null])] as [number | null, number | null, number | null, number | null]; levels[index] = e.target.value === '' ? null : Number(e.target.value); patch({ dryLevels: { ...record.dryLevels, [chapter.id]: levels } }); }}><option value="">{t('未評', 'Not assessed')}</option>{[0, 25, 50, 75, 100].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>)}</div>}
        {record.snapshot.items.filter(item => item.chapterId === chapter.id).map(item => { const result = record.results.find(row => row.itemId === item.id); const observation = result?.observation || { en: '', zh: '' }; const recommendation = result?.recommendation || { en: '', zh: '' }; return <article key={item.id} className="inspection-item"><h4>{state.viewScope!=='management_viewer'&&openIssuesFor(state, item.id).length ? '⭐ ' : ''}{item.code} · {t('級別', 'Level')} {item.level}</h4><BilingualText value={item.kpi} /><BilingualText value={item.guidance} />{item.sourceGap && <div className="notice warning">{item.sourceGap} · {item.sourceGapResolved ? t('已附來源補證', 'Supported resolution recorded') : t('來源缺口未補齊', 'Unresolved source gap')}</div>}
          <div className="form-grid"><label className="field">{t('Y/N', 'Y/N')}<select aria-label="Y/N" disabled={controlsDisabled} value={result?.response || ''} onChange={e => updateResult(item.id, { response: e.target.value === '' ? null : e.target.value as 'yes' | 'no' })}><option value="">{t('未知', 'Unknown')}</option><option value="yes" disabled={!!item.sourceGap&&!item.sourceGapResolved}>Yes</option><option value="no">No</option></select></label><label className="field">{t('符合程度', 'Conformity')}<select aria-label={t('符合程度','Conformity')} disabled={controlsDisabled} value={result?.conformity || 'none'} onChange={e => updateResult(item.id, { conformity: e.target.value as InspectionResult['conformity'] })}><option value="all" disabled={!!item.sourceGap&&!item.sourceGapResolved}>{t('全符合', 'All')}</option><option value="partial">{t('部分符合', 'Partial')}</option><option value="none">{t('不符合', 'None')}</option></select></label>
            {readonly ? <><BilingualText value={observation} /><BilingualText value={recommendation} /></> : (['observation', 'recommendation'] as const).flatMap(key => (['en', 'zh'] as const).map(lang => <label className="field" key={`${key}-${lang}`}>{key === 'observation' ? t('觀察', 'Observation') : t('建議', 'Recommendation')} · {lang === 'en' ? t('英文', 'English') : t('繁中', 'Traditional Chinese')}<textarea aria-label={`${key === 'observation' ? t('觀察','Observation') : t('建議','Recommendation')} · ${lang==='en'?t('英文','English'):t('繁中','Traditional Chinese')}`} disabled={controlsDisabled} rows={4} value={(key === 'observation' ? observation : recommendation)[lang]} onChange={e => updateResult(item.id, { [key]: { ...(key === 'observation' ? observation : recommendation), [lang]: e.target.value } })} /></label>))}
          </div>{!readonly && <button className="btn neutral" disabled={controlsDisabled} onClick={() => addFinding(item.id)}>{t('加入檢查發現（預設一般觀察，非自動No）', 'Add finding (defaults to general observation, not automatically No)')}</button>}</article>; })}</>}
      {showingFindings && <><h3>{t('完整原始發現／來源與警示', 'Complete findings / sources and warnings')}</h3>
      {!record.findings.length && <Empty>{t('沒有來源發現；逐項評定仍保存在此快照。', 'No source findings; item grading remains in this snapshot.')}</Empty>}
      {record.findings.map(finding => { const existing = state.improvements.find(row => row.sourceKey === `${record.id}:${finding.id}` || row.inspectionId === record.id && row.findingId === finding.id); return <article key={finding.id} className="inspection-finding"><h4>{findingLabel(finding.classification)}</h4>{!readonly ? <div className="form-grid"><label className="field">{t('明確分類（不會自動改Y/N）', 'Explicit classification (never changes Y/N automatically)')}<select disabled={controlsDisabled} value={finding.classification} onChange={e => updateFinding(finding.id, { classification: e.target.value as Finding['classification'] })}>{findingClassifications.map(value => <option value={value} key={value}>{findingLabel(value)}</option>)}</select></label><FindingItems label={t('發現相關Item', 'Finding-related items')} options={findingItemOptions} selected={finding.itemIds} findingId={finding.id} onChange={changeFindingItems} />{(['observation', 'recommendation'] as const).flatMap(key => (['en', 'zh'] as const).map(lang => <label className="field" key={`${key}-${lang}`}>{key === 'observation' ? t('完整觀察', 'Full observation') : t('完整建議', 'Full recommendation')} · {lang === 'en' ? t('英文', 'English') : t('繁中', 'Traditional Chinese')}<textarea disabled={controlsDisabled} rows={4} value={finding[key][lang]} onChange={e => updateFinding(finding.id, { [key]: { ...finding[key], [lang]: e.target.value } })} /></label>))}</div> : <><BilingualText value={finding.observation} /><BilingualText value={finding.recommendation} /></>}<p>{finding.itemIds.map(id => record.snapshot.items.find(item => item.id === id)?.code || id).join(' / ')}</p>{showSources(finding)}{state.viewScope!=='management_viewer'&&(existing ? <button className="btn neutral" onClick={() => ctx.navigate('improvements', existing.id)}>{t('查看既有改善', 'View existing action')}</button> : canCreateAction && isActionableFinding(finding.classification) && <button className="btn primary" disabled={!!actionEditor.draft || actionEditor.busy || editor.isDirty || !finding.itemIds.length || !record.findings.some(row => row.id === finding.id)} onClick={() => void createAction(record, finding)}>{t('建立改善（先確認再保存）', 'Create action (confirm before saving)')}</button>)}</article>; })}
      </>}
      <div className="page-actions"><button className="btn neutral" disabled={editor.busy || !!actionEditor.draft} onClick={closeEditor}>{readonly ? t('關閉', 'Close') : t('取消／放棄草稿', 'Cancel / discard draft')}</button>{!readonly && <><button className="btn primary" disabled={!editor.canSave} onClick={() => void save(false)}>{t('保存檢查', 'Save inspection')}</button>{record.status!=='final'&&<button className="btn success" disabled={!editor.canSave||editor.pendingUnknown} onClick={() => void save(true)}>{t('發布檢查', 'Publish inspection')}</button>}</>}{readonly && canExport && <button className="btn neutral" disabled={exporting} onClick={() => void exportPdf(record)}>{t('匯出PDF', 'Export PDF')}</button>}</div>
    </Modal>}
    {actionEditor.draft && <Modal title={t('確認由檢查發現建立改善', 'Confirm action from inspection finding')} onClose={() => { if (!actionEditor.busy && (!actionEditor.isDirty || window.confirm(t('放棄改善草稿？', 'Discard this action draft?')))) void actionEditor.cancel(); }}>
      <EditorNotice error={actionEditor.error || actionError} lost={actionEditor.lost} /><BilingualText value={actionEditor.draft.content} compact /><p>{t('此動作不會改變檢查Y/N，也不會修改已發布快照。', 'This does not change inspection Y/N or a published snapshot.')}</p>
      <MultiSelect label={t('部門', 'Departments')} options={departmentOptions(ctx)} selected={actionEditor.draft.departmentIds} onChange={departmentIds => actionEditor.setDraft(old => old ? { ...old, departmentIds } : old)} /><MultiSelect label={t('執行人', 'Assignees')} options={departmentAssigneeOptions(state.people,actionEditor.draft.departmentIds,actionEditor.draft.assigneeIds,ctx.lang)} selected={actionEditor.draft.assigneeIds} onChange={assigneeIds => actionEditor.setDraft(old => old ? { ...old, assigneeIds } : old)} /><label className="field">{t('提出日期', 'Proposed date')}<input type="date" value={actionEditor.draft.proposedDate ?? ''} onChange={e => actionEditor.setDraft(old => old ? { ...old, proposedDate: e.target.value } : old)} /></label><label className="field">{t('目標日期', 'Target date')}<input type="date" value={actionEditor.draft.targetDate} onChange={e => actionEditor.setDraft(old => old ? { ...old, targetDate: e.target.value } : old)} /></label><label className="field">{t('急迫程度', 'Urgency')}<select value={actionEditor.draft.urgency} onChange={e => actionEditor.setDraft(old => old ? { ...old, urgency: e.target.value as Improvement['urgency'] } : old)}>{(['urgent', 'high', 'medium', 'low'] as const).map(value => <option key={value} value={value}>{({ urgent: t('緊急', 'Urgent'), high: t('高', 'High'), medium: t('中', 'Medium'), low: t('低', 'Low') })[value]}</option>)}</select></label><label className="field">{t('計劃', 'Plan')}<ImprovementTextarea key={actionEditor.draft.id} rows={4} value={actionEditor.draft.plan} onChange={plan => actionEditor.setDraft(old => old ? { ...old, plan } : old)} /></label><div className="page-actions"><button className="btn primary" disabled={!actionEditor.canSave} onClick={() => void saveAction()}>{t('確認建立及保存', 'Confirm create and save')}</button><button className="btn neutral" disabled={actionEditor.busy} onClick={() => { if (!actionEditor.isDirty || window.confirm(t('放棄改善草稿？', 'Discard this action draft?'))) void actionEditor.cancel(); }}>{t('取消', 'Cancel')}</button></div>
    </Modal>}
  </>;
}
