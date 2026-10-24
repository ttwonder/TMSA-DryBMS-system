import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {buildImprovementsExcel,buildRemarksExcel,selectedImprovementRows} from '../src/reports.ts';
import {reportingFixture} from './fpmc-reporting-fixture.ts';
const widths=[5.6640625,18.3984375,10.265625,16.86328125,7.59765625,94.1328125,50.265625,17.06640625,17.06640625,7.59765625,5.1328125,7.9296875,7.46484375,7.46484375,10.33203125,10.33203125,10.33203125,14.86328125,14.86328125];
const headers={zh:['文件序號','標題','提出日期','來源','急迫度','完整內容','執行計劃','涉及部門','執行人','狀態','段次','完成率 (%)','已達成階段數','階段總數','最新更新','目標日期','結案日期','分類','關聯編號'],en:['Document no.','Title','Proposed date','Source','Urgency','Complete content','Plan','Departments','Assignees','Status','Part','Completion (%)','Achieved milestones','Total milestones','Updated','Target date','Closed date','Classification','Related codes']};
for(const lang of ['zh','en'] as const)test(`uploaded improvement layout: ${lang} main schema, complete five records and unchanged progress`,async()=>{
 const state=reportingFixture(),ids=state.improvements.slice(0,5).map(r=>r.id),before=JSON.stringify(state),scope='Selected 5 · 合成測試範圍';
 const book=new ExcelJS.Workbook();await book.xlsx.load(await buildImprovementsExcel(state,ids,lang,{reportScope:scope}) as unknown as ExcelJS.Buffer);const [main,progress]=book.worksheets;
 assert.deepEqual((main.getRow(2).values as string[]).slice(1),headers[lang]);
 assert.deepEqual(main.columns.map(c=>c.width),widths);assert.equal(main.getCell('C1').text,scope);assert.deepEqual(main.model.merges,['C1:F1']);
 if(lang==='zh')assert.equal(main.getRow(2).height,34.15,'Chinese header matches uploaded compact height; native Excel requires 30.8pt');
 assert.equal(main.getCell('A1').font.size,18);assert.equal(main.getCell('C1').font.size,12);assert(main.getRow(1).height!>=30);
 assert.equal(main.rowCount,7);assert.equal(main.autoFilter,'A2:S7');assert.equal(main.pageSetup.printArea,'A1:Q7');assert.equal(main.pageSetup.printTitlesRow,'2:2');assert('ySplit' in main.views[0]&&main.views[0].ySplit===2);
 for(const [i,row] of selectedImprovementRows(state,ids).entries()){
  const r=main.getRow(i+3);assert.equal(r.getCell(2).text,row.title);assert.equal(r.getCell(6).text,[row.title,row.content.en,row.content.zh].join('\n').replace(/\n\s*\n/g,'\n'));assert.equal(r.getCell(7).text,row.plan.replace(/\n\s*\n/g,'\n'));assert.equal(r.getCell(11).value,1);
  assert(r.getCell(3).value instanceof Date);assert.equal(r.getCell(3).numFmt,'yyyy-mm-dd');assert(r.getCell(15).value instanceof Date);assert.equal(r.getCell(18).text,row.source==='external'?(lang==='zh'?'分類未載入':'Classification not loaded'):'—');
  for(let c=1;c<=19;c++){const cell=r.getCell(c);assert.equal(cell.font.size,12);assert.equal(cell.alignment.vertical,'top');assert.equal(!!cell.alignment.wrapText,![3,15,16,17].includes(c));assert(cell.border.bottom?.style);assert.notEqual(cell.type,ExcelJS.ValueType.Formula);}
 }
 assert.equal(progress.getCell('A4').text,headers[lang][0]);assert.equal(progress.autoFilter,`A4:H${progress.rowCount}`);assert('ySplit' in progress.views[0]&&progress.views[0].ySplit===4);assert.equal(JSON.stringify(state),before);
});
test('improvement long scope continues without truncation and Remarks stays row four',async()=>{
 const state=reportingFixture(),scope='SCOPE_BEGIN '+('完整來源與部門名稱 complete canonical scope '.repeat(200))+' SCOPE_END',book=new ExcelJS.Workbook();
 await book.xlsx.load(await buildImprovementsExcel(state,[state.improvements[0].id],'en',{reportScope:scope}) as unknown as ExcelJS.Buffer);
 const sh=book.worksheets[0],header=Number((sh.autoFilter as string).match(/^A(\d+):/)![1]);assert(header>2);assert.equal(Array.from({length:header-1},(_,i)=>sh.getCell(i+1,3).text).join(''),scope);for(let r=1;r<header;r++)assert(sh.getRow(r).height!<=409.5);assert.equal(sh.getCell(header,19).text,'Related codes');
 const remarks=new ExcelJS.Workbook();await remarks.xlsx.load(await buildRemarksExcel(state,'TMSA','en') as unknown as ExcelJS.Buffer);assert.equal(remarks.worksheets[0].getCell('F4').text,'Complete remarks');
});
