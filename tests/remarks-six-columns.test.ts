import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {buildRemarksExcel} from '../src/reports.ts';
import {remarksExportFixture} from './remarks-export-fixture.ts';
import {compactBlankLines} from '../src/standardText.ts';
for(const lang of ['zh','en'] as const)test(`remarks ${lang} has six real columns and reversible labelled full-text continuations`,async()=>{
 const state=remarksExportFixture('long');state.assessments[0].remarks+='\n'+'LONG_CELL_LIMIT '.repeat(2400);const before=JSON.stringify(state),book=new ExcelJS.Workbook();await book.xlsx.load(await buildRemarksExcel(state,'TMSA',lang,['chapter-TMSA']) as unknown as ExcelJS.Buffer);const s=book.worksheets[0];
 assert.equal(s.columnCount,6,'Remove Part, do not hide it');assert.deepEqual((s.getRow(4).values as string[]).slice(1),lang==='zh'?['對應章節','Item','備註狀態','涉及部門','追蹤人員','完整備註']:['Chapter','Item','Remarks status','Departments','Follow-up people','Complete remarks']);
 assert.deepEqual(s.columns.map(c=>c.width),[22,10,13,22,20,126]);assert(!s.columns.some(c=>c.hidden));assert.equal(s.views[0].state,'frozen');assert.equal((s.views[0] as {ySplit:number}).ySplit,4);assert.equal(s.autoFilter,`A4:F${s.rowCount}`);assert.equal(s.pageSetup.printArea,`A1:F${s.rowCount}`);assert.deepEqual(s.model.merges,['A2:F3']);assert(!s.getCell('A2').text.includes('Item and Part'));assert(!s.getCell('A2').text.includes('段次排序'));
 const heights=new Set<number>();
 for(const a of state.assessments){const item=state.items.find(i=>i.id===a.itemId)!;const rows:ExcelJS.Row[]=[];s.eachRow(r=>{if(r.number>4&&r.getCell(2).text===item.code)rows.push(r);});assert(rows.length>1);
  // Simulate cross-record/value sorting, then restore this record by its visible F prefix.
  rows.reverse();rows.sort((a,b)=>a.getCell(6).text.localeCompare(b.getCell(6).text,'en'));
  let text='';rows.forEach((r,i)=>{const label=r.getCell(6).text.match(/^\[(\d+)\/(\d+)\]\n/);assert(label);assert.equal(Number(label[1]),i+1);assert.equal(Number(label[2]),rows.length);text+=r.getCell(6).text.slice(label[0].length);assert.equal(r.getCell(5).text,'測試 Owner / 停用歷史姓名');assert.equal(r.getCell(4).text,lang==='zh'?'海務 / 工務':'Marine / Technical');heights.add(r.height!);for(let c=1;c<=6;c++){assert.equal(r.getCell(c).alignment.wrapText,true);assert.notEqual(r.getCell(c).alignment.shrinkToFit,true);assert(r.getCell(c).text.length<=32767);}});assert.equal(text,compactBlankLines(a.remarks!));
 }
 assert.equal(heights.size,1,'One safe height survives native whole-range sorts');assert([...heights][0]<=409.5);assert.equal(JSON.stringify(state),before);
});
test('exceptionally long responsibility labels continue without losing their source text',async()=>{
 const state=remarksExportFixture('ordinary');state.people[0].name='姓名原文'.repeat(250);const book=new ExcelJS.Workbook();await book.xlsx.load(await buildRemarksExcel(state,'TMSA','zh',['chapter-TMSA']) as unknown as ExcelJS.Buffer);const s=book.worksheets[0],rows:ExcelJS.Row[]=[];s.eachRow(r=>{if(r.number>4&&r.getCell(2).text==='1.1.1')rows.push(r);});
 assert(rows.length>1);assert.equal(rows.map(r=>r.getCell(5).text).join(''),state.people[0].name+' / 停用歷史姓名');assert.equal(rows.map(r=>r.getCell(6).text.replace(/^\[\d+\/\d+\]\n/,'')).join(''),compactBlankLines(state.assessments[0].remarks!));assert(rows.every(r=>r.height!<=409.5));
});
