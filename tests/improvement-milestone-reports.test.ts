import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { reportingFixture } from './fpmc-reporting-fixture.ts';
import * as reports from '../src/reports.ts';
import { applyMilestoneCommand, checkpointMilestones, milestoneEventText } from '../src/improvementMilestones.ts';
import { compactBlankLines } from '../src/standardText.ts';

function milestoneFixture() {
 const state=reportingFixture(),base={...state.improvements[0],status:'in_progress' as const};
 let n=0;const meta=()=>({id:`milestone-report-${++n}`,at:'2026-10-23T01:00:00Z',by:state.people[0].id});
 const goal='GOAL_BEGIN\n'+Array.from({length:35},(_,i)=>`  ${i+1}. Complete bilingual procedure 完整階段內容`).join('\n')+'\nGOAL_END';
 let record=checkpointMilestones(base,{...base,milestones:[{id:'stage-a',goal,plannedDate:'2026-11-01',achievedDate:''},{id:'stage-b',goal:'Vendor procedure review 供應商程序審查',plannedDate:'2026-11-10',achievedDate:''},{id:'stage-c',goal:'Removed stage remains in history 移除後保留原文',plannedDate:'2026-11-30',achievedDate:''}]},meta);
 record=applyMilestoneCommand(base,record,{kind:'achieve',milestoneId:'stage-a',date:'2026-11-02'},meta);
 record=applyMilestoneCommand(base,record,{kind:'postpone',milestoneId:'stage-b',date:'2026-11-17',reason:'Supplier delayed 供應商延期',cascade:true},meta);
 record=applyMilestoneCommand(base,record,{kind:'revoke',milestoneId:'stage-a',reason:'Evidence requires correction 佐證需修正'},meta);
 record=applyMilestoneCommand(base,record,{kind:'remove',milestoneId:'stage-c'},meta);
 // A presentation consumer must derive progress, not trust a conflicting cache field.
 record.percent=87;state.improvements[0]=record;return {state,record};
}
test('milestones: original workbook exports derived progress, complete stages and append-only change history',async()=>{
 const {state,record}=milestoneFixture(),before=JSON.stringify(state),book=new ExcelJS.Workbook();
 await book.xlsx.load(await reports.buildImprovementsExcel(state,[record.id],'zh') as unknown as ExcelJS.Buffer);
 assert.deepEqual(book.worksheets.map(s=>s.name),['改善項目','全部進度','具體階段目標','階段變更歷史']);
 const [main,,stages,history]=book.worksheets;
 assert.equal(main.getCell(5,17).value,0);assert.equal(main.getCell(5,18).value,0);assert.equal(main.getCell(5,19).value,2);
 for(const sheet of book.worksheets){assert(sheet.autoFilter);assert.equal(sheet.views[0].state,'frozen');assert.equal(sheet.model.merges.length,1);sheet.eachRow(row=>{if(row.number<=4)return;assert.equal(row.getCell(1).value,1);assert(row.height!<=409.5);row.eachCell(cell=>assert.notEqual(cell.type,ExcelJS.ValueType.Formula));});}
 for(const [index,stage] of record.milestones!.entries()){
  const parts:ExcelJS.Row[]=[];stages.eachRow(row=>{if(row.number>4&&row.getCell(3).value===index+1)parts.push(row);});parts.sort((a,b)=>Number(a.getCell(9).value)-Number(b.getCell(9).value));
  assert.equal(parts.map(row=>row.getCell(4).text).join(''),compactBlankLines(stage.goal));
  assert(parts.every(row=>row.getCell(5).value instanceof Date));assert.equal((parts[0].getCell(5).value as Date).toISOString().slice(0,10),stage.plannedDate);assert.equal(parts[0].getCell(7).value,null);
 }
 for(const [index,event] of record.milestoneEvents!.entries()){
  const parts:ExcelJS.Row[]=[];history.eachRow(row=>{if(row.number>4&&row.getCell(3).value===index+1)parts.push(row);});parts.sort((a,b)=>Number(a.getCell(7).value)-Number(b.getCell(7).value));
  assert.equal(parts.map(row=>row.getCell(6).text).join(''),compactBlankLines(milestoneEventText(event,'zh')));assert.equal(parts[0].getCell(4).text,event.at);
 }
 let all='';history.eachRow(row=>{all+=row.getCell(6).text;});for(const text of ['2026-11-17','2026-12-07','Supplier delayed 供應商延期','Evidence requires correction 佐證需修正','Removed stage remains in history 移除後保留原文','GOAL_END'])assert(all.includes(text),text);
 assert.equal(JSON.stringify(state),before);
});
test('milestones: English workbook headers accommodate measured native Excel wrapped date labels',async()=>{
 const {state,record}=milestoneFixture(),book=new ExcelJS.Workbook();await book.xlsx.load(await reports.buildImprovementsExcel(state,[record.id],'en') as unknown as ExcelJS.Buffer);
 assert(book.getWorksheet('Specific milestones')!.getRow(4).height!>=54,'Native Excel needs 54pt for the three-line completion-date header at the retained 14pt font');
});
test('milestones: original PDF builder retains full-width stage and history rows',async()=>{
 const {state,record}=milestoneFixture(),before=JSON.stringify(state),lines:reports.ReportFieldLine[]=[];
 const bytes=await reports.buildImprovementsPdf(state,[record.id],'zh',undefined,{fontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf')),fallbackFontBytes:['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(n=>new Uint8Array(readFileSync('public/fonts/'+n))),onFieldLine:l=>lines.push(l)});
 assert(bytes.length>1000);assert(lines.some(l=>/^improvements:\d+:6:/.test(l.fieldId)&&l.width>1000),'Complete milestone goals need full-width rows');
 assert(lines.some(l=>/^improvements:\d+:7:/.test(l.fieldId)&&l.width>1000),'Complete milestone changes need full-width rows');assert(lines.every(l=>l.size>=14));assert.equal(JSON.stringify(state),before);
});
