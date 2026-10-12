import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire,registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import type {ApiClient,PageProps,PlatformState} from '../src/types.ts';

const require=createRequire(import.meta.url);
const ts=require('typescript') as typeof import('typescript');
registerHooks({
 resolve(specifier,context,next){
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){
   const url=new URL(specifier,context.parentURL);
   if(!/\.[a-z]+$/i.test(url.pathname))for(const suffix of ['.ts','.tsx']){
    const candidate=new URL(url.href+suffix);
    if(existsSync(candidate))return {url:candidate.href,shortCircuit:true};
   }
  }
  return next(specifier,context);
 },
 load(url,context,next){
  if(url.endsWith('.tsx'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},fileName:fileURLToPath(url)}).outputText};
  return next(url,context);
 }
});
const {createElement}=await import('react');
const {renderToStaticMarkup}=await import('react-dom/server');
const {default:Management}=await import('../src/Management.tsx');
const {default:FrameworkPage}=await import('../src/FrameworkPage.tsx');
const {DEFAULT_PERMISSIONS}=await import('../src/domain.ts');
const {departmentOptions}=await import('../src/ui.tsx');
const base=(id:string)=>({id,version:1,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:'owner'});
function ctx(role:'owner'|'admin'|'operator'='owner',lang:'zh'|'en'='zh'):PageProps{
 const people=(['owner','admin','operator'] as const).map(role=>({...base(role),role,active:true,hasPassword:role==='owner',username:role,name:`Fixture ${role}`,departmentId:'sd-office-dept-synthetic'}));
 const state:PlatformState={frameworks:[],chapters:[],items:[],assessments:[],improvements:[],inspections:[],people,dryScores:[],auditLogs:[],cycles:[],provenance:[],serverTime:'2026-01-01T00:00:00Z',snapshotToken:'fixture',settings:{...base('settings'),departments:[{id:'sd-office-dept-synthetic',name:{en:'',zh:'測試部門'},active:true}],rolePermissions:structuredClone(DEFAULT_PERMISSIONS),siteGateConfigured:true}};
 const forbidden=()=>{throw new Error('SSR must not dispatch mutations');};
 const api=new Proxy({config:{url:'http://127.0.0.1',anonKey:'fixture'},clientId:'fixture'},{get(target,key){return key in target?target[key as keyof typeof target]:forbidden;}}) as unknown as ApiClient;
 return {state,user:people.find(p=>p.role===role)!,api,lang,t:(zh,en)=>lang==='zh'?zh:en,refresh:async()=>forbidden(),notify:forbidden,navigate:forbidden};
}
test('mounted personnel list supplies a department filter with readable labels',()=>{
 const html=renderToStaticMarkup(createElement(Management,ctx()));
 assert.match(html,/aria-label="人員部門篩選"/);
 assert.match(html,/<option value="sd-office-dept-synthetic">測試部門<\/option>/);
});
test('mounted personnel role filter contains exactly the three office roles',()=>{
 const html=renderToStaticMarkup(createElement(Management,ctx()));
 const filter=html.match(/<select[^>]*aria-label="人員角色篩選"[^>]*>([\s\S]*?)<\/select>/)?.[1];
 assert.ok(filter,'the actual mounted list must contain its role filter');
 assert.deepEqual([...filter.matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]),['','owner','admin','operator']);
});
test('department selector retains known Chinese names in English mode without inventing translations',()=>{
 assert.deepEqual(departmentOptions(ctx('owner','en')),[{id:'sd-office-dept-synthetic',label:'測試部門'}]);
});
test('operator cannot obtain the mounted personnel controls; admin cannot edit the Owner',()=>{
 const operator=renderToStaticMarkup(createElement(Management,ctx('operator')));
 assert.doesNotMatch(operator,/人員部門篩選|新增人員/);
 const admin=renderToStaticMarkup(createElement(Management,ctx('admin')));
 const ownerRow=admin.match(/<tr[^>]*>[\s\S]*?Fixture owner[\s\S]*?<\/tr>/)?.[0];
 assert.ok(ownerRow);
 assert.match(ownerRow,/<button[^>]*disabled=""/);
});
for(const frameworkId of ['TMSA','DRYBMS'] as const)test(`mounted ${frameworkId} joins PDF wraps and removes surplus standard blank lines`,()=>{
 const props=ctx();
 props.state.frameworks=[{...base(frameworkId),name:{en:frameworkId,zh:frameworkId},description:{en:'',zh:''},scoring:frameworkId==='TMSA'?'tmsa-stage':'drybms-guidance',active:true,sourceVersion:'fixture',scopeLabel:{en:'Fixture',zh:'測試'}}];
 props.state.chapters=[{...base('chapter'),frameworkId,code:'1',name:{en:'Fixture',zh:'測試'},order:1,active:true}];
 props.state.items=[{...base('item'),frameworkId,chapterId:'chapter',code:'1.1.1',level:1,order:1,active:true,kpi:{en:'A clear\ncommitment.\n\nRecords exist.',zh:'管理階層\n確保安全。\n\n定期審查。'},guidance:{en:'Evidence:\n\n• Review\nrecords',zh:'建議證據：\n\n• 記錄'},departmentIds:[],sources:[]}];
 const before=JSON.stringify(props.state);
 const html=renderToStaticMarkup(createElement(FrameworkPage,{...props,frameworkId}));
 assert.ok(html.includes('A clear commitment.\nRecords exist.'),'the real FrameworkPage must render complete sentences, not PDF-column short lines');
 assert.ok(html.includes('管理階層確保安全。\n定期審查。'));
 assert.ok(html.includes('Evidence:\n• Review records'));
 assert.equal(JSON.stringify(props.state),before,'rendering must not rewrite standards, assessments, IDs or history');
});
