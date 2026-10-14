// Original mounted App + synthetic read-only transport. Geometry, not hosted/DB acceptance.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {layoutFixture} from './layout-fixture.mjs';
import {collectionFor} from '../src/syncState.ts';

const root=resolve(import.meta.dirname,'..');
const phase=process.argv.includes('--baseline')?'baseline':'fixed';
const output=join(root,'qa-evidence','audit-layout',`${phase}-${new Date().toISOString().replaceAll(':','-')}`);
mkdirSync(output,{recursive:true});
const fixture=layoutFixture(),owner=fixture.people[0],qaUrl='http://127.0.0.1:63639';
const entityId='improvement:qa-0123456789abcdef0123456789abcdef';
const auditRows=[
 {id:'audit-qa-1',at:'2026-10-14T05:34:12.933127+00:00',actorId:owner.id,actorName:owner.name,action:'update',kind:'improvement',entityId,itemCodes:['1.1.1'],summary:`update improvement :${entityId}`},
 {id:'audit-qa-2',at:'2026-10-14T05:30:00.000000+00:00',actorId:owner.id,actorName:owner.name,action:'export',kind:'export',entityId:'export:qa-selected-items',itemCodes:fixture.items.map(item=>item.code),summary:'匯出所選條目；保留完整內容及來源。\nExport the selected items with complete text and source references.'},
 {id:'audit-qa-3',at:'2026-10-14T05:20:00.000000+00:00',actorId:owner.id,actorName:owner.name,action:'update',kind:'improvement',entityId:'improvement:qa-long-summary',itemCodes:['2.1.1','2.2.1'],summary:('摘要保留完整文字與換行，不縮小字體、不截斷內容。\nThe complete audit summary remains readable and wraps naturally.\n').repeat(4)}
];
const frozen=JSON.stringify({fixture,auditRows});
const records=Object.entries(collectionFor).flatMap(([kind,key])=>(key==='settings'?[fixture.settings]:fixture[key]).map(body=>({kind,body})));
const sync={user:owner,versions:Object.fromEntries(records.map(({kind,body})=>[`${kind}:${body.id}`,body.version])),records,metadataToken:'audit-layout-fixture',cycles:[],provenance:[],auditLogs:[],serverTime:fixture.serverTime,snapshotToken:fixture.snapshotToken,baseline:true};
const receipt={phase,layer:'Original mounted App + synthetic read-only transport; not hosted/database/auth acceptance',cases:[],errors:[],actions:[],blockedExternal:0,deniedActions:[],screenshots:[]};
let vite,browser,uiPort,page;
const portClosed=port=>new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));});
try {
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});
 await vite.listen();uiPort=vite.httpServer.address().port;const ui=`http://127.0.0.1:${uiPort}`;
 browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===qaUrl){
   const {p_action:action,p_payload:query={}}=request.postDataJSON();receipt.actions.push(action);let data;
   if(action==='bootstrap_status')data={initialized:true,siteGateConfigured:true};
   else if(action==='sync')data=sync;
   else if(action==='current_user')data=owner;
   else if(action==='read')data=fixture;
   else if(action==='audit_query'){
    const rows=auditRows.filter(row=>(!query.kind||row.kind===query.kind)&&(!query.itemCode||row.itemCodes.includes(query.itemCode))&&(!query.actorId||row.actorId===query.actorId)&&(!query.text||row.summary.includes(query.text)));
    data={rows:rows.slice(query.offset||0,(query.offset||0)+(query.limit||25)),total:rows.length};
   }else{receipt.deniedActions.push(action);return route.fulfill({status:200,json:{ok:false,code:'QA_READ_ONLY'}});}
   return route.fulfill({status:200,json:{ok:true,data}});
  }
  if(url.origin===ui||['data:','blob:'].includes(url.protocol))return route.continue();
  receipt.blockedExternal++;return route.abort();
 });
 await context.addInitScript(({qaUrl,owner})=>{
  localStorage.setItem('fpmc-compliance-config',JSON.stringify({url:qaUrl,anonKey:'synthetic-layout-public-placeholder'}));
  sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:owner,sessionToken:'synthetic-layout-session-placeholder'}));
  localStorage.setItem('fpmc-compliance-language','zh');
 },{qaUrl,owner});
 page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',error=>receipt.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')receipt.errors.push(message.text());});
 await page.goto(ui);await page.getByRole('navigation',{name:'Main navigation'}).waitFor();
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'管理',exact:true}).click();
 await page.getByRole('button',{name:'操作紀錄',exact:true}).click();
 const table=page.locator('.data-table').filter({has:page.getByRole('columnheader',{name:/^(摘要|Summary)$/})});
 await expect(table.locator('tbody tr')).toHaveCount(auditRows.length);
 for(const language of ['zh','en']){
  if(language==='en')await page.getByRole('button',{name:'Switch language',exact:true}).click();
  for(const width of [1440,1920,1366,390]){
   const id=`${language}-${width}`;await page.setViewportSize({width,height:width===390?844:1000});
   await table.evaluate(el=>{el.closest('.table-wrap').scrollLeft=0;});
   await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   const g=await table.evaluate(el=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,tableWidth:el.getBoundingClientRect().width,layout:getComputedStyle(el).tableLayout,columns:[...el.querySelectorAll('thead th')].map(th=>({width:th.getBoundingClientRect().width,fontSize:getComputedStyle(th).fontSize})),clippedCells:[...el.querySelectorAll('th,td')].filter(cell=>cell.scrollWidth>cell.clientWidth+1||cell.scrollHeight>cell.clientHeight+1).length,summaryStyles:[...el.querySelectorAll('tbody td:nth-child(4)')].map(cell=>({whiteSpace:getComputedStyle(cell).whiteSpace,fontSize:getComputedStyle(cell).fontSize,clamp:getComputedStyle(cell).webkitLineClamp})),scrollerWidth:el.closest('.table-wrap').clientWidth}));
   receipt.lastGeometry=g;const image=join(output,`${id}.png`);await page.screenshot({path:image});receipt.screenshots.push(image);
   assert.equal(g.columns.length,4,`${id}: retain all four audit columns`);
   assert(g.columns[3].width>Math.max(...g.columns.slice(0,3).map(c=>c.width)),`${id}: Summary must be the widest column; actual widths ${g.columns.map(c=>Math.round(c.width)).join('/')}`);
   assert(g.columns[3].width>=g.tableWidth*.49,`${id}: Summary gets at least half of the available table`);
   assert(g.documentWidth<=width+1,`${id}: no document-wide horizontal overflow`);
   assert.equal(g.clippedCells,0,`${id}: all cell contents wrap without overlap or clipping`);
   assert(g.summaryStyles.every(s=>s.whiteSpace==='pre-wrap'&&s.clamp==='none'&&parseFloat(s.fontSize)>=15),`${id}: preserve full text, newlines and original readable font`);
   assert.deepEqual(await table.locator('tbody td:nth-child(4)').allTextContents(),auditRows.map(row=>row.summary));
   assert.deepEqual(await table.locator('tbody td:nth-child(3) small').allTextContents(),auditRows.map(row=>row.entityId));
   if(width===390){
    await table.evaluate(el=>{el.closest('.table-wrap').scrollLeft=el.scrollWidth;});
    await table.locator('th').nth(3).scrollIntoViewIfNeeded();
    const edge=await table.evaluate(el=>{const parent=el.closest('.table-wrap'),cell=el.querySelector('th:last-child');return {cellRight:cell.getBoundingClientRect().right,scrollerRight:parent.getBoundingClientRect().right,scrollLeft:parent.scrollLeft};});
    assert(edge.scrollLeft>0&&edge.cellRight<=edge.scrollerRight+1,`${id}: rightmost summary remains reachable inside the local scroller`);
    await table.evaluate(el=>{const parent=el.closest('.table-wrap'),cell=el.querySelector('th:last-child');parent.scrollLeft+=cell.getBoundingClientRect().left-parent.getBoundingClientRect().left-1;});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const summaryStart=await table.locator('th').nth(3).boundingBox();
    assert(summaryStart&&summaryStart.x>=0&&summaryStart.x<width-50,`${id}: summary heading and beginning are visible when scrolled to its start`);
    await page.screenshot({path:join(output,`${id}-summary-scrolled.png`)});receipt.screenshots.push(join(output,`${id}-summary-scrolled.png`));
   }
   receipt.cases.push({id,status:'PASS',geometry:g});
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('.toolbar label').filter({hasText:/^Record kind/}).locator('select').selectOption('improvement');await page.getByRole('button',{name:'Query server',exact:true}).click();
 await expect(table.locator('tbody tr')).toHaveCount(2);
 assert.deepEqual(await table.locator('tbody td:nth-child(4)').allTextContents(),auditRows.filter(row=>row.kind==='improvement').map(row=>row.summary));
 receipt.cases.push({id:'original-kind-query-retains-full-summary',status:'PASS'});
 assert.equal(JSON.stringify({fixture,auditRows}),frozen,'The layout does not mutate fixture records');
 assert.equal(receipt.blockedExternal,0);assert.deepEqual(receipt.deniedActions,[]);assert.deepEqual(receipt.errors,[]);
 receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure=error.message;process.exitCode=1;}
finally{
 await browser?.close();await vite?.close();receipt.cleanup={browserClosed:!browser?.isConnected(),uiPortClosed:uiPort?await portClosed(uiPort):true};
 if(!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}
 receipt.testedInputs=Object.fromEntries(['src/Management.tsx','src/styles.css','src/App.tsx','scripts/verify-audit-layout.mjs','scripts/layout-fixture.mjs','package.json'].map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));
 writeFileSync(join(output,'receipt.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({status:receipt.status,phase,cases:receipt.cases.length,failure:receipt.failure,lastColumnWidths:receipt.lastGeometry?.columns.map(c=>c.width),cleanup:receipt.cleanup,output}));
}
