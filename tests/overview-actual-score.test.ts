import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire,registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import type {ApiClient,PageProps,PlatformState} from '../src/types.ts';
const require=createRequire(import.meta.url),ts=require('typescript') as typeof import('typescript');
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname))for(const ext of ['.ts','.tsx'])if(existsSync(new URL(url.href+ext)))return {url:url.href+ext,shortCircuit:true};}return next(specifier,context);},load(url,context,next){if(url.endsWith('.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},fileName:fileURLToPath(url)}).outputText,shortCircuit:true};return next(url,context);}});
const {default:Overview}=await import('../src/Overview.tsx');
const {layoutFixture}=await import(new URL('../scripts/layout-fixture.mjs',import.meta.url).href);
const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
test('target simulation explicitly displays actual self-assessment and gaps without mutating facts',()=>{
 const state=layoutFixture() as PlatformState,before=JSON.stringify(state),forbidden=()=>{throw Error('Readonly render cannot write');};
 const api=new Proxy({config:{url:'http://127.0.0.1',anonKey:'synthetic-public'},clientId:'qa',sessionToken:''},{get(target,key){return key in target?target[key as keyof typeof target]:forbidden;}}) as unknown as ApiClient;
 for(const lang of ['zh','en'] as const){const ctx:PageProps={state,user:state.people[0],api,lang,t:(z,e)=>lang==='zh'?z:e,refresh:async()=>forbidden(),notify:forbidden,navigate:forbidden};const html=renderToStaticMarkup(createElement(Overview,ctx));const trial=html.split('class="panel simulation"')[1];assert.ok(trial);assert.ok(trial.includes(lang==='zh'?'實際自評':'Actual self-assessment'));assert.ok(trial.includes(lang==='zh'?'分數差距':'Score gap'));assert.ok(trial.includes(lang==='zh'?'還原目前分數':'Reset to current scores'));}
 assert.equal(JSON.stringify(state),before);
});
