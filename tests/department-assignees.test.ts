import test from 'node:test';
import assert from 'node:assert/strict';
import { departmentAssigneeOptions } from '../src/departmentAssignees.ts';
const people = [
  {id:'a',name:'Same name',departmentId:'marine',active:true},
  {id:'b',name:'Same name',departmentId:'technical',active:true},
  {id:'c',name:'Inactive',departmentId:'marine',active:false},
  {id:'d',name:'Other',departmentId:'safety',active:true},
];
const ids = (departments:string[],selected:string[]=[]) => departmentAssigneeOptions(people,departments,selected,'zh').map(p=>p.id);
test('DA-U01 single department exposes only active matching IDs, not names or roles',()=>assert.deepEqual(ids(['marine']),['a']));
test('DA-U02 multi department union deduplicates stable IDs without merging same names',()=>{
  assert.deepEqual(departmentAssigneeOptions([...people,people[0]],['marine','technical','marine'],[],'en').map(p=>p.id),['a','b']);
});
test('DA-U03 no departments retains original unlimited active roster',()=>assert.deepEqual(ids([]),['a','b','d']));
test('DA-U04 no match never falls back to all people',()=>assert.deepEqual(ids(['empty']),[]));
test('DA-U05 selected out-of-scope IDs stay visible with bilingual warning and original name',()=>{
  for(const lang of ['zh','en'] as const){const rows=departmentAssigneeOptions(people,['marine'],['b'],'zh'===lang?'zh':'en');assert.deepEqual(rows.map(p=>p.id),['a','b']);assert.match(rows[1].label,/Same name/);assert.match(rows[1].label,lang==='zh'?/不在目前涉及部門，請核對/:/Outside current departments; please check/);}
});
test('DA-U06 removing an out-of-scope selection cannot offer it again',()=>{assert.deepEqual(ids(['marine'],['b']),['a','b']);assert.deepEqual(ids(['marine'],[]),['a']);});
test('DA-U07 inactive selected IDs are retained only while selected; missing legacy IDs remain removable',()=>{
  const rows=departmentAssigneeOptions(people,['marine'],['c','legacy','legacy'],'zh');assert.deepEqual(rows.map(p=>p.id),['a','c','legacy']);assert.match(rows[1].label,/Inactive.*停用/);assert.match(rows[2].label,/legacy.*名冊不可用/);assert.deepEqual(ids(['marine']),['a']);
});
test('DA-U08 clearing departments does not clear selections or promote inactive people',()=>assert.deepEqual(ids([],['b','c','legacy']),['a','b','d','c','legacy']));
test('DA-U09 roster refresh derives candidates without mutating draft IDs or people',()=>{
  const selected=['a','b','c','legacy'],departments=['marine'],original=structuredClone({people,selected,departments});
  const refreshed=people.map(p=>p.id==='a'?{...p,departmentId:'technical'}:p.id==='b'?{...p,active:false}:p);
  assert.deepEqual(departmentAssigneeOptions(refreshed,departments,selected,'en').map(p=>p.id),selected);
  assert.deepEqual({people,selected,departments},original);
});
test('DA-U10 empty roster preserves only exact selected IDs and never invents a person',()=>assert.deepEqual(departmentAssigneeOptions([],['marine'],['a','legacy'],'en').map(p=>p.id),['a','legacy']));
