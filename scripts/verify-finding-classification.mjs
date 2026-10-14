// Original App/native PostgreSQL; synthetic data only, never hosted acceptance.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
import {createApiClient} from '../src/api.ts';
const phase=process.argv.includes('--red-native')?'red-native':process.argv.includes('--red-ui')?'red-ui':'green';
const out=join(root,'qa-evidence','finding-classification',`${phase}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const receipt={phase,layer:'Original UI + synthetic data + owned PostgreSQL, NOT hosted',cases:[],errors:[],screenshots:[],blockedExternal:0};
const seed=syntheticSeed(),base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
seed.inspections=['TMSA','DRYBMS'].map(frameworkId=>{const items=seed.items.filter(i=>i.frameworkId===frameworkId);return {...base(`classification-${frameworkId}`),frameworkId,title:`QA classification ${frameworkId}`,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===frameworkId)),chapters:structuredClone(seed.chapters.filter(c=>c.frameworkId===frameworkId)),items:structuredClone(items),scoringVersion:frameworkId==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},results:items.map(i=>({itemId:i.id,response:'no',conformity:'partial',reviewed:true,observation:{en:'Preserve item observation',zh:'保留逐項觀察'},recommendation:{en:'Preserve item advice',zh:'保留逐項建議'}})),findings:['linked','unlinked','general'].map((id,n)=>({id,itemIds:id==='general'?[]:[items[0].id],classification:id==='general'?'general':'finding',observation:{en:`Finding ${id}`,zh:`發現 ${id}`},recommendation:{en:'Keep recommendation',zh:'保留建議'},sources:[{source:'Synthetic evidence',rawItem:`RAW ${frameworkId} ${id}`}],warning:`KEEP warning ${n}`})),...(frameworkId==='DRYBMS'?{dryLevels:{'chapter-DRYBMS':[100,75,50,25]}}:{includeTmsaChapter14:true})};});
// Initial seed runs on pre-009 validation, so the optional policy is added by later normal save when relevant.
for(const i of seed.inspections)delete i.includeTmsaChapter14;
seed.improvements=seed.inspections.map(i=>({...base(`action-${i.frameworkId}`),title:`Action ${i.frameworkId}`,content:{en:'Keep action-owned content',zh:'保留改善自有內容'},itemIds:[...i.findings[0].itemIds],departmentIds:['marine'],assigneeIds:[],source:'external',inspectionId:i.id,findingId:'linked',sourceKey:`${i.id}:linked`,urgency:'high',status:'in_progress',percent:35,targetDate:'2026-11-01',plan:'Keep action-owned plan',events:[],closedAt:null,closedBy:null,sources:structuredClone(i.findings[0].sources)}));
let qa,vite,browser,page,current='setup',hold=false,hit=false,release,drop=false,barrier=Promise.resolve();
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const run=async(id,fn)=>{current=id;await fn();receipt.cases.push({id,status:'PASS'});writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));};
try{
 qa=await startQaServer({seed,evidenceDir:out,afterCommit:async({action,result})=>{if(action==='save'&&result.ok&&hold){hold=false;hit=true;await barrier;}return action==='save'&&result.ok&&drop;}});
 for(const f of readdirSync(join(root,'supabase/migrations')).filter(f=>/^(00[6-9]|010)_.*\.sql$/.test(f)).sort())await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',f),'utf8'));
 const read=async(kind,id)=>(await qa.db.setup.query('select body from compliance_private.records where kind=$1 and id=$2',[kind,id])).rows[0].body;
 const ledger=async()=>({records:(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows,audit:(await qa.db.setup.query('select count(*)::int n from compliance_private.audit')).rows[0].n,operations:(await qa.db.setup.query('select count(*)::int n from compliance_private.operations')).rows[0].n});
 receipt.predecessors=(await qa.db.setup.query("select oid::regprocedure::text signature,md5(replace(prosrc,E'\\r\\n',E'\\n')) md5 from pg_proc where pronamespace='compliance_private'::regnamespace and proname in ('validate_record','validate_record_before_tmsa14','validate_record_history_rules','performance_dispatch') order by proname")).rows;
 const apiFor=role=>{const api=createApiClient(qa.config);api.user=qa.users[role].user;api.sessionToken=qa.users[role].sessionToken;return api;},owner=apiFor('owner'),admin=apiFor('admin');
 const save=async(api,kind,body,intent='update')=>{const lease=await api.claim(kind,body.id,intent);try{return await api.save(kind,body,body.version,lease,intent);}finally{await api.release(lease);}};
 const migration=join(root,'supabase/migrations/011_finding_classification.sql');
 if(phase==='green'&&existsSync(migration))await run('install-zero-business-data-or-ledger-change',async()=>{const before=await ledger();await qa.db.setup.query(readFileSync(migration,'utf8'));assert.deepEqual(await ledger(),before);});
 if(phase!=='red-ui')await run('linked-finding-to-OFI-keeps-original-action-and-IDs',async()=>{
  const before=await ledger(),original=await read('inspection','classification-TMSA'),body={...original,findings:original.findings.map(f=>f.id==='linked'?{...f,classification:'ofi'}:f)};let saved;
  try{saved=await save(owner,'inspection',body);}catch(e){assert.deepEqual(await ledger(),before);throw e;}
  assert.equal(saved.findings[0].classification,'ofi');assert.deepEqual((await ledger()).records.filter(r=>r.kind!=='inspection'||r.id!==saved.id),before.records.filter(r=>r.kind!=='inspection'||r.id!==saved.id));assert.deepEqual(saved.snapshot,original.snapshot);assert.deepEqual(saved.results,original.results);
 });
 if(phase==='green'){
  receipt.effectiveFunctions=(await qa.db.setup.query("select oid::regprocedure::text signature,md5(replace(prosrc,E'\\r\\n',E'\\n')) md5,prosecdef,proconfig from pg_proc where pronamespace='compliance_private'::regnamespace and proname in ('validate_record','validate_record_finding_classes','validate_record_finding_classes_rules','validate_record_before_tmsa14','validate_record_history_rules','performance_dispatch') order by proname")).rows;
  await run('fresh-and-incremental-summary-carries-exact-source-classes-only',async()=>{
   const first=await admin.sync();for(const summary of first.inspections){const raw=await read('inspection',summary.id);assert.deepEqual(summary.findingClassifications,Object.fromEntries(raw.findings.map(f=>[f.id,f.classification])));assert(!('findings' in summary));assert(!('snapshot' in summary));assert.deepEqual(await admin.hydrateInspection(summary),raw);}
   const raw=await read('inspection','classification-DRYBMS');raw.findings[0].classification='ofi';await save(owner,'inspection',raw);const next=await admin.sync();assert.equal(next.inspections.find(i=>i.id===raw.id).findingClassifications.linked,'ofi');
  });
  for(const fw of ['TMSA','DRYBMS'])await run(`${fw}-reverse-classification-preserves-action-progress-and-score`,async()=>{
   const raw=await read('inspection',`classification-${fw}`),action=await read('improvement',`action-${fw}`);raw.findings[0].classification='finding';const saved=await save(owner,'inspection',raw);assert.deepEqual(saved.results,raw.results);assert.deepEqual(saved.snapshot,raw.snapshot);assert.deepEqual(saved.dryLevels,raw.dryLevels);assert.deepEqual(await read('improvement',action.id),action);
  });
  for(const [name,change,code] of [
   ['linked-item-change',b=>b.findings[0].itemIds=[b.snapshot.items[1].id],'LINKED_FINDING_IDENTITY'],
   ['linked-nonactionable-class',b=>b.findings[0].classification='positive','LINKED_FINDING_IDENTITY'],
   ['source-locator-change',b=>b.findings[0].sources[0].rawItem='tampered','IMMUTABLE_FINDING_SOURCE'],
   ['linked-finding-deletion',b=>b.findings.shift(),'IMMUTABLE_FINDING_SOURCE']
  ])await run(`reject-${name}-without-business-write`,async()=>{const before=await ledger(),b=await read('inspection','classification-TMSA');change(b);await assert.rejects(()=>save(owner,'inspection',b),e=>e.code===code);assert.deepEqual(await ledger(),before);});
  await run('create-OFI-action-then-preserve-original-identity-through-progress',async()=>{
   const b=await read('inspection','classification-DRYBMS');b.findings[1].classification='ofi';await save(owner,'inspection',b);
   const a={...structuredClone(seed.improvements[1]),...base(randomUUID()),title:'Native OFI action',content:{en:'Native OFI action content',zh:'本機 OFI 測試內容'},findingId:'unlinked',sourceKey:`${b.id}:unlinked`,sources:structuredClone(b.findings[1].sources)};const created=await save(owner,'improvement',a,'create');
   const changed={...created,percent:50,events:[...created.events,{id:randomUUID(),at:new Date().toISOString(),by:owner.user.id,content:'Native progress retained',status:'in_progress',percent:50}]};const updated=await save(owner,'improvement',changed);assert.equal(updated.percent,50);assert.equal(updated.id,created.id);assert.equal(updated.sourceKey,created.sourceKey);
  });
  await run('lease-and-stale-version-still-reject-reclassification',async()=>{
   const b=await read('inspection','classification-TMSA'),held=await admin.claim('inspection',b.id);try{await assert.rejects(()=>owner.claim('inspection',b.id),e=>e.code==='LEASE_HELD');}finally{await admin.release(held);}
   const before=await ledger(),lease=await owner.claim('inspection',b.id);try{b.findings[0].classification='ofi';await assert.rejects(()=>owner.save('inspection',b,b.version-1,lease),e=>e.code==='VERSION_CONFLICT');assert.deepEqual(await ledger(),before);}finally{await owner.release(lease);}
  });
  await run('011-replay-refuses-without-business-write',async()=>{const before=await ledger();try{await assert.rejects(()=>qa.db.setup.query(readFileSync(migration,'utf8')),/FINDING_CLASSES_ALREADY_INSTALLED_VERIFY_READBACK/);}finally{await qa.db.setup.query('rollback');}assert.deepEqual(await ledger(),before);});
  const readback=join(root,'supabase/finding-classification-readback.sql');if(existsSync(readback))await run('011-readonly-installation-readback',async()=>{const before=await ledger(),results=await qa.db.setup.query(readFileSync(readback,'utf8'));receipt.readback=results.flatMap(r=>r.rows||[]).find(r=>r.finding_classification_readback)?.finding_classification_readback;assert.equal(receipt.readback?.status,'PASS_FINDING_CLASSIFICATION_INSTALL_ONLY');assert.equal(receipt.readback.checkCount,11);assert.equal(Object.keys(receipt.readback.checks).length,11);assert(Object.values(receipt.readback.checks).every(v=>v===true));assert.deepEqual(await ledger(),before);});
 }
 if(phase==='red-ui'||phase==='green'){
  vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const open=async(role='owner',lang='zh')=>{
   const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',r=>{if(![ui,qa.url].includes(new URL(r.request().url()).origin)){receipt.blockedExternal++;return r.abort();}return r.continue();});
   await context.addInitScript(({config,user,lang})=>{if(!sessionStorage.getItem('qa-initialized')){localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language',lang);sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));sessionStorage.setItem('qa-initialized','yes');}},{config:qa.config,user:qa.users[role],lang});
   const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>receipt.errors.push(e.name));p.on('dialog',d=>d.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();return p;
  };
  const modal=(p=page)=>p.getByRole('dialog').first();
  const history=async(fw,p=page,edit=true,lang='zh')=>{await p.locator('.main-nav').getByRole('button',{name:lang==='zh'?'歷史檢查記錄':'Inspection history',exact:true}).click();const row=p.locator('.data-table tbody tr').filter({has:p.getByRole('button',{name:`QA classification ${fw}`,exact:true})});await (edit?row.getByRole('button',{name:lang==='zh'?'直接修改':'Edit directly',exact:true}):row.getByRole('button',{name:`QA classification ${fw}`,exact:true})).click();await modal(p).getByRole('navigation').getByRole('button').last().click();await expect(modal(p).locator('.inspection-finding')).toHaveCount(3);};
  const close=async(p=page)=>{await modal(p).locator('.page-actions').getByRole('button',{name:/取消／放棄草稿|關閉|Cancel \/ discard draft|Close/,exact:true}).click();await expect(p.getByRole('dialog')).toHaveCount(0);};
  const saved=async()=>{await modal().getByRole('button',{name:'保存檢查',exact:true}).click();await expect(modal().getByRole('status')).toContainText(/已由伺服器確認|原操作只保存一次/);};
  const item=async(fw,p=page)=>{await p.locator('.main-nav').getByRole('button',{name:fw,exact:true}).click();await p.locator('.item-nav').first().click();};
  const linked=(p=page)=>p.locator('.linked-improvement-table tbody tr').filter({hasText:'Keep action-owned content'});
  const image=async(name,p=page)=>{const path=join(out,`${name}.png`);await p.screenshot({path,fullPage:true});receipt.screenshots.push(path);};
  const onlyHistoryChanged=(before,after,id)=>assert.deepEqual(after.records.filter(r=>r.kind!=='inspection'||r.id!==id),before.records.filter(r=>r.kind!=='inspection'||r.id!==id));
  page=await open();await history('TMSA');await run('original-editor-offers-separate-Observation-and-OFI-classes',async()=>{await expect(modal().locator('.inspection-finding').first().locator('select option')).toHaveText(['缺失','建議改善','正面觀察','指引','無缺失','一般觀察（非自動判No）']);});await close();
  if(phase==='green'){
   const peer=await open('admin');
   for(const fw of ['TMSA','DRYBMS']){
    await run(`${fw}-cancel-class-change-is-zero-write`,async()=>{const before=await ledger();await history(fw);await modal().locator('.inspection-finding').first().locator('select').selectOption('ofi');await close();assert.deepEqual(await ledger(),before);});
    await run(`${fw}-held-ACK-then-same-action-class-updates-on-both-clients`,async()=>{
     await item(fw,peer);await expect(linked(peer).locator('.finding-classification')).toHaveText('缺失');const before=await ledger(),original=await read('inspection',`classification-${fw}`);
     await history(fw);await modal().locator('.inspection-finding').first().locator('select').selectOption('ofi');assert.deepEqual(await ledger(),before);
     hold=true;hit=false;barrier=new Promise(resolve=>release=resolve);await modal().getByRole('button',{name:'保存檢查',exact:true}).click();await expect.poll(()=>hit).toBe(true);await expect(modal().locator('.inspection-finding').first().locator('select')).toBeDisabled();await expect(modal().getByRole('status')).toContainText('尚未保存至伺服器');release();await expect(modal().getByRole('status')).toContainText('已由伺服器確認');await close();
     const result=await read('inspection',original.id),after=await ledger();assert.equal(result.findings[0].classification,'ofi');assert.equal(result.version,original.version+1);assert.deepEqual(result.results,original.results);assert.deepEqual(result.snapshot,original.snapshot);assert.deepEqual(result.dryLevels,original.dryLevels);onlyHistoryChanged(before,after,original.id);assert.equal(after.audit,before.audit+1);assert.equal(after.operations,before.operations+1);
     await item(fw);await expect(linked().locator('.finding-classification')).toHaveText('建議改善');await expect(linked(peer).locator('.finding-classification')).toHaveText('建議改善',{timeout:30000});await image(`${fw}-item-OFI`);
     await page.locator('.main-nav').getByRole('button',{name:'待改善項目',exact:true}).click();await expect(page.locator('.improvement-table tbody tr').filter({hasText:`Action ${fw}`}).locator('.finding-classification')).toContainText('建議改善');
    });
    await run(`${fw}-reverse-to-Observation-${fw==='TMSA'?'lost-ACK-recovery':'normal-save'}-preserves-original-action`,async()=>{
     const before=await ledger(),original=await read('inspection',`classification-${fw}`);await history(fw);await modal().locator('.inspection-finding').first().locator('select').selectOption('finding');
     if(fw==='TMSA'){drop=true;await modal().getByRole('button',{name:'保存檢查',exact:true}).click();await expect(modal()).toContainText('NETWORK_UNKNOWN',{timeout:50000});await expect(modal().locator('.inspection-finding').first().locator('select')).toBeDisabled();drop=false;await saved();}else await saved();
     await close();const after=await ledger(),result=await read('inspection',original.id);assert.equal(result.findings[0].classification,'finding');assert.equal(result.version,original.version+1);assert.equal(after.audit,before.audit+1);assert.equal(after.operations,before.operations+1);onlyHistoryChanged(before,after,original.id);
     await item(fw);await expect(linked().locator('.finding-classification')).toHaveText('缺失');await expect(linked(peer).locator('.finding-classification')).toHaveText('缺失',{timeout:30000});
     const fresh=await open('operator');await item(fw,fresh);await expect(linked(fresh).locator('.finding-classification')).toHaveText('缺失');await fresh.context().close();
    });
   }
   await run('original-OFI-create-confirm-cancel-then-save-retains-item-link-and-source',async()=>{
    await history('TMSA');const finding=modal().locator('.inspection-finding').nth(1);await finding.locator('select').selectOption('ofi');await saved();const before=await ledger(),source=await read('inspection','classification-TMSA');
    await finding.getByRole('button',{name:'建立改善（先確認再保存）',exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await ledger(),before);
    await finding.getByRole('button',{name:'建立改善（先確認再保存）',exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:'確認建立及保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);await expect(finding.getByRole('button',{name:'查看既有改善',exact:true})).toBeVisible();await close();
    const after=await ledger(),actions=after.records.filter(r=>r.kind==='improvement'&&r.body.sourceKey==='classification-TMSA:unlinked');assert.equal(actions.length,1);assert.deepEqual(actions[0].body.itemIds,source.findings[1].itemIds);assert.deepEqual(actions[0].body.sources,source.findings[1].sources);assert.deepEqual(await read('inspection',source.id),source);assert.equal(after.audit,before.audit+1);assert.equal(after.operations,before.operations+1);
    await item('TMSA');await expect(page.locator('.linked-improvement-table tbody tr').filter({hasText:'Finding unlinked'}).locator('.finding-classification')).toHaveText('建議改善');
   });
   for(const [lang,width] of [['zh',390],['en',1440]])await run(`fresh-readonly-${lang}-${width}-both-classes-visible`,async()=>{
    const before=await ledger(),p=await open('admin',lang);await p.setViewportSize({width,height:width===390?844:1000});await history('TMSA',p,false,lang);await expect(modal(p).locator('.inspection-finding h4')).toHaveText(lang==='zh'?['缺失','建議改善','一般觀察（非自動判No）']:['Observation','OFI','General observation (not automatically No)']);
    const geometry=await modal(p).evaluate(el=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,modalWidth:el.clientWidth,modalScrollWidth:el.scrollWidth}));assert(geometry.documentWidth<=width+1);assert(geometry.modalScrollWidth<=geometry.modalWidth+1);receipt.geometry??={};receipt.geometry[`${lang}-${width}`]=geometry;await image(`${lang}-${width}-both-classes`,p);await modal(p).locator('.inspection-finding').nth(1).scrollIntoViewIfNeeded();await image(`${lang}-${width}-OFI`,p);await close(p);await p.context().close();assert.deepEqual(await ledger(),before);
   });
   await peer.context().close();
  }
 }
 assert.equal(receipt.blockedExternal,0);assert.deepEqual(receipt.errors,[]);receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.failure={case:current,message:String(e.message).slice(0,2200)};if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{release?.();await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;if(!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}const files=['supabase/finding-classification-readback.sql','src/findingClassification.ts','src/Inspections.tsx','src/Improvements.tsx','src/FrameworkPage.tsx','src/types.ts','src/syncState.ts','src/reports.ts','src/domain.ts','src/api.ts','src/useRecordEditor.ts','scripts/verify-finding-classification.mjs','scripts/qa-server.mjs','scripts/native-postgres.mjs',...readdirSync(join(root,'supabase/migrations')).filter(f=>/^\d.*\.sql$/.test(f)).map(f=>'supabase/migrations/'+f)];receipt.testedInputs=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(join(root,f))).digest('hex')]));writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));}
