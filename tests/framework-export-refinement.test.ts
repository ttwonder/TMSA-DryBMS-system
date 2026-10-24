import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {buildFrameworkExcel,bilingual} from '../src/reports.ts';
import {reportingFixture} from './fpmc-reporting-fixture.ts';
import {buildPrintReport} from '../src/useReportPrint.ts';
const templateBytes=new Uint8Array(readFileSync('public/templates/tmsa-template.xlsx'));
test('framework print: simple continuous table; complete variant retains remarks and GM excludes restricted blocks',async()=>{
 const s=reportingFixture(),req={kind:'framework',format:'pdf',frameworkId:'TMSA',ids:['chapter-TMSA'] as string[]} as const;
 const simple=await buildPrintReport(s,req,'en');assert.match(simple,/<table class="framework-simple">/);assert(!simple.includes('REMARKS_'));assert(!simple.includes('Reviewed:'));
 const full=await buildPrintReport(s,{...req,filters:{reportVariant:'complete'}},'en');assert(full.includes('REMARKS_'));assert(full.includes('Remarks status'));assert(full.includes('Level'));
 const gm=await buildPrintReport({...s,viewScope:'management_viewer'},{...req,filters:{reportVariant:'complete'}},'en');assert(!gm.includes('REMARKS_'));assert(!gm.includes('Remarks status'));assert(!gm.includes('Open improvements'));
});
test('DRY custom same-code rows preserve stable-ID associations and item order in both builders',async()=>{
 const s=reportingFixture(),original=s.items.find(i=>i.frameworkId==='DRYBMS')!,assessment=s.assessments.find(a=>a.itemId===original.id)!;
 s.items=[{...original,id:'same-second',code:'SAME',order:2,kpi:{en:'SECOND_KPI',zh:''}},{...original,id:'same-first',code:'SAME',order:1,kpi:{en:'FIRST_KPI',zh:''}},{...original,id:'same-inactive',code:'SAME',order:0,active:false,kpi:{en:'INACTIVE_KPI',zh:''}}];
 s.assessments=[{...assessment,id:'first-a',itemId:'same-first',response:'yes',conformity:'all',selfAssessment:{en:'FIRST_CURRENT',zh:''}},{...assessment,id:'second-a',itemId:'same-second',selfAssessment:{en:'SECOND_CURRENT',zh:''}}];
 const bytes=await buildFrameworkExcel(s,'DRYBMS','en',[original.chapterId],{templateBytes});const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);const sh=book.worksheets[0];assert.equal(sh.getCell('A3').text,'SAME');assert.equal(sh.getCell('A4').text,'SAME');assert.equal(sh.getCell('B3').text,'FIRST_KPI');assert.equal(sh.getCell('E3').text,'FIRST_CURRENT');assert.equal(sh.getCell('B4').text,'SECOND_KPI');assert.equal(sh.getCell('E4').text,'SECOND_CURRENT');assert.equal(sh.autoFilter,'A2:H4');
 const html=await buildPrintReport(s,{kind:'framework',format:'pdf',frameworkId:'DRYBMS',ids:[original.chapterId]},'en');assert(html.indexOf('FIRST_KPI')<html.indexOf('SECOND_KPI'));assert(html.includes('FIRST_CURRENT')&&html.includes('SECOND_CURRENT'));assert(!html.includes('INACTIVE_KPI'));
});
test('complete print variant is not the simple projection',async()=>{const s=reportingFixture();const html=await buildPrintReport(s,{kind:'framework',format:'pdf',frameworkId:'TMSA',ids:['chapter-TMSA'],filters:{reportVariant:'complete'}},'en');assert(html.includes('REMARKS_'));});
test('English complete PDF department filter explanation uses Chinese canonical labels',async()=>{
 const s=reportingFixture(),i=s.items.find(i=>i.frameworkId==='TMSA')!,a=s.assessments.find(a=>a.itemId===i.id)!,department=s.settings.departments[0];
 department.name={en:'English Department',zh:'中文部門'};a.departmentIds=[department.id];
 const html=await buildPrintReport(s,{kind:'framework',format:'pdf',frameworkId:'TMSA',ids:[i.chapterId],filters:{reportVariant:'complete',departmentIds:[department.id]}},'en');
 assert(html.includes('Department filter: 中文部門.'));assert(!html.includes('Department filter: English Department.'));
});
test('framework tall cells shrink locally, retain full text, warn and refuse the physical character limit',async()=>{
 const s=reportingFixture(),i=s.items[0];s.items=[i];i.guidance={en:Array.from({length:28},(_,n)=>'LINE_'+n).join('\n'),zh:''};let warning='';
 let b=new ExcelJS.Workbook();await b.xlsx.load(await buildFrameworkExcel(s,'TMSA','en',[i.chapterId],{templateBytes,onWarning:m=>warning=m}) as unknown as ExcelJS.Buffer);assert.equal(b.worksheets[0].getCell('C3').text,i.guidance.en);assert(b.worksheets[0].getCell('C3').font.size!<12);assert.equal(b.worksheets[0].getCell('B3').font.size,12);assert.equal(warning,'');
 i.guidance.en='LONG\n'.repeat(100)+'END';b=new ExcelJS.Workbook();await b.xlsx.load(await buildFrameworkExcel(s,'TMSA','en',[i.chapterId],{templateBytes,onWarning:m=>warning=m}) as unknown as ExcelJS.Buffer);assert.equal(b.worksheets[0].getCell('C3').text,i.guidance.en);assert.equal(b.worksheets[0].getRow(3).height,409.5);assert(warning.includes(i.code)&&warning.includes('PDF'));
 i.guidance.en='x'.repeat(32768);await assert.rejects(()=>buildFrameworkExcel(s,'TMSA','en',[i.chapterId],{templateBytes}),/32767.*1.1.1/);
});
test('framework reference: eight columns at row 2, current-only content and one complete Item per row',async()=>{
 const s=reportingFixture(),item=s.items.find(i=>i.frameworkId==='TMSA')!,a=s.assessments.find(a=>a.itemId===item.id)!;
 s.items=[item];item.guidance={en:'COMPLETE_GUIDANCE',zh:'完整指引'};a.response='no';a.departmentIds=[];
 a.selfAssessment={en:'CURRENT_ONLY',zh:'目前自評'};a.note={en:'EXCLUDED_NOTE',zh:'不應列出'};
 const b=new ExcelJS.Workbook();await b.xlsx.load(await buildFrameworkExcel(s,'TMSA','en',[item.chapterId],{templateBytes}) as unknown as ExcelJS.Buffer);const sh=b.worksheets[0];
 assert.equal(sh.getCell('A2').text,'Item');assert.equal(sh.getCell('A3').text,item.code);assert.equal(sh.rowCount,3);
 assert.equal(sh.getCell('C3').text,bilingual(item.guidance));assert.equal(sh.getCell('E3').text,a.selfAssessment.en);assert.equal(sh.getCell('F3').text,a.selfAssessment.zh);assert.equal(sh.getCell('H3').text,'');
 assert.equal(sh.getCell('D3').font.color?.argb,'FF9C0006');assert.equal(sh.getCell('E3').font.size,12);
 assert(sh.getCell('F1').value instanceof Date);assert.equal(sh.autoFilter,'A2:H3');assert('ySplit' in sh.views[0]&&sh.views[0].ySplit===2);
});
