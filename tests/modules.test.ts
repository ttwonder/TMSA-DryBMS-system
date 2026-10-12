import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { ApiClient, Finding, FrameworkId, PageProps, PlatformState, SeedBundle } from '../src/types.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof import('typescript');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const candidate = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(candidate.pathname)) {
        for (const extension of ['.ts', '.tsx']) {
          const url = new URL(`${candidate.href}${extension}`);
          if (existsSync(url)) return { url: url.href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) {
      const input = readFileSync(fileURLToPath(url), 'utf8');
      const result = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: fileURLToPath(url) });
      return { format: 'module', source: result.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  }
});
const Improvements = await import('../src/Improvements.tsx');
const Inspections = await import('../src/Inspections.tsx');
const Management = await import('../src/Management.tsx');
const { DEFAULT_PERMISSIONS, inspectionScore } = await import('../src/domain.ts');
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');

function fixture(): PlatformState {
  const base = (id: string) => ({ id, version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 'owner' });
  const frameworks = (['TMSA', 'DRYBMS'] as FrameworkId[]).map(id => ({ ...base(id), name: { en: id, zh: id }, description: { en: '', zh: '' }, scoring: id === 'TMSA' ? 'tmsa-stage' as const : 'drybms-guidance' as const, active: true, sourceVersion: 'QA fixture', scopeLabel: { en: 'Test scope', zh: '測試範圍' } }));
  const chapters = frameworks.flatMap(fw => Array.from({ length: fw.id === 'TMSA' ? 20 : 30 }, (_, index) => ({ ...base(`${fw.id}-c${index}`), frameworkId: fw.id as FrameworkId, code: String(index + 1), name: { en: `Chapter ${index + 1}`, zh: `章節${index + 1}` }, order: index + 1, active: true })));
  const items = chapters.map(chapter => ({ ...base(`${chapter.id}-i`), frameworkId: chapter.frameworkId, chapterId: chapter.id, code: `${chapter.code}.1.1`, level: 1, order: chapter.order, active: true, kpi: { en: 'Requirement', zh: '要求' }, guidance: { en: 'Advisory evidence', zh: '建議證據' }, departmentIds: ['dept'], sources: [{ source: 'QA original', file: 'qa.pdf', pages: [1] }] }));
  const people = (['owner', 'admin', 'operator', 'vessel'] as const).map(role => ({ ...base(role), username: role, name: `QA ${role}`, departmentId: 'dept', role, active: true, hasPassword: role === 'owner' || role === 'admin' }));
  return { frameworks, chapters, items, people, assessments: [], improvements: [], inspections: [], dryScores: [], settings: { ...base('settings'), departments: [{ id: 'dept', name: { en: 'Department', zh: '部門' }, active: true }], rolePermissions: structuredClone(DEFAULT_PERMISSIONS), siteGateConfigured: true }, auditLogs: [], cycles: [], provenance: [], serverTime: '2026-01-01T00:00:00Z', snapshotToken: 'QA-snapshot' };
}
function context(state = fixture(), role: 'owner' | 'admin' | 'operator' | 'vessel' = 'owner'): PageProps {
  const noSideEffect = () => { throw new Error('Static render must not call the server'); };
  const api = new Proxy({ config: { url: 'http://127.0.0.1', anonKey: 'qa-public' }, clientId: 'qa', sessionToken: '' }, { get(target, key) { return key in target ? target[key as keyof typeof target] : noSideEffect; } }) as unknown as ApiClient;
  return { state, user: state.people.find(row => row.role === role)!, api, lang: 'zh', t: (zh, _en) => zh, refresh: async () => { noSideEffect(); }, notify: noSideEffect, navigate: noSideEffect };
}
const finding = (state: PlatformState, classification: Finding['classification'] = 'finding'): Finding => ({ id: 'f1', itemIds: [state.items[0].id], classification, observation: { en: 'Finding EN', zh: '發現繁中' }, recommendation: { en: 'Action EN', zh: '建議繁中' }, sources: [{ source: 'QA audit', file: 'audit.pdf', pages: [2], rawItem: 'Complete original finding' }], warning: 'QA uncertainty' });
const emptySeed = (): SeedBundle => ({ schemaVersion: 1, frameworks: [], chapters: [], items: [], assessments: [], improvements: [], inspections: [], dryScores: [], cycles: [], provenance: [], sourceManifest: [], importNote: { en: 'Test', zh: '測試' } });

const source = (name: string): string => {
  const path = new URL(`../src/${name}.tsx`, import.meta.url);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

test('improvement export sends explicit intersected IDs and canonical authorized state', () => {
  const code = source('Improvements');
  assert.match(code, /effectiveSelection/);
  assert.match(code, /authorizeExport/);
  assert.match(code, /downloadImprovementsPdf\(canonical/);
  assert.match(code, /if\s*\(!ids\.length\)/);
});

test('each business editor uses the shared record lease hook', () => {
  assert.match(source('Improvements'), /useRecordEditor<Improvement>\(ctx,\s*'improvement'\)/);
  assert.match(source('Inspections'), /useRecordEditor<Inspection>\(ctx,\s*'inspection'\)/);
  assert.match(source('Inspections'), /useRecordEditor<Improvement>\(ctx,\s*'improvement'\)/);
  for (const [type, kind] of [['Person', 'person'], ['Framework', 'framework'], ['Chapter', 'chapter'], ['StandardItem', 'item'], ['SystemSettings', 'settings']]) {
    assert.ok(source('Management').includes(`useRecordEditor<${type}>(ctx, '${kind}')`), `${kind} must use the shared lease editor`);
  }
});

test('management queries server audit pages, rather than cached latest audit rows', () => {
  assert.match(source('Management'), /api\.queryAudit\(/);
  assert.doesNotMatch(source('Management'), /state\.auditLogs\.filter/);
});

test('inspection publishing and revision copy preserve the frozen historical record', () => {
  assert.match(source('Inspections'), /inspectionScore\(/);
  assert.match(source('Inspections'), /supersedesId/);
  assert.match(source('Inspections'), /save\('finalize'\)/);
  assert.match(source('Inspections'), /status === 'final'/);
});

test('focus resolves a canonical case or item ID without copying records', () => {
  const state = fixture();
  const inspection = Inspections.createInspectionDraft(state, 'TMSA');
  state.improvements.push(Inspections.improvementFromFinding(inspection, finding(state)));
  const resolve = (Improvements as unknown as { resolveImprovementFocus: (state: PlatformState, id?: string) => unknown }).resolveImprovementFocus;
  assert.equal(typeof resolve, 'function', 'the parent focus prop needs an identity resolver');
  assert.deepEqual(resolve(state, state.improvements[0].id), { kind: 'case', id: state.improvements[0].id });
  assert.deepEqual(resolve(state, state.items[0].id), { kind: 'item', id: state.items[0].id });
  assert.equal(resolve(state, 'missing'), null);
});

test('saved imported general themes can track progress without guessing Item IDs; new or unrelated cases cannot', () => {
  const state = fixture();
  const inspection = Inspections.createInspectionDraft(state, 'TMSA');
  const ordinary = finding(state);
  const action = { ...Inspections.improvementFromFinding(inspection, ordinary), version: 1, itemIds: [] };
  inspection.imported = true;
  inspection.status = 'final';
  inspection.findings = [{ ...ordinary, classification: 'general', itemIds: [] }];
  state.inspections = [inspection];
  state.improvements = [action];
  const ctx = context(state);
  assert.equal(Improvements.improvementValidation({ ...action, percent: 25 }, ctx), '');
  for (const changes of [{ version: 0 }, { id: 'new-general' }, { inspectionId: 'missing' }, { source: 'non_external' as const }]) {
    assert.notEqual(Improvements.improvementValidation({ ...action, ...changes }, ctx), '');
  }
  inspection.findings[0].classification = 'positive';
  assert.notEqual(Improvements.improvementValidation(action, ctx), '');
});

test('effective selection is unique, filtered and empty never becomes all', () => {
  const state = fixture();
  const inspection = Inspections.createInspectionDraft(state, 'TMSA');
  const action = Inspections.improvementFromFinding(inspection, finding(state));
  assert.deepEqual(Improvements.effectiveSelection([], [action]), []);
  assert.deepEqual(Improvements.effectiveSelection(['absent', action.id, action.id], [action]), [action.id]);
  assert.deepEqual(Improvements.effectiveSelection([action.id], []), []);
});

test('bilingual titles preserve both languages and legacy monolingual titles', () => {
  assert.deepEqual(Improvements.improvementTitle('English\n繁中'), { en: 'English', zh: '繁中' });
  assert.deepEqual(Improvements.improvementTitle('繁中標題'), { en: '', zh: '繁中標題' });
  assert.deepEqual(Improvements.improvementTitle('English title'), { en: 'English title', zh: '' });
});

test('new progress appends immutable history and close/reopen are independent', () => {
  const state = fixture();
  const action = Inspections.improvementFromFinding(Inspections.createInspectionDraft(state, 'TMSA'), finding(state));
  const baseline = structuredClone(action);
  const closed = Improvements.appendImprovementEvent(action, { id: 'event1', at: '2026-01-02T00:00:00Z', by: 'owner', content: 'Work verified', status: 'closed', percent: 100 });
  assert.equal(action.events.length, 0);
  assert.deepEqual(action, baseline);
  assert.equal(closed.closedBy, 'owner');
  const reopened = Improvements.appendImprovementEvent(closed, { id: 'event2', at: '2026-01-03T00:00:00Z', by: 'operator', content: 'Follow-up', status: 'open', percent: 0 });
  assert.deepEqual(reopened.events[0], closed.events[0]);
  assert.equal(reopened.closedAt, null);
  assert.equal(reopened.closedBy, null);
  assert.equal(reopened.id, action.id);
  assert.throws(() => Improvements.appendImprovementEvent(reopened, { ...reopened.events[0], id: 'event1' }), /DUPLICATE_EVENT/);
  assert.throws(() => Improvements.appendImprovementEvent(action, { ...closed.events[0], percent: 101 }), /INVALID_PERCENT/);
  assert.throws(() => Improvements.appendImprovementEvent(action, { ...closed.events[0], content: ' ' }), /PROGRESS_CONTENT_REQUIRED/);
});

test('inspection creation freezes all active definitions and never infers Yes', () => {
  const state = fixture();
  state.items[0].active = false;
  const draft = Inspections.createInspectionDraft(state, 'TMSA');
  assert.equal(draft.version, 0);
  assert.equal(draft.snapshot.chapters.length, 20);
  assert.equal(draft.snapshot.items.length, 19);
  assert.equal(draft.snapshot.scoringVersion, 'company-20-equal-stage-v1');
  assert.ok(draft.results.every(result => result.response === null && !result.reviewed));
  state.items[1].kpi.en = 'Later source change';
  assert.equal(draft.snapshot.items[0].kpi.en, 'Requirement');
  state.frameworks[0].active = false;
  assert.throws(() => Inspections.createInspectionDraft(state, 'TMSA'), /ACTIVE_FRAMEWORK_REQUIRED/);
});

test('revision creates a new record and preserves the original final snapshot', () => {
  const state = fixture();
  const original = Inspections.createInspectionDraft(state, 'TMSA'); original.status = 'final'; original.version = 3;
  const before = structuredClone(original);
  const copy = Inspections.reviseInspection(original);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.version, 0);
  assert.equal(copy.status, 'draft');
  assert.equal(copy.supersedesId, original.id);
  copy.snapshot.items[0].kpi.en = 'Local edit';
  assert.deepEqual(original, before);
  assert.throws(() => Inspections.reviseInspection({ ...original, status: 'draft' }), /FINAL_INSPECTION_REQUIRED/);
});

test('partial snapshots and missing grades do not become a complete zero score', () => {
  const state = fixture();
  const draft = Inspections.createInspectionDraft(state, 'TMSA');
  assert.equal(inspectionScore(draft).score, null);
  draft.results.forEach(result => { result.response = 'no'; result.reviewed = true; });
  assert.equal(inspectionScore(draft).score, 0);
  draft.results.pop();
  assert.equal(inspectionScore(draft).score, null);
  draft.results = [];
  assert.equal(inspectionScore(draft).score, null);
  const dry = Inspections.createInspectionDraft(state, 'DRYBMS');
  dry.results.forEach(result => { result.response = 'no'; result.reviewed = true; });
  assert.equal(inspectionScore(dry).score, null);
  for (const chapter of dry.snapshot.chapters) dry.dryLevels![chapter.id] = [0, 25, 50, 75];
  assert.ok(inspectionScore(dry).score !== null);
});

test('only explicitly classified findings produce external improvements', () => {
  const state = fixture();
  const inspection = Inspections.createInspectionDraft(state, 'TMSA');
  for (const kind of ['positive', 'no_finding', 'guidance', 'general'] as const) assert.throws(() => Inspections.improvementFromFinding(inspection, finding(state, kind)), /FINDING_NOT_ACTIONABLE/);
  const action = Inspections.improvementFromFinding(inspection, finding(state));
  assert.equal(action.source, 'external');
  assert.equal(action.sourceKey, `${inspection.id}:f1`);
  assert.deepEqual(action.sources, finding(state).sources);
  assert.equal(action.version, 0);
  inspection.findings.push(finding(state)); state.inspections.push(inspection);
  assert.equal(Improvements.improvementValidation(action, context(state)), '');
  state.improvements.push(action);
  assert.match(Improvements.improvementValidation({ ...action, id: 'duplicate' }, context(state)), /已有改善/);
});

test('management digest uses real WebCrypto and seed preview rejects credentials', async () => {
  const input = 'local-qa-only';
  assert.equal(await Management.credentialDigest(input), createHash('sha256').update(input).digest('hex'));
  await assert.rejects(Management.credentialDigest(''), /PASSWORD_REQUIRED/);
  assert.equal(Management.validateSeedPreview(emptySeed()).schemaVersion, 1);
  assert.throws(() => Management.validateSeedPreview({ ...emptySeed(), schemaVersion: 2 }), /SCHEMA/);
  assert.throws(() => Management.validateSeedPreview({ ...emptySeed(), provenance: [{ credentialHash: 'never-seed-secrets' }] }), /CREDENTIALS/);
  assert.throws(() => Management.validateSeedPreview({ ...emptySeed(), people: [] }), /PEOPLE_OR_SETTINGS/);
  const state = fixture();
  assert.equal(Management.freshBusinessDatabase({ state }), false);
  state.frameworks = []; state.chapters = []; state.items = [];
  assert.equal(Management.freshBusinessDatabase({ state }), true);
});

test('source gap resolution requires added located source evidence', () => {
  const state = fixture();
  const baseline = { ...state.items[0], sourceGap: 'Cropped original', sourceGapResolved: false };
  assert.equal(Management.gapResolutionSupported({ ...baseline, sourceGapResolved: true }, baseline), false);
  const fixed = { ...baseline, sourceGapResolved: true, sources: [...baseline.sources, { source: 'Supplement', file: 'full.pdf', pages: [3], note: 'Missing sentence supplied from full source' }] };
  assert.equal(Management.gapResolutionSupported(fixed, baseline), true);
  assert.equal(Management.gapResolutionSupported({ ...fixed, sources: [...baseline.sources, { source: 'Supplement', file: 'full.pdf', note: 'No locator' }] }, baseline), false);
});

test('focus wiring and fixed administrator management capabilities remain explicit', () => {
  assert.match(source('Improvements'), /PageProps & \{ focusId\?: string(?:;[^}]+)? \}/);
  assert.match(source('Improvements'), /resolveImprovementFocus\(state, ctx\.focusId/);
  assert.match(source('Improvements'), /row\.itemIds\.includes\(filters\.itemId\)/);
  const management = source('Management');
  assert.match(management, /role === 'admin' && \['enterManagement', 'manageUsers'\]\.includes\(capability\)/);
  assert.match(management, /disabled=\{!owner \|\| locked\}/);
  assert.match(management, /checked=\{forced \|\| !locked/);
});

test('sensitive forms use exact contract fields and transient secrets never enter readstate', () => {
  const code = source('Management');
  assert.match(code, /rpc\('site_password', \{ credentialHash, newGateHash:/);
  assert.match(code, /rpc\('transfer_owner', \{ targetId: targetOwner, credentialHash \}\)/);
  assert.match(code, /type="password"/);
  assert.match(code, /const confirmed = await ctx\.api\.read\(\)/);
  assert.doesNotMatch(code, /localStorage|sessionStorage/);
  assert.doesNotMatch(code, /state\.people[^;]*credentialHash/);
});

test('new inspection findings need explicit classification and saved canonical source', () => {
  const code = source('Inspections');
  assert.match(code, /classification: 'general'/);
  assert.match(code, /improvementFromFinding\(canonical, originalFinding\)/);
  assert.match(code, /if \(!canonical \|\| !originalFinding \|\| editor\.isDirty\)/);
  assert.doesNotMatch(code, /inspectionHasCompleteGrading/);
});

test('real React static rendering enforces management roles and explicit export selection', () => {
  for (const role of ['operator', 'vessel'] as const) {
    const markup = renderToStaticMarkup(createElement(Management.default, context(fixture(), role)));
    assert.match(markup, /不能進入/);
    assert.doesNotMatch(markup, /新增人員/);
  }
  for (const role of ['owner', 'admin'] as const) assert.match(renderToStaticMarkup(createElement(Management.default, context(fixture(), role))), /新增人員/);
  const state = fixture();
  const inspection = Inspections.createInspectionDraft(state, 'TMSA'); inspection.title = 'QA inspection'; state.inspections.push(inspection);
  const action = Inspections.improvementFromFinding(inspection, finding(state)); state.improvements.push(action);
  const markup = renderToStaticMarkup(createElement(Improvements.default, context(state)));
  assert.ok(markup.indexOf('Finding EN') < markup.indexOf('發現繁中'));
  assert.match(markup, /disabled=""[^>]*>匯出已選PDF \(0\)/);
  const history = renderToStaticMarkup(createElement(Inspections.default, context(state)));
  assert.match(history, /未完整記分（不是0分）/);
  assert.doesNotMatch(history, /0\.00 \/ 4/);
});
