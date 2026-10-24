import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {buildImprovementsExcel} from '../src/reports.ts';
import {describeAudit} from '../src/auditChanges.ts';
import {reportingFixture} from './fpmc-reporting-fixture.ts';

test('canonical source rename reaches existing record Excel and audit without rewriting historical identity',async()=>{
 const state=reportingFixture();
 Object.assign(state.settings,{improvementSources:[{id:'non_external',name:{zh:'內部改名驗證',en:'Renamed internal source'},active:true}]});
 const row=state.improvements.find(r=>r.source==='non_external')!;
 const before=JSON.stringify(state);
 const book=new ExcelJS.Workbook();await book.xlsx.load(await buildImprovementsExcel(state,[row.id],'zh') as unknown as ExcelJS.Buffer);
 const sheet=book.worksheets[0],headers=sheet.getRow(2).values as string[],column=headers.indexOf('來源');assert(column>0);
 assert.equal(sheet.getRow(3).getCell(column).text,'內部改名驗證');
 const audit=describeAudit({id:'qa',at:'2026-01-01',actorId:'qa-owner',actorName:'QA',action:'create',kind:'improvement',entityId:row.id,itemCodes:[],summary:'Original source prose',operationId:'qa',before:null,after:{source:'non_external'}},'zh',state);
 assert(audit.changes.some(change=>change.after==='內部改名驗證'));
 assert.equal(JSON.stringify(state),before);
});
