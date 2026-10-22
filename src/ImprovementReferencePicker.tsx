import {memo, useId, useMemo, useState} from 'react';
import type {BiText, Chapter, FrameworkId, Language, StandardItem} from './types';
import {richTextToPlainText} from './richText';

interface ImprovementReferencePickerProps {
  chapters: Chapter[];
  items: StandardItem[];
  chapterIds: string[];
  itemIds: string[];
  lang: Language;
  disabled?: boolean;
  allowedItemIds?: string[];
  allowedChapterIds?: string[];
  onChange: (value: {chapterIds: string[]; itemIds: string[]}) => void;
}
const frameworks: FrameworkId[] = ['TMSA', 'DRYBMS'];
// Same locale fallback as bi(), without depending on the editor/domain save path.
const plain = (value: BiText, lang: Language) => richTextToPlainText(value[lang] || value.en || value.zh);
const ordered = <T extends {order: number; code: string}>(a: T, b: T) => a.order - b.order || a.code.localeCompare(b.code, undefined, {numeric:true});

/** Browse state is local; only explicit chapter/item actions change references.
 * Remount with the record key when changing records. Scope filters limit NEW
 * choices, never silently clean up existing references or authorize a save.
 */
export const ImprovementReferencePicker = memo(function ImprovementReferencePicker({
  chapters, items, chapterIds, itemIds, lang, disabled = false,
  allowedItemIds, allowedChapterIds, onChange,
}: ImprovementReferencePickerProps) {
  const id = useId();
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;
  const chapterMap = useMemo(() => new Map(chapters.map(c => [c.id, c])), [chapters]);
  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const selectedChapters = useMemo(() => new Set(chapterIds), [chapterIds]);
  const selectedItems = useMemo(() => new Set(itemIds), [itemIds]);
  const allowedChapters = useMemo(() => allowedChapterIds === undefined ? undefined : new Set(allowedChapterIds), [allowedChapterIds]);
  const allowedItems = useMemo(() => allowedItemIds === undefined ? undefined : new Set(allowedItemIds), [allowedItemIds]);
  const [visibleFrameworks, setVisibleFrameworks] = useState<FrameworkId[]>(() => frameworks.filter(f =>
    chapterIds.some(key => chapterMap.get(key)?.frameworkId === f) || itemIds.some(key => itemMap.get(key)?.frameworkId === f)));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const candidates = useMemo(() => {
    const eligibleChapters = chapters.filter(c => c.active && (!allowedChapters || allowedChapters.has(c.id))).sort(ordered);
    const byChapter = new Map<string, StandardItem[]>(eligibleChapters.map(c => [c.id, []]));
    for (const item of items) {
      const chapter = chapterMap.get(item.chapterId);
      if (item.active && chapter?.frameworkId === item.frameworkId && (!allowedItems || allowedItems.has(item.id))) byChapter.get(item.chapterId)?.push(item);
    }
    for (const list of byChapter.values()) list.sort(ordered);
    return {chapters:eligibleChapters, byChapter, chapterIds:new Set(eligibleChapters.map(c => c.id)), itemIds:new Set([...byChapter.values()].flat().map(i => i.id))};
  }, [chapters, items, chapterMap, allowedChapters, allowedItems]);
  const chapterText = (c: Chapter) => `${c.frameworkId} ${c.code} · ${plain(c.name, lang)}`;
  const itemText = (i: StandardItem) => `${i.frameworkId} ${i.code} · ${plain(i.kpi, lang)}`;
  const changeChapter = (key: string, checked: boolean) => {
    if (disabled || (checked && (!candidates.chapterIds.has(key) || selectedChapters.has(key)))) return;
    onChange({chapterIds:checked ? [...chapterIds, key] : chapterIds.filter(x => x !== key), itemIds});
  };
  const changeItem = (key: string, checked: boolean) => {
    if (disabled || (checked && (!candidates.itemIds.has(key) || selectedItems.has(key)))) return;
    onChange({chapterIds, itemIds:checked ? [...itemIds, key] : itemIds.filter(x => x !== key)});
  };
  const retained = t('已保留；不在目前可選範圍', 'Retained; outside current choices');
  const heading = t('關聯章節與小項目', 'Related chapters and items');
  return <fieldset className="improvement-reference-picker" disabled={disabled} aria-label={heading} aria-describedby={`${id}-hint`}>
    <legend>{heading}</legend>
    <p className="irp-hint" id={`${id}-hint`}>{t('只選章節即可；展開後可另選小項。章節不會自動全選小項。', 'You may select chapters only, or expand to choose items separately. A chapter does not select all its items.')}</p>
    <fieldset className="irp-frameworks">
      <legend>{t('選擇體系', 'Choose frameworks')}</legend>
      <div>{frameworks.map(f => <label key={f}><input type="checkbox" checked={visibleFrameworks.includes(f)} onChange={e => {
        if (!disabled) setVisibleFrameworks(previous => e.target.checked ? [...previous, f] : previous.filter(x => x !== f));
      }}/>{f}</label>)}</div>
      <p className="irp-hint">{t('切換體系不會清除已選關聯。', 'Switching frameworks does not clear selected references.')}</p>
    </fieldset>
    <div className="irp-chapters">
      {visibleFrameworks.length === 0 && <p className="irp-hint">{t('請先選擇體系以瀏覽章節。', 'Choose a framework to browse chapters.')}</p>}
      {frameworks.filter(f => visibleFrameworks.includes(f)).map(f => <section key={f} aria-label={f} className="irp-framework-section">
        <h4>{f}</h4>
        {!candidates.chapters.some(c => c.frameworkId === f) && <p className="irp-hint">{t('沒有可新增的章節。', 'No chapters available to add.')}</p>}
        {candidates.chapters.filter(c => c.frameworkId === f).map(c => {
          const open = expanded.has(c.id), childId = `${id}-items-${encodeURIComponent(c.id)}`;
          return <div className="irp-chapter" key={c.id}>
            <div className="irp-chapter-row">
              <label><input type="checkbox" aria-label={`${t('關聯章節', 'Link chapter')} ${chapterText(c)}`} checked={selectedChapters.has(c.id)} onChange={e => changeChapter(c.id, e.target.checked)}/><span>{chapterText(c)}</span></label>
              <button type="button" aria-expanded={open} aria-controls={childId} aria-label={`${t('選擇小項目', 'Choose items')} ${f} ${c.code}`} onClick={() => {
                if (disabled) return;
                setExpanded(previous => {const next = new Set(previous); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); return next;});
              }}><span aria-hidden="true">{open ? '▾' : '▸'}</span> {t('小項目', 'Items')} ({candidates.byChapter.get(c.id)?.length ?? 0})</button>
            </div>
            <div id={childId} hidden={!open} className="irp-items" role="group" aria-label={`${t('小項目', 'Items')} ${f} ${c.code}`}>
              {open && (candidates.byChapter.get(c.id) ?? []).map(item => <label key={item.id}><input type="checkbox" checked={selectedItems.has(item.id)} onChange={e => changeItem(item.id, e.target.checked)}/><span>{itemText(item)}</span></label>)}
              {open && !candidates.byChapter.get(c.id)?.length && <p className="irp-hint">{t('沒有可新增的小項目。', 'No items available to add.')}</p>}
            </div>
          </div>;
        })}
      </section>)}
    </div>
    <section className="irp-selected" aria-label={t('已選關聯', 'Selected references')}>
      <h4>{t('已選關聯', 'Selected references')} <span className="irp-hint">{t(`${selectedChapters.size} 章節 · ${selectedItems.size} 小項目`, `${selectedChapters.size} chapters · ${selectedItems.size} items`)}</span></h4>
      {!selectedChapters.size && !selectedItems.size && <p className="irp-hint">{t('尚未選擇。', 'None selected.')}</p>}
      <ul>
        {[...selectedChapters].map(key => {const c = chapterMap.get(key), text = c ? chapterText(c) : key;return <li key={`chapter-${key}`}>
          <span className="irp-selected-text"><b>{t('章節', 'Chapter')}</b> · {text}{!candidates.chapterIds.has(key) && <small className="irp-retained">{retained}</small>}</span>
          <button type="button" aria-label={`${t('移除章節', 'Remove chapter')} ${text}`} onClick={() => changeChapter(key, false)}>{t('移除', 'Remove')}</button>
        </li>;})}
        {[...selectedItems].map(key => {const item = itemMap.get(key), text = item ? itemText(item) : key;return <li key={`item-${key}`}>
          <span className="irp-selected-text"><b>Item</b> · {text}{!candidates.itemIds.has(key) && <small className="irp-retained">{retained}</small>}</span>
          <button type="button" aria-label={`${t('移除小項目', 'Remove item')} ${text}`} onClick={() => changeItem(key, false)}>{t('移除', 'Remove')}</button>
        </li>;})}
      </ul>
    </section>
  </fieldset>;
});
