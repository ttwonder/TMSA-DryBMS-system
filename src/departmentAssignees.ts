import type { Language, Person } from './types';

/** Candidate projection only: callers keep the entire draft and save payload. */
export function departmentAssigneeOptions(
  people: readonly Pick<Person, 'id' | 'name' | 'departmentId' | 'active'>[],
  departmentIds: readonly string[],
  selectedIds: readonly string[],
  lang: Language,
): { id: string; label: string }[] {
  const departments = new Set(departmentIds);
  const roster = new Map<string, typeof people[number]>();
  for (const person of people) if (!roster.has(person.id)) roster.set(person.id, person);
  const inScope = (person: typeof people[number]) => !departments.size || departments.has(person.departmentId);
  const options = new Map<string, { id: string; label: string }>();
  for (const person of roster.values()) {
    if (person.active && inScope(person)) options.set(person.id, { id: person.id, label: person.name });
  }
  // Retained choices are not new candidates. Removing one drops it next render.
  for (const id of selectedIds) {
    if (options.has(id)) continue;
    const person = roster.get(id);
    const notes = !person ? [lang === 'zh' ? '名冊不可用，請核對' : 'Not in roster; please check'] : [
      ...(!person.active ? [lang === 'zh' ? '停用' : 'Inactive'] : []),
      ...(!inScope(person) ? [lang === 'zh' ? '不在目前涉及部門，請核對' : 'Outside current departments; please check'] : []),
    ];
    options.set(id, { id, label: `${person?.name || id}（${notes.join('；')}）` });
  }
  return [...options.values()];
}
