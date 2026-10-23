import type { Improvement, ImprovementSource, Language, SystemSettings } from './types';

export const STANDALONE_IMPROVEMENT_SOURCES = ['management_review', 'management_directive', 'vessel_safety_meeting', 'company_safety_meeting', 'seminar', 'external_regulatory_impact'] as const;
export const BUILTIN_IMPROVEMENT_SOURCES = ['non_external', 'external', ...STANDALONE_IMPROVEMENT_SOURCES] as const;
const labels = { external: ['外部檢查', 'External inspection'], non_external: ['內部管理需求', 'Internal management needs'], management_review: ['管理審查會議', 'Management review meeting'], management_directive: ['管理層指令', 'Management directive'], vessel_safety_meeting: ['船舶安全會議', 'Vessel safety meeting'], company_safety_meeting: ['公司安全會議', 'Company safety meeting'], seminar: ['研討會', 'Seminar'], external_regulatory_impact: ['外部法規規則影響', 'External regulatory and rule impacts'] };
export const defaultImprovementSources = (): ImprovementSource[] => BUILTIN_IMPROVEMENT_SOURCES.map(id => ({id,name:{zh:labels[id][0],en:labels[id][1]},active:true}));
/** A supplied snapshot owns its labels; never consult live/global settings. */
export function improvementSources(settings?: Pick<SystemSettings,'improvementSources'>): ImprovementSource[] {
  return settings?.improvementSources ?? defaultImprovementSources();
}
export const isStandaloneImprovement = (source: Improvement['source'], settings?: Pick<SystemSettings,'improvementSources'>) => STANDALONE_IMPROVEMENT_SOURCES.some(value => value === source) || source.startsWith('custom:') && improvementSources(settings).some(row=>row.id===source);
export const activeImprovementSource = (source: Improvement['source'], settings?: Pick<SystemSettings,'improvementSources'>) => improvementSources(settings).some(row=>row.id===source && row.active);
export function improvementSourceLabel(source: Improvement['source'], lang: Language, settings?: Pick<SystemSettings,'improvementSources'>): string {
  const row = improvementSources(settings).find(row=>row.id===source);
  return row?.name[lang] || row?.name.en || row?.name.zh || source;
}

/** Date-only business fact. No timestamp/inspection-date inference for saved rows. */
export function validProposedDate(value: string): boolean {
  if (value === '') return true;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Saved events only; real timestamps win, append order resolves ties/missing clocks. */
export function latestImprovementEvent(record: Pick<Improvement, 'events'>) {
  return record.events.reduce<Improvement['events'][number] | undefined>((latest, event) => {
    if (!latest) return event;
    const previous = Date.parse(latest.at), current = Date.parse(event.at);
    return !Number.isFinite(previous) || Number.isFinite(current) && current >= previous ? event : latest;
  }, undefined);
}
export function localToday(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
