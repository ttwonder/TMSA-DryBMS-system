// Bounded original App + existing native QA transport; no hosted requests.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';

const phase=process.argv.includes('--red-navigation')?'red-navigation':process.argv.includes('--red-bulk')?'red-bulk':'green';
const navigationOnly=process.argv.includes('--navigation-only')||phase==='red-navigation';
const out=join(root,'qa-evidence','inspection-sections-bulk',`${phase}-${new Date().toISOString().replaceAll(':','-')}`);
mkdirSync(out,{recursive:true});
const receipt={phase,layer:'Original App + synthetic data + owned native PostgreSQL; NOT hosted acceptance',cases:[],nativeCases:[],screenshots:[],errors:[],blockedExternal:0};
const seed=syntheticSeed(),base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
seed.chapters=[];seed.items=[];seed.assessments=[];seed.dryScores=[];
for(const frameworkId of ['TMSA','DRYBMS'])for(let chapterNumber=1;chapterNumber<=3;chapterNumber++){
 const chapter={...base(`${frameworkId}-c${chapterNumber}`),frameworkId,code:String(chapterNumber),name:{en:`Synthetic chapter ${chapterNumber}`,zh:`測試章節 ${chapterNumber}`},order:chapterNumber,active:true};
 seed.chapters.push(chapter);
 if(frameworkId==='DRYBMS')seed.dryScores.push({...base(`current-${chapter.id}`),chapterId:chapter.id,levels:[0,0,0,0],note:''});
 for(let level=1;level<=(chapterNumber===3?1:4);level++){
  const item={...base(`${chapter.id}-s${level}`),frameworkId,chapterId:chapter.id,code:`${chapterNumber}.${level}.1`,level,order:level,active:true,kpi:{en:`Synthetic requirement ${level}`,zh:`合成條目 ${level}`},guidance:{en:'Frozen synthetic guidance',zh:'固定合成指引'},departmentIds:['marine'],sources:[{source:'Synthetic',rawItem:`RAW ${chapter.id} ${level}`}]};
  seed.items.push(item);
  if(chapterNumber===1&&level===2)seed.items.push({...structuredClone(item),id:`${item.id}-gap`,code:'1.2.2',order:10,sourceGap:'Synthetic missing fragment',sourceGapResolved:false});
 }
}
seed.assessments=seed.items.map(item=>({...base(`current-${item.id}`),itemId:item.id,response:'no',conformity:'partial',reviewed:false,selfAssessment:{en:'Current assessment must not change',zh:'目前自評不可變更'},evidence:{en:'Current evidence',zh:'目前佐證'},departmentIds:['marine'],assigneeIds:[],executionStatus:'not_started',sources:[]}));
seed.inspections=['TMSA','DRYBMS'].map(frameworkId=>{
 const chapters=seed.chapters.filter(c=>c.frameworkId===frameworkId),items=seed.items.filter(i=>i.frameworkId===frameworkId);
 return {...base(`history-${frameworkId}`),frameworkId,title:`QA sections ${frameworkId}`,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===frameworkId)),chapters:structuredClone(chapters),items:structuredClone(items),scoringVersion:frameworkId==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},results:items.map(item=>({itemId:item.id,response:'no',conformity:'partial',reviewed:true,observation:{en:`Original observation ${item.code}`,zh:`原觀察 ${item.code}`},recommendation:{en:`Original recommendation ${item.code}`,zh:`原建議 ${item.code}`}})),findings:['finding','positive','guidance','no_finding','general'].map((classification,index)=>({id:`${frameworkId}-finding-${index}`,itemIds:[items[0].id],classification,observation:{en:`Full ${classification} observation`,zh:`完整 ${classification} 觀察`},recommendation:{en:`Full ${classification} recommendation`,zh:`完整 ${classification} 建議`},sources:[{source:'Synthetic raw report',rawItem:`RAW ${classification} MUST SURVIVE`}],warning:`Original ${classification} uncertainty`})),...(frameworkId==='DRYBMS'?{dryLevels:Object.fromEntries(chapters.map(c=>[c.id,[50,75,null,25]]))}:{})};
});
seed.improvements=[{...base('linked-action'),title:'Synthetic linked action',content:{en:'Original linked content',zh:'原關聯內容'},itemIds:['TMSA-c1-s1'],departmentIds:['marine'],assigneeIds:[],source:'external',inspectionId:'history-TMSA',findingId:'TMSA-finding-0',sourceKey:'history-TMSA:TMSA-finding-0',urgency:'medium',status:'open',percent:0,targetDate:'',plan:'',events:[],closedAt:null,closedBy:null,sources:structuredClone(seed.inspections[0].findings[0].sources)}];
let qa,vite,browser,page,current='setup',hold=false,hit=false,release,drop=false,barrier=Promise.resolve();
const closed=port=>new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));});
const run=async(id,fn)=>{current=id;await fn();receipt.cases.push({id,status:'PASS'});writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));};
try{
 qa=await startQaServer({seed,evidenceDir:out,afterCommit:async({action,result})=>{if(action==='save'&&result.ok&&hold){hold=false;hit=true;await barrier;}return action==='save'&&result.ok&&drop;}});
 for(const file of ['006_restart_updates.sql','007_shared_targets.sql','008_inspection_history.sql'])await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',file),'utf8'));
 const read=async(kind,id)=>(await qa.db.setup.query('select body from compliance_private.records where kind=$1 and id=$2',[kind,id])).rows[0].body;
 const ledger=async()=>({records:(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows,audit:(await qa.db.setup.query('select count(*)::int n from compliance_private.audit')).rows[0].n,operations:(await qa.db.setup.query('select count(*)::int n from compliance_private.operations')).rows[0].n});
 const initial=await ledger();
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async(role='owner',lang='zh')=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>{if(![ui,qa.url].includes(new URL(route.request().url()).origin)){receipt.blockedExternal++;return route.abort();}return route.continue();});
  await context.addInitScript(({config,user,lang})=>{if(!sessionStorage.getItem('qa-initialized')){localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));localStorage.setItem('fpmc-compliance-language',lang);sessionStorage.setItem('qa-initialized','yes');}},{config:qa.config,user:qa.users[role],lang});
  const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',error=>receipt.errors.push(error.name));p.on('dialog',dialog=>dialog.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();return p;
 };
 page=await open();
 const modal=(p=page)=>p.getByRole('dialog');
 const nav=(p=page)=>modal(p).getByRole('navigation',{name:/檢查章節|Inspection chapters/});
 const findings=(p=page)=>nav(p).getByRole('button',{name:/^(缺陷／改善建議|Findings \/ recommendations)$/});
 const select=async(frameworkId='TMSA',editing=false,p=page)=>{await p.locator('.main-nav').getByRole('button',{name:/^(歷史檢查記錄|Inspection history)$/}).click();const row=p.locator('.data-table tbody tr').filter({has:p.getByRole('button',{name:`QA sections ${frameworkId}`,exact:true})});await row.getByRole('button',{name:editing?/^(直接修改|Edit directly)$/:/^(查看|View)$/}).click();await modal(p).waitFor();};
 const close=async(p=page)=>{await modal(p).locator('.page-actions').getByRole('button',{name:/^(關閉|Close|取消／放棄草稿|Cancel \/ discard draft)$/}).click();await expect(modal(p)).toHaveCount(0);};
 const image=async(name,p=page)=>{const path=join(out,`${name}.png`);await p.screenshot({path});receipt.screenshots.push(path);};
 const saved=async()=>{await modal().getByRole('button',{name:'保存檢查',exact:true}).click();await expect(modal().getByRole('status')).toContainText('已由伺服器確認');};
 const draft=async()=>page.evaluate(()=>{const key=Object.keys(sessionStorage).find(k=>k.startsWith('fpmc-inspection-draft-v1:'));return key?JSON.parse(sessionStorage.getItem(key)).draft:null;});
 if(phase!=='red-bulk'){
  for(const editing of [false,true])await run(`${editing?'edit':'readonly'}-unique-last-findings-entry-separates-all-raw-findings-with-zero-writes`,async()=>{
   const before=await ledger();await select('TMSA',editing);await image(`${editing?'edit':'readonly'}-initial-chapter`);
   const buttons=nav().getByRole('button');assert.equal(await buttons.count(),4,'Three real chapters plus exactly one last findings entry');
   await expect(buttons.last()).toHaveText('缺陷／改善建議');assert.equal(await findings().locator('.inspection-chapter-score,.inspection-status').count(),0);
   for(let index=0;index<3;index++){await buttons.nth(index).click();await expect(modal().locator('.inspection-item').first()).toBeVisible();await expect(modal().locator('.inspection-finding')).toHaveCount(0);await expect(modal().getByRole('heading',{name:'完整原始發現／來源與警示',exact:true})).toHaveCount(0);}
   await findings().click();await expect(modal().locator('.inspection-item')).toHaveCount(0);await expect(modal().locator('.inspection-finding')).toHaveCount(5);
   for(const classification of ['finding','positive','guidance','no_finding','general'])await expect(modal()).toContainText(`RAW ${classification} MUST SURVIVE`);
   await expect(modal().getByRole('button',{name:'查看既有改善',exact:true})).toBeVisible();await image(`${editing?'edit':'readonly'}-findings`);await close();assert.deepEqual(await ledger(),before);
  });
  await run('add-general-finding-opens-findings-without-grading-or-cloud-write',async()=>{
   const before=await ledger(),original=await read('inspection','history-TMSA');await select('TMSA',true);await modal().locator('.inspection-item').first().getByRole('button',{name:/加入檢查發現/}).click();await expect(modal().locator('.inspection-item')).toHaveCount(0);await expect(modal().locator('.inspection-finding')).toHaveCount(6);const added=modal().locator('.inspection-finding').last();await expect(added.locator('select')).toHaveValue('general');await expect(added.locator('textarea').first()).toHaveValue(original.results[0].observation.en);await added.locator('textarea').first().fill('Editable added general finding');const local=await draft();assert.deepEqual(local.results,original.results);assert.deepEqual(local.findings.slice(0,-1),original.findings);assert.deepEqual(await ledger(),before);await close();assert.deepEqual(await ledger(),before);
  });
 }
 if(!navigationOnly){
  await run('global-negative-and-four-exact-stage-actions-present',async()=>{await select('TMSA',true);await expect(modal().getByRole('button',{name:'一鍵全不符合',exact:true})).toBeVisible();for(let level=1;level<=4;level++)await expect(modal().getByRole('button',{name:`Stage ${level} 全符合`,exact:true})).toBeVisible();await expect(modal().getByRole('button',{name:'本章一鍵全不符合',exact:true})).toBeVisible();await close();});
  if(phase==='green'){
   const bulkButtons=(p=page)=>modal(p).getByRole('button',{name:/^(一鍵全符合|一鍵全不符合|Stage [1-4] 全符合|本章一鍵全不符合)$/});
   const disabledBulk=async()=>{await expect(bulkButtons()).toHaveCount(7);for(const button of await bulkButtons().all())await expect(button).toBeDisabled();};
   const grade=(row,conformity)=>({...row,response:conformity==='all'?'yes':'no',conformity,reviewed:true});
   const unchangedFields=(current,original)=>{for(const key of ['id','status','imported','snapshot','findings','dryLevels'])assert.deepEqual(current[key],original[key]);for(const row of current.results){const old=original.results.find(r=>r.itemId===row.itemId);assert.deepEqual(row.observation,old.observation);assert.deepEqual(row.recommendation,old.recommendation);}};
   const nativeCase=(id)=>receipt.nativeCases.push({id,status:'PASS'});
   const freshReadback=async(frameworkId,expected)=>{const p=await open('admin');await select(frameworkId,false,p);for(let index=0;index<expected.snapshot.chapters.length;index++){const chapter=expected.snapshot.chapters[index];await nav(p).getByRole('button').nth(index).click();const items=expected.snapshot.items.filter(i=>i.chapterId===chapter.id);for(const [itemIndex,item] of items.entries()){const result=expected.results.find(r=>r.itemId===item.id),article=modal(p).locator('.inspection-item').nth(itemIndex);await expect(article.getByLabel('Y/N',{exact:true})).toHaveValue(result.response??'');await expect(article.getByLabel('符合程度',{exact:true})).toHaveValue(result.conformity);}}await findings(p).click();await expect(modal(p).locator('.inspection-finding')).toHaveCount(expected.findings.length);await close(p);await p.context().close();};
   for(const frameworkId of ['TMSA','DRYBMS'])for(let level=1;level<=4;level++)await run(`${frameworkId}-stage-${level}-exact-scope-source-skip-preservation-cancel-zero-write`,async()=>{
    const before=await ledger(),original=await read('inspection',`history-${frameworkId}`);await select(frameworkId,true);await modal().getByRole('button',{name:`Stage ${level} 全符合`,exact:true}).click();const local=await draft(),target=`${frameworkId}-c1-s${level}`;
    assert.deepEqual(local.results,original.results.map(r=>r.itemId===target?grade(r,'all'):r));unchangedFields(local,original);
    if(level===2){await expect(modal()).toContainText('略過 1');await expect(modal()).toContainText('1.2.2: Synthetic missing fragment');}else await expect(modal()).not.toContainText('略過');
    if(frameworkId==='TMSA')await expect(nav().locator('.inspection-chapter-score').first()).toContainText(level===1?'1.00 / 4':'0.00 / 4');
    await expect(modal().getByRole('status')).toContainText('尚未保存至伺服器');assert.deepEqual(await ledger(),before);await close();assert.deepEqual(await ledger(),before);
   });
   for(const frameworkId of ['TMSA','DRYBMS'])for(const scope of ['chapter','all'])await run(`${frameworkId}-${scope}-negative-explicit-No-including-gap-no-cross-scope-change`,async()=>{
    const before=await ledger(),original=await read('inspection',`history-${frameworkId}`);await select(frameworkId,true);await modal().getByRole('button',{name:scope==='chapter'?'本章一鍵全不符合':'一鍵全不符合',exact:true}).click();const local=await draft();assert.deepEqual(local.results,original.results.map(r=>scope==='all'||r.itemId.startsWith(`${frameworkId}-c1-`)?grade(r,'none'):r));unchangedFields(local,original);await expect(nav().locator('.inspection-status').first()).toHaveClass(/red/);await findings().click();assert.deepEqual((await draft()).results,local.results);assert.deepEqual(await ledger(),before);await close();
   });
   await run('missing-stages-disabled-and-readonly-bulk-actions-absent',async()=>{
    const before=await ledger();await select('TMSA',true);await nav().getByRole('button').nth(2).click();for(let level=2;level<=4;level++)await expect(modal().getByRole('button',{name:`Stage ${level} 全符合`,exact:true})).toBeDisabled();await expect(modal().getByRole('button',{name:'Stage 1 全符合',exact:true})).toBeEnabled();await close();await select();await expect(bulkButtons()).toHaveCount(0);await findings().click();await expect(modal().locator('.inspection-finding textarea')).toHaveCount(0);await close();assert.deepEqual(await ledger(),before);
   });
   await run('global-negative-held-ACK-locks-bulk-and-persists-only-original-record',async()=>{
    const before=await ledger(),original=await read('inspection','history-TMSA');await select('TMSA',true);await modal().getByRole('button',{name:'一鍵全不符合',exact:true}).click();const expected=(await draft()).results;assert.deepEqual(await ledger(),before);
    hold=true;hit=false;barrier=new Promise(resolve=>release=resolve);await modal().getByRole('button',{name:'保存檢查',exact:true}).click();await expect.poll(()=>hit).toBe(true);await disabledBulk();await expect(modal().getByRole('status')).toContainText('尚未保存至伺服器');await findings().click();await expect(modal().locator('.inspection-finding textarea').first()).toBeDisabled();await nav().getByRole('button').first().click();await disabledBulk();assert.deepEqual((await draft()).results,expected);release();await expect(modal().getByRole('status')).toContainText('已由伺服器確認');
    const record=await read('inspection',original.id),after=await ledger();assert.deepEqual(record.results,expected);unchangedFields(record,original);assert.equal(record.version,original.version+1);assert.equal(after.audit,before.audit+1);assert.equal(after.operations,before.operations+1);nativeCase('global-No-including-gap-same-final-ID-single-audit-and-operation');await close();await freshReadback('TMSA',record);
   });
   await run('stage-bulk-lost-ACK-locks-pending-draft-and-replays-once-with-fresh-readback',async()=>{
    const before=await ledger(),original=await read('inspection','history-TMSA');await select('TMSA',true);await nav().getByRole('button').nth(1).click();await modal().getByRole('button',{name:'Stage 3 全符合',exact:true}).click();const expected=original.results.map(r=>r.itemId==='TMSA-c2-s3'?grade(r,'all'):r);assert.deepEqual((await draft()).results,expected);drop=true;await modal().getByRole('button',{name:'保存檢查',exact:true}).click();await expect(modal()).toContainText('NETWORK_UNKNOWN',{timeout:50000});await disabledBulk();await findings().click();await nav().getByRole('button').first().click();await disabledBulk();assert.deepEqual((await draft()).results,expected);
    const committed=await ledger();assert.equal(committed.audit,before.audit+1);assert.equal(committed.operations,before.operations+1);drop=false;await saved();assert.deepEqual(await ledger(),committed);const record=await read('inspection',original.id);assert.deepEqual(record.results,expected);unchangedFields(record,original);assert.equal(record.version,original.version+1);nativeCase('stage-only-native-save-lost-ACK-replay-single-operation');await close();await freshReadback('TMSA',record);
   });
   await run('DRYBMS-chapter-No-stage-Yes-preserves-independent-levels-on-native-save-and-reopen',async()=>{
    const before=await ledger(),original=await read('inspection','history-DRYBMS');await select('DRYBMS',true);await nav().getByRole('button').nth(1).click();await modal().getByRole('button',{name:'本章一鍵全不符合',exact:true}).click();await modal().getByRole('button',{name:'Stage 2 全符合',exact:true}).click();const expected=original.results.map(r=>r.itemId.startsWith('DRYBMS-c2-')?grade(r,r.itemId==='DRYBMS-c2-s2'?'all':'none'):r);assert.deepEqual((await draft()).results,expected);assert.deepEqual((await draft()).dryLevels,original.dryLevels);assert.deepEqual(await ledger(),before);await saved();
    const record=await read('inspection',original.id),after=await ledger();assert.deepEqual(record.results,expected);unchangedFields(record,original);assert.equal(record.version,original.version+1);assert.equal(after.audit,before.audit+1);assert.equal(after.operations,before.operations+1);nativeCase('DRYBMS-chapter-No-and-stage-Yes-native-preserves-percentages-and-other-chapters');await close();await freshReadback('DRYBMS',record);
   });
   await run('original-create-action-confirmation-remains-reachable-from-findings-with-cancel-zero-write',async()=>{
    const before=await ledger();await select('DRYBMS');await findings().click();await modal().getByRole('button',{name:'建立改善（先確認再保存）',exact:true}).click();const action=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'確認由檢查發現建立改善',exact:true})});await expect(action).toContainText('Full finding observation');await action.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);await close();assert.deepEqual(await ledger(),before);
   });
   for(const lang of ['zh','en'])for(const width of [1440,390])for(const editing of [false,true])await run(`layout-${lang}-${width}-${editing?'edit':'readonly'}-unique-nav-toolbar-and-findings`,async()=>{
    const before=await ledger(),p=await open('admin',lang);await p.setViewportSize({width,height:width===390?844:1000});await select('TMSA',editing,p);await nav(p).getByRole('button').last().scrollIntoViewIfNeeded();
    const measure=async()=>modal(p).evaluate(el=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,modalWidth:el.clientWidth,modalScrollWidth:el.scrollWidth,overflowingControls:[...el.querySelectorAll('.chapter-navigation button,.inspection-chapter-actions button')].filter(b=>b.scrollWidth>b.clientWidth+1).length}));
    const chapterGeometry=await measure();assert(chapterGeometry.documentWidth<=width+1);assert(chapterGeometry.modalScrollWidth<=chapterGeometry.modalWidth+1);assert.equal(chapterGeometry.overflowingControls,0);if(editing){const toolbar=modal(p).getByRole('group',{name:/本章批次評定|Chapter bulk grading/});await expect(toolbar.getByRole('button')).toHaveCount(5);await toolbar.scrollIntoViewIfNeeded();}await image(`${lang}-${width}-${editing?'edit':'readonly'}-chapter`,p);
    await findings(p).click();await expect(modal(p).locator('.inspection-item')).toHaveCount(0);await expect(modal(p).locator('.inspection-finding')).toHaveCount(5);await modal(p).getByRole('heading',{name:/完整原始發現／來源與警示|Complete findings \/ sources and warnings/}).scrollIntoViewIfNeeded();const findingsGeometry=await measure();assert(findingsGeometry.documentWidth<=width+1);assert(findingsGeometry.modalScrollWidth<=findingsGeometry.modalWidth+1);await image(`${lang}-${width}-${editing?'edit':'readonly'}-findings`,p);receipt.geometry??={};receipt.geometry[`${lang}-${width}-${editing?'edit':'readonly'}`]={chapter:chapterGeometry,findings:findingsGeometry};await close(p);await p.context().close();assert.deepEqual(await ledger(),before);
   });
   const final=await ledger();assert.equal(final.audit,initial.audit+3);assert.equal(final.operations,initial.operations+3);assert.deepEqual(final.records.filter(r=>r.kind!=='inspection'),initial.records.filter(r=>r.kind!=='inspection'));nativeCase('all-current-assessments-improvements-frameworks-and-sources-unchanged');
  }
 }
 assert.deepEqual((await ledger()).records.filter(r=>r.kind!=='inspection'),initial.records.filter(r=>r.kind!=='inspection'));
 assert.equal(receipt.blockedExternal,0);assert.deepEqual(receipt.errors,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:error.message};if(page){const path=join(out,'failure.png');await page.screenshot({path}).catch(()=>{});receipt.screenshots.push(path);}process.exitCode=1;}
finally{
 release?.();await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;
 if(!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}
 receipt.testedInputs=Object.fromEntries(['src/App.tsx','src/Inspections.tsx','src/domain.ts','src/styles.css','src/inspectionEditing.ts','src/useRecordEditor.ts','src/inspectionDraft.ts','src/api.ts','scripts/verify-inspection-sections-bulk.mjs','scripts/native-postgres.mjs','scripts/qa-server.mjs','package.json','supabase/migrations/008_inspection_history.sql'].map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));
 writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,uiCases:receipt.cases.length,nativeCases:receipt.nativeCases.length,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));
}
