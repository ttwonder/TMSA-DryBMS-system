// Real original App + synthetic data + owned native PostgreSQL. No hosted access.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {verifyTrackingUi} from './fpmc-tracking-ui-boundaries.mjs';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed,sha256} from './native-postgres.mjs';
const red=process.argv.includes('--red'),slice=process.argv.find(a=>a.startsWith('--slice='))?.split('=')[1]??'all';
const out=join(root,'qa-evidence/fpmc-tracking',`${red?'red':'green'}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const receipt={layer:'真實UI＋測試資料；本機PostgreSQL非正式Supabase',cases:[],screenshots:[],errors:[],blockedExternal:0};
const seed=syntheticSeed();
const base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
const legacy={...base('legacy-action'),title:'Legacy text\n舊改善',content:{en:'\n  1. Keep indent\n \nSecond line\n',zh:'\r\n  一、保留縮排\r\n\r\n第二行\r\n'},itemIds:['item-a','item-dry'],departmentIds:['marine'],assigneeIds:['qa-owner'],source:'non_external',urgency:'medium',status:'open',percent:0,targetDate:'',plan:'\n  PLAN ONE\n\nPLAN TWO\n',events:[],closedAt:null,closedBy:null,sources:[]};
seed.improvements=[legacy,{...structuredClone(legacy),id:'event-action',title:'Saved progress action',events:[
 {id:'e1',at:'2026-02-01T10:00:00Z',by:'qa-owner',content:'EARLIER SAME TIME',status:'open',percent:0},
 {id:'e2',at:'2026-02-01T10:00:00Z',by:'qa-peer',content:'LATEST COMPLETE\n\n  1. Detail retained\nFINAL LINE',status:'in_progress',percent:33},
 {id:'e3',at:'2026-01-01T10:00:00Z',by:'qa-owner',content:'OLDER IMPORT APPENDED LATER',status:'open',percent:0}
]}];
seed.inspections=[{...base('ui-inspection'),frameworkId:'TMSA',title:'QA finding source',organization:'Synthetic QA',date:'2020-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:seed.frameworks[0],chapters:seed.chapters.filter(c=>c.frameworkId==='TMSA'),items:seed.items.filter(i=>i.frameworkId==='TMSA'),scoringVersion:'company-20-equal-stage-v1'},results:[],findings:[{id:'finding',itemIds:['item-a'],classification:'finding',observation:{en:'Finding content',zh:'發現內容'},recommendation:{en:'\n  PLAN ONE\n\nPLAN TWO\n',zh:''},sources:[]}]}];
const ack={hold:false,hit:false,barrier:Promise.resolve(),release:null};
let qa,vite,browser,page,current='setup';
const run=async(id,fn)=>{current=id;await fn();receipt.cases.push({id,status:'PASS'});writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));};
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:14,afterCommit:async({action,result})=>{if(action==='save'&&result.ok&&ack.hold){ack.hold=false;ack.hit=true;await ack.barrier;}return false;}});
 for(const name of ['015_management_viewer_remarks.sql','016_fpmc_tracking.sql'])if(existsSync(join(root,'supabase/migrations',name)))await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',name),'utf8'));
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async(role='owner')=>{const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',route=>{if(![ui,qa.url].includes(new URL(route.request().url()).origin)){receipt.blockedExternal++;return route.abort();}return route.continue();});await context.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users[role]});const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>receipt.errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();return p;};
 page=await open();const modal=(p=page)=>p.getByRole('dialog');
 const field=(name,p=page)=>modal(p).locator('label.field').filter({hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).locator('input,textarea,select').first();
 const nav=async(p=page)=>p.locator('.main-nav').getByRole('button',{name:'待改善項目',exact:true}).click();
 const record=async id=>(await qa.db.setup.query("select body from compliance_private.records where kind='improvement' and id=$1",[id])).rows[0]?.body;
 const image=async name=>{const path=join(out,name+'.png');await page.screenshot({path});receipt.screenshots.push(path);};
 await nav();await image('baseline-list');receipt.baselineHeader=await page.locator('.app-header').evaluate(el=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,header:el.getBoundingClientRect().toJSON(),brand:el.querySelector('.brand').getBoundingClientRect().toJSON(),identity:el.querySelector('.identity').getBoundingClientRect().toJSON()}));
 if(slice==='all'||slice==='create'||slice==='list')for(const [source,label] of [['management_review','管理審查會議'],['management_directive','管理層指令']])await run(`FPMC-B-${source}-mounted-create-date-native-peer`,async()=>{
  await page.getByRole('button',{name:'新增改善',exact:true}).click();await field('標題（英文）').fill('QA '+source);await field('內容（繁中）').fill('公司層級獨立追蹤');
  await field('來源').selectOption(source,{timeout:2500});await field('提出日期').fill('2026-02-28');await modal().getByRole('button',{name:'確認保存',exact:true}).click();await expect(modal()).toHaveCount(0);
  const rows=(await qa.db.setup.query("select body from compliance_private.records where kind='improvement' and body->>'title'=$1",['QA '+source+'\n'])).rows;assert.equal(rows.length,1);const saved=await record(rows[0].body.id);assert.equal(saved.source,source);assert.equal(saved.proposedDate,'2026-02-28');assert.deepEqual(saved.itemIds,[]);
  const peer=await open('admin');await nav(peer);const row=peer.locator('.improvement-table tbody tr').filter({has:peer.getByText('QA '+source,{exact:true})});await row.getByRole('button',{name:'完整編輯',exact:true}).click();await expect(field('來源',peer)).toHaveValue(source);await expect(field('提出日期',peer)).toHaveValue('2026-02-28');await modal(peer).getByRole('button',{name:'取消／放棄草稿',exact:true}).click();await peer.context().close();
 });
 if(slice==='all'||slice==='branding')await run('FPMC-A-header-and-title-exact-product-name',async()=>{
  await expect(page.locator('.brand')).toContainText('FPMC Management System Assessment and Improvement Tracking System');await expect(page.locator('.brand')).toContainText('公司系統級評估和改善平台');assert((await page.title()).includes('FPMC Management System Assessment and Improvement Tracking System'));
 });
 if(slice==='all'||slice==='list')await run('FPMC-C-source-date-shortcut-same-list',async()=>{
  const source=page.locator('.improvement-source-filter select');await source.selectOption('management_review',{timeout:2500});await expect(page.locator('.improvement-table tbody tr')).toHaveCount(1);
  await page.getByLabel('提出起日',{exact:true}).fill('2026-02-28');await page.getByLabel('提出迄日',{exact:true}).fill('2026-02-28');await expect(page.locator('.improvement-table tbody tr')).toHaveCount(1);await expect(page.getByRole('button',{name:'管審會執行計劃清單',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByLabel('提出起日',{exact:true}).fill('2026-03-01');await expect(page.locator('.improvement-table tbody tr')).toHaveCount(0);await page.getByRole('button',{name:'清除篩選及選取',exact:true}).click();await expect(page.locator('.improvement-table tbody tr')).toHaveCount(4);
 });
 if(slice==='all'||slice==='progress')await run('FPMC-D-main-latest-real-event-full-text-and-empty',async()=>{
  const row=page.locator('.improvement-table tbody tr').filter({has:page.getByText('Saved progress action',{exact:true})});await expect(row).toContainText('LATEST COMPLETE');await expect(row).toContainText('FINAL LINE');await expect(row).toContainText('測試同事');await expect(row).toContainText('2026-02-01');await expect(row).toContainText('進行中');await expect(row).not.toContainText('OLDER IMPORT APPENDED LATER');await expect(page.locator('.improvement-table tbody tr').filter({has:page.getByText('Legacy text',{exact:true})})).toContainText('尚無進度');
 });
 if(slice==='all'||slice==='editor')await run('FPMC-E-original-full-editor-compacts-view-not-raw',async()=>{
  const before=await record('legacy-action');await page.locator('.improvement-table tbody tr').filter({has:page.getByText('Legacy text',{exact:true})}).getByRole('button',{name:'完整編輯',exact:true}).click();
  await expect(field('內容（英文）')).toHaveValue('  1. Keep indent\nSecond line');await expect(field('內容（繁中）')).toHaveValue('  一、保留縮排\n第二行');await expect(field('改善計劃')).toHaveValue('  PLAN ONE\nPLAN TWO');
  assert.deepEqual(await record('legacy-action'),before);await modal().getByRole('button',{name:'取消／放棄草稿',exact:true}).click();assert.deepEqual(await record('legacy-action'),before);
 });
 if(slice==='all'||slice==='finding')await run('FPMC-BE-history-create-date-and-plan-projection',async()=>{
  await page.locator('.main-nav').getByRole('button',{name:'歷史檢查記錄',exact:true}).click();await page.getByRole('button',{name:'QA finding source',exact:true}).click();await modal().getByRole('button',{name:'缺陷／改善建議',exact:true}).click();await modal().getByRole('button',{name:'建立改善（先確認再保存）',exact:true}).click();
  const m=page.getByRole('dialog').last();await expect(m.getByLabel('提出日期',{exact:true})).toHaveValue(await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}));await expect(m.locator('label.field').filter({hasText:/^計劃/}).locator('textarea')).toHaveValue('  PLAN ONE\nPLAN TWO');await m.getByLabel('提出日期',{exact:true}).fill('2026-04-01');await m.getByRole('button',{name:'確認建立及保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);
  const saved=(await qa.db.setup.query("select body from compliance_private.records where kind='improvement' and body->>'sourceKey'='ui-inspection:finding'")).rows[0].body;assert.equal(saved.proposedDate,'2026-04-01');assert.equal(saved.plan,seed.inspections[0].findings[0].recommendation.en);assert.equal(saved.source,'external');await modal().getByRole('button',{name:'關閉',exact:true}).click();await nav();
 });
 if(slice==='all'||slice==='boundaries')await verifyTrackingUi({qa,page,open,run,record,nav,modal,field,image,receipt,out,ack});
 assert.equal(receipt.blockedExternal,0);assert.deepEqual(receipt.errors,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:String(error.message).slice(0,2000)};if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{ack.release?.();await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;if(!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}receipt.testedInputs=Object.fromEntries(['src/Improvements.tsx','src/improvementList.ts','src/types.ts','src/App.tsx','src/styles.css','scripts/verify-fpmc-tracking.mjs','scripts/qa-server.mjs','scripts/native-postgres.mjs','supabase/migrations/016_fpmc_tracking.sql'].filter(p=>existsSync(join(root,p))).map(p=>[p,sha256(readFileSync(join(root,p)))]));writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));}
