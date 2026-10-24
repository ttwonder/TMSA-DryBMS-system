import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {buildFrameworkExcel,buildFrameworkPdf} from '../src/reports.ts';
import {buildPrintReport} from '../src/useReportPrint.ts';
import {reportingFixture} from './fpmc-reporting-fixture.ts';
import {encodeRichText,richTextToPlainText} from '../src/richText.ts';
const templateBytes=new Uint8Array(readFileSync('public/templates/tmsa-template.xlsx'));
function fixture(){const s=reportingFixture(),i=s.items[0],a=s.assessments.find(a=>a.itemId===i.id)!;s.items=[i];i.kpi={en:'SHORT_KPI',zh:'短指標'};i.guidance={en:'SHORT_GUIDANCE',zh:'短指引'};a.selfAssessment={en:Array.from({length:24},(_,n)=>'SPLIT_EN_'+String(n).padStart(2,'0')).join('\n'),zh:Array.from({length:24},(_,n)=>'SPLIT_ZH_'+String(n).padStart(2,'0')+' 中文').join('\n')};return {s,i,a};}
async function sheet(s:ReturnType<typeof reportingFixture>){const b=new ExcelJS.Workbook();await b.xlsx.load(await buildFrameworkExcel(s,'TMSA','en',[s.items[0].chapterId],{templateBytes}) as unknown as ExcelJS.Buffer);return b.worksheets[0];}
test('self-assessment languages occupy equal original-width cells in one sortable 12pt Item row',async()=>{
 const {s,a}=fixture();a.selfAssessment.en=encodeRichText({text:a.selfAssessment.en,spans:[{start:0,end:11,bold:true,color:'blue'}],lists:[]});
 const sh=await sheet(s);assert.equal(sh.getCell('E3').text,richTextToPlainText(a.selfAssessment.en));assert.equal(sh.getCell('F3').text,a.selfAssessment.zh);
 assert.deepEqual(sh.columns.map(c=>c.width),[7.86328125,23.796875,58.265625,4.1328125,58.265625,58.265625,37.265625,7.73046875]);assert.equal(sh.autoFilter,'A2:H3');assert.equal(sh.pageSetup.printArea,'A1:H3');assert.equal(sh.rowCount,3);assert(!sh.getCell('E3').isMerged&&!sh.getCell('F3').isMerged);
 for(const c of ['E3','F3'])assert.equal(sh.getCell(c).font.size,12);assert(sh.getRow(3).height!<409.5);
 const value=sh.getCell('E3').value as ExcelJS.CellRichTextValue;assert(value.richText.some(r=>r.font?.bold&&r.font.color?.argb==='FF1565C0'));assert.equal(sh.getCell('G3').font.color?.argb,'FFFF0000');assert.equal(sh.getCell('H3').alignment.horizontal,'center');
 assert.match(sh.getCell('E2').text,/2026.*English Self Assessment\n英文自評/);assert.match(sh.getCell('F2').text,/2026.*Chinese Self Assessment\n中文自評/);
});
test('simple and complete PDF self-assessments stay paired with independent language streams even when tall',async()=>{
 const {s,i,a}=fixture();a.selfAssessment.en='LONG_EN '.repeat(450)+'EN_END';a.selfAssessment.zh='中文自評唯一尾段';
 const request={kind:'framework',format:'pdf',frameworkId:'TMSA',ids:[i.chapterId] as string[]} as const;
 const simple=await buildPrintReport(s,request,'en');const body=/<tbody><tr>([\s\S]*?)<\/tr><\/tbody>/.exec(simple)![1];const cells=[...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m=>m[1]);assert.equal(cells.length,8);assert(cells[4].includes('EN_END')&&!cells[4].includes(a.selfAssessment.zh));assert(cells[5].includes(a.selfAssessment.zh)&&!cells[5].includes('LONG_EN'));
 const cols=[...simple.matchAll(/<col style="width:([^%]+)%">/g)].map(m=>m[1]);assert.equal(cols[4],cols[5]);
 const html=await buildPrintReport(s,{...request,filters:{reportVariant:'complete'}},'en');const pair=[...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m=>m[1]).find(row=>row.includes('English Self Assessment')&&row.includes('Chinese Self Assessment'));assert(pair,'complete self-assessment must remain one logical row');assert.equal((pair.match(/<td>/g)??[]).length,2);assert.match(html,/<table class="grouped parallel-assessments"><colgroup><col style="width:50%"><col style="width:50%">/);assert(pair.includes('EN_END')&&pair.includes(a.selfAssessment.zh));
 const lines:{fieldId:string;page:number;x:number;baseline:number;width:number;size:number}[]=[];
 await buildFrameworkPdf(s,'TMSA','en',[i.chapterId],{reportVariant:'complete',fontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf')),fallbackFontBytes:['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(f=>new Uint8Array(readFileSync('public/fonts/'+f))),onFieldLine:line=>lines.push(line)});
 const left=lines.find(l=>/^framework-complete:.*:4:0:0$/.test(l.fieldId))!,right=lines.find(l=>/^framework-complete:.*:4:0:1$/.test(l.fieldId))!;assert(left&&right);assert.equal(left.page,right.page);assert.equal(left.baseline,right.baseline);assert.equal(left.width,right.width);assert(right.x>left.x);assert.equal(left.size,12);
});
test('empty languages never fall back and each language has its own Excel character capacity',async()=>{
 const {s,i,a}=fixture();
 for(const [en,zh] of [['EN_ONLY',''],['','只有中文'],['','']]){a.selfAssessment={en,zh};const sh=await sheet(s);assert.equal(sh.getCell('E3').text,en);assert.equal(sh.getCell('F3').text,zh);}
 a.selfAssessment={en:'e\n'.repeat(16000)+'E',zh:'中\n'.repeat(16000)+'末'};const sh=await sheet(s);assert.equal(sh.getCell('E3').text,a.selfAssessment.en);assert.equal(sh.getCell('F3').text,a.selfAssessment.zh);
 for(const language of ['en','zh'] as const){a.selfAssessment={en:'',zh:''};a.selfAssessment[language]='x'.repeat(32768);await assert.rejects(()=>sheet(s),/32767.*column [56]/);}
 s.assessments=[];const empty=await sheet(s);assert.equal(empty.getCell('E3').text,'');assert.equal(empty.getCell('F3').text,'');
 const html=await buildPrintReport(s,{kind:'framework',format:'pdf',frameworkId:'TMSA',ids:[i.chapterId],filters:{reportVariant:'complete'}},'en');assert(!html.includes('EN_ONLY'));const pair=[...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m=>m[1]).find(row=>row.includes('English Self Assessment'));assert(pair&&!pair.includes('—'),'missing languages remain empty, not generated fallback');
});
