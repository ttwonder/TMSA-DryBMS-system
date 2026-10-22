import {RichTextEditor,RichText} from './RichTextEditor';
import {richTextToPlainText,isRichTextEmpty} from './richText';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BiText, Improvement, PageProps, BrowseState, Inspection, ProgressEvent, SaveIntent } from './types';
import { bi, departmentsLabel, hasPermission, isoNow, newBase, openIssuesFor, peopleLabel } from './domain';
import { filterImprovementList, improvementListView, improvementPage, withImprovementListView } from './improvementList';
import type { ImprovementListFilters, ImprovementListView } from './improvementList';
import { BilingualText, EditorNotice, Empty, Modal, MultiSelect, MultiSelectDropdown, PageHeading, departmentOptions } from './ui';
import { departmentAssigneeOptions } from './departmentAssignees';
import { DepartmentHeadsButton } from './DepartmentHeadsButton';
import { useRecordEditor } from './useRecordEditor';
import { withHydratedInspection } from './syncState';
import { COMPANY_IMPROVEMENT_SOURCES, isCompanyImprovement, improvementSourceLabel, localToday, validProposedDate, latestImprovementEvent } from './improvementTracking';
import {findingClassificationLabel, improvementFindingClassification, isActionableFinding} from './findingClassification';

// The persisted title remains a string; a newline separates EN and ZH.
export function improvementTitle(title: string): BiText {
  const split = title.indexOf('\n');
  if (split >= 0) return { en: title.slice(0, split), zh: title.slice(split + 1) };
  return /[\u3400-\u9fff]/.test(title) ? { en: '', zh: title } : { en: title, zh: '' };
}
export function effectiveSelection(selected: string[], visible: Improvement[]): string[] {
  const valid = new Set(visible.map(row => row.id));
  return [...new Set(selected)].filter(id => valid.has(id));
}
export function appendImprovementEvent(record: Improvement, event: ProgressEvent): Improvement {
  if (!Number.isInteger(event.percent) || event.percent < 0 || event.percent > 100) throw new Error('INVALID_PERCENT');
  if (record.events.some(old => old.id === event.id)) throw new Error('DUPLICATE_EVENT');
  if (isRichTextEmpty(event.content) && event.percent === record.percent && event.status === record.status) return record;
  return { ...record, status: event.status, percent: event.percent, events: [...record.events, event], closedAt: event.status === 'closed' ? event.at : null, closedBy: event.status === 'closed' ? event.by : null };
}
// Existing links already passed the server validator. The live compact source
// owns classification; only unchanged/subset Item links can use that projection.
// New/relinked actions and unlocated general themes still need the full finding.
function savedExternalClassification(record: Improvement, state: BrowseState) {
  const original = state.improvements.find(row => row.id === record.id);
  if (record.source !== 'external' || record.version < 1 || !original || original.version !== record.version || original.source !== 'external' || original.inspectionId !== record.inspectionId || original.findingId !== record.findingId || original.sourceKey !== record.sourceKey || record.itemIds.some(id => !original.itemIds.includes(id))) return null;
  const classification = improvementFindingClassification(state, record);
  return classification === 'general' ? null : classification;
}
export function improvementValidation(record: Improvement, ctx: Pick<PageProps, 'state' | 't'>): string {
  const { state, t } = ctx;
  if (isRichTextEmpty(record.title) || isRichTextEmpty(record.content.en) && isRichTextEmpty(record.content.zh)) return t('請填寫標題及改善內容。', 'A title and improvement content are required.');
  if (record.proposedDate !== undefined && !validProposedDate(record.proposedDate)) return t('提出日期須為有效日期。', 'Proposed date must be a valid date.');
  const inspection = record.source === 'external' ? state.inspections.find(row => row.id === record.inspectionId) : undefined;
  const finding = inspection && 'findings' in inspection ? inspection.findings.find(row => row.id === record.findingId) : undefined;
  const original = state.improvements.find(row => row.id === record.id);
  const compactClassification = savedExternalClassification(record, state);
  if (record.source === 'external' && !finding && !compactClassification) return t('來源發現資料尚未載入；草稿保留，請待來源讀取完成後再保存。', 'Source finding details are not loaded; retain the draft and wait for the source read before saving.');
  // Already-imported general themes deliberately have no guessed Item locator.
  // Permit their existing event stream, not creation of arbitrary unlocated cases.
  const importedGeneral = record.version > 0 && original?.source === 'external' && original.inspectionId === record.inspectionId && original.findingId === record.findingId && !original.itemIds.length && inspection?.imported === true && finding?.classification === 'general' && !finding.itemIds.length;
  if (!record.itemIds.length && !importedGeneral && !isCompanyImprovement(record.source)) return t('請選擇至少一個相關條目。', 'Select at least one related item.');
  if (record.source === 'external') {
    if (!isActionableFinding((finding?.classification ?? compactClassification)!) && !importedGeneral) return t('請選擇有效外部檢查及需追蹤的發現，正面觀察或指引不能作為缺失。', 'Select a valid external inspection and actionable finding, not a positive observation or guidance.');
    if (!record.sourceKey || record.sourceKey !== `${inspection!.id}:${record.findingId}`) return t('外部來源識別不完整。', 'The external source identity is incomplete.');
    if (state.improvements.some(row => row.id !== record.id && (row.sourceKey === record.sourceKey || row.inspectionId === record.inspectionId && row.findingId === record.findingId))) return t('此發現已有改善記錄，請使用既有記錄。', 'This finding already has an improvement; use the existing record.');
    if (finding && record.itemIds.some(id => !finding.itemIds.includes(id))) return t('外部改善只能關聯此來源發現涉及的Item。', 'External actions can reference only items covered by this finding.');
  }
  return '';
}

export function resolveImprovementFocus(state: Pick<BrowseState,'items'|'improvements'>, focusId?: string): { kind: 'case' | 'item'; id: string } | null {
  if (!focusId) return null;
  if (state.improvements.some(row => row.id === focusId)) return { kind: 'case', id: focusId };
  if (state.items.some(row => row.id === focusId)) return { kind: 'item', id: focusId };
  return null;
}
// Keep unchanged option controls out of text-input commits, without changing other pages' pickers.
const ImprovementMultiSelect = memo(MultiSelect);
// Local view projection only. Untouched fields retain original bytes in the editor.
// Once typing starts, do not compact onChange: Enter, caret and IME remain native.
export function ImprovementTextarea({ value, onChange, rows, disabled, lang='zh' }: { value: string; onChange: (value: string) => void; rows: number; disabled?: boolean; lang?: 'zh'|'en' }) {
  return <RichTextEditor compact rows={rows} disabled={disabled} lang={lang} value={value} onChange={onChange}/>;
}
export type InlineImprovementTarget = { itemId: string; action: 'create' | 'progress' | 'full' | 'close' | 'view'; improvementId?: string };
export default function Improvements(ctx: PageProps & { focusId?: string; inlineTarget?: InlineImprovementTarget; onInlineClose?: () => void }) {
  const { t } = ctx;
  const [sourceInspection,setSourceInspection]=useState<Inspection|null>(null);
  const [sourceError,setSourceError]=useState('');
  const sourceGeneration=useRef(0),sourceOwner=useRef({api:ctx.api,session:ctx.api.sessionToken,actor:ctx.user.id});
  if(sourceOwner.current.api!==ctx.api||sourceOwner.current.session!==ctx.api.sessionToken||sourceOwner.current.actor!==ctx.user.id){sourceGeneration.current++;sourceOwner.current={api:ctx.api,session:ctx.api.sessionToken,actor:ctx.user.id};}
  const state=sourceInspection?withHydratedInspection(ctx.state,sourceInspection):ctx.state;
  const editor = useRecordEditor<Improvement>(ctx, 'improvement');
  const [filters, setFilterState] = useState<ImprovementListFilters>({ frameworkId: 'all' });
  const [page, setPage] = useState(1);
  const pageTop = useRef<HTMLDivElement>(null);
  const setFilters = (next: ImprovementListFilters | ((old: ImprovementListFilters) => ImprovementListFilters)) => { setFilterState(next); setPage(1); };
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<'full' | 'progress' | 'close' | 'reopen'>('full');
  const [stagedId, setStagedId] = useState('');
  const previousIncompletePercent = useRef(0);
  const [validation, setValidation] = useState('');
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState('');
  const handledFocus = useRef('');
  const visible = useMemo(() => filterImprovementList(state, filters), [state, filters]);
  const paged = improvementPage(visible, page);
  const listView = improvementListView(filters);
  const inspectionSources = useMemo(() => [...state.inspections].sort((a,b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)), [state.inspections]);
  useEffect(() => { if (page !== paged.page) setPage(paged.page); }, [page, paged.page]);
  const goToPage = (next: number) => { setPage(next); pageTop.current?.scrollIntoView({block:'start'}); };
  const ids = effectiveSelection(selected, visible);
  const can = (cap: Parameters<typeof hasPermission>[2]) => hasPermission(state.settings.rolePermissions, ctx.user, cap);
  const draft = editor.draft;
  const controlsLocked = !editor.canSave || editor.lost || editor.pendingUnknown;
  useEffect(()=>{
    const id=draft?.source==='external'?draft.inspectionId:undefined,summary=ctx.state.inspections.find(i=>i.id===id),g=++sourceGeneration.current,owner=sourceOwner.current;
    setSourceError('');
    if(!summary || mode !== 'full' && draft && savedExternalClassification(draft,ctx.state)){setSourceInspection(null);return;}
    const pending=ctx.api.hydrateInspection?ctx.api.hydrateInspection(summary):ctx.api.read().then(s=>s.inspections.find(i=>i.id===id));
    void pending.then(full=>{if(g===sourceGeneration.current&&owner===sourceOwner.current&&ctx.api.sessionToken===owner.session&&full?.version===summary.version){setSourceInspection(full);setSourceError('');}}).catch(error=>{if(g===sourceGeneration.current&&owner===sourceOwner.current&&ctx.api.sessionToken===owner.session){const code=error instanceof Error?/^[A-Z][A-Z_0-9]{0,47}(?=:)/.exec(error.message)?.[0]:undefined;setSourceError(t('來源檢查讀取未完成；草稿保留。這是讀取提示，不是保存結果。','Source inspection read incomplete; the draft is retained. This is a read notice, not a save outcome.')+(code?` (${code})`:''));}});
    return()=>{sourceGeneration.current++;};
  },[draft?.id,draft?.inspectionId,draft?.source,mode,ctx.api,ctx.user.id,ctx.api.sessionToken,ctx.state.inspections]);
  const detail = state.improvements.find(row => row.id === detailId);
  const statusLabel = (value: Improvement['status']) => value === 'closed' ? t('已結案', 'Closed') : value === 'in_progress' ? t('進行中', 'In progress') : t('待處理', 'Open');
  const urgencyLabel = (value: Improvement['urgency']) => ({ urgent: t('盡快', 'As soon as possible'), high: t('高', 'High'), medium: t('中', 'Medium'), low: t('低', 'Low') }[value]);
  const setFilter = (key: keyof ImprovementListFilters, value: string) => setFilters(old => ({ ...old, [key]: value, ...(key === 'status' && value === 'closed' ? { unfinished: false } : {}) }));
  const draftWriter = useRef(editor.setDraft);
  draftWriter.current = editor.setDraft;
  const patch = useCallback((value: Partial<Improvement>) => draftWriter.current(old => old ? { ...old, ...value } : old), []);
  const itemOptions = useMemo(() => state.items.filter(item => item.active || draft?.itemIds.includes(item.id)).map(item => ({ id: item.id, label: `${item.frameworkId} ${item.code} · ${bi(item.kpi, ctx.lang)}${item.active ? '' : t('（停用）', ' (inactive)')}` })), [state.items, draft?.itemIds, ctx.lang, t]);
  const formDepartments = useMemo(() => departmentOptions(ctx), [ctx.state.settings.departments, ctx.lang]);
  const formPeople = useMemo(() => departmentAssigneeOptions(ctx.state.people, draft?.departmentIds ?? [], draft?.assigneeIds ?? [], ctx.lang), [ctx.state.people, draft?.departmentIds, draft?.assigneeIds, ctx.lang]);
  const changeItems = useCallback((itemIds: string[]) => patch({ itemIds }), [patch]);
  const changeDepartments = useCallback((departmentIds: string[]) => patch({ departmentIds }), [patch]);
  const changeAssignees = useCallback((assigneeIds: string[]) => patch({ assigneeIds }), [patch]);
  const changeTitle = (lang: 'en' | 'zh', value: string) => { if (draft) { const parts = improvementTitle(draft.title); parts[lang] = value; patch({ title: `${parts.en}\n${parts.zh}` }); } };
  const discard = () => { if (editor.busy) return; if (!editor.isDirty || window.confirm(t('放棄此草稿？取消不會保存。', 'Discard this draft? Cancel does not save.'))) void editor.cancel().then(() => ctx.onInlineClose?.()); };

  useEffect(() => {
    if (ctx.inlineTarget) return;
    const query = new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.search);
    const focus = resolveImprovementFocus(state, ctx.focusId || query.get('improvementId') || query.get('focus') || undefined);
    if (!focus) { handledFocus.current = ''; return; }
    const key = `${focus.kind}:${focus.id}`;
    if (handledFocus.current === key) return;
    handledFocus.current = key;
    if (focus.kind === 'case') setDetailId(focus.id);
    else if (focus?.kind === 'item') { setDetailId(''); setFilters({ frameworkId: 'all', itemId: focus.id }); }
  }, [ctx.focusId, ctx.inlineTarget, state.improvements, state.items]);

  const start = async (record: Improvement, nextMode: typeof mode = 'full') => {
    setValidation(''); setMode(nextMode); setStagedId('');
    if (!await editor.open(record, nextMode === 'close' ? 'close' : nextMode === 'reopen' ? 'reopen' : 'update')) return;
    if (nextMode !== 'full') {
      const eventId = crypto.randomUUID(); setStagedId(eventId);
      editor.setDraft(current => {
        if (!current) return current;
        previousIncompletePercent.current = current.percent < 100 ? current.percent : 0;
        const status = nextMode === 'close' ? 'closed' : nextMode === 'reopen' ? 'open' : current.status;
        const event: ProgressEvent = { id: eventId, at: isoNow(), by: ctx.user.id, content: '', status, percent: nextMode === 'close' ? 100 : nextMode === 'reopen' ? 0 : current.percent };
        return { ...current, status, percent: event.percent, events: [...current.events, event], closedAt: status === 'closed' ? event.at : null, closedBy: status === 'closed' ? ctx.user.id : null };
      });
    }
  };
  const create = () => {
    const itemId = ctx.inlineTarget?.itemId ?? filters.itemId;
    const record: Improvement = { ...newBase(), title: '', content: { en: '', zh: '' }, itemIds: itemId ? [itemId] : [], departmentIds: itemId ? state.items.find(row => row.id === itemId)?.departmentIds || [] : [], assigneeIds: [], source: 'non_external', proposedDate: localToday(), urgency: 'medium', status: 'open', percent: 0, targetDate: '', plan: '', events: [], closedAt: null, closedBy: null, sources: [] };
    void start(record);
  };
  useEffect(() => {
    if (!ctx.inlineTarget) return;
    let live = true;
    // Defer the initial claim so StrictMode's cancelled setup cannot claim twice.
    queueMicrotask(() => {
      if (!live) return;
      const target = ctx.inlineTarget!;
      if (!state.items.some(item => item.id === target.itemId && item.active)) {
        setValidation(t('條目已不存在或停用。', 'The item is missing or inactive.')); return;
      }
      if (target.action === 'create') {
        if (!can('createImprovements')) { setValidation(t('沒有新增改善的權限。', 'Creating an action is not permitted.')); return; }
        create(); return;
      }
      const record = state.improvements.find(row => row.id === target.improvementId && row.itemIds.includes(target.itemId));
      if (!record) { setValidation(t('此條目的改善記錄已不可用。', 'The linked action is no longer available.')); return; }
      if (target.action === 'view') { setDetailId(record.id); return; }
      if (!can(target.action === 'close' ? 'closeImprovements' : 'updateImprovements') || (target.action === 'progress' || target.action === 'close') && record.status === 'closed') {
        setValidation(t('此改善目前不可更新。', 'This action cannot currently be updated.')); return;
      }
      void start(record, target.action);
    });
    return () => { live = false; };
  }, [ctx.inlineTarget]);

  const updateStaged = (changes: Partial<ProgressEvent>) => {
    if (controlsLocked) return;
    if (changes.percent !== undefined && Number.isInteger(changes.percent) && changes.percent >= 0 && changes.percent < 100) previousIncompletePercent.current = changes.percent;
    editor.setDraft(current => {
      if (!current) return current;
      const events = current.events.map(event => event.id === stagedId ? { ...event, ...changes } : event);
      const event = events.find(row => row.id === stagedId);
      return { ...current, events, ...(event ? { status: event.status, percent: event.percent, closedAt: event.status === 'closed' ? event.at : null, closedBy: event.status === 'closed' ? event.by : null } : {}) };
    });
  };
  const switchProgressMode = (nextMode: 'full' | 'close') => {
    if (mode !== 'progress' || controlsLocked || !can(nextMode === 'close' ? 'closeImprovements' : 'updateImprovements')) return;
    // Keep the current lease, draft and staged event; start/open would discard them.
    if (nextMode === 'close') updateStaged({ status: 'closed', percent: 100 });
    setValidation('');
    setMode(nextMode);
  };
  const submit = async () => {
    if (!draft) return;
    const issue = improvementValidation(draft, {...ctx,state});
    const event = draft.events.find(row => row.id === stagedId);
    if (issue) { setValidation(issue); return; }
    let submitted=draft;
    if (event) {
      const original=editor.getBase();if(!original)return;
      try { submitted=appendImprovementEvent({ ...draft,status:original.status,percent:original.percent,closedAt:original.closedAt,closedBy:original.closedBy,events:draft.events.filter(row=>row.id!==stagedId) },event); }
      catch { setValidation(t('完成百分比須為0–100的整數。', 'Completion must be an integer between 0 and 100.')); return; }
      if(JSON.stringify(submitted)===JSON.stringify(original)){setValidation(t('沒有變更；未建立進度事件。','No changes; no progress event was created.'));return;}
    }
    const intent: SaveIntent = draft.version === 0 ? 'create' : mode === 'close' ? 'close' : mode === 'reopen' ? 'reopen' : 'update';
    if (await editor.save(intent,{record:submitted})) ctx.onInlineClose?.();
  };
  const exportPdf = async () => {
    const ids = effectiveSelection(selected, filterImprovementList(state, filters));
    if (!ids.length) { ctx.notify(t('請明確勾選仍符合篩選的改善記錄，空選不會匯出全部。', 'Explicitly select matching records. Empty selection never exports all.'), 'error'); return; }
    setExporting(true);
    try {
      const canonical = await ctx.api.authorizeExport({ format: 'pdf', kind: 'improvements', ids, snapshotToken: state.snapshotToken, filters });
      const eligible = filterImprovementList(canonical, filters);
      if (effectiveSelection(ids, eligible).length !== ids.length) throw new Error('EXPORT_RECORD_NOT_AVAILABLE');
      const { downloadImprovementsPdf } = await import('./reports');
      await downloadImprovementsPdf(canonical, ids, ctx.lang, t('待改善項目', 'Improvement actions'));
      ctx.notify(t('PDF已產生並啟動下載。', 'PDF generated and download started.'), 'success');
    } catch (error) { ctx.notify(error instanceof Error ? error.message : String(error), 'error'); }
    finally { setExporting(false); }
  };
  const pagination = (position: 'top' | 'bottom') => <nav className="improvement-pagination" aria-label={position === 'top' ? t('改善清單分頁（上方）', 'Improvement pagination (top)') : t('改善清單分頁（下方）', 'Improvement pagination (bottom)')}>
    <span>{t('顯示', 'Showing')} {paged.start}–{paged.end} / {paged.total} · {t('每頁40筆', '40 per page')}</span>
    <button className="btn neutral small" disabled={paged.page <= 1} onClick={() => goToPage(paged.page - 1)}>{t('上一頁', 'Previous')}</button>
    <label>{t('跳至頁碼', 'Go to page')} <select aria-label={t('跳至頁碼', 'Go to page')} value={paged.page} onChange={event => goToPage(Number(event.target.value))}>{Array.from({length:paged.pages}, (_,index) => <option key={index+1} value={index+1}>{index+1}</option>)}</select> / {paged.pages}</label>
    <button className="btn neutral small" disabled={paged.page >= paged.pages} onClick={() => goToPage(paged.page + 1)}>{t('下一頁', 'Next')}</button>
  </nav>;
  const classification = (record: Improvement) => record.source === 'external' ? <small className="finding-classification">{t('分類', 'Classification')}: {findingClassificationLabel(improvementFindingClassification(state,record),ctx.lang)}</small> : null;
  const sourceDetails = (record: Improvement) => <div className="notice"><strong>{improvementSourceLabel(record.source, ctx.lang)}</strong><div>{classification(record)}</div>{record.inspectionId && <p><RichText value={state.inspections.find(row => row.id === record.inspectionId)?.title || record.inspectionId} inline/> · {record.findingId}</p>}{record.sources.map((source, index) => <p key={index}><RichText value={[source.source, source.file, source.sheet, source.cell, source.pages?.join(', '), source.rawItem, source.note].filter(Boolean).join(' · ')} inline/></p>)}</div>;
  const latestProgress = (record: Improvement) => {
    const event = latestImprovementEvent(record);
    return <div className="improvement-latest-progress"><small>{t('最新已保存進度', 'Latest saved progress')}</small>{event ? <><div><time>{event.at.slice(0,10)}</time> · {peopleLabel(state, [event.by])} · {statusLabel(event.status)}</div><p className="preserve-lines"><RichText value={event.content} compact inline/></p></> : <div>{t('尚無進度。', 'No progress events yet.')}</div>}</div>;
  };
  const eventList = (record: Improvement) => <div className="progress-history"><h3>{t('已保存進度（不可修改）', 'Saved progress (immutable)')}</h3>{record.events.filter(event => event.id !== stagedId).length ? record.events.filter(event => event.id !== stagedId).map(event => <article key={event.id} className="notice"><small>{event.at} · {state.people.find(person => person.id === event.by)?.name || event.by} · {statusLabel(event.status)} · {event.percent}%</small><p className="preserve-lines"><RichText value={event.content} compact inline/></p></article>) : <Empty>{t('尚無進度。', 'No progress events yet.')}</Empty>}</div>;

  return <>
    {!ctx.inlineTarget && <>
    <PageHeading title={filters.source === 'management_review' ? t('管審會執行計劃清單', 'Management review execution plan') : t('待改善項目', 'Improvement actions')} subtitle={t('提出日期為獨立日期；最近更新日期篩選為UTC，並非回溯快照。', 'Proposed date is independent. Last updated filters use UTC, not historical reconstruction.')} actions={<>{can('createImprovements') && <button className="btn primary" disabled={editor.busy || !!draft} onClick={create}>{t('新增改善', 'New action')}</button>}{can('exportReports') && <button className="btn neutral" disabled={!ids.length || exporting} onClick={() => void exportPdf()}>{exporting ? t('產生中…', 'Generating…') : `${t('匯出已選PDF', 'Export selected PDF')} (${ids.length})`}</button>}</>} />
    <nav className="improvement-list-views" aria-label={t('改善清單', 'Improvement lists')}>
      {(['all', 'unfinished', 'completed'] as ImprovementListView[]).map(view => <button key={view} className={`btn ${listView === view ? 'primary' : 'neutral'}`} aria-pressed={listView === view} onClick={() => setFilters(old => withImprovementListView(old, view))}>{view === 'all' ? t('總表', 'All actions') : view === 'unfinished' ? t('未完成', 'Unfinished') : t('已完成', 'Completed')}</button>)}
      <button className={`btn ${filters.source === 'management_review' ? 'primary' : 'neutral'}`} aria-pressed={filters.source === 'management_review'} onClick={() => setFilters(old => ({ ...old, source: old.source === 'management_review' ? '' : 'management_review' }))}>{t('管審會執行計劃清單', 'Management review execution plan')}</button>
    </nav>
    <div className="toolbar improvement-filters">
      <label className="field">{t('搜尋', 'Search')}<input value={filters.query || ''} onChange={event => setFilter('query', event.target.value)} placeholder={t('標題、內容、Item或進度', 'Title, content, item or progress')} /></label>
      <label className="field">{t('框架', 'Framework')}<select value={filters.frameworkId || 'all'} onChange={event => setFilters(old => ({ ...old, frameworkId: event.target.value as ImprovementListFilters['frameworkId'], chapterId: '' }))}><option value="all">{t('全部', 'All')}</option><option>TMSA</option><option>DRYBMS</option></select></label>
      <label className="field">{t('章節', 'Chapter')}<select value={filters.chapterId || ''} onChange={event => setFilter('chapterId', event.target.value)}><option value="">{t('全部', 'All')}</option>{state.chapters.filter(chapter => !filters.frameworkId || filters.frameworkId === 'all' || chapter.frameworkId === filters.frameworkId).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.frameworkId} {chapter.code} · {bi(chapter.name, ctx.lang)}</option>)}</select></label>
      <label className="field">{t('狀態', 'Status')}<select value={filters.status || ''} onChange={event => setFilter('status', event.target.value)}><option value="">{t('全部', 'All')}</option>{(['open', 'in_progress', 'closed'] as const).map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
      <label className="field improvement-source-filter">{t('來源', 'Source')}<select value={filters.source || ''} onChange={event => setFilter('source', event.target.value)}><option value="">{t('全部來源', 'All sources')}</option><option value="non_external">{t('自行提出', 'Self-proposed')}</option>{COMPANY_IMPROVEMENT_SOURCES.map(source => <option key={source} value={source}>{improvementSourceLabel(source, ctx.lang)}</option>)}{inspectionSources.map(inspection => <option key={inspection.id} value={`inspection:${inspection.id}`}>{inspection.date} · {inspection.frameworkId} · {richTextToPlainText(inspection.title)}</option>)}</select></label>
      <label className="field">{t('提出起日', 'Proposed from')}<input type="date" value={filters.proposedFrom || ''} onChange={event => setFilter('proposedFrom', event.target.value)} /></label>
      <label className="field">{t('提出迄日', 'Proposed to')}<input type="date" value={filters.proposedTo || ''} onChange={event => setFilter('proposedTo', event.target.value)} /></label>
      <details className="secondary-filters"><summary>{t('更多篩選（部門／人員／日期）', 'More filters (department / person / dates)')}{[filters.departmentId, filters.personId, filters.urgency, filters.from, filters.to].some(Boolean) && <span className="filter-active"> · {t('已套用', 'Active')}</span>}</summary><div className="secondary-filter-fields">
      <label className="field">{t('部門', 'Department')}<select value={filters.departmentId || ''} onChange={event => setFilter('departmentId', event.target.value)}><option value="">{t('全部', 'All')}</option>{state.settings.departments.map(dept => <option key={dept.id} value={dept.id}>{bi(dept.name, ctx.lang)}</option>)}</select></label>
      <label className="field">{t('執行人', 'Assignee')}<select value={filters.personId || ''} onChange={event => setFilter('personId', event.target.value)}><option value="">{t('全部', 'All')}</option>{state.people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label className="field">{t('急迫程度', 'Urgency')}<select value={filters.urgency || ''} onChange={event => setFilter('urgency', event.target.value)}><option value="">{t('全部', 'All')}</option>{(['urgent', 'high', 'medium', 'low'] as const).map(urgency => <option key={urgency} value={urgency}>{urgencyLabel(urgency)}</option>)}</select></label>
      <label className="field">{t('最近更新起日', 'Last updated from')}<input type="date" value={filters.from || ''} onChange={event => setFilter('from', event.target.value)} /></label>
      <label className="field">{t('最近更新迄日', 'Last updated to')}<input type="date" value={filters.to || ''} onChange={event => setFilter('to', event.target.value)} /></label>
      </div></details>
      <button className="btn neutral" onClick={() => { setFilters({ frameworkId: 'all' }); setSelected([]); }}>{t('清除篩選及選取', 'Clear filters and selection')}</button>
    </div>
    {filters.itemId && <div className="notice">{t('限定相關Item；新增改善將預填此Item', 'Filtered to related item; new actions prefill this item')}: {state.items.find(row => row.id === filters.itemId)?.code || filters.itemId} <button className="btn neutral" onClick={() => setFilters(old => ({ ...old, itemId: undefined }))}>{t('取消Item限定', 'Clear item scope')}</button></div>}
    <div className="list-selection-summary"><span>{t('符合篩選', 'Matching')}: {visible.length} · {t('已選', 'Selected')}: {ids.length}</span><button className="btn neutral small" onClick={() => setSelected([])}>{t('取消全部勾選', 'Clear selection')}</button><span className="list-hint">{t('清單顯示全文；點標題查看詳情', 'Full content shown; open the title for details')}</span></div>
    <EditorNotice error={draft ? '' : editor.error} lost={editor.lost} />
    <div ref={pageTop}>{pagination('top')}</div>
    {!visible.length ? <Empty>{t('沒有符合篩選的改善記錄。', 'No matching improvement records.')}</Empty> : <div className="table-wrap"><table className="data-table improvement-table"><thead><tr><th>{t('選取', 'Select')}</th><th>{t('內容／相關Item', 'Action / related items')}</th><th>{t('跟進資訊／操作', 'Follow-up / actions')}</th></tr></thead><tbody>{paged.rows.map(record => <tr key={record.id}><td><input type="checkbox" aria-label={`${t('選取', 'Select')} ${richTextToPlainText(record.title)}`} checked={ids.includes(record.id)} onChange={event => { const checked = event.target.checked; setSelected(old => checked ? [...old, record.id] : old.filter(id => id !== record.id)); }} /></td><td><button className="text-button" onClick={() => setDetailId(record.id)}><BilingualText value={improvementTitle(record.title)} /></button><div className="improvement-content"><BilingualText value={record.content} compact /></div><div className="improvement-origin">{improvementSourceLabel(record.source, ctx.lang)} · {t('提出日期', 'Proposed date')}: {record.proposedDate || t('未填', 'Not entered')}</div>{classification(record)}<div className="improvement-plan"><small>{t('執行計劃', 'Action plan')}</small><p className="preserve-lines"><RichText value={record.plan||'—'} compact inline/></p></div>{latestProgress(record)}<div className="item-references">{record.itemIds.map(id => <button key={id} className="btn neutral" onClick={() => { const item = state.items.find(row => row.id === id); if (item) ctx.navigate(item.frameworkId, id); }}>{openIssuesFor(state, id).length > 0 ? '⭐ ' : ''}{state.items.find(item => item.id === id)?.code || id}</button>)}</div></td><td className="improvement-metadata">
      <div className="improvement-meta-group"><small>{t('部門／執行人', 'Departments / assignees')}</small><div>{departmentsLabel(state, record.departmentIds, ctx.lang)}{record.assigneeIds.length > 0 && <><br />{peopleLabel(state, record.assigneeIds)}</>}</div></div>
      <div className="improvement-meta-group"><small>{t('狀態／急迫程度', 'Status / urgency')}</small><div className="improvement-status-line"><span className={`status-pill ${record.status}`}>{statusLabel(record.status)}</span><span className={`urgency ${record.urgency}`}>{urgencyLabel(record.urgency)}</span><span>{record.percent}%</span></div></div>
      <div className="improvement-meta-group"><small>{t('目標／記錄更新', 'Target / record updated')}</small><div>{record.targetDate || '—'}<br /><small>{record.updatedAt}</small></div></div>
      <div className="improvement-meta-group"><small>{t('操作', 'Actions')}</small><div className="page-actions">{can('updateImprovements') && record.status !== 'closed' && <button className="btn primary" disabled={!!draft || editor.busy} onClick={() => void start(record, 'progress')}>{t('直接更新', 'Update progress')}</button>}{can('updateImprovements') && <button className="btn neutral" disabled={!!draft || editor.busy} onClick={() => void start(record)}>{t('完整編輯', 'Full edit')}</button>}{can('closeImprovements') && <button className={`btn ${record.status === 'closed' ? 'warning' : 'success'}`} disabled={!!draft || editor.busy} onClick={() => void start(record, record.status === 'closed' ? 'reopen' : 'close')}>{record.status === 'closed' ? t('重開', 'Reopen') : t('結案', 'Close')}</button>}</div></div>
    </td></tr>)}</tbody></table></div>}
    {visible.length > 0 && pagination('bottom')}
    </>}
    {ctx.inlineTarget && !draft && !detail && <Modal title={t('改善事項', 'Improvement action')} wide onClose={discard}><EditorNotice error={editor.error || validation} lost={editor.lost} />{!editor.error && !validation && <p>{t('正在準備編輯視窗…', 'Preparing the editor…')}</p>}</Modal>}
    {detail && !draft && <Modal title={t('改善詳情', 'Action detail')} wide onClose={() => { setDetailId(''); ctx.onInlineClose?.(); }}><BilingualText value={improvementTitle(detail.title)} /><BilingualText value={detail.content} compact /><p className="preserve-lines">{t('計劃', 'Plan')}: <RichText value={detail.plan} compact inline/></p>{sourceDetails(detail)}{eventList(detail)}{ctx.inlineTarget && can('updateImprovements') && <button className="btn neutral" disabled={editor.busy} onClick={() => void start(detail)}>{t('完整編輯', 'Full edit')}</button>}</Modal>}
    {draft && <Modal title={mode === 'close' ? t('確認結案', 'Confirm close') : mode === 'reopen' ? t('確認重開', 'Confirm reopen') : mode === 'progress' ? t('更新進度', 'Update progress') : draft.version === 0 ? t('新增改善', 'New improvement') : t('編輯改善', 'Edit improvement')} wide onClose={discard}>
      <EditorNotice error={editor.error || validation || sourceError} lost={editor.lost} />
      {mode === 'progress' && <div className="page-actions improvement-update-actions">{can('updateImprovements') && <button className="btn neutral" disabled={controlsLocked} onClick={() => switchProgressMode('full')}>{t('完整編輯', 'Full edit')}</button>}{can('closeImprovements') && <button className="btn success" disabled={controlsLocked} onClick={() => switchProgressMode('close')}>{t('結案', 'Close')}</button>}</div>}
      {mode === 'close' && <p className="notice">{t('結案會同時標記已經完成作業（100%）；按「確認保存」並獲伺服器確認後，才會同步更新清單。', 'Closing also marks work completed (100%). The lists update only after Confirm save is acknowledged by the server.')}</p>}
      {mode === 'full' ? <div className="form-grid">
        <label className="field">{t('標題（英文）', 'Title (English)')}<RichTextEditor disabled={controlsLocked} singleLine lang={ctx.lang} value={improvementTitle(draft.title).en} onChange={value => changeTitle('en', value)} /></label><label className="field">{t('標題（繁中）', 'Title (Traditional Chinese)')}<RichTextEditor disabled={controlsLocked} singleLine lang={ctx.lang} value={improvementTitle(draft.title).zh} onChange={value => changeTitle('zh', value)} /></label>
        <label className="field">{t('內容（英文）', 'Content (English)')}<ImprovementTextarea disabled={controlsLocked} lang={ctx.lang} key={`${draft.id}:en`} rows={5} value={draft.content.en} onChange={en => patch({ content: { ...draft.content, en } })} /></label><label className="field">{t('內容（繁中）', 'Content (Traditional Chinese)')}<ImprovementTextarea disabled={controlsLocked} lang={ctx.lang} key={`${draft.id}:zh`} rows={5} value={draft.content.zh} onChange={zh => patch({ content: { ...draft.content, zh } })} /></label>
        <ImprovementMultiSelect label={t('相關Item（可跨框架）', 'Related items (cross-framework)')} options={itemOptions} selected={draft.itemIds} onChange={changeItems} />
        <ImprovementMultiSelect label={t('負責部門', 'Responsible departments')} options={formDepartments} selected={draft.departmentIds} onChange={changeDepartments} /><ImprovementMultiSelect label={t('執行人', 'Assignees')} options={formPeople} selected={draft.assigneeIds} onChange={changeAssignees} /><DepartmentHeadsButton people={state.people} departmentIds={draft.departmentIds} selectedIds={draft.assigneeIds} onChange={changeAssignees} disabled={!editor.canSave || editor.lost || editor.pendingUnknown} lang={ctx.lang} />
        <label className="field">{t('急迫程度', 'Urgency')}<select value={draft.urgency} onChange={event => patch({ urgency: event.target.value as Improvement['urgency'] })}>{(['urgent', 'high', 'medium', 'low'] as const).map(value => <option key={value} value={value}>{urgencyLabel(value)}</option>)}</select></label>
        <label className="field">{t('目標日期', 'Target date')}<input type="date" value={draft.targetDate} onChange={event => patch({ targetDate: event.target.value })} /></label><label className="field">{t('改善計劃', 'Action plan')}<ImprovementTextarea disabled={controlsLocked} lang={ctx.lang} key={`${draft.id}:plan`} rows={4} value={draft.plan} onChange={plan => patch({ plan })} /></label>
        <label className="field">{t('來源', 'Source')}<select value={draft.source} disabled={draft.version > 0} onChange={event => patch({ source: event.target.value as Improvement['source'], inspectionId: undefined, findingId: undefined, sourceKey: undefined, sources: [] })}><option value="non_external">{t('非外部', 'Non-external')}</option><option value="external">{t('外部檢查', 'External inspection')}</option>{COMPANY_IMPROVEMENT_SOURCES.map(source => <option key={source} value={source}>{improvementSourceLabel(source, ctx.lang)}</option>)}</select></label>
        <label className="field">{t('提出日期', 'Proposed date')}<input type="date" value={draft.proposedDate ?? ''} onChange={event => patch({ proposedDate: event.target.value })} /></label>
        {draft.source === 'external' && <><label className="field">{t('來源檢查', 'Source inspection')}<select disabled={draft.version > 0} value={draft.inspectionId || ''} onChange={event => patch({ inspectionId: event.target.value, findingId: undefined, sourceKey: undefined, sources: [] })}><option value="">{t('請選擇', 'Select')}</option>{state.inspections.map(row => <option key={row.id} value={row.id}>{row.date} · {richTextToPlainText(row.title)}</option>)}</select></label><label className="field">{t('來源發現', 'Source finding')}<select disabled={draft.version > 0} value={draft.findingId || ''} onChange={event => { const finding = (sourceInspection&&sourceInspection.id===draft.inspectionId&&state.inspections.some(i=>i.id===sourceInspection.id&&i.version===sourceInspection.version)?sourceInspection.findings:[]).find(row => row.id === event.target.value); patch({ findingId: finding?.id, sourceKey: finding ? `${draft.inspectionId}:${finding.id}` : undefined, sources: finding ? structuredClone(finding.sources) : [] }); }}><option value="">{t('請選擇', 'Select')}</option>{(sourceInspection&&sourceInspection.id===draft.inspectionId&&state.inspections.some(i=>i.id===sourceInspection.id&&i.version===sourceInspection.version)?sourceInspection.findings:[]).filter(row => isActionableFinding(row.classification)).map(row => <option key={row.id} value={row.id}>{bi(row.observation, ctx.lang)}</option>)}</select></label></>}
      </div> : <BilingualText value={improvementTitle(draft.title)} />}
      {mode === 'progress' ? <section className="progress-action-content" aria-label={t('完整改善內容', 'Full action content')}><BilingualText value={draft.content} compact/></section> : sourceDetails(draft)}
      {stagedId && (() => { const event = draft.events.find(row => row.id === stagedId); if (!event) return null; const progressFields = <>{mode !== 'reopen' && <label className="checkbox-field improvement-work-complete"><input type="checkbox" checked={event.percent === 100} disabled={mode === 'close' || controlsLocked} onChange={e => updateStaged({ percent: e.target.checked ? 100 : previousIncompletePercent.current })} />{t('已經完成作業', 'Work completed')}</label>}<label className="field"><span>{t('完成百分比', 'Completion percentage')}</span><input aria-label={t('完成百分比', 'Completion percentage')} type="number" min={0} max={100} disabled={mode === 'close' || editor.busy} value={event.percent} onChange={e => updateStaged({ percent: Number(e.target.value) })} /></label>{mode === 'progress' && <label className="field"><span>{t('執行狀態', 'Execution status')}</span><select aria-label={t('執行狀態', 'Execution status')} disabled={editor.busy} value={event.status} onChange={e => updateStaged({ status: e.target.value as ProgressEvent['status'] })}><option value="open">{t('待處理', 'Open')}</option><option value="in_progress">{t('進行中', 'In progress')}</option></select></label>}</>; return <div className={mode === 'progress' ? 'progress-editor-grid' : 'form-grid'}><label className="field progress-text">{t('本次新增進度（保存前可修改）', 'New progress (editable until saved)')}<ImprovementTextarea lang={ctx.lang} key={event.id} disabled={controlsLocked} rows={mode === 'progress' ? 8 : 5} value={event.content} onChange={content => updateStaged({ content })} /></label>{mode === 'progress' ? <div className="progress-controls">{progressFields}<label className="field progress-urgency"><span>{t('急迫程度', 'Urgency')}</span><select aria-label={t('急迫程度', 'Urgency')} disabled={editor.busy} value={draft.urgency} onChange={e => patch({urgency:e.target.value as Improvement['urgency']})}>{(['urgent','high','medium','low'] as const).map(value=><option key={value} value={value}>{urgencyLabel(value)}</option>)}</select></label><MultiSelectDropdown label={t('涉及部門','Departments')} options={departmentOptions(ctx)} selected={draft.departmentIds} onChange={departmentIds=>patch({departmentIds})} disabled={!editor.canSave}/><MultiSelectDropdown label={t('執行跟進人','Assignees')} options={formPeople} selected={draft.assigneeIds} onChange={assigneeIds=>patch({assigneeIds})} disabled={!editor.canSave}/><DepartmentHeadsButton people={state.people} departmentIds={draft.departmentIds} selectedIds={draft.assigneeIds} onChange={changeAssignees} disabled={!editor.canSave || editor.lost || editor.pendingUnknown} lang={ctx.lang} /></div> : progressFields}</div>; })()}
      {eventList(draft)}
      <div className="page-actions"><button className="btn neutral" disabled={editor.busy} onClick={discard}>{t('取消／放棄草稿', 'Cancel / discard draft')}</button><button className={`btn ${mode === 'close' ? 'success' : 'primary'}`} disabled={!editor.canSave} onClick={() => void submit()}>{editor.busy ? t('保存中…', 'Saving…') : t('確認保存', 'Confirm save')}</button></div>
    </Modal>}
  </>;
}
