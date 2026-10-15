import test from 'node:test';
import assert from 'node:assert/strict';
import { filterImprovementList, improvementListView, improvementPage, withImprovementListView, IMPROVEMENTS_PER_PAGE } from '../src/improvementList.ts';
import { filteredImprovements } from '../src/domain.ts';
import { createRequire } from 'node:module';
const { layoutFixture } = createRequire(import.meta.url)('../scripts/layout-fixture.mjs') as {layoutFixture: () => PlatformState};
import type { PlatformState } from '../src/types.ts';
import type { ImprovementListFilters } from '../src/improvementList.ts';

// Supplemental pure regressions; behavioral RED is the original mounted 123-row register.
function fixture(): PlatformState {
  const state = layoutFixture() as PlatformState;
  const original = state.improvements[0];
  state.improvements = Array.from({ length: 83 }, (_, index) => ({
    ...structuredClone(original), id: `action-${index}`, title: `Action ${index}`,
    updatedAt: `2026-01-${String(1 + index % 28).padStart(2,'0')}T00:00:00Z`,
    source: index % 3 === 2 ? 'non_external' : 'external', inspectionId: index % 3 === 0 ? 'same-title-a' : 'same-title-b',
    findingId: `f-${index}`, sourceKey: `${index % 3 === 0 ? 'same-title-a' : 'same-title-b'}:f-${index}`,
    status: index % 4 === 0 ? 'closed' : index % 4 === 1 ? 'open' : 'in_progress', percent: 100,
  }));
  return state;
}
const ids = (rows: {id:string}[]) => rows.map(row => row.id).sort();
for (const [count, expected] of [[0,[0]],[1,[1]],[39,[39]],[40,[40]],[41,[40,1]],[80,[40,40]],[81,[40,40,1]],[123,[40,40,40,3]]] as const) {
  test(`page boundary ${count}: exact once, maximum 40, stable order`, () => {
    const input=Array.from({length:count},(_,n)=>n),snapshot=[...input],first=improvementPage(input,1),seen:number[]=[];
    assert.equal(first.pages,expected.length);assert.equal(IMPROVEMENTS_PER_PAGE,40);
    for(let n=1;n<=first.pages;n++){const page=improvementPage(input,n);assert.equal(page.rows.length,expected[n-1]);assert(page.rows.length<=40);seen.push(...page.rows);}
    assert.deepEqual(seen,input);assert.deepEqual(input,snapshot);assert.equal(first.start,count?1:0);
  });
}
test('invalid and stale page requests clamp to an actual page',()=>{
 const rows=Array.from({length:41},(_,n)=>n);
 for(const n of [-5,0,NaN,Infinity])assert.equal(improvementPage(rows,n).page,1);
 assert.equal(improvementPage(rows,2.7).page,2);assert.equal(improvementPage(rows,999).page,2);
 const shrunk=improvementPage(rows.slice(0,40),2);assert.equal(shrunk.page,1);assert.equal(shrunk.rows.length,40);
 assert.deepEqual(improvementPage([],99),{page:1,pages:1,total:0,start:0,end:0,rows:[]});
});
test('default register preserves original filtering and update ordering',()=>{
 const state=fixture();assert.deepEqual(filterImprovementList(state,{}),filteredImprovements(state,{}));
});
test('completed and unfinished partition the same data without treating 100 percent as closed',()=>{
 const state=fixture(),before=JSON.stringify(state),completed=filterImprovementList(state,withImprovementListView({},'completed')),unfinished=filterImprovementList(state,withImprovementListView({},'unfinished'));
 assert.deepEqual(ids(completed),ids(state.improvements.filter(i=>i.status==='closed')));
 assert.deepEqual(ids(unfinished),ids(state.improvements.filter(i=>i.status!=='closed')));
 assert(unfinished.every(i=>i.percent===100));assert.deepEqual(ids([...completed,...unfinished]),ids(state.improvements));assert.equal(JSON.stringify(state),before);
});
for(const source of ['inspection:same-title-a','inspection:same-title-b','non_external'] as const)test(`source ${source} uses exact stored identity, not title or Item`,()=>{
 const state=fixture(),wanted=state.improvements.filter(i=>source==='non_external'?i.source==='non_external':i.source==='external'&&i.inspectionId===source.slice('inspection:'.length));
 assert.deepEqual(ids(filterImprovementList(state,{source})),ids(wanted));
});
test('missing or unknown inspection source is empty rather than inferred or widened',()=>{
 const state=fixture();delete state.improvements[0].inspectionId;
 assert.equal(filterImprovementList(state,{source:'inspection:missing'}).length,0);
 assert(!filterImprovementList(state,{source:'inspection:same-title-a'}).some(i=>i.id===state.improvements[0].id));
});
test('view changes preserve source and all non-status filters; active state comes from same predicate',()=>{
 const original:ImprovementListFilters={source:'non_external',query:'Action',frameworkId:'TMSA',chapterId:'chapter',itemId:'item',departmentId:'department',personId:'person',urgency:'high',from:'2026-01-01',to:'2026-12-31',status:'open'};
 for(const view of ['all','unfinished','completed'] as const){const next=withImprovementListView(original,view);assert.equal(improvementListView(next),view);for(const key of Object.keys(original).filter(k=>k!=='status') as (keyof ImprovementListFilters)[])assert.equal(next[key],original[key]);}
 assert.equal(improvementListView({status:'open'}),'unfinished');assert.equal(improvementListView({status:'in_progress'}),'unfinished');assert.equal(improvementListView({status:'closed'}),'completed');
});
test('source, completion, Item and legacy filters are ANDed before pagination',()=>{
 const state=fixture(),filters:ImprovementListFilters={source:'inspection:same-title-a',unfinished:true,itemId:state.improvements[0].itemIds[0],query:'Action',from:'2026-01-10',to:'2026-01-20'};
 const expected=filteredImprovements(state,filters).filter(i=>i.source==='external'&&i.inspectionId==='same-title-a'&&i.status!=='closed'&&i.itemIds.includes(filters.itemId!));
 assert.deepEqual(filterImprovementList(state,filters),expected);assert.deepEqual(improvementPage(filterImprovementList(state,filters),1).rows,expected.slice(0,40));
});
test('canonical export recheck rejects source or completion drift without mutating the snapshot',()=>{
 const state=fixture(),filters:ImprovementListFilters={source:'inspection:same-title-a',unfinished:true},selected=filterImprovementList(state,filters)[0];
 const canonical=structuredClone(state);canonical.improvements.find(i=>i.id===selected.id)!.status='closed';const before=JSON.stringify(canonical);
 assert(!filterImprovementList(canonical,filters).some(i=>i.id===selected.id));assert.equal(JSON.stringify(canonical),before);
 canonical.improvements.find(i=>i.id===selected.id)!.status='in_progress';canonical.improvements.find(i=>i.id===selected.id)!.inspectionId='same-title-b';assert(!filterImprovementList(canonical,filters).some(i=>i.id===selected.id));
});
