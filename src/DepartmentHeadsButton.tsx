import type { Language, Person } from './types';
import { addDepartmentHeads } from './personDepartments';

export function DepartmentHeadsButton({ people, departmentIds, selectedIds, onChange, disabled, lang }: {
  people: readonly Person[]; departmentIds: readonly string[]; selectedIds: readonly string[];
  onChange: (ids: string[]) => void; disabled: boolean; lang: Language;
}) {
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;
  const heads = addDepartmentHeads(people, departmentIds, []);
  const note = !departmentIds.length ? t('請先選擇部門', 'Select departments first') : !heads.length ? t('沒有符合的部門負責人', 'No matching department heads') : '';
  return <div className="department-head-shortcut"><button type="button" className="btn small neutral" disabled={disabled || !heads.length} onClick={() => { if (!disabled && heads.length) onChange(addDepartmentHeads(people, departmentIds, selectedIds)); }}>{t('勾選部門負責人', 'Select department heads')}</button>{note && <small>{note}</small>}</div>;
}
