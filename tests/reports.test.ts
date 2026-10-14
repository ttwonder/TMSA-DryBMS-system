import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import type { PlatformState } from '../src/types.ts';
import { DEFAULT_PERMISSIONS } from '../src/domain.ts';

// A missing implementation is an explicit RED, not a fabricated provider result.
const reports = await import('../src/reports.ts').catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {} as typeof import('../src/reports.ts');
  throw error;
});
const base = (id:string) => ({id, version:1, createdAt:'2026-10-11T01:00:00Z', updatedAt:'2026-10-11T02:00:00Z', updatedBy:'qa-person'});
export async function reportFixture() {
  const bytes = new Uint8Array(await readFile(process.env.REPORT_TEMPLATE ?? resolve('public/templates/tmsa-template.xlsx')));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const state:PlatformState = {
    frameworks:[{...base('TMSA'),name:{en:'Synthetic company TMSA',zh:'測試公司 TMSA'}, description:{en:'Synthetic only',zh:'僅測試資料'},scoring:'tmsa-stage',active:true,sourceVersion:'QA-1',scopeLabel:{en:'Company 20 chapters; not official OCIMF score',zh:'公司20分章；非 OCIMF 官方得分'}}],
    chapters:[],items:[],assessments:[],improvements:[],inspections:[],people:[{...base('qa-person'),username:'qa',name:'QA執行人',departmentId:'qa-dept',role:'operator',active:true,hasPassword:false}],
    settings:{...base('settings'),departments:[{id:'qa-dept',name:{en:'QA Marine',zh:'測試海務'},active:true},{id:'qa-dept2',name:{en:'QA Technical',zh:'測試工務'},active:true}],rolePermissions:DEFAULT_PERMISSIONS,siteGateConfigured:false},
    dryScores:[],auditLogs:[],cycles:[],provenance:[],serverTime:'2026-10-11T03:00:00Z',snapshotToken:'synthetic-qa-snapshot'
  };
  for (const [order, sheet] of book.worksheets.entries()) {
    const rows:{code:string,row:number}[]=[];
    sheet.eachRow(row=>{if (/^\d+[A-Za-z]?\.\d+\.\d+$/.test(row.getCell(1).text)) rows.push({code:row.getCell(1).text,row:row.number});});
    const code=rows[0]?.code.split('.')[0]??String(order+1),chapterId=`qa-ch-${code}`;
    state.chapters.push({...base(chapterId),frameworkId:'TMSA',code,name:{en:`Synthetic chapter ${code}`,zh:`測試分章 ${code}`},order,active:true});
    for (const [itemOrder,{code,row}] of rows.entries()) {
      const itemId=`qa-item-${code}`;
      state.items.push({...base(itemId),frameworkId:'TMSA',chapterId,code,level:Number(code.split('.')[1]),order:itemOrder,active:true,kpi:{en:`QA KPI ${code}`,zh:`測試指標 ${code}`},guidance:{en:`QA guidance ${code}`,zh:`測試指引 ${code}`},departmentIds:['qa-dept'],sources:[{source:'synthetic',sheet:sheet.name,cell:`A${row}`} ]});
      state.assessments.push({...base(`qa-assessment-${code}`),itemId,response:'yes',conformity:'all',reviewed:true,selfAssessment:{en:`QA current ${code}`,zh:`測試目前自評 ${code}`},evidence:{en:`QA evidence ${code}`,zh:`測試證據 ${code}`},departmentIds:['qa-dept','qa-dept2'],assigneeIds:['qa-person'],executionStatus:'in_progress',sources:[]});
    }
  }
  return {state,bytes,book};
}

for(const frameworkId of ['TMSA','DRYBMS'] as const)for(const lang of ['zh','en'] as const)test(`framework XLSX removes scoring-intro block ${frameworkId} ${lang}`,async()=>{
  const {state,bytes,book}=await reportFixture();
  if(frameworkId==='DRYBMS'){
    state.frameworks=[{...state.frameworks[0],id:'DRYBMS',scoring:'drybms-guidance',scopeLabel:{en:'REMOVED_DRY_SCOPE',zh:'移除之DRY範圍說明'}}];
    state.chapters=state.chapters.map(c=>({...c,frameworkId:'DRYBMS'}));
    state.items=state.items.map(i=>({...i,frameworkId:'DRYBMS',sources:[]}));
  }
  const before=JSON.stringify(state),output=await reports.buildFrameworkExcel(state,frameworkId,lang,undefined,{templateBytes:bytes});
  const saved=new ExcelJS.Workbook();await saved.xlsx.load(output as unknown as ExcelJS.Buffer);
  assert.equal(saved.worksheets.length,state.chapters.length);
  for(const sheet of saved.worksheets){
    assert.equal(sheet.getCell('E2').text,'',`${sheet.name}: removed intro must not be exported`);
    const original=frameworkId==='TMSA'?book.getWorksheet(sheet.name):book.worksheets[0];
    assert.equal(sheet.getRow(2).height,original?.getRow(2).height??24,`${sheet.name}: no enlarged empty intro row`);
    assert.equal(sheet.getCell('A6').text,'Item','Keep existing header coordinates');
    const view=sheet.views[0];assert.ok(view.state==='frozen','Keep frozen view');
    assert.equal(view.ySplit,6,'Keep freeze-pane coordinates');
    assert.ok(sheet.getCell('A1').value,'Keep chapter title');
    const seen:string[]=[];sheet.eachRow(row=>{if(row.number>=7&&row.getCell(1).value)seen.push(row.getCell(1).text);});
    assert.ok(seen.length||!state.items.some(i=>i.chapterId===state.chapters.find(c=>sheet.getCell('A1').text.startsWith(c.code+' '))?.id),'Keep body records');
  }
  assert.equal(JSON.stringify(state),before,'Export presentation must not change source/scoring data');
});

test('framework XLSX fills original Item coordinates and retains twenty styled sheets', async()=>{
  assert.equal(typeof reports.buildFrameworkExcel,'function','real XLSX builder is not implemented');
  const {state,bytes,book}=await reportFixture();
  assert.equal(book.worksheets.length,20);
  assert.equal(state.items.length,288);
  const output=await reports.buildFrameworkExcel(state,'TMSA','zh',undefined,{templateBytes:bytes});
  const saved=new ExcelJS.Workbook();await saved.xlsx.load(output as unknown as ExcelJS.Buffer);
  assert.equal(saved.worksheets.length,20);
  const first=state.items[0],loc=first.sources[0],sheet=saved.getWorksheet(loc.sheet!)!;
  assert.equal(sheet.getCell(loc.cell!).text,first.code);
  assert.equal(sheet.getCell(`B${loc.cell!.slice(1)}`).text,`${first.kpi.en}\n${first.kpi.zh}`);
  assert.equal(sheet.getCell('E6').text.includes('2026'),true);
  assert.equal(sheet.getColumn(1).width,book.worksheets[0].getColumn(1).width);
  assert.ok(sheet.getCell(loc.cell!).border.left?.style);
  assert.ok(sheet.getCell(`F${loc.cell!.slice(1)}`).alignment.wrapText);
  if(process.env.REPORT_QA_DIR){await mkdir(process.env.REPORT_QA_DIR,{recursive:true});await writeFile(resolve(process.env.REPORT_QA_DIR,'framework-20.xlsx'),output);await writeFile(resolve(process.env.REPORT_QA_DIR,'xlsx-expectations.json'),JSON.stringify({sheets:book.worksheets.map(s=>s.name),itemCodes:state.items.map(i=>i.code),required:['QA KPI 1.1.1','測試目前自評 1.1.1'],uniqueItems:288}));await writeFile(resolve(process.env.REPORT_QA_DIR,'framework-state.json'),JSON.stringify(state));}
});

test('native sheetPr order retains tabColor before outlinePr and pageSetUpPr',async()=>{
  const {default:JSZip}=await import('jszip');
  const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('native');
  sheet.properties.tabColor={argb:'FF339966'};sheet.properties.outlineProperties={summaryBelow:true,summaryRight:true};sheet.pageSetup.fitToPage=true;sheet.getCell('A1').value='QA';
  const bytes=await reports.ensureNativeExcelCompatibility(new Uint8Array(await book.xlsx.writeBuffer()));
  const zip=await JSZip.loadAsync(bytes);const xml=await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  const props=/<sheetPr[^>]*>([\s\S]*?)<\/sheetPr>/.exec(xml)![1];
  assert.ok(props.indexOf('<tabColor')<props.indexOf('<outlinePr'));
  assert.ok(props.indexOf('<outlinePr')<props.indexOf('<pageSetUpPr'));
});

test('a template containing annotations is rejected instead of leaking comments',async()=>{
  const {state,book}=await reportFixture();book.worksheets[0].getCell('E7').note='FORBIDDEN_TEMPLATE_COMMENT';
  const contaminated=new Uint8Array(await book.xlsx.writeBuffer());
  await assert.rejects(()=>reports.buildFrameworkExcel(state,'TMSA','zh',undefined,{templateBytes:contaminated}),/comment|annotation|註解/i);
});

test('long bilingual XLSX fields reconstruct exactly and include custom chapters while excluding inactive current items', async()=>{
  const {state,bytes}=await reportFixture();
  const first=state.items[0];
  first.kpi={en:'BEGIN_EN\n'+Array.from({length:120},(_,i)=>`QA long English paragraph ${i}: keep every complete word and punctuation.\n`).join('')+'END_EN',zh:'中文開始\n'+Array.from({length:120},(_,i)=>`第${i}段完整繁體中文內容，換行與來源不得遺失。\n`).join('')+'中文結尾'};
  const customChapter={...state.chapters[0],id:'qa-custom-chapter',code:'CUSTOM',order:99};
  state.chapters.push(customChapter);
  state.items.push({...first,id:'qa-custom-item',code:'LOCAL-X',chapterId:customChapter.id,kpi:{en:'CUSTOM_ONLY',zh:'自訂條目'},sources:[]});
  const inactive=state.items[1];inactive.active=false;
  const output=await reports.buildFrameworkExcel(state,'TMSA','zh',undefined,{templateBytes:bytes});
  const saved=new ExcelJS.Workbook();await saved.xlsx.load(output as unknown as ExcelJS.Buffer);
  assert.equal(saved.worksheets.length,21);
  const sheet=saved.getWorksheet(first.sources[0].sheet!)!;
  const rows:ExcelJS.Row[]=[];sheet.eachRow(row=>{if(row.getCell(1).text===first.code)rows.push(row);});
  assert.ok(rows.length>2);
  const size=rows[0].getCell(2).font.size!;
  const planned=reports.splitExcelBiText(first.kpi,(sheet.getColumn(2).width!)*5.1-12,size,rows[0].getCell(2).font.name!,Math.floor((300-12)/(size*1.6)));
  assert.equal(planned.map(s=>s.en).join(''),first.kpi.en);
  assert.equal(planned.map(s=>s.zh).join(''),first.kpi.zh);
  assert.deepEqual(rows.slice(0,planned.length).map(row=>row.getCell(2).text),planned.map(s=>s.text));
  const seen=new Set<string>();for(const s of saved.worksheets)s.eachRow(r=>{if(r.getCell(1).text)seen.add(r.getCell(1).text);});
  assert.ok(seen.has('LOCAL-X'));assert.ok(!seen.has(inactive.code));
  for(const row of rows){assert.ok(row.height!<=409.5);for(let c=1;c<=7;c++)for(const side of ['left','right','top','bottom'] as const)assert.ok(row.getCell(c).border[side]?.style);}
  if(process.env.REPORT_QA_DIR){await writeFile(resolve(process.env.REPORT_QA_DIR,'framework-long-custom.xlsx'),output);await writeFile(resolve(process.env.REPORT_QA_DIR,'long-expectations.json'),JSON.stringify({sheets:saved.worksheets.map(s=>s.name),itemCodes:state.items.filter(i=>i.active).map(i=>i.code),required:['END_EN','中文結尾','CUSTOM_ONLY'],forbiddenCodes:[inactive.code],nativeTextBand:[70,250,300,880],segments:planned.map((s,index)=>({sheet:sheet.name,cell:`B${rows[index].number}`,text:s.text})),fullFields:[{en:first.kpi.en,zh:first.kpi.zh,enSegments:planned.map(s=>s.en),zhSegments:planned.map(s=>s.zh)}]}));}
});

test('public CJK font covers U+4E00 through U+9FEF without input normalization',async()=>{
  const fontBytes=new Uint8Array(await readFile('public/fonts/NotoSansTC-Regular.ttf'));
  const {PDFDocument}=await import('pdf-lib');const {default:fontkit}=await import('@pdf-lib/fontkit');
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(fontBytes,{subset:true});const supported=new Set(font.getCharacterSet());
  for(let code=0x4e00;code<=0x9fef;code++)assert.ok(supported.has(code),`Missing assigned basic CJK U+${code.toString(16)}`);
});

test('public CJK glyph locations are four-byte aligned for valid browser fontkit subsets',async()=>{
  const bytes=await readFile('public/fonts/NotoSansTC-Regular.ttf');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const tables=new Map<string,number>();for(let n=0;n<view.getUint16(4);n++){const row=12+n*16;tables.set(bytes.subarray(row,row+4).toString('ascii'),view.getUint32(row+8));}
  const format=view.getInt16(tables.get('head')!+50),count=view.getUint16(tables.get('maxp')!+4),loca=tables.get('loca')!;
  for(let glyph=0;glyph<=count;glyph++){const offset=format===0?view.getUint16(loca+glyph*2)*2:view.getUint32(loca+glyph*4);assert.equal(offset%4,0,`Unaligned CJK glyph ${glyph} corrupts fontkit short loca subsets`);}
});

test('selectable-text Chinese PDF emits complete explicit improvements and refuses empty or invalid IDs', async()=>{
  assert.equal(typeof reports.buildImprovementsPdf,'function','downloadable selectable-text PDF is not implemented');
  const {state}=await reportFixture();
  const issue={...base('qa-issue-1'),title:'明選改善測試',content:{en:'SELECTED_EN_BEGIN\n'+('Keep the complete finding and proposed action.\n'.repeat(70))+'SELECTED_EN_END',zh:'中文改善開始\n'+('保持完整改善事項與建議，不得截斷內容。\n'.repeat(70))+'中文改善結尾'},itemIds:[state.items[0].id],departmentIds:['qa-dept','qa-dept2'],assigneeIds:['qa-person'],source:'non_external' as const,urgency:'urgent' as const,status:'in_progress' as const,percent:50,targetDate:'2026-12-31',plan:'PLAN_FULL_MARKER',events:[{id:'qa-event-1',at:'2026-10-11T02:00:00Z',by:'qa-person',content:'FIRST_PROGRESS_MARKER 第一筆',status:'open' as const,percent:0},{id:'qa-event-2',at:'2026-10-11T03:00:00Z',by:'qa-person',content:'SECOND_PROGRESS_MARKER 第二筆',status:'in_progress' as const,percent:50}],closedAt:null,closedBy:null,sources:[{source:'synthetic source',rawItem:'1,1,1',note:'Literal malformed source token preserved'}]};
  state.improvements=[issue,{...issue,id:'qa-unselected',title:'UNSELECTED_SECRET',content:{en:'UNSELECTED_SECRET',zh:'不選取內容'}}];
  await assert.rejects(()=>reports.buildImprovementsPdf(state,[],'zh'));
  await assert.rejects(()=>reports.buildImprovementsPdf(state,['unavailable'],'zh'));
  const fontBytes=new Uint8Array(await readFile('public/fonts/NotoSansTC-Regular.ttf'));
  const output=await reports.buildImprovementsPdf(state,[issue.id],'zh',undefined,{fontBytes});
  assert.equal(new TextDecoder().decode(output.slice(0,5)),'%PDF-');
  const {PDFDocument}=await import('pdf-lib');
  const document=await PDFDocument.load(output);assert.ok(document.getPageCount()>1);
  if(process.env.REPORT_QA_DIR){await mkdir(process.env.REPORT_QA_DIR,{recursive:true});await writeFile(resolve(process.env.REPORT_QA_DIR,'improvements.pdf'),output);await writeFile(resolve(process.env.REPORT_QA_DIR,'pdf-expectations.json'),JSON.stringify({required:['明選改善測試','中文改善結尾','SELECTED_EN_END','PLAN_FULL_MARKER','FIRST_PROGRESS_MARKER','SECOND_PROGRESS_MARKER','1,1,1'],forbidden:['UNSELECTED_SECRET'],fullText:[issue.content.en,issue.content.zh],contentColumn:0,ratios:[1],layout:'content-bands',minimumBody:15,minimumOther:14}));}
});

test('inspection PDF preserves frozen inactive definitions and reports missing assessments rather than zero', async()=>{
  assert.equal(typeof reports.buildInspectionPdf,'function','frozen inspection report is not implemented');
  const {state}=await reportFixture();
  const frozenItem={...state.items[0],active:false,kpi:{en:'FROZEN_KPI_MARKER',zh:'凍結條文'}};
  const inspection:import('../src/types.ts').Inspection={...base('qa-inspection'),frameworkId:'TMSA' as const,title:'凍結檢查測試',organization:'QA organization',date:'2026-10-01',type:'formal' as const,status:'final' as const,snapshot:{framework:state.frameworks[0],chapters:[state.chapters[0]],items:[frozenItem],scoringVersion:'QA_FROZEN_SCORING_V1'},results:[],findings:[{id:'qa-finding',itemIds:[frozenItem.id],classification:'positive' as const,observation:{en:'FULL_POSITIVE_OBSERVATION',zh:'完整正面觀察'},recommendation:{en:'KEEP_POSITIVE_RECOMMENDATION',zh:'正面發現之建議也應完整保留'},sources:[]}],imported:true};
  const ungrouped={...frozenItem,id:'qa-ungrouped-frozen',code:'FROZEN-UNGROUPED',chapterId:'missing-frozen-chapter',active:true};
  inspection.snapshot.items.push(ungrouped);
  inspection.results=[{itemId:ungrouped.id,response:'no',reviewed:true,conformity:'partial',observation:{en:'UNGROUPED_OBSERVATION_FULL',zh:'無分章結果完整觀察'},recommendation:{en:'UNGROUPED_RECOMMENDATION_FULL',zh:'無分章結果完整建議'}}];
  state.inspections=[inspection];state.items[0].kpi={en:'CURRENT_KPI_MUST_NOT_APPEAR',zh:'不得混用目前條文'};
  const fontBytes=new Uint8Array(await readFile('public/fonts/NotoSansTC-Regular.ttf'));
  const output=await reports.buildInspectionPdf(state,inspection.id,'zh',{fontBytes});
  if(process.env.REPORT_QA_DIR){await writeFile(resolve(process.env.REPORT_QA_DIR,'inspection.pdf'),output);await writeFile(resolve(process.env.REPORT_QA_DIR,'inspection-expectations.json'),JSON.stringify({required:['FROZEN_KPI_MARKER','QA_FROZEN_SCORING_V1','KEEP_POSITIVE_RECOMMENDATION','未完整記分','UNGROUPED_OBSERVATION_FULL','UNGROUPED_RECOMMENDATION_FULL'],forbidden:['CURRENT_KPI_MUST_NOT_APPEAR'],minimumOther:14}));}
});

test('DRYBMS exports preserve analysis/source-gap labels and use shared conservative scoring',async()=>{
  const {state,bytes}=await reportFixture();
  const chapter={...state.chapters[0],id:'qa-dry-chapter',frameworkId:'DRYBMS' as const,code:'1'};
  state.frameworks=[{...state.frameworks[0],id:'DRYBMS',scoring:'drybms-guidance',scopeLabel:{en:'DRYBMS Guidance v1.1; analysis IDs are not official clauses',zh:'DRYBMS Guidance v1.1；分析索引非官方條款'}}];state.chapters=[chapter];
  state.items=[{...state.items[0],id:'qa-dry-item',frameworkId:'DRYBMS',chapterId:chapter.id,code:'DRY-ANALYSIS-001',analysisIndex:true,sourceGap:'DRY_QA_SOURCE_GAP',sourceOriginals:[{id:'qa-dry-original',kind:'suggested_objective_evidence',en:'FULL_SOURCE_ORIGINAL_MARKER',page:7}],sources:[]}];state.assessments=[];
  state.dryScores=[{...base('qa-dry-score'),chapterId:chapter.id,levels:[100,100,100,100],note:'QA'}];
  const {frameworkScore}=await import('../src/domain.ts');assert.equal(frameworkScore(state,'DRYBMS').rows[0].provisional,true);assert.notEqual(frameworkScore(state,'DRYBMS').score,4);
  const output=await reports.buildFrameworkExcel(state,'DRYBMS','en',undefined,{templateBytes:bytes});const book=new ExcelJS.Workbook();await book.xlsx.load(output as unknown as ExcelJS.Buffer);
  assert.equal(book.worksheets.length,1);const text=book.worksheets[0].getSheetValues().flat().join(' ');
  assert.ok(text.includes('NOT an official DRYBMS'));assert.ok(text.includes('DRY_QA_SOURCE_GAP'));assert.ok(text.includes('FULL_SOURCE_ORIGINAL_MARKER'));
  const fontBytes=new Uint8Array(await readFile('public/fonts/NotoSansTC-Regular.ttf'));
  const pdf=await reports.buildFrameworkPdf(state,'DRYBMS','en',undefined,{fontBytes});
  if(process.env.REPORT_QA_DIR){await writeFile(resolve(process.env.REPORT_QA_DIR,'drybms.xlsx'),output);await writeFile(resolve(process.env.REPORT_QA_DIR,'drybms.pdf'),pdf);await writeFile(resolve(process.env.REPORT_QA_DIR,'drybms-expectations.json'),JSON.stringify({required:['DRY-ANALYSIS-001','DRY_QA_SOURCE_GAP','FULL_SOURCE_ORIGINAL_MARKER','NOT an official DRYBMS'],forbidden:[],minimumOther:14}));}
});

test('authorization adapter uses returned server snapshot and rejects stale filter selection (unit seam, not provider acceptance)',async()=>{
  const {state}=await reportFixture();const server=structuredClone(state);server.snapshotToken='SERVER_RETURNED_SNAPSHOT';server.assessments[0].selfAssessment={en:'SERVER_ONLY',zh:'僅伺服器值'};
  const sent:unknown[]=[];
  const ctx={state,user:state.people[0],t:(zh:string)=>zh,api:{authorizeExport:async(request:unknown)=>{sent.push(request);return server;}}} as unknown as import('../src/types.ts').PageProps;
  const request={format:'pdf' as const,kind:'framework' as const,ids:[state.chapters[0].id],frameworkId:'TMSA' as const,filters:{chapterIds:[state.chapters[0].id]}};
  const result=await reports.authorizeReportSnapshot(ctx,request);assert.equal(result,server);assert.notEqual(result,state);
  assert.deepEqual(sent,[{...request,snapshotToken:state.snapshotToken}]);
  await assert.rejects(()=>reports.authorizeReportSnapshot(ctx,{format:'pdf',kind:'improvements',ids:[],filters:{}}));assert.equal(sent.length,1);
  state.improvements=[{...base('qa-unit-selected'),title:'Synthetic filtered selection',content:{en:'Synthetic',zh:'合成'},itemIds:[state.items[0].id],departmentIds:['qa-dept'],assigneeIds:['qa-person'],source:'non_external',urgency:'low',status:'open',percent:0,targetDate:'',plan:'',events:[],closedAt:null,closedBy:null,sources:[]}];
  await assert.rejects(()=>reports.authorizeReportSnapshot(ctx,{format:'pdf',kind:'improvements',ids:['qa-unit-selected'],filters:{status:'closed'}}),/scope|篩選/);assert.equal(sent.length,1);
  await assert.rejects(()=>reports.authorizeReportSnapshot(ctx,{format:'pdf',kind:'improvements',ids:['qa-unit-selected'],filters:{status:'open'}}),/scope|篩選/);assert.equal(sent.length,2,'Canonical snapshot without the selected record must still reject');
  const denied={...ctx,user:{...state.people[0],role:'vessel' as const}};
  await assert.rejects(()=>reports.authorizeReportSnapshot(denied,request),/權限|permit/);assert.equal(sent.length,2);
});

test('overview PDF uses complete chapter score and discloses source gaps',async()=>{
  assert.equal(typeof reports.buildOverviewPdf,'function','overview report is not implemented');
  const {state}=await reportFixture();state.items[0].sourceGap='QA_SOURCE_GAP';
  const fontBytes=new Uint8Array(await readFile('public/fonts/NotoSansTC-Regular.ttf'));
  const output=await reports.buildOverviewPdf(state,'TMSA','zh',[state.chapters[0].id],{fontBytes});
  const {PDFDocument}=await import('pdf-lib');assert.ok((await PDFDocument.load(output)).getPageCount());
  if(process.env.REPORT_QA_DIR){await writeFile(resolve(process.env.REPORT_QA_DIR,'overview.pdf'),output);await writeFile(resolve(process.env.REPORT_QA_DIR,'overview-expectations.json'),JSON.stringify({required:['QA_SOURCE_GAP','暫估','完整'],forbidden:[],minimumOther:14}));}
});
