import type {BrowseState,Finding,Improvement,Language} from './types';

export const findingClassifications: Finding['classification'][] = ['finding','ofi','positive','guidance','no_finding','general'];
export const isActionableFinding = (classification: Finding['classification']): boolean => classification === 'finding' || classification === 'ofi';
export function findingClassificationLabel(value: Finding['classification'] | null, lang: Language): string {
  const labels = {finding:['缺失','Observation'],ofi:['建議改善','OFI'],positive:['正面觀察','Positive observation'],guidance:['指引','Guidance'],no_finding:['無缺失','No finding'],general:['一般觀察（非自動判No）','General observation (not automatically No)']};
  return value ? labels[value][lang === 'zh' ? 0 : 1] : lang === 'zh' ? '分類未載入' : 'Classification not loaded';
}
/** Source-owned projection: no second mutable classification on an improvement. */
export function improvementFindingClassification(state: Pick<BrowseState,'inspections'>, action: Improvement): Finding['classification'] | null {
  if (action.source !== 'external' || !action.inspectionId || !action.findingId) return null;
  if (action.sourceKey && action.sourceKey !== `${action.inspectionId}:${action.findingId}`) return null;
  const inspection = state.inspections.find(row => row.id === action.inspectionId);
  if (!inspection) return null;
  const value = 'findings' in inspection ? inspection.findings.find(f => f.id === action.findingId)?.classification : inspection.findingClassifications && Object.hasOwn(inspection.findingClassifications,action.findingId) ? inspection.findingClassifications[action.findingId] : undefined;
  return value && findingClassifications.includes(value) ? value : null;
}
