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
const phase=process.argv.includes('--baseline')?'baseline':'full-content';
// Latest user requirement: full list text, not the earlier one-line preview.
const output=path.join(root,'qa-evidence','layout',phase);fs.mkdirSync(output,{recursive:true});
const qaUrl='http://127.0.0.1:63639';
const fixture=layoutFixture(),owner=fixture.people[0],cases=[],errors=[],requests=[];
fixture.improvements[0].title=`${'Review the complete supporting record with all responsible departments. '.repeat(3)}\n${'與全部責任部門核對完整佐證及改善內容。'.repeat(6)}`;
fixture.improvements[0].itemIds=[fixture.items[0].id,fixture.items[4].id,fixture.items.find(item=>item.frameworkId==='DRYBMS').id];
const fixtureBefore=JSON.stringify(fixture);
const server=await createServer({root,configFile:path.join(root,'vite.config.ts'),server:{host:'127.0.0.1',port:0,strictPort:true,open:false},logLevel:'error'});
let browser,port;
const geometry=async page=>page.evaluate(()=>{
 const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontSize,lineHeight:s.lineHeight,padding:s.padding};};
 const brokenLabelWords=[];
 for(const element of document.querySelectorAll('.assessment-summary-grid small,.assessment-decision .field>span,.linked-improvement-table th')){
  for(const node of element.childNodes){
   if(node.nodeType!==Node.TEXT_NODE)continue;
   for(const match of node.textContent.matchAll(/[A-Za-z]+/g)){
    const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
    if(range.getClientRects().length>1)brokenLabelWords.push(match[0]);
   }
  }
 }
 const frameworkLayout=document.querySelector('.item-content-grid')?{
  guidance:rect(document.querySelector('.item-content-grid .guidance-block')),
  self:rect(document.querySelector('.assessment-content-block[aria-label="Self Assessment"]')),
  evidence:rect(document.querySelector('.assessment-content-block[aria-label="Implementation / evidence"]')),
  kpi:rect(document.querySelector('.item-kpi')),
  decision:rect(document.querySelector('.assessment-decision')),
  linked:rect(document.querySelector('.linked-improvements')),
  responsibility:rect(document.querySelector('.item-responsibility')),
  score:rect(document.querySelector('.item-chapter-score')),
  clippedText:[...document.querySelectorAll('.item-content-grid .bilingual>div,.item-kpi .bilingual>div,.linked-improvement-table .bilingual>div')].filter(e=>e.textContent.trim()&&(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)).length,
  brokenLabelWords,
  overlappingHeaders:[...document.querySelectorAll('.linked-improvement-table th')].filter(e=>e.scrollWidth>e.clientWidth+1).length
 }:null;
 const rows=[...document.querySelectorAll('.data-table tbody tr')];
 const textNodes=[...document.querySelectorAll('.improvement-table td:nth-child(2) .bilingual>div')].filter(e=>e.textContent.trim());
 const clipped=textNodes.filter(e=>e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1||e.clientHeight===0).length;
 const improvementText=textNodes.map(e=>{const s=getComputedStyle(e);return {height:e.clientHeight,scrollHeight:e.scrollHeight,width:e.clientWidth,scrollWidth:e.scrollWidth,clamp:s.webkitLineClamp,overflow:s.overflow,display:s.display};});
 const improvementColumns=[...document.querySelectorAll('.improvement-table thead th')].map(e=>e.getBoundingClientRect().width);
 const overflowingButtons=[...document.querySelectorAll('.improvement-table .btn')].filter(e=>e.scrollWidth>e.clientWidth+1).length;
 const overflowingHeaders=[...document.querySelectorAll('.improvement-table th')].filter(e=>e.scrollWidth>e.clientWidth+1).length;
 return {frameworkLayout,viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,bodyFont:getComputedStyle(document.body).fontSize,header:rect(document.querySelector('.app-header')),nav:rect(document.querySelector('.main-nav')),heading:rect(document.querySelector('.page-heading')),toolbar:rect(document.querySelector('.toolbar')),cards:[...document.querySelectorAll('.score-card')].map(rect),table:rect(document.querySelector('.data-table')),rowHeights:rows.slice(0,12).map(e=>e.getBoundingClientRect().height),tableFont:document.querySelector('.data-table')?getComputedStyle(document.querySelector('.data-table')).fontSize:null,detail:rect(document.querySelector('.item-detail')),requirement:rect(document.querySelector('.bilingual')),modal:rect(document.querySelector('.modal')),buttonHeights:[...document.querySelectorAll('.data-table .btn')].slice(0,8).map(e=>e.getBoundingClientRect().height),clippedListText:clipped,improvementText,improvementColumns,overflowingButtons,overflowingHeaders,overflowElements:[...document.body.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&!e.closest('.table-wrap')&&!e.closest('.multi-select');}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,70)}))};
});
async function capture(page,id){
 await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 const g=await geometry(page);cases.push({id,...g});await page.screenshot({path:path.join(output,`${id}.png`),fullPage:false});
 if(phase==='full-content'){
  assert.equal(g.bodyFont,'16px',`${id}: normal text remains 16px`);
  assert.ok(g.documentWidth<=g.viewport.width+1,`${id}: no document horizontal overflow`);
  if(g.tableFont)assert.ok(parseFloat(g.tableFont)>=14,`${id}: tables remain readable`);
  if(id.endsWith('overview')&&g.viewport.width>=1200){assert.equal(g.cards.length,4);assert.equal(new Set(g.cards.map(c=>Math.round(c.y))).size,1,'Four overview cards on one row');assert.ok(g.cards[0].height<190,'No tall padded metric cards');}
  if(id.endsWith('management')&&g.viewport.width>=1200)assert.ok(Math.max(...g.rowHeights)<=55,'Compact personnel rows');
  if(g.frameworkLayout){
   const f=g.frameworkLayout;
   assert.ok(f.guidance&&f.self&&f.evidence&&f.kpi&&f.decision&&f.linked&&f.responsibility&&f.score,`${id}: all approved item regions exist`);
   assert.equal(f.clippedText,0,`${id}: standard, assessment, evidence and linked action text are complete`);
   assert.equal(f.overlappingHeaders,0,`${id}: linked table headers do not overlap`);
   assert.deepEqual(f.brokenLabelWords,[],`${id}: English status labels and table headers wrap between words, not within a word`);
   if(g.viewport.width>=1200){
    assert.ok(f.guidance.x+f.guidance.width<=f.self.x+1,`${id}: guidance left, assessment right`);
    assert.ok(Math.abs(f.guidance.y-f.self.y)<=1,`${id}: two columns begin together`);
    assert.ok(f.evidence.y>=f.self.y+f.self.height,`${id}: evidence below self assessment`);
    assert.ok(f.evidence.y-(f.self.y+f.self.height)<=10,`${id}: no stretched blank space between right panels`);
    assert.ok(f.kpi.x+f.kpi.width<=f.decision.x+1,`${id}: assessment controls beside KPI`);
   }else if(g.viewport.width<620){
    assert.ok(f.self.y>=f.guidance.y+f.guidance.height,`${id}: mobile guidance precedes assessment`);
    assert.ok(f.evidence.y>=f.self.y+f.self.height,`${id}: mobile evidence follows assessment`);
   }
   assert.ok(f.responsibility.y>=f.linked.y+f.linked.height,`${id}: responsibility footer below actions`);
   assert.ok(f.score.y+f.score.height<=f.kpi.y+1,`${id}: chapter score directly visible in the header`);
  }
  if(g.improvementColumns.length){
   assert.equal(g.clippedListText,0,`${id}: all title/content lines are rendered without clipping`);
   assert.ok(g.improvementText.every(e=>e.clamp==='none'),`${id}: no one-line clamp on title or content`);
   assert.equal(g.overflowingButtons,0,`${id}: action and Item labels fit their buttons`);
   assert.equal(g.overflowingHeaders,0,`${id}: every table header fits without overlapping adjacent columns`);
   const columns=g.improvementColumns;
   assert.ok(columns[1]>=g.table.width*.45,`${id}: full content gets at least 45% of table width`);
   for(const [index,max] of [[2,.13],[3,.11],[4,.12]])assert.ok(columns[index]<=g.table.width*max,`${id}: auxiliary column ${index+1} is narrower`);
  }
  if(id.endsWith('improvements')){
   const rows=page.locator('.improvement-table tbody tr');
   const record=fixture.improvements[0],row=rows.first();
   assert.equal(await row.locator('.text-button .bilingual>div').nth(0).textContent(),record.title.split('\n')[0]);
   assert.equal(await row.locator('.text-button .bilingual>div').nth(1).textContent(),record.title.split('\n')[1]);
   const content=row.locator('td').nth(1).locator(':scope > div > .bilingual > div');
   assert.equal(await content.nth(0).textContent(),record.content.en);
   assert.equal(await content.nth(1).textContent(),record.content.zh);
   assert.equal(await row.locator('.item-references button').count(),record.itemIds.length);
   if(g.viewport.width<620)assert.ok(g.table.y<650,'Primary mobile list is reachable without a wall of filters');
  }
 }
}
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
 if(phase==='full-content'){
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===1440?1000:844});
   await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'總覽',exact:true}).click();
   await page.locator('.secondary-filters>summary').click();await capture(page,`${width}-overview-expanded-filters`);
   const personSelect=page.getByRole('combobox',{name:'總覽人員'});await personSelect.selectOption(fixture.people.at(-1).id);await page.locator('.secondary-filters>summary').click();assert.ok(await page.locator('.filter-active').isVisible());await page.locator('.secondary-filters>summary').click();assert.equal(await personSelect.inputValue(),fixture.people.at(-1).id);await page.getByRole('button',{name:'清除篩選',exact:true}).click();
   await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'待改善項目',exact:true}).click();await page.locator('.secondary-filters>summary').click();await capture(page,`${width}-improvements-expanded-filters`);
   const urgency=page.locator('.secondary-filters label').filter({hasText:'急迫程度'}).locator('select');await urgency.selectOption('urgent');assert.equal(await page.locator('.improvement-table tbody tr').count(),fixture.improvements.filter(i=>i.urgency==='urgent').length);await page.locator('.secondary-filters>summary').click();assert.ok(await page.locator('.filter-active').isVisible());await page.locator('.secondary-filters>summary').click();assert.equal(await urgency.inputValue(),'urgent');await page.getByRole('button',{name:'清除篩選及選取',exact:true}).click();assert.equal(await page.locator('.improvement-table tbody tr').count(),fixture.improvements.length);
   if(await page.locator('.secondary-filters').getAttribute('open')!==null)await page.locator('.secondary-filters>summary').click();
   await page.getByLabel('搜尋',{exact:true}).fill('Follow-up');assert.equal(await page.locator('.improvement-table tbody tr').count(),fixture.improvements.length-1);await capture(page,`${width}-improvement-readable-rows`);await page.getByRole('button',{name:'清除篩選及選取',exact:true}).click();
   await page.locator('.improvement-table tbody tr').first().locator('.item-references').scrollIntoViewIfNeeded();await capture(page,`${width}-improvement-long-text-tail`);await page.evaluate(()=>window.scrollTo(0,0));
   await page.locator('.improvement-table tbody tr').first().locator('input[type=checkbox]').check();
   await page.locator('.improvement-table tbody tr').first().locator('.text-button').click();assert.ok((await page.getByRole('dialog').innerText()).includes(fixture.improvements[0].content.en));assert.ok((await page.getByRole('dialog').innerText()).includes(fixture.improvements[0].content.zh));await capture(page,`${width}-complete-improvement-detail`);await page.getByRole('button',{name:'Close',exact:true}).click();
   assert.ok(await page.locator('.improvement-table tbody tr').first().locator('input[type=checkbox]').isChecked(),'Opening full details retains selection');await page.getByRole('button',{name:'取消全部勾選',exact:true}).click();
  }
  await page.locator('.improvement-table').evaluate(e=>{e.closest('.table-wrap').scrollLeft=e.scrollWidth;});await capture(page,'390-improvement-rightmost-actions');
  await page.locator('.improvement-table tbody tr').first().getByRole('button',{name:'直接更新',exact:true}).click();await page.getByRole('dialog').waitFor();await capture(page,'390-improvement-progress-editor');await page.getByRole('button',{name:'Close',exact:true}).click();
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===1440?1000:844});
   await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'TMSA',exact:true}).click();
   const ordinaryAction=fixture.improvements.find(action=>action.status!=='closed'&&!fixture.improvements[0].itemIds.includes(action.itemIds[0]));
   const ordinary=fixture.items.find(item=>item.id===ordinaryAction.itemIds[0]),chapter=fixture.chapters.find(c=>c.id===ordinary.chapterId);
   const itemNav=page.locator('.item-nav').filter({has:page.locator('b',{hasText:new RegExp('^'+ordinary.code.replaceAll('.','\\.')+'$')})});
   if(!await itemNav.count())await page.locator('.chapter-button').filter({hasText:new RegExp('^[▸▾]\\s*'+chapter.code+'\\s')}).first().click();
   await itemNav.click();
   await capture(page,`${width}-TMSA-readable-item`);
  }
  for(const itemId of fixture.improvements[0].itemIds){
   await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'待改善項目',exact:true}).click();
   const index=fixture.improvements[0].itemIds.indexOf(itemId),item=fixture.items.find(item=>item.id===itemId);
   await page.locator('.improvement-table tbody tr').first().locator('.item-references button').nth(index).click();
   assert.equal(await page.getByRole('navigation',{name:'Main navigation'}).locator('[aria-current=page]').innerText(),item.frameworkId);
   assert.ok((await page.locator('.item-detail h2').innerText()).includes(item.code),'Related Item opens its original framework/item');
  }
 }
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'待改善項目',exact:true}).click();
 await page.locator('.improvement-table tbody tr').first().locator('.text-button').click();await page.getByRole('dialog').waitFor();assert.ok((await page.getByRole('dialog').innerText()).includes(fixture.improvements[0].content.en));assert.ok((await page.getByRole('dialog').innerText()).includes(fixture.improvements[0].content.zh));await capture(page,'1440-improvement-complete-detail');await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'TMSA',exact:true}).click();await page.getByRole('button',{name:'修改',exact:true}).click();await page.locator('.assessment-editor').waitFor();await capture(page,'1440-TMSA-editor');await page.setViewportSize({width:390,height:844});await capture(page,'390-TMSA-editor');await page.getByRole('button',{name:'取消編輯',exact:true}).click();
 await page.getByRole('button',{name:'Switch language'}).click();for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});for(const [id,name] of [['overview','Overview'],['TMSA','TMSA'],['DRYBMS','DRYBMS'],['improvements','Improvements'],['management','Management']]){await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();await capture(page,`${width}-en-${id}`);}}
 assert.deepEqual(errors,[],'No console/runtime errors or unexpected outbound service');assert.ok(!requests.some(a=>['save','import_seed','role_permissions','site_password','transfer_owner'].includes(a)),'No business write invoked');
 assert.equal(JSON.stringify(fixture),fixtureBefore,'Layout does not mutate source records');
 await context.close();
}catch(error){errors.push(error instanceof Error?error.message:String(error));throw error;}finally{
 if(browser)await browser.close();await server.close();
 if(port){const open=await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));});assert.equal(open,false,'Owned layout HTTP port closed');}
 const result={status:errors.length?'FAIL':'PASS',phase,evidenceLayer:'production mounted App + anonymous mock transport: geometry only, NOT native/hosted database or authentication acceptance',cases,errors,actions:[...new Set(requests)],sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/styles.css'))).digest('hex'),serverPortClosed:true};fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,phase,viewportStates:cases.length,errors,output,serverPortClosed:true}));
}
