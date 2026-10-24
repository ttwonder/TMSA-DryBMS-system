import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import * as reports from '../src/reports.ts';
import {reportingFixture} from './fpmc-reporting-fixture.ts';
import {compactBlankLines} from '../src/standardText.ts';
import type {PageProps} from '../src/types.ts';
test('report authorization rechecks shared source/proposal cohort on canonical data',async()=>{
 const state=reportingFixture(),server=structuredClone(state);server.improvements[0].proposedDate='2026-03-01';let calls=0;
 const ctx={state,user:state.people[0],t:(s:string)=>s,api:{authorizeExport:async()=>{calls++;return server;}}} as unknown as PageProps;
 await assert.rejects(()=>reports.authorizeReportSnapshot(ctx,{format:'xlsx',kind:'improvements',ids:[state.improvements[0].id],filters:{source:'management_review',proposedFrom:'2026-02-28',proposedTo:'2026-02-28'}}),/scope|篩選/);assert.equal(calls,1);
 await assert.rejects(()=>reports.authorizeReportSnapshot(ctx,{format:'pdf',kind:'improvements',ids:[state.improvements[1].id],filters:{source:'management_review'}}),/scope|篩選/);assert.equal(calls,1);
});
test('remarks workbook includes authoritative assignments and full sortable continuations',async()=>{
 const state=reportingFixture(true),before=JSON.stringify(state),bytes=await reports.buildRemarksExcel(state,'TMSA','zh',['chapter-TMSA']);const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);const sheet=book.worksheets[0];
 assert.deepEqual((sheet.getRow(4).values as string[]).slice(1),['對應章節','Item','備註狀態','涉及部門','追蹤人員','完整備註']);
 let full='';sheet.eachRow(row=>{if(row.number<=4)return;assert.equal(row.getCell(2).text,'1.1.1');assert.equal(row.getCell(4).text,'海務 / 工務');assert.equal(row.getCell(5).text,'測試 Owner / 停用歷史姓名');full+=row.getCell(6).text.replace(/^\[\d+\/\d+\]\n/,'');assert(row.height!<=409.5);});assert.equal(full,compactBlankLines(state.assessments[0].remarks!));assert.equal(JSON.stringify(state),before);
});
test('remarks PDF full-width narrative instead of a narrow fourth column',async()=>{
 const state=reportingFixture(),lines:reports.ReportFieldLine[]=[];await reports.buildRemarksPdf(state,'TMSA','zh',['chapter-TMSA'],{fontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf')),fallbackFontBytes:['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(n=>new Uint8Array(readFileSync('public/fonts/'+n))),onFieldLine:l=>lines.push(l)});
 assert(lines.some(l=>l.fieldId.startsWith('remarks:')&&l.width>1000),'Remarks must span full width in third logical row');
});
test('improvement register roundtrips >32767 narrative, all progress, true dates and sortable metadata',async()=>{
 const state=reportingFixture(true);state.improvements[0].content.en='LONG_BEGIN\n\n'+('  1. Complete English 中文 → CO₂ •\n'.repeat(1500))+'LONG_END';state.improvements[1].proposedDate='';
 const before=JSON.stringify(state),ids=state.improvements.map(r=>r.id),book=new ExcelJS.Workbook();await book.xlsx.load(await reports.buildImprovementsExcel(state,ids,'zh') as unknown as ExcelJS.Buffer);const main=book.worksheets[0],events=book.worksheets[1];
 assert.deepEqual(book.worksheets.map(s=>s.name),['改善項目','全部進度']);
 for(const sheet of book.worksheets){assert.equal(sheet.views[0].state,'frozen');assert(sheet.autoFilter);assert.equal(sheet.model.merges.length,1);const heights=new Set<number>();sheet.eachRow(row=>{if(row.number<=(sheet===main?2:4))return;heights.add(row.height!);row.eachCell(cell=>{assert.notEqual(cell.type,ExcelJS.ValueType.Formula);assert(cell.text.length<=32767);assert(!/\n\s*\n/.test(cell.text));if(!(sheet===main&&[3,15,16,17].includes(Number(cell.col))))assert.notEqual(cell.alignment.shrinkToFit,true);});});assert([...heights].every(h=>h>0&&h<=409.5));assert(heights.size>1);}
 for(const [index,source] of reports.selectedImprovementRows(state,ids).entries()){
  const rows:ExcelJS.Row[]=[];main.eachRow(r=>{if(r.number>2&&r.getCell(1).value===index+1)rows.push(r);});rows.sort((a,b)=>Number(a.getCell(11).value)-Number(b.getCell(11).value));const body=[source.title,source.content.en,source.content.zh].filter(Boolean).map(compactBlankLines).join('\n');assert.equal(rows.map(r=>r.getCell(6).text).join(''),body);assert.equal(rows.map(r=>r.getCell(7).text).join(''),compactBlankLines(source.plan));for(const r of rows){assert.equal(r.getCell(2).text,source.title);assert(r.getCell(15).value instanceof Date);assert.equal(r.getCell(15).numFmt,'yyyy-mm-dd');assert.equal((r.getCell(3).value as Date|null)?.toISOString().slice(0,10)||'',source.proposedDate||'');}
  for(const [eventIndex,event] of source.events.entries()){const parts:ExcelJS.Row[]=[];events.eachRow(r=>{if(r.number>4&&r.getCell(1).value===index+1&&r.getCell(3).value===eventIndex+1)parts.push(r);});parts.sort((a,b)=>Number(a.getCell(8).value)-Number(b.getCell(8).value));assert.equal(parts.map(r=>r.getCell(7).text).join(''),compactBlankLines(event.content));assert(parts.every(r=>r.getCell(4).value instanceof Date));}
 }
 assert.equal(JSON.stringify(state),before);
});
test('improvement Excel rejects GM populated data and empty or invalid selection',async()=>{
 const state=reportingFixture();await assert.rejects(()=>reports.buildImprovementsExcel(state,[],'zh'),/選|scope/i);await assert.rejects(()=>reports.buildImprovementsExcel(state,['missing'],'zh'),/選|scope/i);state.viewScope='management_viewer';await assert.rejects(()=>reports.buildImprovementsExcel(state,[state.improvements[0].id],'zh'),/權|scope|forbidden/i);
});
