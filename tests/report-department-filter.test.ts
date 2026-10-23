import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {buildFrameworkExcel,buildFrameworkPdf,selectedFrameworkItems,selectedRemarkRows,authorizeReportSnapshot,type ReportBuildOptions} from '../src/reports.ts';
import {reportingFixture} from './fpmc-reporting-fixture.ts';
import type {PageProps} from '../src/types.ts';
function fixture(){
 const s=reportingFixture();s.improvements=[];s.inspections=[];
 const item=s.items[0],assessment=s.assessments[0];
 s.chapters.push({...s.chapters[0],id:'chapter-second',code:'2',order:2});
 s.items=[...s.items,...[['tech','1.1.2',['marine']],['empty','1.1.3',['marine']],['both','1.1.4',['tech']],['fallback','1.1.5',['tech']],['second','2.1.1',['marine']]].map(([id,code,depts])=>({...item,id:String(id),code:String(code),chapterId:id==='second'?'chapter-second':item.chapterId,departmentIds:depts as string[]}))];
 s.assessments[0]={...assessment,departmentIds:['marine']};
 for(const [id,depts] of [['tech',['tech']],['empty',[]],['both',['marine','tech']],['second',['marine']]] as const)s.assessments.push({...assessment,id:'assessment-'+id,itemId:id,departmentIds:[...depts],remarks:'Remark '+id});
 return s;
}
test('original remarks selector intersects chapters with OR departments and saved assignments',()=>{
 const s=fixture(),before=JSON.stringify(s),select=(deps:string[],chapters=['chapter-TMSA'])=>selectedRemarkRows(s,'TMSA',chapters,deps).map(r=>r.item.id).sort();
 assert.deepEqual(select(['marine']),['both','item-a']);
 assert.deepEqual(select(['tech']),['both','tech']);
 assert.deepEqual(select(['marine','tech']),['both','item-a','tech']);
 assert.deepEqual(select(['marine'],['chapter-second']),['second']);
 assert.deepEqual(select([]),['both','empty','item-a','tech']);
 assert.equal(JSON.stringify(s),before);
});
test('original framework XLSX contains only matching item codes, including definition fallback',async()=>{
 const s=fixture(),before=JSON.stringify(s),options:ReportBuildOptions={templateBytes:new Uint8Array(readFileSync('public/templates/tmsa-template.xlsx')),departmentIds:['tech']};
 const bytes=await buildFrameworkExcel(s,'TMSA','zh',['chapter-TMSA'],options),book=new ExcelJS.Workbook();await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
 const codes=new Set<string>();for(const sheet of book.worksheets)sheet.eachRow(r=>{if(/^\d+\.\d+\.\d+$/.test(r.getCell(1).text))codes.add(r.getCell(1).text);});
 assert.deepEqual([...codes].sort(),['1.1.2','1.1.4','1.1.5']);assert.equal(JSON.stringify(s),before);
});
test('invalid report department never becomes an unrestricted report',async()=>{
 const s=fixture();let called=0;const ctx={state:s,user:s.people[0],t:(z:string)=>z,api:{authorizeExport:async()=>{called++;return s;}}} as unknown as PageProps;
 await assert.rejects(()=>authorizeReportSnapshot(ctx,{format:'xlsx',kind:'framework',frameworkId:'TMSA',ids:['chapter-TMSA'],filters:{departmentIds:['missing-department']}}),/部門|department/i);assert.equal(called,0);
});

for(const format of ['xlsx','pdf'] as const){
 test(`R1 ${format} framework empty departments and valid empty chapter reject before authorization`,async()=>{
  const s=fixture();s.chapters.push({...s.chapters[0],id:'chapter-empty',code:'3',order:3});let calls=0;
  const ctx={state:s,user:s.people[0],t:(z:string)=>z,api:{authorizeExport:async()=>{calls++;return s;}}} as unknown as PageProps;
  await assert.rejects(()=>authorizeReportSnapshot(ctx,{format,kind:'framework',frameworkId:'TMSA',ids:['chapter-empty'],filters:{departmentIds:[]}}),/No items match/);
  assert.equal(calls,0);
 });
 test(`R1 ${format} framework empty departments rechecks canonical active items after one call`,async()=>{
  const s=fixture(),canonical=structuredClone(s);for(const item of canonical.items)if(item.chapterId==='chapter-TMSA')item.active=false;let calls=0;
  const ctx={state:s,user:s.people[0],t:(z:string)=>z,api:{authorizeExport:async()=>{calls++;return canonical;}}} as unknown as PageProps;
  await assert.rejects(()=>authorizeReportSnapshot(ctx,{format,kind:'framework',frameworkId:'TMSA',ids:['chapter-TMSA'],filters:{departmentIds:[]}}),/No items match/);
  assert.equal(calls,1);
 });
 test(`R1 ${format} direct framework builder rejects empty active item set before real assets`,async()=>{
  const s=fixture();for(const item of s.items)if(item.chapterId==='chapter-TMSA')item.active=false;
  const bytes=(p:string)=>new Uint8Array(readFileSync('public/'+p));let assetReads=0;
  const options:ReportBuildOptions={departmentIds:[],get templateBytes(){assetReads++;return bytes('templates/tmsa-template.xlsx');},get fontBytes(){assetReads++;return bytes('fonts/NotoSansTC-Regular.ttf');},fallbackFontBytes:['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(n=>bytes('fonts/'+n))};
  const build=format==='xlsx'?buildFrameworkExcel:buildFrameworkPdf;
  await assert.rejects(()=>build(s,'TMSA','zh',['chapter-TMSA'],options),/No items match/);
  assert.equal(assetReads,0,'empty framework must reject before loading workbook/font assets');
 });
 test(`R1 ${format} empty departments still authorizes and builds all matching items`,async()=>{
  const s=fixture();let calls=0;
  const ctx={state:s,user:s.people[0],t:(z:string)=>z,api:{authorizeExport:async()=>{calls++;return s;}}} as unknown as PageProps;
  const canonical=await authorizeReportSnapshot(ctx,{format,kind:'framework',frameworkId:'TMSA',ids:['chapter-TMSA'],filters:{departmentIds:[]}});
  assert.equal(calls,1);assert.deepEqual(selectedFrameworkItems(canonical,'TMSA',['chapter-TMSA'],[]).map(i=>i.id).sort(),['both','empty','fallback','item-a','tech']);
  const options:ReportBuildOptions={departmentIds:[],templateBytes:new Uint8Array(readFileSync('public/templates/tmsa-template.xlsx')),fontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf')),fallbackFontBytes:['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(n=>new Uint8Array(readFileSync('public/fonts/'+n)))};
  assert((await (format==='xlsx'?buildFrameworkExcel:buildFrameworkPdf)(canonical,'TMSA','zh',['chapter-TMSA'],options)).length>0);
 });
}
test('R1 overview retains valid empty-chapter authorization without framework item guard',async()=>{
 const s=fixture();s.items=[];let calls=0;
 const ctx={state:s,user:s.people[0],t:(z:string)=>z,api:{authorizeExport:async()=>{calls++;return s;}}} as unknown as PageProps;
 assert.equal(await authorizeReportSnapshot(ctx,{format:'pdf',kind:'overview',frameworkId:'TMSA',ids:['chapter-TMSA'],filters:{}}),s);assert.equal(calls,1);
});
