// Original mounted App + owned native PostgreSQL; synthetic data, no hosted writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';

const phase=process.argv.includes('--baseline')?'baseline':'fixed';
const out=join(root,'qa-evidence','inspection-chapter-scores',`${phase}-${new Date().toISOString().replaceAll(':','-')}`);
mkdirSync(out,{recursive:true});
const seed=syntheticSeed(),base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
const codes=['1','1A','2','3','3A','4','4A','5','6','6A','7','8','9','9A','10','11','12','12A','13','14'];
seed.chapters=[];seed.items=[];seed.assessments=[];seed.dryScores=[];
for(const frameworkId of ['TMSA','DRYBMS']){
 const chapterCodes=frameworkId==='TMSA'?codes:Array.from({length:30},(_,i)=>String(i+1));
 for(const [index,code] of chapterCodes.entries()){
  const chapter={...base(`${frameworkId}-chapter-${code}`),frameworkId,code,name:{en:`Synthetic chapter ${code}: management and operational responsibility`,zh:`測試章節 ${code}：管理與作業責任`},order:index,active:true};
  seed.chapters.push(chapter);
  if(frameworkId==='DRYBMS')seed.dryScores.push({...base(`current-dry-${code}`),chapterId:chapter.id,levels:[0,0,0,0],note:''});
  if(frameworkId==='TMSA'&&index===4)continue; // Deliberately empty chapter is not zero.
  for(let level=1;level<=4;level++){
   const item={...base(`${chapter.id}-item-${level}`),frameworkId,chapterId:chapter.id,code:`${code}.${level}.1`,level,order:level,active:true,kpi:{en:`Synthetic requirement ${level}`,zh:`測試條目 ${level}`},guidance:{en:'Synthetic guidance only',zh:'僅合成測試指引'},departmentIds:['marine'],sources:[{source:'Synthetic source',rawItem:`Frozen ${frameworkId} ${code} ${level}`}],...(((frameworkId==='TMSA'&&index===3)||(frameworkId==='DRYBMS'&&index===4))&&level===4?{sourceGap:'Synthetic unresolved source fragment',sourceGapResolved:false}:{})};
   seed.items.push(item);
   seed.assessments.push({...base(`current-${item.id}`),itemId:item.id,response:'no',conformity:'none',reviewed:true,selfAssessment:{en:'Current assessment deliberately differs',zh:'目前自評刻意不同'},evidence:{en:'',zh:''},departmentIds:['marine'],assigneeIds:[],executionStatus:'not_started',sources:[]});
  }
 }
}
seed.inspections=['TMSA','DRYBMS'].map(frameworkId=>{
 const chapters=seed.chapters.filter(c=>c.frameworkId===frameworkId),items=seed.items.filter(i=>i.frameworkId===frameworkId);
 return {...base(`history-${frameworkId}`),frameworkId,title:`QA history ${frameworkId}`,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===frameworkId)),chapters:structuredClone(chapters),items:structuredClone(items),scoringVersion:frameworkId==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},results:items.map(item=>{const unknown=frameworkId==='TMSA'&&item.chapterId===chapters[2].id,no=!!item.sourceGap||frameworkId==='TMSA'&&item.chapterId===chapters[1].id;return {itemId:item.id,response:unknown?null:no?'no':'yes',conformity:unknown||no?'none':'all',reviewed:!unknown,observation:{en:'Original observation',zh:'原觀察'},recommendation:{en:'',zh:''}};}),findings:[],imported:true,...(frameworkId==='DRYBMS'?{dryLevels:Object.fromEntries(chapters.map((c,i)=>[c.id,i===1?[0,0,0,0]:i===2?[null,null,null,null]:i===3?[100,null,null,null]:[100,100,100,100]]))}:{})};
});
const expected={TMSA:codes.map((_,i)=>i===1?'0.00':i===2||i===4?null:i===3?'3.00':'4.00'),DRYBMS:Array.from({length:30},(_,i)=>i===1?'0.00':i===2?null:i===3?'1.00':i===4?'3.00':'4.00')};
const provisional={TMSA:new Set([3]),DRYBMS:new Set([3,4])};
const receipt={phase,layer:'Original App + synthetic data + owned native PostgreSQL; NOT hosted Supabase acceptance',cases:[],errors:[],blockedExternal:0,screenshots:[]};
let qa,vite,browser,page,current='setup',hold=false,hit=false,release;
let barrier=Promise.resolve();
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const run=async(id,fn)=>{current=id;await fn();receipt.cases.push({id,status:'PASS'});writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));};
try{
 qa=await startQaServer({seed,evidenceDir:out,afterCommit:async({action,result})=>{if(action==='save'&&result.ok&&hold){hold=false;hit=true;await barrier;}return false;}});
 for(const file of ['006_restart_updates.sql','007_shared_targets.sql','008_inspection_history.sql'])await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',file),'utf8'));
 const read=async(kind,id)=>(await qa.db.setup.query('select body from compliance_private.records where kind=$1 and id=$2',[kind,id])).rows[0].body;
 const durable=async()=>({records:(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows,audit:(await qa.db.setup.query('select count(*)::int n from compliance_private.audit')).rows[0].n});
 const initial=await durable();
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async(role='owner',lang='zh')=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>{if(![ui,qa.url].includes(new URL(route.request().url()).origin)){receipt.blockedExternal++;return route.abort();}return route.continue();});
  await context.addInitScript(({config,user,lang})=>{if(!sessionStorage.getItem('qa-initialized')){localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));sessionStorage.setItem('qa-initialized','yes');localStorage.setItem('fpmc-compliance-language',lang);}},{config:qa.config,user:qa.users[role],lang});
  const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',error=>receipt.errors.push(error.message));p.on('dialog',dialog=>dialog.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();return p;
 };
 page=await open();
 const modal=(p=page)=>p.getByRole('dialog');
 const nav=(p=page)=>modal(p).getByRole('navigation',{name:/檢查章節|Inspection chapters/});
 const score=(index,p=page)=>nav(p).locator('.inspection-chapter-score').nth(index);
 const selectHistory=async(frameworkId,edit=false,p=page)=>{
  await p.locator('.main-nav').getByRole('button',{name:/^(歷史檢查記錄|Inspection history)$/}).click();
  const row=p.locator('.data-table tbody tr').filter({has:p.getByRole('button',{name:`QA history ${frameworkId}`,exact:true})});
  await row.getByRole('button',{name:edit?/^(直接修改|Edit directly)$/:/^(查看|View)$/}).click();await modal(p).waitFor();
 };
 const close=async(p=page)=>{await modal(p).locator('.page-actions').getByRole('button',{name:/^(關閉|Close|取消／放棄草稿|Cancel \/ discard draft)$/}).click();await expect(modal(p)).toHaveCount(0);};
 const percentage=level=>modal().locator('label').filter({hasText:new RegExp(`^${level} %`)}).locator('select');
 const expectScores=async(frameworkId,p=page)=>{
  const buttons=nav(p).getByRole('button'),scores=nav(p).locator('.inspection-chapter-score');
  assert.equal(await buttons.count(),expected[frameworkId].length+1,'Every frozen chapter retains a navigation button, followed by findings');
  await expect(buttons.last()).toHaveText(/^(缺陷／改善建議|Findings \/ recommendations)$/);assert.equal(await buttons.last().locator('.inspection-chapter-score').count(),0);
  await expect(scores).toHaveCount(expected[frameworkId].length);
  for(const [index,value] of expected[frameworkId].entries()){
   if(value===null){await expect(scores.nth(index)).toContainText(/未完整記分|Not fully graded/);await expect(scores.nth(index)).not.toContainText(/\d\.\d{2} \/ 4/);}
   else{await expect(scores.nth(index)).toContainText(`${value} / 4`);if(provisional[frameworkId].has(index))await expect(scores.nth(index)).toContainText(/暫估|Provisional/);else await expect(scores.nth(index)).not.toContainText(/暫估|Provisional/);}
  }
 };
 const save=async()=>{await modal().getByRole('button',{name:'保存檢查',exact:true}).click();await expect(modal().getByRole('status')).toContainText('已由伺服器確認');};
 const image=async(name,p=page)=>{await nav(p).getByRole('button').first().scrollIntoViewIfNeeded();const path=join(out,name+'.png');await p.screenshot({path});receipt.screenshots.push(path);};
 await run('readonly-all-TMSA-chapters-show-independent-score-zero-unknown-and-source-gap',async()=>{
  await selectHistory('TMSA');await expectScores('TMSA');await image('tmsa-readonly-desktop');await close();assert.deepEqual(await durable(),initial);
 });
 await run('TMSA-draft-recalculates-on-every-grading-and-bulk-change-cancel-is-zero-write',async()=>{
  await selectHistory('TMSA',true);const items=modal().locator('.inspection-item');
  await items.nth(3).getByLabel('符合程度',{exact:true}).selectOption('partial');await expect(score(0)).toContainText('3.00 / 4');
  await items.first().getByLabel('Y/N',{exact:true}).selectOption('no');await expect(score(0)).toContainText('0.00 / 4');
  await items.first().getByLabel('Y/N',{exact:true}).selectOption('');await expect(score(0)).toContainText('未完整記分');
  await modal().getByRole('button',{name:'一鍵全符合',exact:true}).click();await expect(score(0)).toContainText('4.00 / 4');await expect(score(2)).toContainText('4.00 / 4');await expect(score(3)).toContainText('3.00 / 4');await expect(score(3)).toContainText('暫估');await expect(score(4)).toContainText('未完整記分');
  await expect(modal().getByRole('status')).toContainText('尚未保存至伺服器');await close();assert.deepEqual(await durable(),initial);
 });
 await run('draft-restoration-recomputes-score-without-saving-or-borrowing-self-assessment',async()=>{
  await selectHistory('TMSA',true);await modal().locator('.inspection-item').nth(3).getByLabel('Y/N',{exact:true}).selectOption('no');await expect(score(0)).toContainText('3.00 / 4');await page.reload();await page.locator('.main-nav').waitFor();await page.locator('.main-nav').getByRole('button',{name:'歷史檢查記錄',exact:true}).click();await page.getByRole('button',{name:'恢復本機草稿',exact:true}).click();await expect(score(0)).toContainText('3.00 / 4');assert.deepEqual(await durable(),initial);await close();
 });
 await run('TMSA-edited-score-held-ACK-same-ID-native-save-and-fresh-peer-readback',async()=>{
  const old=await read('inspection','history-TMSA');await selectHistory('TMSA',true);await modal().locator('.inspection-item').nth(3).getByLabel('Y/N',{exact:true}).selectOption('no');
  await expect(score(0)).toContainText('3.00 / 4');hold=true;hit=false;barrier=new Promise(resolve=>release=resolve);await modal().getByRole('button',{name:'保存檢查',exact:true}).click();await expect.poll(()=>hit).toBe(true);await expect(modal().getByRole('status')).toContainText('尚未保存至伺服器');await expect(score(0)).toContainText('3.00 / 4');release();await expect(modal().getByRole('status')).toContainText('已由伺服器確認');
  const saved=await read('inspection',old.id);assert.equal(saved.version,old.version+1);assert.equal(saved.status,'final');assert.deepEqual(saved.snapshot,old.snapshot);assert.deepEqual(saved.findings,old.findings);assert.equal(saved.results[3].response,'no');expected.TMSA[0]='3.00';await close();
  const peer=await open('admin');await selectHistory('TMSA',false,peer);await expectScores('TMSA',peer);await close(peer);await peer.context().close();
 });
 await run('readonly-all-DRYBMS-chapters-use-independent-percentages-with-zero-and-provisional',async()=>{await selectHistory('DRYBMS');await expectScores('DRYBMS');await image('dry-readonly-desktop');await close();});
 await run('DRYBMS-percentage-edit-updates-weighted-score-not-derived-from-Yes-No',async()=>{
  const before=await durable(),old=await read('inspection','history-DRYBMS');await selectHistory('DRYBMS',true);
  await modal().locator('.inspection-item').first().getByLabel('Y/N',{exact:true}).selectOption('no');await expect(score(0)).toContainText('4.00 / 4');
  const levels=['Basic','Intermediate','Advanced','Excellence'];await percentage('Basic').selectOption('50');
  const weighted=((50+100*.05+100*.05+100*.05)/100).toFixed(2);await expect(score(0)).toContainText(`${weighted} / 4`);
  for(const level of levels)await percentage(level).selectOption('');await expect(score(0)).toContainText('未完整記分');
  for(const level of levels)await percentage(level).selectOption(level==='Basic'?'50':'100');
  await expect(score(0)).toContainText(`${weighted} / 4`);assert.deepEqual(await durable(),before);await save();
  const saved=await read('inspection',old.id);assert.equal(saved.version,old.version+1);assert.deepEqual(saved.snapshot,old.snapshot);assert.deepEqual(saved.dryLevels[old.snapshot.chapters[0].id],[50,100,100,100]);expected.DRYBMS[0]=weighted;await close();
 });
 for(const lang of ['zh','en'])for(const frameworkId of ['TMSA','DRYBMS'])for(const width of [1440,390])await run(`saved-${frameworkId}-${lang}-${width}-all-chapters-and-layout`,async()=>{
  const p=await open('admin',lang);await p.setViewportSize({width,height:width===390?844:1000});await selectHistory(frameworkId,false,p);await expectScores(frameworkId,p);
  const geometry=await nav(p).evaluate(el=>{const r=el.getBoundingClientRect();return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,navWidth:r.width,navScrollWidth:el.scrollWidth,overflowingButtons:[...el.querySelectorAll('button')].filter(b=>b.scrollWidth>b.clientWidth+1).length,scoreFontSizes:[...el.querySelectorAll('.inspection-chapter-score')].map(s=>parseFloat(getComputedStyle(s).fontSize))};});
  assert(geometry.documentWidth<=width+1);assert(geometry.navScrollWidth<=geometry.navWidth+1);assert.equal(geometry.overflowingButtons,0);assert(geometry.scoreFontSizes.every(n=>n>=14));
  receipt.casesGeometry??={};receipt.casesGeometry[`${frameworkId}-${lang}-${width}`]=geometry;await image(`${frameworkId}-${lang}-${width}`,p);await close(p);await p.context().close();
 });
 const final=await durable();assert.equal(final.audit,initial.audit+2);
 assert.deepEqual(final.records.filter(r=>r.kind!=='inspection'),initial.records.filter(r=>r.kind!=='inspection'));
 receipt.nativeReadback={inspectionSaves:2,otherRecordsUnchanged:true,frozenSnapshotsPreserved:true,allChapterCounts:{TMSA:20,DRYBMS:30}};
 assert.equal(receipt.blockedExternal,0);assert.deepEqual(receipt.errors,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:error.message};if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{
 release?.();await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;
 if(!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}
 receipt.testedInputs=Object.fromEntries(['src/Inspections.tsx','src/domain.ts','src/styles.css','src/inspectionEditing.ts','src/useRecordEditor.ts','src/inspectionDraft.ts','src/api.ts','scripts/verify-inspection-chapter-scores.mjs','scripts/native-postgres.mjs','scripts/qa-server.mjs','package.json','supabase/migrations/008_inspection_history.sql'].map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));
 writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));
}
