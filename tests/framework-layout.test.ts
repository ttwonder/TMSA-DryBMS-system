import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire,registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import type {ApiClient,PageProps,PlatformState} from '../src/types.ts';
const require=createRequire(import.meta.url);
const ts=require('typescript') as typeof import('typescript');
registerHooks({
 resolve(specifier,context,next){
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){
   const url=new URL(specifier,context.parentURL);
   if(!/\.[a-z]+$/i.test(url.pathname))for(const ext of ['.ts','.tsx'])if(existsSync(new URL(url.href+ext)))return {url:url.href+ext,shortCircuit:true};
  }
  return next(specifier,context);
 },
 load(url,context,next){
  if(url.endsWith('.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},fileName:fileURLToPath(url)}).outputText,shortCircuit:true};
  return next(url,context);
 }
});
const {default:FrameworkPage}=await import('../src/FrameworkPage.tsx');
const {layoutFixture}=await import(new URL('../scripts/layout-fixture.mjs',import.meta.url).href);
const {createElement}=await import('react');
const {renderToStaticMarkup}=await import('react-dom/server');
function context(state:PlatformState):PageProps{
 const forbidden=()=>{throw Error('Static layout cannot call API or navigate');};
 const api=new Proxy({config:{url:'http://127.0.0.1',anonKey:'qa-public'},clientId:'qa',sessionToken:''},{get(target,key){return key in target?target[key as keyof typeof target]:forbidden;}}) as unknown as ApiClient;
 return {state,user:state.people[0],api,lang:'zh',t:(zh)=>zh,refresh:async()=>forbidden(),notify:forbidden,navigate:forbidden};
}
test('TMSA has separate accessible guidance, assessment and evidence regions, without data writes',()=>{
 const state=layoutFixture() as PlatformState,before=JSON.stringify(state);
 const html=renderToStaticMarkup(createElement(FrameworkPage,{...context(state),frameworkId:'TMSA'}));
 assert.match(html,/aria-label="條目內容"/,'The hand-drawn content group must be present');
 for(const label of ['Best-Practice Guidance','Self Assessment','Implementation / evidence'])assert.ok(html.includes(`aria-label="${label}"`),`${label} needs its own region`);
 assert.ok(html.includes('執行跟進人'),'The bottom responsibility field uses the approved label');
 assert.equal(JSON.stringify(state),before);
});

test('DRYBMS shares the same regions and retains its own level and scoring wording',()=>{
 const state=layoutFixture() as PlatformState;
 const html=renderToStaticMarkup(createElement(FrameworkPage,{...context(state),frameworkId:'DRYBMS'}));
 for(const label of ['Best-Practice Guidance','Self Assessment','Implementation / evidence'])assert.ok(html.includes(`aria-label="${label}"`));
 assert.ok(html.includes('Expectations &amp; Targets'));
 assert.ok(html.includes('Suggested Objective Evidence'));
 assert.ok(html.includes('Basic'));
 assert.ok(html.includes('本主題四級自評百分比'));
});
test('an unassessed response is not displayed as a confirmed failure in the top summary',()=>{
 const state=layoutFixture() as PlatformState;
 state.assessments[0].response=null;state.assessments[0].conformity='none';state.assessments[0].reviewed=false;
 const html=renderToStaticMarkup(createElement(FrameworkPage,{...context(state),frameworkId:'TMSA'}));
 const decision=html.split('aria-label="評定與執行狀態"')[1].split('</section>')[0];
 assert.ok(decision.includes('尚未評定'));
 assert.equal(decision.includes('<b>不符合</b>'),false,'unknown is not a confirmed noncompliance verdict');
});

for(const frameworkId of ['TMSA','DRYBMS'] as const)test(`${frameworkId} displays complete standard sentences without changing source text`,()=>{
 const state=layoutFixture() as PlatformState,item=state.items.find(i=>i.frameworkId===frameworkId)!;
 item.kpi={en:'A clear\ncommitment.\n\nRecords exist.',zh:'管理階層\n確保安全。\n\n定期審查。'};
 item.guidance={en:'Evidence:\n\n• Keep\nrecords\n• Review logs',zh:'佐證：\n\n• 保留紀錄\n• 定期審查'};
 const before=JSON.stringify(state);
 const html=renderToStaticMarkup(createElement(FrameworkPage,{...context(state),frameworkId}));
 assert.ok(html.includes('A clear commitment.\nRecords exist.'));
 assert.ok(html.includes('管理階層確保安全。\n定期審查。'));
 assert.ok(html.includes('• Keep records\n• Review logs'));
 assert.equal(JSON.stringify(state),before);
});
