import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {PlatformState,Assessment} from '../src/types.ts';
import {DEFAULT_PERMISSIONS,frameworkScore} from '../src/domain.ts';
import {REMARKS_STATUSES,hasItemRemarks} from '../src/itemRemarks.ts';
import {describeAudit} from '../src/auditChanges.ts';
import * as reports from '../src/reports.ts';
const base=(id:string)=>({id,version:1,createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z',updatedBy:'tester'});
const bi=(s:string)=>({en:s,zh:'測試 '+s});
export function remarksFixture():PlatformState {
 const frameworks=(['TMSA','DRYBMS'] as const).map(id=>({...base(id),id,name:bi(id),description:bi('Synthetic'),scoring:id==='TMSA'?'tmsa-stage' as const:'drybms-guidance' as const,active:true,sourceVersion:'qa',scopeLabel:bi('Synthetic')}));
 const chapters=frameworks.flatMap(f=>[1,2].map(n=>({...base(`${f.id}-c${n}`),frameworkId:f.id,code:String(n),name:bi(`CHAPTER_${n}`),order:n,active:true})));
 const items=chapters.flatMap(ch=>Array.from({length:8},(_,n)=>({...base(ch.id+'-i'+n),frameworkId:ch.frameworkId,chapterId:ch.id,code:`${ch.frameworkId}-${ch.code}.${n+1}`,level:1,order:n,active:n!==7,kpi:bi('DO_NOT_EXPORT_KPI'),guidance:bi('DO_NOT_EXPORT_GUIDANCE'),departmentIds:[],sources:[]})));
 const assessments:Assessment[]=items.map((i,n)=>({...base('a-'+i.id),itemId:i.id,response:'no',conformity:'partial',reviewed:false,selfAssessment:bi('DO_NOT_EXPORT_SELF_ASSESSMENT'),evidence:bi('DO_NOT_EXPORT_EVIDENCE'),departmentIds:[],assigneeIds:[],executionStatus:'not_started',sources:[],note:bi('DO_NOT_EXPORT_SOURCE_NOTE'),...(n%8<5?{remarksStatus:REMARKS_STATUSES[n%8].value,remarks:n%8===0?'FULLY_NOTE_'+i.code:`NOTE_${i.code}\n  Keep whitespace.\n尾行。`}:n%8===5?{remarks:' \n\t ',remarksStatus:''}:n%8===6?{remarks:'TEXT_ONLY_'+i.code}:{remarks:'INACTIVE_HIDDEN'})}));
 return {frameworks,chapters,items,assessments,improvements:[],inspections:[],people:[],dryScores:[],auditLogs:[],cycles:[],provenance:[],serverTime:'2026-10-20T00:00:00Z',snapshotToken:'synthetic-remarks-token',settings:{...base('settings'),departments:[],rolePermissions:DEFAULT_PERMISSIONS,siteGateConfigured:false}};
}
const luminance=(hex:string)=>{const rgb=hex.match(/[0-9a-f]{2}/gi)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
test('five exact independent status labels, contrasting distinct colours, no scoring change',()=>{
 assert.deepEqual(REMARKS_STATUSES.map(s=>s.zh),['完全符合','部分符合可完善','部分符合近期無法完善','不符合可完善','不符合近期無法完善']);assert.equal(new Set(REMARKS_STATUSES.map(s=>s.background)).size,5);
 const state=remarksFixture(),score=frameworkScore(state,'TMSA');for(const s of REMARKS_STATUSES){assert((luminance(s.background)+.05)/(luminance(s.color)+.05)>=4.5);state.assessments[0].remarksStatus=s.value;assert.deepEqual(frameworkScore(state,'TMSA'),score);}
});
test('only nonblank manual text selects an export row; status-only and source note do not',()=>{
 const a=remarksFixture().assessments[0];assert(!hasItemRemarks({...a,remarks:''}));assert(hasItemRemarks({...a,remarksStatus:'',remarks:'  text  '}));assert(!hasItemRemarks({...a,remarksStatus:'',remarks:' \n\t '}));assert(!hasItemRemarks(undefined));
});
test('remark report selection is framework/chapter/active scoped, ordered, and never empty-means-all',()=>{
 assert.equal(typeof reports.selectedRemarkRows,'function','Remark-only selector is not implemented');const s=remarksFixture(),original=JSON.stringify(s);
 const rows=reports.selectedRemarkRows(s,'TMSA',['TMSA-c1']);assert.deepEqual(rows.map(r=>r.item.code),['TMSA-1.1','TMSA-1.2','TMSA-1.3','TMSA-1.4','TMSA-1.5','TMSA-1.7']);assert.equal(rows[0].assessment.remarks,'FULLY_NOTE_TMSA-1.1');assert.equal(rows[5].assessment.remarksStatus,undefined);
 for(const ids of [[],['DRYBMS-c1'],['TMSA-c1','TMSA-c1'],['missing']])assert.throws(()=>reports.selectedRemarkRows(s,'TMSA',ids));assert.equal(JSON.stringify(s),original);
});
test('audit shows exact independent remarks status and text, without inventing assessment changes',()=>{
 const before=remarksFixture().assessments[0],after={...before,remarks:'New manual text',remarksStatus:'not_met_blocked' as const};const d=describeAudit({id:'log',at:base('').updatedAt,actorId:'tester',actorName:'QA',action:'update',kind:'assessment',entityId:before.id,itemCodes:[],summary:'update assessment',before,after,operationId:'qa'},'zh',remarksFixture());assert.deepEqual(d.changes.map(c=>JSON.parse(c.path)[0]).sort(),['remarks','remarksStatus']);assert(d.changes.some(c=>c.after==='不符合近期無法完善'));
});
for(const framework of ['TMSA','DRYBMS'] as const)test(`${framework} actual XLSX has only manual remarks, exact statuses, cell colours and long text continuations`,async()=>{
 assert.equal(typeof reports.buildRemarksExcel,'function','Remark-only Excel builder is not implemented');const s=remarksFixture(),first=s.assessments.find(a=>a.itemId===`${framework}-c1-i1`)!;first.remarks='=SUM(1,1)\n'+Array.from({length:90},(_,i)=>`LINE_${i} 中英文完整內容，不可截斷。\n`).join('')+'END_LONG';const original=JSON.stringify(s);
 const bytes=await reports.buildRemarksExcel(s,framework,'zh',[`${framework}-c1`]);const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);assert.equal(book.worksheets.length,1);const sheet=book.worksheets[0],rows:ExcelJS.Row[]=[];sheet.eachRow(r=>{if(r.number>4)rows.push(r);});
 assert.deepEqual([...new Set(rows.map(r=>r.getCell(2).text))],['1','2','3','4','5','7'].map(x=>`${framework}-1.${x}`));const long=rows.filter(r=>r.getCell(2).text===`${framework}-1.2`);assert(long.length>1);assert.equal(long.map(r=>r.getCell(6).text).join(''),first.remarks);
 for(const status of REMARKS_STATUSES){const r=rows.find(r=>r.getCell(3).text===status.zh)!;assert(r);assert.equal((r.getCell(3).fill as ExcelJS.FillPattern).fgColor?.argb,'FF'+status.background.slice(1));assert.equal(r.getCell(3).font.color?.argb,'FF'+status.color.slice(1));}
 for(const r of rows){assert(r.height!<=409.5);for(let c=1;c<=6;c++){assert.equal(r.getCell(c).type,ExcelJS.ValueType.String);assert(r.getCell(c).alignment.wrapText);assert(r.getCell(c).border.bottom?.style);}}
 assert(!JSON.stringify(sheet.model).includes('DO_NOT_EXPORT_'));assert.equal(JSON.stringify(s),original);if(process.env.REMARKS_QA_DIR){mkdirSync(process.env.REMARKS_QA_DIR,{recursive:true});writeFileSync(resolve(process.env.REMARKS_QA_DIR,framework+'-remarks.xlsx'),bytes);writeFileSync(resolve(process.env.REMARKS_QA_DIR,framework+'-fixture.json'),JSON.stringify(s));}
});
test('actual remarks PDF builder uses complete text and fails closed for an empty cohort',async()=>{
 assert.equal(typeof reports.buildRemarksPdf,'function','Remark-only PDF builder is not implemented');const state=remarksFixture(),options={fontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf')),fallbackFontBytes:['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(n=>new Uint8Array(readFileSync('public/fonts/'+n)))};
 state.assessments[1].remarks=Array.from({length:60},(_,i)=>`PDF_LINE_${i} 中文備註完整保留。`).join('\n')+'\nEND_PDF';
 const bytes=await reports.buildRemarksPdf(state,'TMSA','zh',['TMSA-c1'],options);assert.equal(Buffer.from(bytes.slice(0,5)).toString(),'%PDF-');assert(bytes.length>10000);if(process.env.REMARKS_QA_DIR){mkdirSync(process.env.REMARKS_QA_DIR,{recursive:true});writeFileSync(resolve(process.env.REMARKS_QA_DIR,'TMSA-remarks.pdf'),bytes);writeFileSync(resolve(process.env.REMARKS_QA_DIR,'pdf-fixture.json'),JSON.stringify(state));}
 state.assessments.forEach(a=>{a.remarks='';a.remarksStatus='';});await assert.rejects(()=>reports.buildRemarksPdf(state,'TMSA','zh',['TMSA-c1'],options),/No remarks|沒有.*備註/);await assert.rejects(()=>reports.buildRemarksExcel(state,'TMSA','zh',['TMSA-c1']),/No remarks|沒有.*備註/);
});
