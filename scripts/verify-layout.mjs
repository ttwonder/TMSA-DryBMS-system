// Production App + anonymous mocked transport: layout only, never DB/auth acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {layoutFixture} from './layout-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..');
const phase=process.argv.includes('--baseline')?'baseline':'compact';
const output=path.join(root,'qa-evidence','layout',phase);fs.mkdirSync(output,{recursive:true});
const qaUrl='http://127.0.0.1:63639';
const fixture=layoutFixture(),owner=fixture.people[0],cases=[],errors=[],requests=[];
const server=await createServer({root,configFile:path.join(root,'vite.config.ts'),server:{host:'127.0.0.1',port:0,strictPort:true,open:false},logLevel:'error'});
let browser,port;
const geometry=async page=>page.evaluate(()=>{
 const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontSize,lineHeight:s.lineHeight,padding:s.padding};};
 const rows=[...document.querySelectorAll('.data-table tbody tr')];
 const clipped=[...document.querySelectorAll('.data-table .list-text-preview .bilingual>div')].filter(e=>e.scrollHeight>e.clientHeight+1).length;
 return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,bodyFont:getComputedStyle(document.body).fontSize,header:rect(document.querySelector('.app-header')),nav:rect(document.querySelector('.main-nav')),heading:rect(document.querySelector('.page-heading')),toolbar:rect(document.querySelector('.toolbar')),cards:[...document.querySelectorAll('.score-card')].map(rect),table:rect(document.querySelector('.data-table')),rowHeights:rows.slice(0,12).map(e=>e.getBoundingClientRect().height),tableFont:document.querySelector('.data-table')?getComputedStyle(document.querySelector('.data-table')).fontSize:null,detail:rect(document.querySelector('.item-detail')),requirement:rect(document.querySelector('.bilingual')),modal:rect(document.querySelector('.modal')),buttonHeights:[...document.querySelectorAll('.data-table .btn')].slice(0,8).map(e=>e.getBoundingClientRect().height),clippedPreviews:clipped,overflowElements:[...document.body.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&!e.closest('.table-wrap')&&!e.closest('.multi-select');}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,70)}))};
});
async function capture(page,id){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});const g=await geometry(page);cases.push({id,...g});await page.screenshot({path:path.join(output,`${id}.png`),fullPage:false});if(phase==='compact'){assert.equal(g.bodyFont,'16px',`${id}: normal text remains 16px`);assert.ok(g.documentWidth<=g.viewport.width+1,`${id}: no document horizontal overflow`);if(g.tableFont)assert.ok(parseFloat(g.tableFont)>=14,`${id}: tables remain readable`);if(id.endsWith('overview')&&g.viewport.width>=1200){assert.equal(g.cards.length,4);assert.equal(new Set(g.cards.map(c=>Math.round(c.y))).size,1,'Four overview cards on one row');assert.ok(g.cards[0].height<190,'No tall padded metric cards');}if(id.endsWith('management')&&g.viewport.width>=1200)assert.ok(Math.max(...g.rowHeights)<=55,'Compact personnel rows');if(id.endsWith('improvements')){assert.ok(Math.max(...g.rowHeights)<=180,`${id}: bounded long-text rows`);assert.ok(g.clippedPreviews>0,`${id}: long list content uses an actual preview`);if(g.viewport.width<620)assert.ok(g.table.y<650,'Primary mobile list is reachable without a wall of filters');}}}
try{
 await server.listen();port=server.httpServer.address().port;const url=`http://127.0.0.1:${port}`;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  if(u.origin===qaUrl){
   const body=request.postDataJSON(),action=body.p_action,payload=body.p_payload||{};requests.push(action);let data;
   if(action==='bootstrap_status')data={initialized:true,siteGateConfigured:true};
   else if(action==='read')data=fixture;
   else if(action==='current_user')data=owner;
   else if(action==='audit_query')data={rows:[],total:0};
   else if(action==='claim'||action==='renew'){const kind=payload.kind,id=payload.id;data={resourceKey:kind==='assessment'?`item:${id}`:`${kind}:${id}`,token:'layout-lease-placeholder',expiresAt:new Date(Date.now()+75000).toISOString(),holderName:owner.name,holderId:owner.id,baseVersion:1};}
   else if(action==='release')data={released:true};
   else {return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:false,code:'LAYOUT_ONLY_NO_WRITE',message:'Geometry fixture never accepts business writes.'})});}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})});
  }
  if(u.origin===url||u.protocol==='data:'||u.protocol==='blob:')return route.continue();
  errors.push(`Blocked unexpected outbound request to ${u.origin}`);return route.abort();
 });
 await context.addInitScript(({config,owner})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:owner,sessionToken:'layout-session-placeholder'}));localStorage.setItem('fpmc-compliance-language','zh');},{config:{url:qaUrl,anonKey:'layout-public-placeholder'},owner});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept());
 await page.goto(url,{waitUntil:'networkidle'});await page.getByRole('navigation',{name:'Main navigation'}).waitFor();
 const pages=[['overview','總覽'],['TMSA','TMSA'],['DRYBMS','DRYBMS'],['improvements','待改善項目'],['inspections','歷史檢查記錄'],['reports','報告中心'],['management','管理']];
 for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});for(const [id,name] of pages){await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();await capture(page,`${width}-${id}`);}}
 if(phase==='compact'){
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===1440?1000:844});
   await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'總覽',exact:true}).click();
   await page.locator('.secondary-filters>summary').click();await capture(page,`${width}-overview-expanded-filters`);
   const personSelect=page.getByRole('combobox',{name:'總覽人員'});await personSelect.selectOption(fixture.people.at(-1).id);await page.locator('.secondary-filters>summary').click();assert.ok(await page.locator('.filter-active').isVisible());await page.locator('.secondary-filters>summary').click();assert.equal(await personSelect.inputValue(),fixture.people.at(-1).id);await page.getByRole('button',{name:'清除篩選',exact:true}).click();
   await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'待改善項目',exact:true}).click();await page.locator('.secondary-filters>summary').click();await capture(page,`${width}-improvements-expanded-filters`);
   const urgency=page.locator('.secondary-filters label').filter({hasText:'急迫程度'}).locator('select');await urgency.selectOption('urgent');assert.equal(await page.locator('.improvement-table tbody tr').count(),fixture.improvements.filter(i=>i.urgency==='urgent').length);await page.locator('.secondary-filters>summary').click();assert.ok(await page.locator('.filter-active').isVisible());await page.locator('.secondary-filters>summary').click();assert.equal(await urgency.inputValue(),'urgent');await page.getByRole('button',{name:'清除篩選及選取',exact:true}).click();assert.equal(await page.locator('.improvement-table tbody tr').count(),fixture.improvements.length);
   await page.locator('.improvement-table tbody tr').first().locator('.text-button').click();assert.ok((await page.getByRole('dialog').innerText()).includes(fixture.improvements[0].content.en));assert.ok((await page.getByRole('dialog').innerText()).includes(fixture.improvements[0].content.zh));await capture(page,`${width}-complete-improvement-detail`);await page.getByRole('button',{name:'Close',exact:true}).click();
  }
  await page.locator('.improvement-table').evaluate(e=>{e.closest('.table-wrap').scrollLeft=e.scrollWidth;});await capture(page,'390-improvement-rightmost-actions');
  await page.locator('.improvement-table tbody tr').first().getByRole('button',{name:'直接更新',exact:true}).click();await page.getByRole('dialog').waitFor();await capture(page,'390-improvement-progress-editor');await page.getByRole('button',{name:'Close',exact:true}).click();
 }
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'待改善項目',exact:true}).click();
 await page.locator('.improvement-table tbody tr').first().locator('.text-button').click();await page.getByRole('dialog').waitFor();assert.ok((await page.getByRole('dialog').innerText()).includes(fixture.improvements[0].content.en));assert.ok((await page.getByRole('dialog').innerText()).includes(fixture.improvements[0].content.zh));await capture(page,'1440-improvement-complete-detail');await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'TMSA',exact:true}).click();await page.getByRole('button',{name:'修改',exact:true}).click();await page.locator('.assessment-editor').waitFor();await capture(page,'1440-TMSA-editor');await page.setViewportSize({width:390,height:844});await capture(page,'390-TMSA-editor');await page.getByRole('button',{name:'取消編輯',exact:true}).click();
 await page.getByRole('button',{name:'Switch language'}).click();for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});for(const [id,name] of [['overview','Overview'],['improvements','Improvements'],['management','Management']]){await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();await capture(page,`${width}-en-${id}`);}}
 assert.deepEqual(errors,[],'No console/runtime errors or unexpected outbound service');assert.ok(!requests.some(a=>['save','import_seed','role_permissions','site_password','transfer_owner'].includes(a)),'No business write invoked');
 await context.close();
}catch(error){errors.push(error instanceof Error?error.message:String(error));throw error;}finally{
 if(browser)await browser.close();await server.close();
 if(port){const open=await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));});assert.equal(open,false,'Owned layout HTTP port closed');}
 const result={status:errors.length?'FAIL':'PASS',phase,evidenceLayer:'production mounted App + anonymous mock transport: geometry only, NOT native/hosted database or authentication acceptance',cases,errors,actions:[...new Set(requests)],sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/styles.css'))).digest('hex'),serverPortClosed:true};fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,phase,viewportStates:cases.length,errors,output,serverPortClosed:true}));
}
