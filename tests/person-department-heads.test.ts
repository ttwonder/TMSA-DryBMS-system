import test from 'node:test';
import assert from 'node:assert/strict';
import { departmentAssigneeOptions } from '../src/departmentAssignees.ts';
import { addDepartmentHeads, personDepartmentIds } from '../src/personDepartments.ts';

const multi = { id:'multi', name:'Same Name', departmentId:'marine', departmentIds:['marine','technical'], isDepartmentHead:true, active:true };
test('PDH-U01 original candidate projection includes secondary membership', () => {
  assert.deepEqual(departmentAssigneeOptions([multi], ['technical'], [], 'en'), [{id:'multi',label:'Same Name'}]);
});

const ordinary = { ...multi, id:'ordinary', isDepartmentHead:false };
const inactive = { ...multi, id:'inactive', active:false };
const sameName = { ...multi, id:'same-name' };
const roster = [multi, sameName, ordinary, inactive];
test('PDH-U02 legacy absence is one membership and not a head', () => {
 const legacy={id:'legacy',name:'Legacy',departmentId:'marine',active:true};
 assert.deepEqual(personDepartmentIds(legacy),['marine']);
 assert.deepEqual(addDepartmentHeads([legacy],['marine'],[]),[]);
});
test('PDH-U03 selected departments union deduplicates stable IDs not names', () => {
 assert.deepEqual(addDepartmentHeads([...roster,multi],['technical','marine','marine'],[]),['multi','same-name']);
});
test('PDH-U04 no departments never chooses all heads, ordinary candidates remain available', () => {
 assert.deepEqual(addDepartmentHeads(roster,[],['outside','inactive']),['outside','inactive']);
 assert.equal(departmentAssigneeOptions(roster,[],[],'en').length,3);
});
test('PDH-U05 unmatched departments have no fallback', () => {
 assert.deepEqual(addDepartmentHeads(roster,['missing'],[]),[]);
 assert.deepEqual(departmentAssigneeOptions(roster,['missing'],[],'en'),[]);
});
test('PDH-U06 additive selection retains inactive out-of-scope and missing IDs', () => {
 assert.deepEqual(addDepartmentHeads(roster,['technical'],['outside','inactive','missing','ordinary','multi']),['outside','inactive','missing','ordinary','multi','same-name']);
});
test('PDH-U07 repeated explicit click is idempotent and never mutates inputs', () => {
 const before=JSON.stringify(roster),selected=['missing'];const once=addDepartmentHeads(roster,['marine'],selected);
 assert.deepEqual(addDepartmentHeads(roster,['marine'],once),once);assert.equal(JSON.stringify(roster),before);assert.deepEqual(selected,['missing']);
});
test('PDH-U08 array is authoritative, legacy department does not add membership', () => {
 assert.deepEqual(personDepartmentIds({...multi,departmentIds:['technical']}),['technical']);
 assert.deepEqual(addDepartmentHeads([{...multi,departmentIds:['technical']}],['marine'],[]),[]);
});
test('PDH-U09 roster refresh projects candidates but never changes retained draft', () => {
 const selected=['multi','missing'];const next=[{...multi,departmentIds:['shipping'],isDepartmentHead:false}];
 const options=departmentAssigneeOptions(next,['marine'],selected,'en');
 assert.deepEqual(selected,['multi','missing']);assert.match(options[0].label,/Outside current departments/);assert.match(options[1].label,/Not in roster/);
});
test('PDH-U10 explicit false excludes head, multi memberships do not imply role', () => {
 assert.deepEqual(addDepartmentHeads([{...multi,isDepartmentHead:false}],['marine','technical'],[]),[]);
 const operator={...multi,role:'operator'};
 assert.deepEqual(addDepartmentHeads([operator],['technical'],[]),['multi']);
});
