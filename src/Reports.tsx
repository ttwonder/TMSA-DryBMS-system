import {richTextToPlainText} from './richText';
import {useRef,useState} from 'react';
import {hasItemRemarks} from './itemRemarks';
import type {ExportRequest,FrameworkId,PageProps} from './types';
import {bi,hasPermission,overviewChapterScope} from './domain';
import {filterImprovementList,type ImprovementListFilters} from './improvementList';
import {improvementSourceLabel,STANDALONE_IMPROVEMENT_SOURCES} from './improvementTracking';
import {PageHeading,MultiSelect,Empty} from './ui';
import {authorizeReportSnapshot,buildFrameworkExcel,buildFrameworkPdf,buildRemarksExcel,buildRemarksPdf,selectedRemarkRows,buildImprovementsExcel,buildImprovementsPdf,buildInspectionPdf,buildOverviewPdf,downloadReportBytes} from './reports.ts';

type ReportKind=ExportRequest['kind']|'remarks';
export default function Reports(ctx:PageProps) {
  const {state,lang,t}=ctx;const restricted=state.viewScope==='management_viewer';
  const [kind,setKind]=useState<ReportKind>('framework');
  const [format,setFormat]=useState<ExportRequest['format']>('xlsx');
  const [frameworkId,setFrameworkId]=useState<FrameworkId>('TMSA');
  const [chapterIds,setChapterIds]=useState<string[]>(()=>state.chapters.filter(c=>c.active&&c.frameworkId==='TMSA').map(c=>c.id));
  const [inspectionId,setInspectionId]=useState('');
  const [filters,setFilters]=useState<ImprovementListFilters>({frameworkId:'all'});
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const actor=useRef({id:ctx.user.id,session:ctx.api.sessionToken,api:ctx.api});
  actor.current={id:ctx.user.id,session:ctx.api.sessionToken,api:ctx.api};
  const allowed=hasPermission(state.settings.rolePermissions,ctx.user,'exportReports');
  const chapters=state.chapters.filter(c=>c.active&&c.frameworkId===frameworkId).sort((a,b)=>a.order-b.order);
  const visible=filterImprovementList(state,filters);
  const effectiveSelection=selectedIds.filter(id=>visible.some(row=>row.id===id));
  const selectedChapters=chapterIds.filter(id=>chapters.some(ch=>ch.id===id));
  const overviewScope=selectedChapters.filter(id=>overviewChapterScope(state,frameworkId,{...filters,frameworkId}).includes(id));
  const changeFilter=(key:keyof ImprovementListFilters,value:string)=>setFilters(previous=>({...previous,[key]:value||undefined}));
  const remarksCount=state.assessments.filter(a=>hasItemRemarks(a)&&state.items.some(i=>i.id===a.itemId&&i.active&&i.frameworkId===frameworkId&&selectedChapters.includes(i.chapterId))).length;
  const changeKind=(value:ReportKind)=>{setKind(value);setError('');if(value==='inspection'||value==='overview')setFormat('pdf');};
  const exportReport=async()=>{
    if(busy||!allowed||restricted&&(kind==='improvements'||kind==='remarks'))return;
    const ids=kind==='improvements'?effectiveSelection:kind==='inspection'?(inspectionId?[inspectionId]:[]):kind==='overview'?overviewScope:selectedChapters;
    if(!ids.length){setError(t('請明選仍符合篩選的有效項目。空選不會輸出全部。','Select valid records still matching the filters. An empty selection never means all.'));return;}
    if(kind!=='remarks'&&(filters.from&&filters.to&&filters.from>filters.to||kind==='improvements'&&filters.proposedFrom&&filters.proposedTo&&filters.proposedFrom>filters.proposedTo)){setError(t('起始日期不可晚於結束日期。','The start date must not be after the end date.'));return;}
    const initiating=actor.current;
    const unchanged=()=>actor.current.id===initiating.id&&actor.current.session===initiating.session&&actor.current.api===initiating.api;
    setBusy(true);setError('');
    try {
      if(kind==='remarks'&&!selectedRemarkRows(state,frameworkId,ids).length)throw new Error(t('所選章節沒有已填寫的備註。','No remarks in the selected chapters.'));
      const request:Omit<ExportRequest,'snapshotToken'>={format,kind:kind==='remarks'?'framework':kind,ids,frameworkId:kind==='framework'||kind==='overview'||kind==='remarks'?frameworkId:undefined,filters:kind==='improvements'?filters:kind==='overview'?{...filters,frameworkId,chapterIds:ids}: {chapterIds:kind==='framework'||kind==='remarks'?ids:undefined,...(kind==='remarks'?{reportVariant:'remarks'}:{})}};
      // This RPC authorizes and records the export; no builder receives the live page state.
      const canonical=await authorizeReportSnapshot(ctx,request);
      if(!unchanged())throw new Error(t('登入已變更，已停止輸出。','The signed-in session changed; export stopped.'));
      const bytes=kind==='remarks'?(format==='xlsx'?await buildRemarksExcel(canonical,frameworkId,lang,ids):await buildRemarksPdf(canonical,frameworkId,lang,ids)):kind==='framework'?(format==='xlsx'?await buildFrameworkExcel(canonical,frameworkId,lang,ids):await buildFrameworkPdf(canonical,frameworkId,lang,ids)):kind==='improvements'?(format==='xlsx'?await buildImprovementsExcel(canonical,ids,lang):await buildImprovementsPdf(canonical,ids,lang)):kind==='inspection'?await buildInspectionPdf(canonical,ids[0],lang):await buildOverviewPdf(canonical,frameworkId,lang,ids,{filters});
      if(!unchanged())throw new Error(t('登入已變更，已停止下載。','The signed-in session changed; download stopped.'));
      downloadReportBytes(bytes,`${kind==='framework'||kind==='overview'||kind==='remarks'?frameworkId+'-':''}${kind}-${canonical.serverTime.slice(0,10)}.${format}`,format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf');
      ctx.notify(t('文件已產生並啟動下載；保存位置由瀏覽器決定。','The document was generated and download started; the browser controls where it is saved.'),'success');
    } catch(problem) {
      const message=problem instanceof Error?problem.message:String(problem);setError(message);ctx.notify(message,'error');
    } finally {setBusy(false);}
  };
  return <>
    <PageHeading title={t('報告中心','Report center')} subtitle={t('授權快照 · 原樣式 XLSX · 可選取中文 PDF','Authorized snapshot · Source-style XLSX · Selectable-text PDF')}/>
    {!allowed&&<div className="notice warning" role="status">{t('目前角色沒有報告輸出權限。','Your role does not permit report export.')}</div>}
    <section className="panel">
      <div className="toolbar">
        <label><span>{t('報告種類','Report type')}</span><select aria-label={t('報告種類','Report type')} value={kind} disabled={busy} onChange={event=>changeKind(event.target.value as ReportKind)}><option value="framework">{t('框架完整自評','Full framework assessment')}</option>{!restricted&&<option value="remarks">{t('條目備註','Item remarks')}</option>}{!restricted&&<option value="improvements">{t('明選改善項目','Selected improvements')}</option>}<option value="inspection">{t('凍結歷史檢查','Frozen inspection')}</option><option value="overview">{t('管控總覽','Management overview')}</option></select></label>
        <label><span>{t('文件格式','File format')}</span><select aria-label={t('文件格式','File format')} disabled={busy||(kind==='inspection'||kind==='overview')} value={format} onChange={event=>setFormat(event.target.value as ExportRequest['format'])}><option value="xlsx">Excel (.xlsx)</option><option value="pdf">PDF (.pdf)</option></select></label>
        {(kind==='framework'||kind==='overview'||kind==='remarks')&&<label><span>{t('框架','Framework')}</span><select aria-label={t('報告框架','Report framework')} value={frameworkId} disabled={busy} onChange={event=>{const fw=event.target.value as FrameworkId;setFrameworkId(fw);setChapterIds(state.chapters.filter(c=>c.active&&c.frameworkId===fw).map(c=>c.id));}}><option>TMSA</option><option>DRYBMS</option></select></label>}
        <button className="btn primary" disabled={!allowed||busy} onClick={()=>void exportReport()}>{busy?t('產生中…','Generating…'):t('生成並下載','Generate and download')}</button>
      </div>
      <p className="calculation-note">{kind==='remarks'?t('備註獨立清單：對應章節、Item、狀態、涉及部門、追蹤人員及完整備註；Excel／PDF均保留狀態文字與顏色。','Separate remarks list: chapter, Item, status, departments, follow-up people and complete text; Excel/PDF retain status labels and colours.'):kind==='improvements'?t('Excel 依文件序號／段次保留全文，全部進度另表，可篩選及排序；PDF 正文15pt、輔助≥14pt。','Excel retains full text by document number/part, with a separate progress sheet, filters and sorting; PDF body 15pt, auxiliary ≥14pt.'):t('Excel 原樣式／同 Item 續列；PDF 正文15pt、輔助≥14pt，不縮字、不裁文。','Source-style Excel with Item continuations; PDF body 15pt, auxiliary ≥14pt. No shrinking or clipping.')}</p>
      {(kind==='framework'||kind==='overview'||kind==='remarks')&&<MultiSelect label={t('完整分章選取','Complete chapter selection')} options={chapters.map(ch=>({id:ch.id,label:`${ch.code} · ${bi(ch.name,lang)}`}))} selected={selectedChapters} onChange={setChapterIds}/>}
      {kind==='remarks'&&<p className="muted">{t('所選章節有文字備註的條目','Items with remarks text in selected chapters')}: {remarksCount}. {t('只輸出已保存的文字備註與其狀態，不含未保存草稿；只有狀態、沒有備註文字的條目不輸出。','Only saved remarks text and its status are exported, never unsaved drafts. Status-only items without remarks text are excluded.')}</p>}
      {kind==='inspection'&&<label className="field"><span>{t('檢查快照','Inspection snapshot')}</span><select aria-label={t('檢查快照','Inspection snapshot')} value={inspectionId} disabled={busy} onChange={event=>setInspectionId(event.target.value)}><option value="">{t('請選取一筆檢查','Select an inspection')}</option>{state.inspections.map(i=><option key={i.id} value={i.id}>{i.frameworkId} · {i.date} · {richTextToPlainText(i.title)} · {i.status==='final'?t('已發布','Published'):t('草稿','Draft')}</option>)}</select><p className="muted">{t('歷史報告保留凍結條文、完整觀察與建議；未完整評定顯示未完整記分，不當成0分。','Historical reports retain frozen definitions and complete observations/recommendations. Incomplete coverage is marked unscored, never zero.')}</p></label>}
      {(kind==='improvements'||kind==='overview')&&<div className="toolbar overview-filters">
        {kind==='improvements'&&<><label><span>{t('搜尋','Search')}</span><input aria-label={t('報告搜尋','Report search')} value={filters.query??''} onChange={event=>changeFilter('query',event.target.value)} placeholder={t('事項、條目、計劃或進度','Title, Item, plan or progress')}/></label><label><span>{t('改善框架','Improvement framework')}</span><select aria-label={t('改善框架','Improvement framework')} value={filters.frameworkId??'all'} onChange={event=>{changeFilter('frameworkId',event.target.value);changeFilter('chapterId','');}}><option value="all">{t('全部','All')}</option><option>TMSA</option><option>DRYBMS</option></select></label><label><span>{t('改善章節','Improvement chapter')}</span><select aria-label={t('改善章節','Improvement chapter')} value={filters.chapterId??''} onChange={event=>changeFilter('chapterId',event.target.value)}><option value="">{t('全部','All')}</option>{state.chapters.filter(ch=>filters.frameworkId==='all'||ch.frameworkId===filters.frameworkId).map(ch=><option key={ch.id} value={ch.id}>{ch.frameworkId} {ch.code} · {bi(ch.name,lang)}</option>)}</select></label></>}
        {kind==='improvements'&&<><label><span>{t('來源','Source')}</span><select aria-label={t('報告來源','Report source')} value={filters.source??''} disabled={busy} onChange={e=>changeFilter('source',e.target.value)}><option value="">{t('全部來源','All sources')}</option>{(['non_external',...STANDALONE_IMPROVEMENT_SOURCES] as const).map(source=><option key={source} value={source}>{improvementSourceLabel(source,lang)}</option>)}{[...state.inspections].sort((a,b)=>b.date.localeCompare(a.date)).map(i=><option key={i.id} value={'inspection:'+i.id}>{i.date} · {i.frameworkId} · {richTextToPlainText(i.title)}</option>)}</select></label><label><span>{t('提出日期・起','Proposed date · from')}</span><input type="date" aria-label={t('報告提出起始日期','Report proposed from')} disabled={busy} value={filters.proposedFrom??''} onChange={e=>changeFilter('proposedFrom',e.target.value)}/></label><label><span>{t('提出日期・至','Proposed date · to')}</span><input type="date" aria-label={t('報告提出結束日期','Report proposed to')} disabled={busy} value={filters.proposedTo??''} onChange={e=>changeFilter('proposedTo',e.target.value)}/></label></>}
        <label><span>{t('部門','Department')}</span><select aria-label={t('報告部門','Report department')} value={filters.departmentId??''} onChange={event=>changeFilter('departmentId',event.target.value)}><option value="">{t('全部部門','All departments')}</option>{state.settings.departments.map(d=><option key={d.id} value={d.id}>{bi(d.name,lang)}</option>)}</select></label>
        <label><span>{t('執行人','Assignee')}</span><select aria-label={t('報告執行人','Report assignee')} value={filters.personId??''} onChange={event=>changeFilter('personId',event.target.value)}><option value="">{t('全部人員','All people')}</option>{state.people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label><span>{t('最近更新 / 匯入・起','Updated / imported · from')}</span><input type="date" aria-label={t('報告起始日期','Report from date')} value={filters.from??''} onChange={event=>changeFilter('from',event.target.value)}/></label><label><span>{t('至','To')}</span><input type="date" aria-label={t('報告結束日期','Report to date')} value={filters.to??''} onChange={event=>changeFilter('to',event.target.value)}/></label>
        {kind==='improvements'&&<><label><span>{t('狀態','Status')}</span><select aria-label={t('報告改善狀態','Report improvement status')} value={filters.status??''} onChange={event=>changeFilter('status',event.target.value)}><option value="">{t('全部','All')}</option><option value="open">{t('開啟','Open')}</option><option value="in_progress">{t('進行中','In progress')}</option><option value="closed">{t('結案','Closed')}</option></select></label><label><span>{t('急迫程度','Urgency')}</span><select aria-label={t('報告急迫程度','Report urgency')} value={filters.urgency??''} onChange={event=>changeFilter('urgency',event.target.value)}><option value="">{t('全部','All')}</option><option value="urgent">{t('緊急','Urgent')}</option><option value="high">{t('高','High')}</option><option value="medium">{t('中','Medium')}</option><option value="low">{t('低','Low')}</option></select></label></>}
      </div>}
      {kind==='improvements'&&<><div className="toolbar"><button className="btn small" disabled={busy||!allowed||!visible.length} onClick={()=>setSelectedIds(previous=>[...new Set([...previous,...visible.map(row=>row.id)])])}>{t('全選符合篩選結果','Select all matching results')}</button><button className="btn small" disabled={busy||!effectiveSelection.length} onClick={()=>setSelectedIds(previous=>previous.filter(id=>!visible.some(row=>row.id===id)))}>{t('取消全選','Clear matching selection')}</button></div><p className="muted">{t('符合篩選','Matching')}: {visible.length} · {t('明選且仍有效','Selected and still valid')}: {effectiveSelection.length}. {t('未選取項目不輸出；全部進度保留。','Unselected records are excluded; all progress is retained.')}</p>{visible.length?<MultiSelect label={t('明選改善項目（搜尋後選取）','Select improvements after searching')} options={visible.map(row=>({id:row.id,label:`${richTextToPlainText(row.title)} · ${row.id.slice(0,12)} · ${row.percent}%`}))} selected={effectiveSelection} onChange={ids=>{if(!busy)setSelectedIds(previous=>[...previous.filter(id=>!visible.some(row=>row.id===id)),...ids]);}}/>:<Empty>{t('沒有符合篩選條件的改善項目。','No improvements match the filters.')}</Empty>}</>}
      {kind==='overview'&&<p className="muted">{t('納入完整分章','Complete chapters included')}: {overviewScope.length}. {restricted?t('部門、人員與日期只選定相關完整分章，不刪除章內 No；試算不混入本報告。','Department, person and date filters select related complete chapters without removing any No. Simulation is not included.'):t('部門、人員與日期只選定相關完整分章，不刪除章內 No；分章改善分佈可重疊，試算不混入本報告。','Department, person and date filters select related complete chapters without removing any No. Chapter issue counts may overlap; simulation is not included.')}</p>}
      {error&&<div className="notice error" role="alert">{error}</div>}
    </section>
  </>;
}
