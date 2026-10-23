import type { BrowseState, Improvement } from './types';
import { filteredImprovements } from './domain.ts';
import {improvementReferenceIndex,improvementHasChapter} from './improvementReferences.ts';
import { validProposedDate } from './improvementTracking.ts';
import type { Filters } from './domain';

export const IMPROVEMENTS_PER_PAGE = 40;
export interface ImprovementListFilters extends Filters {
  itemId?: string;
  sources?: NonNullable<ImprovementListFilters['source']>[];
  chapterIds?: string[];
  departmentIds?: string[];
  personIds?: string[];
  source?: '' | Exclude<Improvement['source'], 'external'> | `inspection:${string}`;
  proposedFrom?: string;
  proposedTo?: string;
  // This is a display restriction, not a new persisted lifecycle status.
  unfinished?: boolean;
}
export type ImprovementListView = 'all' | 'unfinished' | 'completed';
export function improvementListView(filters: ImprovementListFilters): ImprovementListView {
  return filters.status === 'closed' ? 'completed' : filters.unfinished || filters.status ? 'unfinished' : 'all';
}
export function withImprovementListView(filters: ImprovementListFilters, view: ImprovementListView): ImprovementListFilters {
  return { ...filters, status: view === 'completed' ? 'closed' : '', unfinished: view === 'unfinished' };
}
// Shared by the displayed result set AND the canonical export recheck. Never page before filtering.
export function filterImprovementList(state: BrowseState, filters: ImprovementListFilters): Improvement[] {
  const references=improvementReferenceIndex(state);
  const sources=filters.sources??(filters.source?[filters.source]:[]);
  const chapters=filters.chapterIds??(filters.chapterId?[filters.chapterId]:[]);
  const departments=filters.departmentIds??(filters.departmentId?[filters.departmentId]:[]);
  const people=filters.personIds??(filters.personId?[filters.personId]:[]);
  const rows = filteredImprovements(state, {...filters,chapterId:undefined,departmentId:undefined,personId:undefined}).filter(record =>
    (!chapters.length||chapters.some(id=>improvementHasChapter(references,record,id))) &&
    (!departments.length||departments.some(id=>record.departmentIds.includes(id))) &&
    (!people.length||people.some(id=>record.assigneeIds.includes(id))) &&
    (!filters.itemId || record.itemIds.includes(filters.itemId)) &&
    (!filters.unfinished || record.status !== 'closed') &&
    (!sources.length || sources.some(source=>source.startsWith('inspection:')
      ? record.source === 'external' && record.inspectionId === source.slice('inspection:'.length)
      : record.source === source)) &&
    (!(filters.proposedFrom || filters.proposedTo) || !!record.proposedDate && validProposedDate(record.proposedDate) &&
      (!filters.proposedFrom || record.proposedDate >= filters.proposedFrom) && (!filters.proposedTo || record.proposedDate <= filters.proposedTo))
  );
  // The management-review register is the same cohort, ordered by its own date.
  return sources.length===1 && sources[0] === 'management_review' ? rows.sort((a,b) => (b.proposedDate ?? '').localeCompare(a.proposedDate ?? '')) : rows;
}
export function improvementPage<T>(rows: readonly T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(rows.length / IMPROVEMENTS_PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * IMPROVEMENTS_PER_PAGE;
  return { page, pages, total: rows.length, start: rows.length ? offset + 1 : 0, end: Math.min(offset + IMPROVEMENTS_PER_PAGE, rows.length), rows: rows.slice(offset, offset + IMPROVEMENTS_PER_PAGE) };
}
