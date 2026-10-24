import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { reportingFixture } from './fpmc-reporting-fixture.ts';
import { buildImprovementsExcel } from '../src/reports.ts';
import { describeAudit } from '../src/auditChanges.ts';
import { filteredImprovements, openIssuesFor } from '../src/domain.ts';
import { improvementReferenceIndex, improvementReferenceLabels } from '../src/improvementReferences.ts';
import type { AuditLog } from '../src/types.ts';

function fixture() {
  const state = reportingFixture();
  const record = { ...state.improvements[0], itemIds: [], chapterIds: state.chapters.map(chapter => chapter.id) };
  state.improvements = [record];
  return { state, record };
}

test('chapter links export actual XLSX business chapter codes, not empty links or inferred items', async () => {
  const { state, record } = fixture(), before = JSON.stringify(state);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildImprovementsExcel(state, [record.id], 'zh') as unknown as ExcelJS.Buffer);
  const headers = book.worksheets[0].getRow(2).values as string[];
  const column = headers.indexOf('關聯編號'); assert(column > 0);
  const values: string[] = [];
  book.worksheets[0].eachRow(row => { if (row.number > 2) values.push(row.getCell(column).text); });
  assert(values.some(value => value.includes('TMSA 1（章節）') && value.includes('DRYBMS 1（章節）')));
  assert(values.every(value => !value.includes('1.1.1') && !value.includes('D-1')));
  assert.equal(JSON.stringify(state), before);
});

test('chapter link audit names chapters and ignores order-only changes', () => {
  const { state, record } = fixture();
  const log: AuditLog = { id:'qa',at:'2026-01-01',actorId:'qa-owner',actorName:'QA',action:'update',kind:'improvement',entityId:record.id,itemCodes:[],summary:'',operationId:'qa',before:{...record,chapterIds:[]},after:record };
  const result = describeAudit(log, 'zh', state);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].label, '關聯章節');
  assert.match(result.changes[0].after, /TMSA 1/);
  assert.equal(describeAudit({...log,before:record,after:{...record,chapterIds:[...record.chapterIds].reverse()}},'zh',state).changes.length,0);
});

test('chapter-only scopes and labels preserve legacy items, direct links and complete query text', () => {
  const { state, record } = fixture(), index = improvementReferenceIndex(state), before = JSON.stringify(state);
  assert.deepEqual(improvementReferenceLabels(index, record, 'en'), ['TMSA 1 (chapter)', 'DRYBMS 1 (chapter)']);
  assert.deepEqual(improvementReferenceLabels(index, { itemIds:['item-a'] }, 'zh'), ['TMSA 1.1.1']);
  assert.deepEqual(filteredImprovements(state, { query:'1 Chapter' }).map(row=>row.id), [record.id]);
  assert.deepEqual(filteredImprovements(state, { frameworkId:'TMSA',chapterId:'chapter-DRYBMS' }).map(row=>row.id), [record.id]);
  assert.deepEqual(openIssuesFor(state, 'item-a'), []);
  assert.equal(JSON.stringify(state), before);
});
