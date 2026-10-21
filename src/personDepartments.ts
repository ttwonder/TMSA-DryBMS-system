import type { Person } from './types';

type Membership = Pick<Person, 'departmentId' | 'departmentIds'>;
/** Read projection only; absence is legacy, an explicit array is authoritative. */
export function personDepartmentIds(person: Membership): string[] {
  return person.departmentIds ?? (person.departmentId ? [person.departmentId] : []);
}

/** Explicit additive shortcut; empty departments never mean all heads. */
export function addDepartmentHeads(
  people: readonly (Membership & Pick<Person, 'id' | 'active' | 'isDepartmentHead'>)[],
  departmentIds: readonly string[],
  selectedIds: readonly string[],
): string[] {
  const departments = new Set(departmentIds);
  return [...new Set([...selectedIds, ...people.filter(person => person.active && person.isDepartmentHead === true && personDepartmentIds(person).some(id => departments.has(id))).map(person => person.id)])];
}
