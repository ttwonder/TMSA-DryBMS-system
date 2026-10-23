import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { PageProps } from '../src/types.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof import('typescript');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const candidate = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(candidate.pathname)) {
        for (const extension of ['.ts', '.tsx']) {
          const url = new URL(`${candidate.href}${extension}`);
          if (existsSync(url)) return { url: url.href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) {
      const input = readFileSync(fileURLToPath(url), 'utf8');
      const result = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: fileURLToPath(url) });
      return { format: 'module', source: result.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  }
});

const {improvementValidation}=await import('../src/Improvements.tsx');
const {default:Management}=await import('../src/Management.tsx');
const {reportingFixture}=await import('./fpmc-reporting-fixture.ts');
const {defaultImprovementSources}=await import('../src/improvementTracking.ts');
const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
const t=(zh:string,en:string)=>zh;
test('new catalog source is standalone; inactive new and spoofed sources are rejected, historical inactive is editable',()=>{
 const state=reportingFixture(),id=`custom:12345678-1234-4234-8234-123456789abc` as const;
 state.settings.improvementSources=[...defaultImprovementSources(),{id,name:{zh:'自訂',en:'Custom'},active:true}];
 const record={...state.improvements[0],id:'new',version:0,source:id,itemIds:[],chapterIds:[],events:[]};
 assert.equal(improvementValidation(record,{state,t}),'');
 state.settings.improvementSources.at(-1)!.active=false;
 assert.match(improvementValidation(record,{state,t}),/來源/);
 state.improvements.push({...record,version:1});assert.equal(improvementValidation({...record,version:1},{state,t}),'');
 assert.match(improvementValidation({...record,source:'custom:unknown'},{state,t}),/來源/);
 assert.match(improvementValidation({...record,inspectionId:'spoof'},{state,t}),/來源/);
});
test('original Management offers source catalog only to active owner/admin',()=>{
 const state=reportingFixture(),base=state.people[0];
 for(const role of ['owner','admin','operator','vessel','management_viewer'] as const){
  const props={state,user:{...base,role,active:true},lang:'zh',t,api:{},refresh:async()=>{},notify:()=>{},navigate:()=>{}} as unknown as PageProps;
  const html=renderToStaticMarkup(createElement(Management,props));
  assert.equal(html.includes('待改善來源'),role==='owner'||role==='admin');
 }
});
test('Overview priority rows resolve current canonical source labels',async()=>{
 const {default:Overview}=await import('../src/Overview.tsx');const state=reportingFixture();
 state.settings.improvementSources=defaultImprovementSources().map(s=>s.id==='non_external'?{...s,name:{zh:'總覽改名來源',en:'Overview renamed source'}}:s);
 const props={state,user:{...state.people[0],role:'owner',active:true},lang:'zh',t,api:{},refresh:async()=>{},notify:()=>{},navigate:()=>{}} as unknown as PageProps;
 assert(renderToStaticMarkup(createElement(Overview,props)).includes('總覽改名來源'));
});
