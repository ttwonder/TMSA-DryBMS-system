import { useEffect, useMemo, useRef, useState } from 'react';
import type { BiText, Improvement, PageProps, PlatformState, ProgressEvent, SaveIntent } from './types';
import { bi, departmentsLabel, filteredImprovements, hasPermission, isoNow, newBase, openIssuesFor, peopleLabel } from './domain';
import type { Filters } from './domain';
import { BilingualText, EditorNotice, Empty, Modal, MultiSelect, PageHeading, departmentOptions, peopleOptions } from './ui';
import { useRecordEditor } from './useRecordEditor';

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
  if (!event.content.trim()) throw new Error('PROGRESS_CONTENT_REQUIRED');
  if (!Number.isInteger(event.percent) || event.percent < 0 || event.percent > 100) throw new Error('INVALID_PERCENT');
  if (record.events.some(old => old.id === event.id)) throw new Error('DUPLICATE_EVENT');
  return { ...record, status: event.status, percent: event.percent, events: [...record.events, event], closedAt: event.status === 'closed' ? event.at : null, closedBy: event.status === 'closed' ? event.by : null };
}
export function improvementValidation(record: Improvement, ctx: Pick<PageProps, 'state' | 't'>): string {
  const { state, t } = ctx;
  if (!record.title.trim() || !record.content.en.trim() && !record.content.zh.trim()) return t('請填寫標題及改善內容。', 'A title and improvement content are required.');
  const inspection = record.source === 'external' ? state.inspections.find(row => row.id === record.inspectionId) : undefined;
  const finding = inspection?.findings.find(row => row.id === record.findingId);
  const original = state.improvements.find(row => row.id === record.id);
  // Already-imported general themes deliberately have no guessed Item locator.
  // Permit their existing event stream, not creation of arbitrary unlocated cases.
  const importedGeneral = record.version > 0 && original?.source === 'external' && original.inspectionId === record.inspectionId && original.findingId === record.findingId && !original.itemIds.length && inspection?.imported === true && finding?.classification === 'general' && !finding.itemIds.length;
  if (!record.itemIds.length && !importedGeneral) return t('請選擇至少一個相關條目。', 'Select at least one related item.');
  if (record.source === 'external') {
    if (!finding || finding.classification !== 'finding' && !importedGeneral) return t('請選擇有效外部檢查及需追蹤的發現，正面觀察或指引不能作為缺失。', 'Select a valid external inspection and actionable finding, not a positive observation or guidance.');
    if (!record.sourceKey || record.sourceKey !== `${inspection!.id}:${finding.id}`) return t('外部來源識別不完整。', 'The external source identity is incomplete.');
    if (state.improvements.some(row => row.id !== record.id && (row.sourceKey === record.sourceKey || row.inspectionId === record.inspectionId && row.findingId === record.findingId))) return t('此發現已有改善記錄，請使用既有記錄。', 'This finding already has an improvement; use the existing record.');
    if (record.itemIds.some(id => !finding.itemIds.includes(id))) return t('外部改善只能關聯此來源發現涉及的Item。', 'External actions can reference only items covered by this finding.');
  }
  return '';
}

export function resolveImprovementFocus(state: PlatformState, focusId?: string): { kind: 'case' | 'item'; id: string } | null {
  if (!focusId) return null;
  if (state.improvements.some(row => row.id === focusId)) return { kind: 'case', id: focusId };
  if (state.items.some(row => row.id === focusId)) return { kind: 'item', id: focusId };
  return null;
}
export default function Improvements(ctx: PageProps & { focusId?: string }) {
  const { state, t } = ctx;
  const editor = useRecordEditor<Improvement>(ctx, 'improvement');
  const [filters, setFilters] = useState<Filters & { itemId?: string }>({ frameworkId: 'all' });
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<'full' | 'progress' | 'close' | 'reopen'>('full');
  const [stagedId, setStagedId] = useState('');
  const [validation, setValidation] = useState('');
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState('');
  const handledFocus = useRef('');
  const visible = useMemo(() => filteredImprovements(state, filters).filter(row => !filters.itemId || row.itemIds.includes(filters.itemId)), [state, filters]);
  const ids = effectiveSelection(selected, visible);
  const can = (cap: Parameters<typeof hasPermission>[2]) => hasPermission(state.settings.rolePermissions, ctx.user, cap);
  const draft = editor.draft;
  const detail = state.improvements.find(row => row.id === detailId);
  const statusLabel = (value: Improvement['status']) => value === 'closed' ? t('已結案', 'Closed') : value === 'in_progress' ? t('進行中', 'In progress') : t('待處理', 'Open');
  const urgencyLabel = (value: Improvement['urgency']) => ({ urgent: t('盡快', 'As soon as possible'), high: t('高', 'High'), medium: t('中', 'Medium'), low: t('低', 'Low') }[value]);
  const setFilter = (key: keyof Filters, value: string) => setFilters(old => ({ ...old, [key]: value }));
  const patch = (value: Partial<Improvement>) => editor.setDraft(old => old ? { ...old, ...value } : old);
  const changeTitle = (lang: 'en' | 'zh', value: string) => { if (draft) { const parts = improvementTitle(draft.title); parts[lang] = value; patch({ title: `${parts.en}\n${parts.zh}` }); } };
  const discard = () => { if (editor.busy) return; if (!editor.isDirty || window.confirm(t('放棄此草稿？取消不會保存。', 'Discard this draft? Cancel does not save.'))) void editor.cancel(); };

  useEffect(() => {
    const query = new URLSearchParams(window.location.hash.split('?')[1] ?? window.location.search);
    const focus = resolveImprovementFocus(state, ctx.focusId || query.get('improvementId') || query.get('focus') || undefined);
    if (!focus) { handledFocus.current = ''; return; }
    const key = `${focus.kind}:${focus.id}`;
    if (handledFocus.current === key) return;
    handledFocus.current = key;
    if (focus.kind === 'case') setDetailId(focus.id);
    else if (focus?.kind === 'item') { setDetailId(''); setFilters({ frameworkId: 'all', itemId: focus.id }); }
  }, [ctx.focusId, state.improvements, state.items]);

  const start = async (record: Improvement, nextMode: typeof mode = 'full') => {
    setValidation(''); setMode(nextMode); setStagedId('');
    if (!await editor.open(record, nextMode === 'close' ? 'close' : nextMode === 'reopen' ? 'reopen' : 'update')) return;
    if (nextMode !== 'full') {
      const eventId = crypto.randomUUID(); setStagedId(eventId);
      editor.setDraft(current => {
        if (!current) return current;
        const status = nextMode === 'close' ? 'closed' : nextMode === 'reopen' ? 'open' : current.status;
        const event: ProgressEvent = { id: eventId, at: isoNow(), by: ctx.user.id, content: '', status, percent: nextMode === 'close' ? 100 : nextMode === 'reopen' ? 0 : current.percent };
        return { ...current, status, percent: event.percent, events: [...current.events, event], closedAt: status === 'closed' ? event.at : null, closedBy: status === 'closed' ? ctx.user.id : null };
      });
    }
  };
  const create = () => {
    const record: Improvement = { ...newBase(), title: '', content: { en: '', zh: '' }, itemIds: filters.itemId ? [filters.itemId] : [], departmentIds: filters.itemId ? state.items.find(row => row.id === filters.itemId)?.departmentIds || [] : [], assigneeIds: [], source: 'non_external', urgency: 'medium', status: 'open', percent: 0, targetDate: '', plan: '', events: [], closedAt: null, closedBy: null, sources: [] };
    void start(record);
  };
  const updateStaged = (changes: Partial<ProgressEvent>) => {
    editor.setDraft(current => {
      if (!current) return current;
      const events = current.events.map(event => event.id === stagedId ? { ...event, ...changes } : event);
      const event = events.find(row => row.id === stagedId);
      return { ...current, events, ...(event ? { status: event.status, percent: event.percent, closedAt: event.status === 'closed' ? event.at : null, closedBy: event.status === 'closed' ? event.by : null } : {}) };
    });
  };
  const submit = async () => {
    if (!draft) return;
    const issue = improvementValidation(draft, ctx);
    const event = draft.events.find(row => row.id === stagedId);
    if (issue) { setValidation(issue); return; }
    if (event) {
      try { appendImprovementEvent({ ...draft, events: draft.events.filter(row => row.id !== stagedId) }, event); }
      catch { setValidation(t('請填寫本次進度，完成百分比須為0–100。', 'Enter progress text and a percentage between 0 and 100.')); return; }
    }
    const intent: SaveIntent = draft.version === 0 ? 'create' : mode === 'close' ? 'close' : mode === 'reopen' ? 'reopen' : 'update';
    await editor.save(intent);
  };
  const exportPdf = async () => {
    const ids = effectiveSelection(selected, filteredImprovements(state, filters).filter(row => !filters.itemId || row.itemIds.includes(filters.itemId)));
    if (!ids.length) { ctx.notify(t('請明確勾選仍符合篩選的改善記錄，空選不會匯出全部。', 'Explicitly select matching records. Empty selection never exports all.'), 'error'); return; }
    setExporting(true);
    try {
      const canonical = await ctx.api.authorizeExport({ format: 'pdf', kind: 'improvements', ids, snapshotToken: state.snapshotToken, filters });
      const eligible = filteredImprovements(canonical, filters).filter(row => !filters.itemId || row.itemIds.includes(filters.itemId));
      if (effectiveSelection(ids, eligible).length !== ids.length) throw new Error('EXPORT_RECORD_NOT_AVAILABLE');
      const { downloadImprovementsPdf } = await import('./reports');
      await downloadImprovementsPdf(canonical, ids, ctx.lang, t('待改善項目', 'Improvement actions'));
      ctx.notify(t('PDF已產生並啟動下載。', 'PDF generated and download started.'), 'success');
    } catch (error) { ctx.notify(error instanceof Error ? error.message : String(error), 'error'); }
    finally { setExporting(false); }
  };
  const sourceDetails = (record: Improvement) => <div className="notice"><strong>{record.source === 'external' ? t('外部檢查來源', 'External inspection source') : t('非外部來源', 'Non-external source')}</strong>{record.inspectionId && <p>{state.inspections.find(row => row.id === record.inspectionId)?.title || record.inspectionId} · {record.findingId}</p>}{record.sources.map((source, index) => <p key={index}>{[source.source, source.file, source.sheet, source.cell, source.pages?.join(', '), source.rawItem, source.note].filter(Boolean).join(' · ')}</p>)}</div>;
  const eventList = (record: Improvement) => <div className="progress-history"><h3>{t('已保存進度（不可修改）', 'Saved progress (immutable)')}</h3>{record.events.filter(event => event.id !== stagedId).length ? record.events.filter(event => event.id !== stagedId).map(event => <article key={event.id} className="notice"><small>{event.at} · {state.people.find(person => person.id === event.by)?.name || event.by} · {statusLabel(event.status)} · {event.percent}%</small><p className="preserve-lines">{event.content}</p></article>) : <Empty>{t('尚無進度。', 'No progress events yet.')}</Empty>}</div>;

  return <>
    <PageHeading title={t('待改善項目', 'Improvement actions')} subtitle={t('每筆改善只有一份進度；更新日期篩選為UTC，並非回溯快照。', 'One event stream per action. Update date filters use UTC, not historical reconstruction.')} actions={<>{can('createImprovements') && <button className="btn primary" disabled={editor.busy || !!draft} onClick={create}>{t('新增改善', 'New action')}</button>}{can('exportReports') && <button className="btn neutral" disabled={!ids.length || exporting} onClick={() => void exportPdf()}>{exporting ? t('產生中…', 'Generating…') : `${t('匯出已選PDF', 'Export selected PDF')} (${ids.length})`}</button>}</>} />
    <div className="toolbar">
      <label className="field">{t('搜尋', 'Search')}<input value={filters.query || ''} onChange={event => setFilter('query', event.target.value)} placeholder={t('標題、內容、Item或進度', 'Title, content, item or progress')} /></label>
      <label className="field">{t('框架', 'Framework')}<select value={filters.frameworkId || 'all'} onChange={event => setFilters(old => ({ ...old, frameworkId: event.target.value as Filters['frameworkId'], chapterId: '' }))}><option value="all">{t('全部', 'All')}</option><option>TMSA</option><option>DRYBMS</option></select></label>
      <label className="field">{t('章節', 'Chapter')}<select value={filters.chapterId || ''} onChange={event => setFilter('chapterId', event.target.value)}><option value="">{t('全部', 'All')}</option>{state.chapters.filter(chapter => !filters.frameworkId || filters.frameworkId === 'all' || chapter.frameworkId === filters.frameworkId).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.frameworkId} {chapter.code} · {bi(chapter.name, ctx.lang)}</option>)}</select></label>
      <label className="field">{t('狀態', 'Status')}<select value={filters.status || ''} onChange={event => setFilter('status', event.target.value)}><option value="">{t('全部', 'All')}</option>{(['open', 'in_progress', 'closed'] as const).map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
      <details className="secondary-filters"><summary>{t('更多篩選（部門／人員／日期）', 'More filters (department / person / dates)')}{[filters.departmentId, filters.personId, filters.urgency, filters.from, filters.to].some(Boolean) && <span className="filter-active"> · {t('已套用', 'Active')}</span>}</summary><div className="secondary-filter-fields">
      <label className="field">{t('部門', 'Department')}<select value={filters.departmentId || ''} onChange={event => setFilter('departmentId', event.target.value)}><option value="">{t('全部', 'All')}</option>{state.settings.departments.map(dept => <option key={dept.id} value={dept.id}>{bi(dept.name, ctx.lang)}</option>)}</select></label>
      <label className="field">{t('執行人', 'Assignee')}<select value={filters.personId || ''} onChange={event => setFilter('personId', event.target.value)}><option value="">{t('全部', 'All')}</option>{state.people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label className="field">{t('急迫程度', 'Urgency')}<select value={filters.urgency || ''} onChange={event => setFilter('urgency', event.target.value)}><option value="">{t('全部', 'All')}</option>{(['urgent', 'high', 'medium', 'low'] as const).map(urgency => <option key={urgency} value={urgency}>{urgencyLabel(urgency)}</option>)}</select></label>
      <label className="field">{t('更新起日', 'Updated from')}<input type="date" value={filters.from || ''} onChange={event => setFilter('from', event.target.value)} /></label>
      <label className="field">{t('更新迄日', 'Updated to')}<input type="date" value={filters.to || ''} onChange={event => setFilter('to', event.target.value)} /></label>
      </div></details>
      <button className="btn neutral" onClick={() => { setFilters({ frameworkId: 'all' }); setSelected([]); }}>{t('清除篩選及選取', 'Clear filters and selection')}</button>
    </div>
    {filters.itemId && <div className="notice">{t('限定相關Item；新增改善將預填此Item', 'Filtered to related item; new actions prefill this item')}: {state.items.find(row => row.id === filters.itemId)?.code || filters.itemId} <button className="btn neutral" onClick={() => setFilters(old => ({ ...old, itemId: undefined }))}>{t('取消Item限定', 'Clear item scope')}</button></div>}
    <div className="list-selection-summary"><span>{t('符合篩選', 'Matching')}: {visible.length} · {t('已選', 'Selected')}: {ids.length}</span><button className="btn neutral small" onClick={() => setSelected([])}>{t('取消全部勾選', 'Clear selection')}</button><span className="list-hint">{t('清單顯示全文；點標題查看詳情', 'Full content shown; open the title for details')}</span></div>
    <EditorNotice error={draft ? '' : editor.error} lost={editor.lost} />
    {!visible.length ? <Empty>{t('沒有符合篩選的改善記錄。', 'No matching improvement records.')}</Empty> : <div className="table-wrap"><table className="data-table improvement-table"><thead><tr><th>{t('選取', 'Select')}</th><th>{t('內容／相關Item', 'Action / related items')}</th><th>{t('部門／執行人', 'Departments / assignees')}</th><th>{t('狀態／急迫程度', 'Status / urgency')}</th><th>{t('目標／更新', 'Target / updated')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>{visible.map(record => <tr key={record.id}><td><input type="checkbox" aria-label={`${t('選取', 'Select')} ${record.title}`} checked={ids.includes(record.id)} onChange={event => setSelected(old => event.target.checked ? [...old, record.id] : old.filter(id => id !== record.id))} /></td><td><button className="text-button" onClick={() => setDetailId(record.id)}><BilingualText value={improvementTitle(record.title)} /></button><div className="improvement-content"><BilingualText value={record.content} /></div><div className="item-references">{record.itemIds.map(id => <button key={id} className="btn neutral" onClick={() => { const item = state.items.find(row => row.id === id); if (item) ctx.navigate(item.frameworkId, id); }}>{openIssuesFor(state, id).length > 0 ? '⭐ ' : ''}{state.items.find(item => item.id === id)?.code || id}</button>)}</div></td><td>{departmentsLabel(state, record.departmentIds, ctx.lang)}<br />{peopleLabel(state, record.assigneeIds)}</td><td><span className={`status-pill ${record.status}`}>{statusLabel(record.status)}</span><br />{urgencyLabel(record.urgency)} · {record.percent}%</td><td>{record.targetDate || '—'}<br /><small>{record.updatedAt}</small></td><td><div className="page-actions">{can('updateImprovements') && record.status !== 'closed' && <button className="btn primary" disabled={!!draft || editor.busy} onClick={() => void start(record, 'progress')}>{t('直接更新', 'Update progress')}</button>}{can('updateImprovements') && <button className="btn neutral" disabled={!!draft || editor.busy} onClick={() => void start(record)}>{t('完整編輯', 'Full edit')}</button>}{can('closeImprovements') && <button className={`btn ${record.status === 'closed' ? 'warning' : 'success'}`} disabled={!!draft || editor.busy} onClick={() => void start(record, record.status === 'closed' ? 'reopen' : 'close')}>{record.status === 'closed' ? t('重開', 'Reopen') : t('結案', 'Close')}</button>}</div></td></tr>)}</tbody></table></div>}
    {detail && !draft && <Modal title={t('改善詳情', 'Action detail')} wide onClose={() => setDetailId('')}><BilingualText value={improvementTitle(detail.title)} /><BilingualText value={detail.content} /><p>{t('計劃', 'Plan')}: {detail.plan}</p>{sourceDetails(detail)}{eventList(detail)}</Modal>}
    {draft && <Modal title={mode === 'close' ? t('確認結案', 'Confirm close') : mode === 'reopen' ? t('確認重開', 'Confirm reopen') : mode === 'progress' ? t('更新進度', 'Update progress') : draft.version === 0 ? t('新增改善', 'New improvement') : t('編輯改善', 'Edit improvement')} wide onClose={discard}>
      <EditorNotice error={editor.error || validation} lost={editor.lost} />
      {mode === 'full' ? <div className="form-grid">
        <label className="field">{t('標題（英文）', 'Title (English)')}<input value={improvementTitle(draft.title).en} onChange={event => changeTitle('en', event.target.value)} /></label><label className="field">{t('標題（繁中）', 'Title (Traditional Chinese)')}<input value={improvementTitle(draft.title).zh} onChange={event => changeTitle('zh', event.target.value)} /></label>
        <label className="field">{t('內容（英文）', 'Content (English)')}<textarea rows={5} value={draft.content.en} onChange={event => patch({ content: { ...draft.content, en: event.target.value } })} /></label><label className="field">{t('內容（繁中）', 'Content (Traditional Chinese)')}<textarea rows={5} value={draft.content.zh} onChange={event => patch({ content: { ...draft.content, zh: event.target.value } })} /></label>
        <MultiSelect label={t('相關Item（可跨框架）', 'Related items (cross-framework)')} options={state.items.filter(item => item.active || draft.itemIds.includes(item.id)).map(item => ({ id: item.id, label: `${item.frameworkId} ${item.code} · ${bi(item.kpi, ctx.lang)}${item.active ? '' : t('（停用）', ' (inactive)')}` }))} selected={draft.itemIds} onChange={itemIds => patch({ itemIds })} />
        <MultiSelect label={t('負責部門', 'Responsible departments')} options={departmentOptions(ctx)} selected={draft.departmentIds} onChange={departmentIds => patch({ departmentIds })} /><MultiSelect label={t('執行人', 'Assignees')} options={peopleOptions(ctx)} selected={draft.assigneeIds} onChange={assigneeIds => patch({ assigneeIds })} />
        <label className="field">{t('急迫程度', 'Urgency')}<select value={draft.urgency} onChange={event => patch({ urgency: event.target.value as Improvement['urgency'] })}>{(['urgent', 'high', 'medium', 'low'] as const).map(value => <option key={value} value={value}>{urgencyLabel(value)}</option>)}</select></label>
        <label className="field">{t('目標日期', 'Target date')}<input type="date" value={draft.targetDate} onChange={event => patch({ targetDate: event.target.value })} /></label><label className="field">{t('改善計劃', 'Action plan')}<textarea rows={4} value={draft.plan} onChange={event => patch({ plan: event.target.value })} /></label>
        <label className="field">{t('來源', 'Source')}<select value={draft.source} disabled={draft.version > 0} onChange={event => patch({ source: event.target.value as Improvement['source'], inspectionId: undefined, findingId: undefined, sourceKey: undefined, sources: [] })}><option value="non_external">{t('非外部', 'Non-external')}</option><option value="external">{t('外部檢查', 'External inspection')}</option></select></label>
        {draft.source === 'external' && <><label className="field">{t('來源檢查', 'Source inspection')}<select disabled={draft.version > 0} value={draft.inspectionId || ''} onChange={event => patch({ inspectionId: event.target.value, findingId: undefined, sourceKey: undefined, sources: [] })}><option value="">{t('請選擇', 'Select')}</option>{state.inspections.map(row => <option key={row.id} value={row.id}>{row.date} · {row.title}</option>)}</select></label><label className="field">{t('來源發現', 'Source finding')}<select disabled={draft.version > 0} value={draft.findingId || ''} onChange={event => { const finding = state.inspections.find(row => row.id === draft.inspectionId)?.findings.find(row => row.id === event.target.value); patch({ findingId: finding?.id, sourceKey: finding ? `${draft.inspectionId}:${finding.id}` : undefined, sources: finding ? structuredClone(finding.sources) : [] }); }}><option value="">{t('請選擇', 'Select')}</option>{state.inspections.find(row => row.id === draft.inspectionId)?.findings.filter(row => row.classification === 'finding').map(row => <option key={row.id} value={row.id}>{bi(row.observation, ctx.lang)}</option>)}</select></label></>}
      </div> : <BilingualText value={improvementTitle(draft.title)} />}
      {sourceDetails(draft)}
      {stagedId && (() => { const event = draft.events.find(row => row.id === stagedId); return event ? <div className="form-grid"><label className="field">{t('本次新增進度（保存前可修改）', 'New progress (editable until saved)')}<textarea rows={5} value={event.content} onChange={e => updateStaged({ content: e.target.value })} /></label><label className="field">{t('完成百分比', 'Completion percentage')}<input type="number" min={0} max={100} disabled={mode === 'close'} value={event.percent} onChange={e => updateStaged({ percent: Number(e.target.value) })} /></label>{mode === 'progress' && <label className="field">{t('執行狀態', 'Execution status')}<select value={event.status} onChange={e => updateStaged({ status: e.target.value as ProgressEvent['status'] })}><option value="open">{t('待處理', 'Open')}</option><option value="in_progress">{t('進行中', 'In progress')}</option></select></label>}</div> : null; })()}
      {eventList(draft)}
      <div className="page-actions"><button className="btn neutral" disabled={editor.busy} onClick={discard}>{t('取消／放棄草稿', 'Cancel / discard draft')}</button><button className={`btn ${mode === 'close' ? 'success' : 'primary'}`} disabled={!editor.canSave} onClick={() => void submit()}>{editor.busy ? t('保存中…', 'Saving…') : t('確認保存', 'Confirm save')}</button></div>
    </Modal>}
  </>;
}
