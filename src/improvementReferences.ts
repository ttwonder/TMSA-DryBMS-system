import type { BrowseState, FrameworkId, Improvement, Language } from './types.ts';
import { richTextToPlainText } from './richText.ts';

type ReferenceState = Pick<BrowseState, 'chapters' | 'items'>;
type Links = Pick<Improvement, 'chapterIds' | 'itemIds'>;
export function improvementReferenceIndex(state: ReferenceState) {
  return { chapters: new Map(state.chapters.map(row => [row.id, row])), items: new Map(state.items.map(row => [row.id, row])) };
}
type ReferenceIndex = ReturnType<typeof improvementReferenceIndex>;

// Direct chapter references and individual item references are independent.
// These projections never expand a chapter into saved items or Item stars.
export function improvementHasChapter(index: ReferenceIndex, row: Links, chapterId: string): boolean {
  return !!row.chapterIds?.includes(chapterId) || row.itemIds.some(id => index.items.get(id)?.chapterId === chapterId);
}
export function improvementHasFramework(index: ReferenceIndex, row: Links, frameworkId: FrameworkId): boolean {
  return !!row.chapterIds?.some(id => index.chapters.get(id)?.frameworkId === frameworkId) || row.itemIds.some(id => index.items.get(id)?.frameworkId === frameworkId);
}
export function improvementReferenceLabels(index: ReferenceIndex, row: Links, lang: Language): string[] {
  return [
    ...(row.chapterIds ?? []).map(id => { const chapter = index.chapters.get(id); return chapter ? `${chapter.frameworkId} ${chapter.code}${lang === 'zh' ? '（章節）' : ' (chapter)'}` : lang === 'zh' ? '章節（未載入）' : 'Chapter (not loaded)'; }),
    ...row.itemIds.map(id => { const item = index.items.get(id); return item ? `${item.frameworkId} ${item.code}` : '—'; }),
  ];
}
export function improvementReferenceSearch(index: ReferenceIndex, row: Links): string {
  return richTextToPlainText([
    ...(row.chapterIds ?? []).map(id => { const chapter = index.chapters.get(id); return chapter ? `${chapter.code} ${chapter.name.en} ${chapter.name.zh}` : ''; }),
    ...row.itemIds.map(id => index.items.get(id)?.code ?? ''),
  ].join(' '));
}
