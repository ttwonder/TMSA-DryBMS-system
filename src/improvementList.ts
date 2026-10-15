import type { BrowseState, Improvement } from './types';
import { filteredImprovements } from './domain.ts';
import type { Filters } from './domain';

export const IMPROVEMENTS_PER_PAGE = 40;
export interface ImprovementListFilters extends Filters {
  itemId?: string;
  source?: '' | 'non_external' | `inspection:${string}`;
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
  return filteredImprovements(state, filters).filter(record =>
    (!filters.itemId || record.itemIds.includes(filters.itemId)) &&
    (!filters.unfinished || record.status !== 'closed') &&
    (!filters.source || (filters.source === 'non_external'
      ? record.source === 'non_external'
      : filters.source.startsWith('inspection:') && record.source === 'external' && record.inspectionId === filters.source.slice('inspection:'.length)))
  );
}
export function improvementPage<T>(rows: readonly T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(rows.length / IMPROVEMENTS_PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * IMPROVEMENTS_PER_PAGE;
  return { page, pages, total: rows.length, start: rows.length ? offset + 1 : 0, end: Math.min(offset + IMPROVEMENTS_PER_PAGE, rows.length), rows: rows.slice(offset, offset + IMPROVEMENTS_PER_PAGE) };
}
