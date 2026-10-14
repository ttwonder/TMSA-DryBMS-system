import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// Run: node --experimental-strip-types scripts/verify-finding-classification-reports.mjs
// Only synthetic data and public fonts. No private seed, server, credentials or network.
// This exercises existing builders; it is not native/UI/hosted export acceptance.
const root = fileURLToPath(new URL('../', import.meta.url));
const startedAt = new Date().toISOString();
const parent = join(root, 'qa-evidence', 'finding-classification');
mkdirSync(parent, {recursive: true});
const out = join(parent, `reports-${startedAt.replaceAll(':', '-')}-${process.pid}`);
mkdirSync(out); // Never replace an earlier run or remove its artifacts.
const pathText = value => value.replaceAll('\\', '/');
const receiptPath = join(out, 'receipt.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const productPaths = ['src/findingClassification.ts', 'src/reports.ts', 'src/domain.ts', 'src/types.ts', 'src/syncState.ts'];
const probePaths = ['scripts/verify-finding-classification-reports.mjs', 'tests/finding-classification.test.ts'];
const fontPaths = ['public/fonts/NotoSansTC-Regular.ttf', 'public/fonts/ReportSupplement-Regular.ttf', 'public/fonts/ReportSymbols-Regular.ttf'];
const hashes = paths => Object.fromEntries(paths.map(path => [path, hash(readFileSync(join(root, path)))]));
const specs = ['inspection', 'improvements'].flatMap(kind => ['zh', 'en'].map(lang => ({kind, lang, name: `${kind}-${lang}.pdf`})));
const prefix = spec => `FC-REPORT-${spec.kind}-${spec.lang}`;
const expectedCaseIds = [
  ...specs.flatMap(spec => ['build', 'unchanged', 'classification', 'source-content', spec.kind === 'inspection' ? 'frozen-results' : 'progress'].map(suffix => `${prefix(spec)}-${suffix}`)),
  'FC-REPORT-FIXTURE-UNCHANGED', 'FC-REPORT-EXACT-INVENTORY', 'FC-REPORT-NO-NETWORK', 'FC-REPORT-INPUT-HASHES',
];
const receipt = {
  status: 'RUNNING', startedAt,
  layer: 'Actual inspection/improvement PDF builders + independent PyMuPDF saved-byte extraction; local synthetic data only',
  provenance: 'Regression of the already-implemented candidate; no manufactured RED and no product changes',
  command: 'node --experimental-strip-types scripts/verify-finding-classification-reports.mjs',
  runtime: {node: process.version, pythonLauncher: 'uv run --offline --no-project --python 3.12 --with pymupdf python'},
  expectedPdfs: specs.map(spec => pathText(join(out, spec.name))), expectedCaseIds,
  cases: [], pdfs: [], inputHashes: {},
  boundaries: {syntheticOnly: true, privateSeedRead: false, hostedAcceptance: false, databaseUsed: false, networkAllowed: false},
};
function check(id, assertion) {
  assert.ok(!receipt.cases.some(row => row.id === id), `Duplicate case ID: ${id}`);
  try { assertion(); receipt.cases.push({id, status: 'PASS'}); }
  catch (error) { receipt.cases.push({id, status: 'FAIL', error: error.message}); }
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const base = id => ({id, version: 1, createdAt: '2026-10-01T01:00:00Z', updatedAt: '2026-10-02T02:00:00Z', updatedBy: 'qa-person'});
function syntheticFixture(permissions) {
  const framework = {...base('TMSA'), name: {en: 'Synthetic company TMSA', zh: '合成測試公司體系'},
    description: {en: 'Synthetic report fixture only', zh: '僅合成報表測試'}, scoring: 'tmsa-stage', active: true,
    sourceVersion: 'QA-FC-1', scopeLabel: {en: 'Synthetic scope; not an official score', zh: '合成範圍；非官方得分'}};
  const chapter = {...base('qa-chapter-01'), frameworkId: 'TMSA', code: '1',
    name: {en: 'Synthetic chapter', zh: '合成測試分章'}, order: 1, active: true};
  const items = ['alpha', 'beta'].map((suffix, index) => ({...base(`qa-item-${suffix}-01`),
    frameworkId: 'TMSA', chapterId: chapter.id, code: `1.1.${index + 1}`, level: 1, order: index, active: true,
    kpi: {en: `QA_${suffix.toUpperCase()}_FROZEN_KPI Complete synthetic requirement.`, zh: `合成凍結指標${index + 1}完整保留。`},
    guidance: {en: `QA_${suffix.toUpperCase()}_FROZEN_GUIDANCE Keep this frozen guidance.`, zh: `合成凍結指引${index + 1}不得改寫。`},
    departmentIds: ['qa-department'], sources: []}));
  const findings = ['finding', 'ofi'].map((classification, index) => {
    const suffix = index === 0 ? 'alpha' : 'beta', marker = suffix.toUpperCase();
    return {id: `qa-finding-${suffix}-01`, classification, itemIds: index === 0 ? [items[0].id] : [items[1].id, items[0].id],
      observation: {en: `QA_${marker}_BODY_BEGIN Keep every word of this original audit statement. QA_${marker}_BODY_END`,
        zh: `合成${index + 1}原始觀察開始，完整保留全文及原有細目關聯，原始觀察結束。`},
      recommendation: {en: `QA_${marker}_ADVICE_BEGIN Retain the complete proposed follow-up and its evidence. QA_${marker}_ADVICE_END`,
        zh: `合成${index + 1}原始建議開始，保留完整跟進措施與佐證內容，原始建議結束。`},
      sources: [{source: `QA-SOURCE-${marker}-001`, file: `synthetic-${suffix}.pdf`, pages: [index + 1],
        rawItem: index === 0 ? '1,1,1' : '1.1.2', note: `QA_${marker}_SOURCE_NOTE Preserve the literal source token.`}]};
  });
  const inspection = {...base('qa-inspection-class-01'), frameworkId: 'TMSA', title: 'QA synthetic history 合成歷史',
    organization: 'QA synthetic organization', date: '2026-10-01', type: 'formal', status: 'final', imported: true,
    snapshot: {framework: structuredClone(framework), chapters: [structuredClone(chapter)], items: structuredClone(items), scoringVersion: 'QA_FROZEN_CLASSIFICATION_V1'},
    results: items.map((item, index) => ({itemId: item.id, response: 'yes', conformity: 'all', reviewed: true,
      observation: {en: `QA_RESULT_${index + 1}_BODY Full frozen item result.`, zh: `凍結逐項結果${index + 1}保留。`},
      recommendation: {en: `QA_RESULT_${index + 1}_ADVICE Full frozen item advice.`, zh: `凍結逐項建議${index + 1}保留。`}})),
    findings};
  const improvements = findings.map((finding, index) => {
    const suffix = index === 0 ? 'alpha' : 'beta', marker = suffix.toUpperCase(), percent = index === 0 ? 65 : 40;
    return {...base(`qa-action-${suffix}-01`), title: `QA_${marker}_ACTION_TITLE 合成細目改善${index + 1}`,
      content: {en: `QA_${marker}_ACTION_BEGIN Preserve this complete existing item improvement without replacing it. QA_${marker}_ACTION_END`,
        zh: `合成細目改善${index + 1}全文開始，原事項與內容不得因分類改變而重新建立，全文結束。`},
      itemIds: [...finding.itemIds], departmentIds: ['qa-department'], assigneeIds: ['qa-person'], source: 'external',
      inspectionId: inspection.id, findingId: finding.id, sourceKey: `${inspection.id}:${finding.id}`,
      urgency: index === 0 ? 'urgent' : 'low', status: 'in_progress', percent, targetDate: '2026-12-31',
      plan: `QA_${marker}_PLAN_BEGIN Keep the original plan 原執行計劃保留 QA_${marker}_PLAN_END`,
      events: [
        {id: `qa-event-${suffix}-01`, at: '2026-10-01T01:00:00Z', by: 'qa-person', status: 'open', percent: 0,
          content: `QA_${marker}_FIRST_PROGRESS_BEGIN Keep the first progress entry 第一筆原始進度 QA_${marker}_FIRST_PROGRESS_END`},
        {id: `qa-event-${suffix}-02`, at: '2026-10-02T02:00:00Z', by: 'qa-person', status: 'in_progress', percent,
          content: `QA_${marker}_SECOND_PROGRESS_BEGIN Keep the later progress entry 第二筆原始進度 QA_${marker}_SECOND_PROGRESS_END`},
      ], closedAt: null, closedBy: null, sources: structuredClone(finding.sources)};
  });
  const state = {frameworks: [framework], chapters: [chapter], items, assessments: [], inspections: [inspection], improvements,
    people: [{...base('qa-person'), username: 'synthetic-qa', name: 'Synthetic QA 合成人員', departmentId: 'qa-department', role: 'operator', active: true, hasPassword: false}],
    settings: {...base('settings'), departments: [{id: 'qa-department', name: {en: 'Synthetic QA department', zh: '合成測試部門'}, active: true}],
      rolePermissions: structuredClone(permissions), siteGateConfigured: false},
    dryScores: [], auditLogs: [], cycles: [], provenance: [], serverTime: '2026-10-02T03:00:00Z', snapshotToken: 'SYNTHETIC_FC_REPORT_SNAPSHOT'};
  return {state, inspection, ids: improvements.map(row => row.id)};
}

// Ignore only presentation whitespace introduced by wrapping. No Unicode/ID
// normalization, aliases, truncation, or expected text synthesized from actual text.
const compact = text => text.replace(/\s/gu, '');
function includesAll(actual, expected, context) {
  for (const value of expected) assert.ok(compact(actual).includes(compact(value)), `${context}: missing complete value ${JSON.stringify(value)}`);
}
function uniqueField(fields, predicate, context) {
  const matches = fields.filter(predicate);
  assert.equal(matches.length, 1, `${context}: expected one decoded PDF field`);
  return matches[0];
}
const rowPrefix = field => field.id.split(':').slice(0, 3).join(':');
function cell(fields, identity, column) {
  const id = `${rowPrefix(identity)}:${column}`;
  return uniqueField(fields, field => field.id === id, id).text;
}
const label = (classification, lang) => ({finding: {zh: '缺失', en: 'Observation'}, ofi: {zh: '建議改善', en: 'OFI'}}[classification][lang]);
const sourceValues = sources => sources.flatMap(source => [source.source, source.file, source.rawItem, source.note, `p.${source.pages.join(',')}`]);
const statusLabel = (status, lang) => lang === 'en' ? status : {open: '開啟', in_progress: '進行中', closed: '結案'}[status];

// Field positions come from the existing public report callback, never its text.
// Every asserted character is decoded independently from the saved PDF by PyMuPDF.
// Baseline/column matching excludes headers/footers inserted inside continued fields.
const extractPython = String.raw`
import json, sys, pymupdf
result = {"pymupdfVersion": pymupdf.__version__, "reports": []}
for spec in json.load(sys.stdin):
    with pymupdf.open(spec["path"]) as doc:
        spans_by_page = []
        for page in doc:
            spans_by_page.append([span for block in page.get_text("dict")["blocks"] if "lines" in block for line in block["lines"] for span in line["spans"]])
        fields = {}
        for line in spec["fieldLines"]:
            spans = [span for span in spans_by_page[line["page"]]
                     if abs(span["origin"][1] - line["baseline"]) < 0.75
                     and span["origin"][0] >= line["x"] - 0.75
                     and span["bbox"][2] <= line["x"] + line["width"] + 0.75]
            text = "".join(span["text"] for span in sorted(spans, key=lambda span: span["origin"][0]))
            fields.setdefault(line["fieldId"], []).append(text)
        result["reports"].append({"path": spec["path"], "pages": len(doc), "text": "\n".join(page.get_text() for page in doc),
            "fields": [{"id": key, "text": "\n".join(lines)} for key, lines in fields.items()]})
print(json.dumps(result, ensure_ascii=True))
`;

const savedFetch = globalThis.fetch;
let networkAttempts = 0;
globalThis.fetch = async () => {networkAttempts++; throw new Error('Network access is disabled for synthetic report QA');};
let fixture;
let fixtureBefore;
const generated = [];
try {
  receipt.inputHashes.before = {product: hashes(productPaths), probe: hashes(probePaths), fonts: hashes(fontPaths)};
  const {DEFAULT_PERMISSIONS} = await import('../src/domain.ts');
  const {buildInspectionPdf, buildImprovementsPdf} = await import('../src/reports.ts');
  fixture = freeze(syntheticFixture(DEFAULT_PERMISSIONS));
  fixtureBefore = JSON.stringify(fixture);
  receipt.fixture = {source: 'Inline synthetic fixture in this probe; no external data', beforeSha256: hash(fixtureBefore),
    inspectionIds: [fixture.inspection.id], findingIds: fixture.inspection.findings.map(row => row.id),
    improvementIds: fixture.ids, sourceKeys: fixture.state.improvements.map(row => row.sourceKey)};
  const options = {fontBytes: new Uint8Array(readFileSync(join(root, fontPaths[0]))),
    fallbackFontBytes: fontPaths.slice(1).map(path => new Uint8Array(readFileSync(join(root, path))))};
  for (const spec of specs) {
    const before = JSON.stringify(fixture);
    const fieldLines = [];
    try {
      const configured = {...options, onFieldLine: line => fieldLines.push({...line})};
      const bytes = spec.kind === 'inspection'
        ? await buildInspectionPdf(fixture.state, fixture.inspection.id, spec.lang, configured)
        : await buildImprovementsPdf(fixture.state, fixture.ids, spec.lang, undefined, configured);
      assert.equal(Buffer.from(bytes).subarray(0, 5).toString('ascii'), '%PDF-');
      const path = join(out, spec.name);
      writeFileSync(path, bytes);
      const actual = readFileSync(path);
      assert.equal(hash(actual), hash(bytes), 'Saved bytes must equal the actual builder result');
      const artifact = {...spec, path: pathText(path), bytes: actual.length, sha256: hash(actual)};
      receipt.pdfs.push(artifact);
      generated.push({spec, artifact, fieldLines});
      check(`${prefix(spec)}-build`, () => assert.ok(actual.length > 0));
    } catch (error) {
      check(`${prefix(spec)}-build`, () => {throw error;});
    } finally {
      check(`${prefix(spec)}-unchanged`, () => assert.equal(JSON.stringify(fixture), before, 'Export must not mutate source, action or selection'));
    }
  }
  const extraction = spawnSync('uv', ['run', '--offline', '--no-project', '--python', '3.12', '--with', 'pymupdf', 'python', '-c', extractPython], {
    input: JSON.stringify(generated.map(({artifact, fieldLines}) => ({path: artifact.path, fieldLines}))),
    encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(extraction.status, 0, extraction.error?.message ?? extraction.stderr ?? 'PyMuPDF extraction failed');
  const decoded = JSON.parse(extraction.stdout.trim());
  receipt.runtime.pymupdf = decoded.pymupdfVersion;
  assert.equal(decoded.reports.length, generated.length);
  const extractionPath = join(out, 'extraction.json');
  writeFileSync(extractionPath, JSON.stringify({method: 'Saved PDF text; callback coordinates identify fields, not their contents',
    fieldLines: generated.map(({artifact, fieldLines}) => ({path: artifact.path, fieldLines})), ...decoded}, null, 2));
  receipt.extraction = {path: pathText(extractionPath), sha256: hash(readFileSync(extractionPath))};
  for (const {spec, artifact} of generated) {
    const document = decoded.reports.find(report => report.path === artifact.path);
    assert.ok(document && document.pages > 0 && document.text.length > 0, `No selectable text: ${spec.name}`);
    const textPath = `${artifact.path}.txt`;
    writeFileSync(textPath, document.text);
    Object.assign(artifact, {pages: document.pages, textPath, textSha256: hash(readFileSync(textPath)), decodedFields: document.fields.length});
    const {fields} = document;
    if (spec.kind === 'inspection') {
      const identity = finding => uniqueField(fields, field => field.id.startsWith('t:') && compact(field.text) === compact(`${finding.id}\n${label(finding.classification, spec.lang)}`), finding.id);
      check(`${prefix(spec)}-classification`, () => {
        includesAll(document.text, ['缺失', '建議改善'].map((value, index) => spec.lang === 'zh' ? value : ['Observation', 'OFI'][index]), spec.name);
        for (const finding of fixture.inspection.findings) identity(finding);
      });
      check(`${prefix(spec)}-source-content`, () => {
        includesAll(document.text, [fixture.inspection.id], spec.name);
        for (const finding of fixture.inspection.findings) {
          const row = identity(finding);
          includesAll(cell(fields, row, 1), finding.itemIds.map(id => fixture.inspection.snapshot.items.find(item => item.id === id).code), `${finding.id} item links`);
          includesAll(cell(fields, row, 2), [finding.observation.en, finding.observation.zh], `${finding.id} full body`);
          includesAll(cell(fields, row, 3), [finding.recommendation.en, finding.recommendation.zh], `${finding.id} full advice`);
          includesAll(cell(fields, row, 4), sourceValues(finding.sources), `${finding.id} full source`);
        }
      });
      check(`${prefix(spec)}-frozen-results`, () => {
        includesAll(document.text, [fixture.inspection.snapshot.scoringVersion], 'frozen scoring version');
        for (const result of fixture.inspection.results) {
          for (const text of [result.observation.en, result.observation.zh, result.recommendation.en, result.recommendation.zh])
            assert.ok(fields.some(field => compact(field.text).includes(compact(text))), `Missing complete frozen result: ${text}`);
        }
        for (const item of fixture.inspection.snapshot.items) {
          for (const text of [item.kpi.en, item.kpi.zh, item.guidance.en, item.guidance.zh])
            assert.ok(fields.some(field => compact(field.text).includes(compact(text))), `Missing frozen definition: ${text}`);
        }
      });
    } else {
      const identity = action => uniqueField(fields, field => /^t:\d+:\d+:0$/.test(field.id) && compact(field.text).includes(compact(action.id)), action.id);
      check(`${prefix(spec)}-classification`, () => {
        includesAll(document.text, spec.lang === 'zh' ? ['缺失', '建議改善'] : ['Observation', 'OFI'], spec.name);
        for (const action of fixture.state.improvements) {
          const finding = fixture.inspection.findings.find(row => row.id === action.findingId);
          const classLabel = spec.lang === 'zh' ? '分類' : 'Classification';
          includesAll(identity(action).text, [`${classLabel}: ${label(finding.classification, spec.lang)}`], `${action.id} bound source class`);
          const wrongClass = finding.classification === 'finding' ? 'ofi' : 'finding';
          assert.equal(compact(identity(action).text).includes(compact(`${classLabel}: ${label(wrongClass, spec.lang)}`)), false);
        }
      });
      check(`${prefix(spec)}-source-content`, () => {
        for (const action of fixture.state.improvements) {
          const row = identity(action);
          includesAll(row.text, [action.id, action.inspectionId, action.findingId, action.sourceKey, ...sourceValues(action.sources)], `${action.id} full identity/source`);
          includesAll(cell(fields, row, 1), action.itemIds.flatMap(id => [id, fixture.state.items.find(item => item.id === id).code]), `${action.id} stable item links`);
          includesAll(cell(fields, row, 2), [action.title, action.content.en, action.content.zh], `${action.id} complete existing content`);
          includesAll(cell(fields, row, 3), [action.targetDate, action.plan], `${action.id} plan`);
        }
      });
      check(`${prefix(spec)}-progress`, () => {
        for (const action of fixture.state.improvements) {
          const row = identity(action);
          const status = spec.lang === 'zh' ? '狀態' : 'Status', urgency = spec.lang === 'zh' ? '急迫' : 'Urgency';
          const urgencyValue = spec.lang === 'en' ? action.urgency : {urgent: '緊急', low: '低'}[action.urgency];
          includesAll(row.text, [`${status}: ${statusLabel(action.status, spec.lang)} | ${action.percent}%`, `${urgency}: ${urgencyValue}`], `${action.id} independent progress and urgency`);
          const events = cell(fields, row, 4);
          for (const [index, event] of action.events.entries()) includesAll(events,
            [`#${index + 1} ${event.id}`, event.at, event.content, fixture.state.people.find(person => person.id === event.by).name,
              `${status}: ${statusLabel(event.status, spec.lang)} | ${event.percent}%`], `${action.id} complete event ${event.id}`);
          assert.ok(events.indexOf(action.events[0].id) < events.indexOf(action.events[1].id), 'Original progress order must survive');
        }
      });
    }
  }
} catch (error) {
  receipt.failure = {name: error.name, message: error.message};
} finally {
  globalThis.fetch = savedFetch;
  check('FC-REPORT-FIXTURE-UNCHANGED', () => {
    assert.ok(fixture && fixtureBefore, 'Fixture was not built');
    const after = JSON.stringify(fixture);
    receipt.fixture.afterSha256 = hash(after);
    assert.equal(after, fixtureBefore);
    assert.deepEqual(JSON.parse(after), JSON.parse(fixtureBefore));
    for (const action of fixture.state.improvements) assert.equal(Object.hasOwn(action, 'classification'), false);
  });
  check('FC-REPORT-EXACT-INVENTORY', () => {
    assert.deepEqual(readdirSync(out).filter(name => name.endsWith('.pdf')).sort(), specs.map(spec => spec.name).sort());
    assert.deepEqual(receipt.pdfs.map(row => row.path).sort(), [...receipt.expectedPdfs].sort());
    for (const artifact of receipt.pdfs) {
      assert.ok(artifact.pages > 0 && artifact.decodedFields > 0, `${artifact.name} lacks actual text extraction`);
      assert.equal(hash(readFileSync(artifact.path)), artifact.sha256);
    }
  });
  check('FC-REPORT-NO-NETWORK', () => assert.equal(networkAttempts, 0));
  receipt.networkAttempts = networkAttempts;
  check('FC-REPORT-INPUT-HASHES', () => {
    receipt.inputHashes.after = {product: hashes(productPaths), probe: hashes(probePaths), fonts: hashes(fontPaths)};
    assert.deepEqual(receipt.inputHashes.after, receipt.inputHashes.before, 'Relevant source/probe/font bytes changed during this run');
  });
  const seen = new Set(receipt.cases.map(row => row.id));
  for (const id of expectedCaseIds) if (!seen.has(id)) receipt.cases.push({id, status: 'NOT_RUN'});
  receipt.caseCounts = Object.fromEntries(['PASS', 'FAIL', 'NOT_RUN'].map(status => [status, receipt.cases.filter(row => row.status === status).length]));
  receipt.status = !receipt.failure && receipt.cases.length === expectedCaseIds.length && receipt.cases.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL';
  receipt.finishedAt = new Date().toISOString();
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({status: receipt.status, caseCounts: receipt.caseCounts,
    pdfs: receipt.pdfs.map(({path, pages, sha256}) => ({path, pages, sha256})), receipt: pathText(receiptPath),
    failures: receipt.cases.filter(row => row.status !== 'PASS'), failure: receipt.failure}));
  if (receipt.status !== 'PASS') process.exitCode = 1;
}
