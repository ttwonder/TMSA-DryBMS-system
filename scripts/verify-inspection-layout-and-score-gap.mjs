// Real original App + owned PostgreSQL; synthetic data, NOT hosted acceptance.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
const redNavigation=process.argv.includes('--red-navigation'),redGap=process.argv.includes('--red-gap'),gapOnly=process.argv.includes('--gap-only'),navigationOnly=process.argv.includes('--navigation-only');
const out=join(root,'qa-evidence','inspection-layout-and-score-gap',redNavigation?'navigation-red':redGap?'gap-red':gapOnly?'gap-ui':navigationOnly?'navigation-ui':'ui');mkdirSync(out,{recursive:true});
const receipt={layer:'Real original UI + owned PostgreSQL; synthetic data, NOT hosted acceptance',productionRequests:0,blockedExternal:0,cases:[],errors:[],screenshots:[]};
let qa,vite,browser,current='setup';
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false)});s.once('error',()=>resolve(true));});
try {
 const seed=syntheticSeed(),chapterModel=seed.chapters[0],itemModel=seed.items[0],assessmentModel=seed.assessments[0];
 const base=Object.fromEntries(['id','version','createdAt','updatedAt','updatedBy'].map(k=>[k,chapterModel[k]]));
 seed.chapters=[];seed.items=[];seed.assessments=[];seed.dryScores=[];
 for(const fw of ['TMSA','DRYBMS']) {
  const size=fw==='TMSA'?20:30;
  for(let n=1;n<=size;n++) {
   const id=`chapter-${fw}-${n}`;
   seed.chapters.push({...chapterModel,id,frameworkId:fw,code:String(n),order:n,name:{en:`QA chapter ${n} - inspection navigation`,zh:`QA 章節 ${n}・檢查捲動測試`}});
   if(fw==='DRYBMS')seed.dryScores.push({...base,id:`dry-score-${n}`,chapterId:id,levels:n===size?[null,null,null,null]:[100,0,0,0],note:''});
   if(n===size&&fw==='TMSA')continue; // Empty TMSA scope; DRYBMS has a real ungraded percentage row.
   for(let level=1;level<=4;level++) {
    const itemId=`item-${fw}-${n}-${level}`;
    seed.items.push({...itemModel,id:itemId,frameworkId:fw,chapterId:id,code:`QA-${fw}-${n}.${level}`,level,order:n*10+level,kpi:{en:'Synthetic requirement for inspection scrolling. '.repeat(5),zh:'合成條目，用於檢查內容捲動與可見性。'.repeat(5)},guidance:{en:'Synthetic guidance only; no company or standard text. '.repeat(5),zh:'僅限合成說明，不含公司資料或標準原文。'.repeat(5)}});
    seed.assessments.push({...assessmentModel,id:`assessment-${itemId}`,itemId,response:level===1?'yes':'no',conformity:level===1?'all':'none',reviewed:true});
   }
  }
  const chapters=seed.chapters.filter(c=>c.frameworkId===fw),items=seed.items.filter(i=>i.frameworkId===fw);
  seed.inspections.push({...base,id:`history-${fw}`,frameworkId:fw,title:`History QA ${fw}`,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:structuredClone({framework:seed.frameworks.find(f=>f.id===fw),chapters,items,scoringVersion:fw==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'}),results:items.map(i=>({itemId:i.id,response:null,conformity:'none',reviewed:false,observation:{en:'',zh:''},recommendation:{en:'',zh:''}})),findings:[],scoreNote:{en:'Synthetic original snapshot; item results are deliberately unknown. '.repeat(3),zh:'合成原始快照，逐項結果維持未知，不從目前自評自動帶入。'.repeat(3)},...(fw==='DRYBMS'?{dryLevels:Object.fromEntries(chapters.map(c=>[c.id,[null,null,null,null]]))}:{})});
 }
 qa=await startQaServer({seed,evidenceDir:out});
 for(const path of ['006_restart_updates.sql','007_shared_targets.sql'])await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',path),'utf8'));
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>{if(![ui,qa.url].includes(new URL(route.request().url()).origin)){receipt.blockedExternal++;return route.abort();}return route.continue();});
 await context.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users.owner});
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>receipt.errors.push(e.name));await page.goto(ui);await page.locator('.main-nav').waitFor();
 let lang='zh';const text=(zh,en)=>lang==='zh'?zh:en,nav=name=>page.locator('.main-nav').getByRole('button',{name,exact:true});
 const changeLanguage=async value=>{if(lang!==value){await page.getByRole('button',{name:'Switch language',exact:true}).click();lang=value;}};
 const ledger=async()=>({records:(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows,operations:(await qa.db.setup.query('select count(*)::int n from compliance_private.operations')).rows[0].n,audit:(await qa.db.setup.query('select count(*)::int n from compliance_private.audit')).rows[0].n});
 const initial=await ledger();const run=async(id,fn)=>{current=id;await fn();receipt.cases.push({id,status:'PASS'});};
 const scrollCase=async(fw,language,width,mode)=>{
  await changeLanguage(language);await page.setViewportSize({width,height:width===390?844:1000});await nav(text('歷史檢查記錄','Inspection history')).click();
  const row=page.locator('.data-table tbody tr').filter({hasText:`History QA ${fw}`});await row.getByRole('button',{name:mode==='revision'?text('建立修訂副本','Create revision'):text('查看','View'),exact:true}).click();
  const modal=page.getByRole('dialog'),body=modal.locator('.modal-body'),chapters=body.locator('.chapter-navigation'),firstItem=body.locator('.inspection-item').first();await firstItem.waitFor();
  if(mode==='revision') {await expect(modal.getByRole('button',{name:text('保存草稿','Save draft'),exact:true})).toBeEnabled();await expect(body.getByText(`history-${fw}`,{exact:false})).toBeVisible();}
  await expect(chapters.getByRole('button')).toHaveCount(fw==='TMSA'?20:30);
  const before=await chapters.evaluate(el=>({nav:el.getBoundingClientRect().toJSON(),body:el.parentElement.getBoundingClientRect().toJSON(),position:getComputedStyle(el).position,fontSize:getComputedStyle(el.firstElementChild).fontSize,scrollHeight:el.scrollHeight}));
  if(redNavigation){const path=join(out,'before-scroll.png');await page.screenshot({path});receipt.screenshots.push(path);}
  await body.evaluate(el=>{const nav=el.querySelector('.chapter-navigation');el.scrollTop+=nav.getBoundingClientRect().bottom-el.getBoundingClientRect().top+32;});
  const geometry=await chapters.evaluate(el=>({nav:el.getBoundingClientRect().toJSON(),body:el.parentElement.getBoundingClientRect().toJSON(),position:getComputedStyle(el).position,scrollTop:el.parentElement.scrollTop,item:el.parentElement.querySelector('.inspection-item').getBoundingClientRect().toJSON(),viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,modalWidth:el.closest('.modal').scrollWidth,modalClientWidth:el.closest('.modal').clientWidth,scrollHeight:el.scrollHeight}));
  receipt.lastGeometry={fw,language,width,mode,before,after:geometry};const image=join(out,`${fw}-${language}-${width}-${mode}-scrolled.png`);await page.screenshot({path:image});receipt.screenshots.push(image);
  assert(geometry.nav.bottom<=geometry.body.top+1,'Inspection chapters must scroll completely away, not pin over item content');
  assert(geometry.item.top<geometry.body.bottom&&geometry.item.bottom>geometry.body.top,'Original item content must be in the scrolling viewport');
  assert(geometry.documentWidth<=geometry.viewport+1,'No page-wide horizontal overflow');assert(geometry.modalWidth<=geometry.modalClientWidth+1,'No modal horizontal overflow');
  assert.equal(geometry.nav.height,before.nav.height,'Navigation height must not change just because of scrolling');assert(geometry.nav.height>=geometry.scrollHeight-1,'All chapter buttons must remain unclipped');
  await body.evaluate(el=>el.scrollTop=0);await chapters.getByRole('button').nth(1).click();await expect(firstItem.locator('h4')).toContainText(`QA-${fw}-2.1`);
  await expect(firstItem.getByRole('checkbox')).toHaveJSProperty('checked',false);await expect(firstItem.locator('select').first()).toHaveValue('');
  await expect(firstItem.locator('select').first())[mode==='revision'?'toBeEnabled':'toBeDisabled']();
  await modal.locator(':scope > header').getByRole('button',{name:'Close',exact:true}).click();await expect(modal).toHaveCount(0);assert.deepEqual(await ledger(),initial);
 };
 if(!gapOnly&&!redGap){
 if(redNavigation)await run('TMSA-zh-1440-revision-chapters-scroll-away',()=>scrollCase('TMSA','zh',1440,'revision'));
 else {
  for(const fw of ['TMSA','DRYBMS'])for(const language of ['zh','en'])for(const width of [1440,390])for(const mode of ['revision','view'])await run(`${fw}-${language}-${width}-${mode}-chapters-scroll-away`,()=>scrollCase(fw,language,width,mode));
  for(const fw of ['TMSA','DRYBMS'])for(const width of [1440,390])await run(`${fw}-${width}-main-sidebar-keeps-original-positioning`,async()=>{await page.setViewportSize({width,height:1000});await nav(fw).click();await expect(page.locator('.chapter-button').first()).toBeVisible();assert.equal(await page.locator('.framework-workspace .chapter-navigation').evaluate(el=>getComputedStyle(el).position),width===1440?'sticky':'relative');});
  await run('all-revision-cancels-zero-business-operations-and-original-snapshots-retained',async()=>{assert.deepEqual(await ledger(),initial);assert.equal(initial.records.filter(r=>r.kind==='inspection').length,2);});
 }
 }
 if(!redNavigation&&!navigationOnly){
  const positiveRed=await page.evaluate(()=>{const hex=getComputedStyle(document.documentElement).getPropertyValue('--red').trim();return `rgb(${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')})`;});
  const gapCase=async(fw,language,width,kind)=>{
   await changeLanguage(language);await page.setViewportSize({width,height:width===390?844:1000});const overview=nav(text('總覽','Overview'));if(await overview.getAttribute('aria-current')!=='page')await overview.click();
   await page.getByLabel(text('總覽框架','Overview framework'),{exact:true}).selectOption(fw);
   await page.getByLabel(text('總覽章節','Overview chapter'),{exact:true}).selectOption(`chapter-${fw}-${kind==='unknown'?(fw==='TMSA'?20:30):1}`);
   const panel=page.locator('.simulation'),chapter=panel.locator('.target-chapter').first(),actual=panel.locator('.target-score > small').first(),averageGap=panel.locator('.target-score > small').nth(1),chapterGap=chapter.locator('.target-gap');
   await expect(actual.locator('b')).toHaveText(kind==='unknown'?'—':'1.00');
   const emptyScope=kind==='unknown'&&fw==='TMSA';
   if(emptyScope)await expect(panel.locator('.target-chapter')).toHaveCount(0);
   else await chapter.locator('input').fill(kind==='negative'?'0':kind==='zero'?'1':kind==='rounded-positive'?'1.004':kind==='rounded-negative'?'0.996':'4');
   const expected=kind==='unknown'?'—':kind==='positive'?'+3.00':kind==='negative'?'-1.00':kind==='rounded-positive'?'+0.00':kind==='rounded-negative'?'-0.00':'0.00';
   await expect(averageGap.locator('b')).toHaveText(expected);if(!emptyScope)await expect(chapterGap).toHaveText(`${text('分數差距','Score gap')} ${expected}`);
   await panel.scrollIntoViewIfNeeded();const image=join(out,`${fw}-${language}-${width}-gap-${kind}.png`);await page.screenshot({path:image});receipt.screenshots.push(image);
   const colors=await Promise.all([averageGap,averageGap.locator('b'),...(!emptyScope?[chapterGap]:[])].map(node=>node.evaluate(el=>getComputedStyle(el).color)));
   receipt.lastGap={fw,language,width,kind,expected,colors,expectedRed:positiveRed};
   if(kind==='positive'||kind==='negative')assert(colors.every(c=>c===positiveRed),'Both chapter/average gap labels and their values must be red for nonzero displayed differences');
   else assert(colors.every(c=>c!==positiveRed),'Zero or unknown differences must not become red');
   const geometry=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}));assert(geometry.documentWidth<=geometry.viewport+1,'No page-wide horizontal overflow in target simulation');
   assert.deepEqual(await ledger(),initial);
  };
  if(redGap)await run('TMSA-zh-1440-positive-gap-labels-and-values-red',()=>gapCase('TMSA','zh',1440,'positive'));
  else{
   for(const fw of ['TMSA','DRYBMS'])for(const language of ['zh','en'])for(const width of [1440,390])for(const kind of ['positive','negative','zero','unknown'])await run(`${fw}-${language}-${width}-${kind}-gap-labels-and-values`,()=>gapCase(fw,language,width,kind));
   for(const [language,width] of [['zh',1440],['en',390]])for(const kind of ['rounded-positive','rounded-negative'])await run(`DRYBMS-${language}-${width}-${kind}-gap-remains-neutral`,()=>gapCase('DRYBMS',language,width,kind));
   await run('target-trials-zero-durable-writes-assessments-and-frozen-history-unchanged',async()=>assert.deepEqual(await ledger(),initial));
  }
 }
 assert.equal(receipt.blockedExternal,0);assert.deepEqual(receipt.errors,[]);receipt.status='PASS';
} catch(e) {receipt.status='FAIL';receipt.failure={case:current,name:e?.name??'Error',message:e instanceof assert.AssertionError?e.message:undefined,code:e?.code??null};writeFileSync(join(out,'private-failure.txt'),e?.stack??String(e));process.exitCode=1;}
finally {
 await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;
 receipt.testedInputs={};for(const path of ['src/App.tsx','src/Inspections.tsx','src/Overview.tsx','src/domain.ts','src/styles.css','src/useRecordEditor.ts','src/api.ts','src/useCompanyTargets.ts','scripts/verify-inspection-layout-and-score-gap.mjs','scripts/native-postgres.mjs','scripts/qa-server.mjs','package.json','supabase/migrations/006_restart_updates.sql','supabase/migrations/007_shared_targets.sql'])receipt.testedInputs[path]=createHash('sha256').update(readFileSync(join(root,path))).digest('hex');
 writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,failure:receipt.failure,geometry:receipt.lastGeometry&&{position:receipt.lastGeometry.after.position,navBottom:receipt.lastGeometry.after.nav.bottom,bodyTop:receipt.lastGeometry.after.body.top},cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));
}
