import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PERMISSIONS} from '../src/domain.ts';
import {
  findingClassifications,
  findingClassificationLabel,
  improvementFindingClassification,
  isActionableFinding,
} from '../src/findingClassification.ts';
import {inspectionSummary, mergeAcknowledgement} from '../src/syncState.ts';
import type {BrowseState, Finding, Improvement, Inspection, LiveView, PlatformState, ReadonlyInspectionSummary} from '../src/types.ts';

// Regression/characterization of the existing candidate, not manufactured test-first RED.
// Native creation, persistence, UI and hydration acceptance belong to their own probes.
const classifications = ['finding', 'ofi', 'positive', 'guidance', 'no_finding', 'general'] as const;
const modes = ['full', 'thin'] as const;
const base = (id: string) => ({id, version: 1, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z', updatedBy: 'qa-person'});
const labels: Record<Finding['classification'], readonly [string, string]> = {
  finding: ['缺失', 'Observation'],
  ofi: ['建議改善', 'OFI'],
  positive: ['正面觀察', 'Positive observation'],
  guidance: ['指引', 'Guidance'],
  no_finding: ['無缺失', 'No finding'],
  general: ['一般觀察（非自動判No）', 'General observation (not automatically No)'],
};

function fixture(classification: Finding['classification'] = 'finding') {
  const framework: PlatformState['frameworks'][number] = {
    ...base('TMSA'), name: {en: 'Synthetic TMSA', zh: '合成測試體系'},
    description: {en: 'Synthetic only', zh: '僅合成資料'}, scoring: 'tmsa-stage', active: true,
    sourceVersion: 'QA', scopeLabel: {en: 'Synthetic scope', zh: '合成測試範圍'},
  };
  const chapter: PlatformState['chapters'][number] = {
    ...base('qa-chapter'), frameworkId: 'TMSA', code: '1', name: {en: 'Synthetic chapter', zh: '合成測試分章'}, order: 1, active: true,
  };
  const items: PlatformState['items'] = ['a', 'b'].map((suffix, index) => ({
    ...base(`qa-item-${suffix}`), frameworkId: 'TMSA', chapterId: chapter.id, code: `1.1.${index + 1}`,
    level: 1, order: index, active: true, kpi: {en: `Synthetic KPI ${suffix}`, zh: `合成指標 ${suffix}`},
    guidance: {en: `Synthetic guidance ${suffix}`, zh: `合成指引 ${suffix}`}, departmentIds: ['qa-department'], sources: [],
  }));
  const finding: Finding = {
    id: 'qa-shared-finding', itemIds: items.map(item => item.id), classification,
    observation: {en: 'Preserve the original finding body.', zh: '保留原始發現全文。'},
    recommendation: {en: 'Preserve the original recommendation.', zh: '保留原始建議全文。'},
    sources: [{source: 'Synthetic source', rawItem: '1,1,1', note: 'Preserve this literal token.'}],
  };
  const inspection: Inspection = {
    ...base('qa-inspection-a'), frameworkId: 'TMSA', title: 'Synthetic inspection', organization: 'QA',
    date: '2026-10-01', type: 'formal', status: 'final', imported: true,
    snapshot: {framework, chapters: [chapter], items, scoringVersion: 'QA_FROZEN'},
    results: items.map(item => ({itemId: item.id, response: 'yes', conformity: 'all', reviewed: true,
      observation: {en: 'Unchanged result', zh: '原評定保留'}, recommendation: {en: '', zh: ''}})),
    findings: [finding],
  };
  const action: Improvement = {
    ...base('qa-action-original'), title: 'Original item improvement',
    content: {en: 'Keep the complete existing improvement.', zh: '完整保留原有細目改善事項。'},
    itemIds: [...finding.itemIds], departmentIds: ['qa-department'], assigneeIds: ['qa-person'],
    source: 'external', inspectionId: inspection.id, findingId: finding.id, sourceKey: `${inspection.id}:${finding.id}`,
    urgency: 'urgent', status: 'in_progress', percent: 65, targetDate: '2026-12-31', plan: 'Original plan 原計劃',
    events: [
      {id: 'qa-event-original-1', at: '2026-10-01T00:00:00Z', by: 'qa-person', content: 'Original first progress 原進度一', status: 'open', percent: 0},
      {id: 'qa-event-original-2', at: '2026-10-02T00:00:00Z', by: 'qa-person', content: 'Original second progress 原進度二', status: 'in_progress', percent: 65},
    ],
    closedAt: null, closedBy: null, sources: structuredClone(finding.sources),
  };
  const state: PlatformState = {
    frameworks: [framework], chapters: [chapter], items, assessments: [], inspections: [inspection], improvements: [action],
    people: [], settings: {...base('settings'), departments: [], rolePermissions: structuredClone(DEFAULT_PERMISSIONS), siteGateConfigured: false},
    dryScores: [], auditLogs: [], cycles: [], provenance: [], serverTime: '2026-10-02T00:00:00Z', snapshotToken: 'SYNTHETIC_ONLY',
  };
  return {state, inspection, finding, action};
}

function thin(state: PlatformState): LiveView {
  const {cycles, provenance, ...rest} = state;
  return {...rest, inspections: state.inspections.map(inspectionSummary), historyMode: 'readonly-summary-v1',
    controlSummary: {cycles: cycles.length, provenance: provenance.length}};
}

function view(state: PlatformState, mode: typeof modes[number]): BrowseState {
  return mode === 'full' ? state : thin(state);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function projectWithoutMutation(state: Pick<BrowseState, 'inspections'>, action: Improvement) {
  const before = structuredClone({state, action});
  const serialized = JSON.stringify({state, action});
  const keys = Reflect.ownKeys(action);
  deepFreeze(state);
  deepFreeze(action);
  const result = improvementFindingClassification(state, action);
  assert.deepEqual({state, action}, before, 'Projection must not change any source or improvement value');
  assert.equal(JSON.stringify({state, action}), serialized, 'Serialization must remain byte-for-byte equal');
  assert.deepEqual(Reflect.ownKeys(action), keys, 'Projection must not create a writable classification copy');
  assert.equal(Object.hasOwn(action, 'classification'), false);
  return result;
}

test('FC-ENUM: stored values add OFI without removing or renaming existing classes', () => {
  assert.deepEqual(findingClassifications, [...classifications]);
});

for (const classification of classifications) {
  test(`FC-ACTIONABLE-${classification}: only finding and ofi allow the actionable path`, () => {
    assert.equal(isActionableFinding(classification), classification === 'finding' || classification === 'ofi');
  });
  test(`FC-LABEL-${classification}: exact Traditional Chinese and English labels`, () => {
    assert.equal(findingClassificationLabel(classification, 'zh'), labels[classification][0]);
    assert.equal(findingClassificationLabel(classification, 'en'), labels[classification][1]);
  });
  test(`FC-PARITY-${classification}: full findings and real thin projection agree without mutation`, () => {
    const {state, action} = fixture(classification);
    const summary = thin(state);
    assert.equal(projectWithoutMutation(state, action), classification);
    assert.equal(projectWithoutMutation(summary, action), classification);
    assert.equal('findings' in summary.inspections[0], false);
  });
}

test('FC-LABEL-UNLOADED: absent classification is explicitly unloaded, never Observation', () => {
  assert.equal(findingClassificationLabel(null, 'zh'), '分類未載入');
  assert.equal(findingClassificationLabel(null, 'en'), 'Classification not loaded');
});

test('FC-SUMMARY-MAP: real summary maps all source IDs exactly and omits finding narratives', () => {
  const {inspection, finding} = fixture();
  inspection.findings = classifications.map(classification => ({...finding, id: `qa-${classification}`, classification}));
  const before = JSON.stringify(inspection);
  const summary = inspectionSummary(deepFreeze(inspection));
  assert.deepEqual(summary.findingClassifications, Object.fromEntries(classifications.map(value => [`qa-${value}`, value])));
  assert.equal(summary.counts.findings, classifications.length);
  assert.equal('findings' in summary, false);
  assert.equal(JSON.stringify(summary).includes(finding.observation.en), false);
  assert.equal(JSON.stringify(summary).includes(finding.recommendation.zh), false);
  assert.equal(JSON.stringify(inspection), before);
});

for (const mode of modes) {
  test(`FC-ACK-ROUNDTRIP-${mode}: confirmed finding to ofi to finding changes only the display projection`, () => {
    const {state, inspection, action} = fixture();
    let current = view(state, mode);
    let full = inspection;
    const originalAction = structuredClone(action);
    const originalActionJson = JSON.stringify(action);
    assert.equal(projectWithoutMutation(current, action), 'finding');
    for (const classification of ['ofi', 'finding'] as const) {
      const previous = current;
      const previousJson = JSON.stringify(previous);
      const previousFull = full;
      full = {...full, version: full.version + 1, findings: full.findings.map(finding => ({...finding, classification}))};
      // The real acknowledgement reducer represents an already-confirmed server body;
      // this pure test does not claim to perform a save or a database transaction.
      current = mergeAcknowledgement(previous, 'inspection', deepFreeze(full));
      assert.equal(JSON.stringify(previous), previousJson);
      assert.equal(current.improvements, previous.improvements, 'Keep the same existing improvement collection');
      assert.equal(current.improvements[0], action, 'Keep the exact improvement object, not a replacement row');
      assert.deepEqual(current.improvements[0], originalAction);
      assert.equal(JSON.stringify(action), originalActionJson);
      assert.deepEqual(full.snapshot, previousFull.snapshot);
      assert.deepEqual(full.results, previousFull.results, 'Neither class manufactures a No assessment');
      assert.deepEqual({...full.findings[0], classification: previousFull.findings[0].classification}, previousFull.findings[0]);
      assert.equal(projectWithoutMutation(current, action), classification);
      assert.equal(findingClassificationLabel(improvementFindingClassification(current, action), 'zh'), labels[classification][0]);
      assert.equal(findingClassificationLabel(improvementFindingClassification(current, action), 'en'), labels[classification][1]);
    }
  });

  test(`FC-INSPECTION-ISOLATION-${mode}: repeated finding IDs never cross inspection boundaries`, () => {
    const {state, inspection, action} = fixture('finding');
    const other: Inspection = {...structuredClone(inspection), id: 'qa-inspection-b',
      findings: inspection.findings.map(finding => ({...finding, classification: 'ofi'}))};
    state.inspections = [other, inspection]; // A global finding-ID search would incorrectly choose OFI.
    const otherAction = {...action, id: 'qa-action-other', inspectionId: other.id, sourceKey: `${other.id}:${action.findingId}`};
    const current = view(state, mode);
    assert.equal(projectWithoutMutation(current, action), 'finding');
    assert.equal(projectWithoutMutation(current, otherAction), 'ofi');
    const onlyOther = {inspections: current.inspections.filter(row => row.id === other.id)};
    assert.equal(projectWithoutMutation(onlyOther, action), null, 'A matching finding in the wrong inspection is not a source');
  });

  test(`FC-NONEXTERNAL-${mode}: leftover external-looking IDs cannot classify a company improvement`, () => {
    const {state, action} = fixture('ofi');
    assert.equal(projectWithoutMutation(view(state, mode), {...action, source: 'non_external'}), null);
  });

  test(`FC-MISSING-SOURCE-${mode}: absent inspection or finding references remain unknown`, () => {
    const {state, action} = fixture('ofi');
    const current = view(state, mode);
    const candidates: Improvement[] = [
      {...action, inspectionId: undefined}, {...action, findingId: undefined},
      {...action, inspectionId: ''}, {...action, findingId: ''},
      {...action, inspectionId: 'missing', sourceKey: `missing:${action.findingId}`},
      {...action, findingId: 'missing', sourceKey: `${action.inspectionId}:missing`},
    ];
    for (const candidate of candidates) assert.equal(projectWithoutMutation(current, candidate), null);
    assert.equal(projectWithoutMutation({inspections: []}, action), null);
  });

  test(`FC-FORGED-SOURCEKEY-${mode}: plausible but nonmatching keys cannot redirect the lookup`, () => {
    const {state, inspection, action} = fixture('ofi');
    state.inspections.push({...structuredClone(inspection), id: 'qa-inspection-b'});
    const current = view(state, mode);
    for (const sourceKey of [
      `qa-inspection-b:${action.findingId}`, `${action.inspectionId}:other-finding`,
      `${action.sourceKey}:suffix`, `prefix:${action.sourceKey}`, ` ${action.sourceKey}`,
      `${action.sourceKey} `, action.sourceKey!.toUpperCase(),
    ]) assert.equal(projectWithoutMutation(current, {...action, sourceKey}), null, sourceKey);
    assert.equal(projectWithoutMutation(current, action), 'ofi', 'Exact bound source key remains valid');
  });

  test(`FC-LEGACY-KEY-${mode}: an omitted sourceKey still requires the exact inspection and finding IDs`, () => {
    const {state, action} = fixture('ofi');
    const {sourceKey: _sourceKey, ...legacy} = action;
    assert.equal(projectWithoutMutation(view(state, mode), legacy), 'ofi');
  });

  test(`FC-NONAUTHORITATIVE-COPY-${mode}: an extra action classification cannot override history`, () => {
    const {state, action} = fixture('ofi');
    const forged = deepFreeze({...action, classification: 'finding'});
    const before = JSON.stringify(forged);
    assert.equal(improvementFindingClassification(deepFreeze(view(state, mode)), forged), 'ofi');
    assert.equal(JSON.stringify(forged), before, 'Even a malformed input is read, not repaired or rewritten');
  });
}

for (const classification of ['finding', 'ofi'] as const) {
  test(`FC-DIMENSIONS-${classification}: urgency, progress and status do not replace source classification`, () => {
    const {state, action} = fixture(classification);
    for (const mode of modes) for (const urgency of ['urgent', 'high', 'medium', 'low'] as const) {
      for (const status of ['open', 'in_progress', 'closed'] as const) {
        const candidate: Improvement = {...action, urgency, status, percent: status === 'closed' ? 100 : status === 'open' ? 0 : 65,
          closedAt: status === 'closed' ? '2026-10-03T00:00:00Z' : null, closedBy: status === 'closed' ? 'qa-person' : null};
        assert.equal(projectWithoutMutation(view(state, mode), candidate), classification);
      }
    }
  });
}

for (const variant of ['legacy-map-absent', 'empty-map', 'missing-entry', 'invalid-value'] as const) {
  test(`FC-THIN-UNKNOWN-${variant}: never infer finding from summary counts or improvement content`, () => {
    const {inspection, action} = fixture('ofi');
    const {findingClassifications: _map, ...legacy} = inspectionSummary(inspection);
    const maps: Record<typeof variant, Record<string, Finding['classification']> | undefined> = {
      'legacy-map-absent': undefined,
      'empty-map': {},
      'missing-entry': {'some-other-finding': 'finding'},
      'invalid-value': {[action.findingId!]: 'unrecognized' as Finding['classification']},
    };
    const summary: ReadonlyInspectionSummary = variant === 'legacy-map-absent' ? legacy : {...legacy, findingClassifications: maps[variant]};
    assert.ok(summary.counts.findings > 0, 'This must be a nonempty legacy history, not an empty-state test');
    assert.equal(projectWithoutMutation({inspections: [summary]}, action), null);
  });
}

test('FC-THIN-OWN-ENTRY: an inherited map entry is not authoritative source metadata', () => {
  const {inspection, action} = fixture('ofi');
  const inherited = Object.create({[action.findingId!]: 'finding'}) as Record<string, Finding['classification']>;
  const summary = deepFreeze({...inspectionSummary(inspection), findingClassifications: inherited});
  assert.equal(Object.hasOwn(inherited, action.findingId!), false);
  assert.equal(improvementFindingClassification({inspections: [summary]}, deepFreeze(action)), null);
  assert.equal(Object.hasOwn(action, 'classification'), false);
});

test('FC-FULL-AUTHORITY: full findings override a conflicting incidental summary map', () => {
  const {inspection, action} = fixture('ofi');
  const full = {...inspection, findingClassifications: {[action.findingId!]: 'finding' as const}};
  assert.equal(projectWithoutMutation({inspections: [full]}, action), 'ofi');
  assert.equal(projectWithoutMutation({inspections: [{...full, findings: []}]}, action), null);
});

test('FC-FULL-INVALID: unrecognized full classification stays unloaded instead of defaulting', () => {
  const {inspection, action} = fixture();
  const invalid = {...inspection, findings: inspection.findings.map(finding => ({...finding, classification: 'unknown' as Finding['classification']}))};
  assert.equal(projectWithoutMutation({inspections: [invalid]}, action), null);
});
