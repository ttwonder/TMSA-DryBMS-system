// Original App + ApiClient + owned native PostgreSQL; all business data is synthetic.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed,rpc,sha256} from './native-postgres.mjs';
const phase=process.argv.includes('--red')?'red':'green';
const out=join(root,'qa-evidence/improvement-update-save-incident',`${phase}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','tests','scripts','package.json','package-lock.json','supabase'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>existsSync(join(root,f)));
const receipt={phase,layer:'Original App / real ApiClient / owned native PostgreSQL. Synthetic data; controlled inspection-detail transport failure. Not production diagnosis or recovery.',inputs:Object.fromEntries([...new Set(files)].sort().map(f=>[f,sha256(readFileSync(join(root,f)))])),cases:[],requests:[],errors:[],screenshots:[],blockedExternal:0};
const persist=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
const seed=syntheticSeed(),base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
seed.inspections=['TMSA','DRYBMS'].map(fw=>{const items=seed.items.filter(i=>i.frameworkId===fw);return {...base('source-'+fw),frameworkId:fw,title:'Synthetic source '+fw,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===fw)),chapters:structuredClone(seed.chapters.filter(c=>c.frameworkId===fw)),items:structuredClone(items),scoringVersion:fw==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},results:items.map(i=>({itemId:i.id,response:'no',conformity:'none',reviewed:true,observation:{en:'',zh:''},recommendation:{en:'',zh:''}})),findings:[{id:'linked',itemIds:[items[0].id],classification:'finding',observation:{en:'Synthetic actionable observation',zh:'合成需追蹤缺失'},recommendation:{en:'Retain source',zh:'保留來源'},sources:[]}]};});
seed.improvements=seed.inspections.map(i=>({...base('action-'+i.frameworkId),title:'Action '+i.frameworkId,content:{en:'Synthetic content retained',zh:'合成改善內容保留'},itemIds:[...i.findings[0].itemIds],departmentIds:['marine'],assigneeIds:[],source:'external',inspectionId:i.id,findingId:'linked',sourceKey:i.id+':linked',urgency:'medium',status:'open',percent:20,targetDate:'',plan:'Original action plan',events:[],closedAt:null,closedBy:null,sources:[]}));
seed.improvements.push({...structuredClone(seed.improvements[0]),...base('action-control'),title:'Action control',source:'non_external',inspectionId:undefined,findingId:undefined,sourceKey:undefined,itemIds:['item-b']});
seed.inspections[0].findings.push({...structuredClone(seed.inspections[0].findings[0]),id:'general',classification:'general',itemIds:[]});
seed.improvements.push({...structuredClone(seed.improvements[0]),...base('action-general'),title:'Action general',findingId:'general',sourceKey:'source-TMSA:general',itemIds:[]});
let qa,vite,browser,page,current='setup',failDetail=true;
const ok=r=>{assert.equal(r.ok,true,r.code);return r.data;};
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17});await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/018_person_department_heads.sql'),'utf8'));
 const call=(role,action,payload={})=>rpc(qa.db,action,payload,qa.users[role].sessionToken,qa.users[role].clientId);
 const read=async(kind,id)=>(await qa.db.setup.query('select body from compliance_private.records where kind=$1 and id=$2',[kind,id])).rows[0].body;
 const all=async()=>(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows;
 const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const uiPort=reserve.address().port;await new Promise(r=>reserve.close(r));
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:uiPort,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${uiPort}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async(role='owner')=>{const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',async r=>{const url=r.request().url();if(![ui,qa.url].includes(new URL(url).origin)){receipt.blockedExternal++;return r.abort();}if(url.startsWith(qa.url)&&r.request().method()==='POST'){const b=r.request().postDataJSON();receipt.requests.push({case:current,role,action:b.p_action,id:b.p_payload.id??b.p_payload.record?.id,intent:b.p_payload.intent,operationId:b.p_payload.operationId});if(b.p_action==='inspection_detail'&&failDetail){await new Promise(done=>setTimeout(done,600));return r.abort('failed');}}return r.continue();});await context.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users[role]});const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>receipt.errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();return p;};
 const nav=async(route,p=page)=>p.locator('.main-nav').getByRole('button',{name:route==='list'?'待改善項目':route,exact:true}).click();
 const row=(fw,route,p=page)=>p.locator(route==='list'?'.improvement-table':'.linked-improvement-table').locator('tbody tr').filter({has:p.getByRole('button',{name:'Action '+fw,exact:true})});
 const enter=async(fw,route='list')=>{await nav(route);await row(fw,route).getByRole('button',{name:route==='list'?'直接更新':'更新',exact:true}).click();const d=page.getByRole('dialog');await expect(d.getByRole('heading',{name:'更新進度',exact:true})).toBeVisible();return d;};
 const cancel=async d=>{await d.getByRole('button',{name:'取消／放棄草稿',exact:true}).click();await expect(d).toHaveCount(0);};
 const snap=async()=>{const path=join(out,current+'.png');await page.screenshot({path,fullPage:false});receipt.screenshots.push(path);};
 const run=async(id,fn)=>{current=id;try{const details=await fn();receipt.cases.push({id,status:'PASS',...details});}catch(error){await snap().catch(()=>{});receipt.cases.push({id,status:'FAIL',message:error.message,visibleNotice:await page?.getByRole('dialog').locator('.notice.error').allTextContents().catch(()=>[])});throw error;}finally{persist();}};
 page=await open();
 await run('NON_EXTERNAL_CONTROL',async()=>{const before=await all(),d=await enter('control');await d.locator('.progress-text textarea').fill('Control draft');await page.waitForTimeout(1000);assert.equal(receipt.requests.filter(x=>x.case===current&&x.action==='inspection_detail').length,0);assert.equal(receipt.requests.filter(x=>x.case===current&&x.action==='save').length,0);await cancel(d);assert.deepEqual(await all(),before);});
 for(const [fw,route] of [['TMSA','list'],['DRYBMS','DRYBMS']])await run('EXTERNAL_PROGRESS_'+fw,async()=>{
  const before=await all(),old=await read('improvement','action-'+fw),source=await read('inspection','source-'+fw),d=await enter(fw,route);
  await d.locator('.progress-text textarea').fill('Retained synthetic progress '+fw);await page.waitForTimeout(1200);await snap();
  assert.equal(receipt.requests.filter(x=>x.case===current&&x.action==='save').length,0,'opening and typing do not save');assert.deepEqual(await all(),before);
  assert.equal(await d.getByText(/NETWORK_UNKNOWN/).count(),0,'Opening a saved external action must not show an unknown-save warning from an unrelated detail read');
  assert.equal(receipt.requests.filter(x=>x.case===current&&x.action==='inspection_detail').length,0,'Existing linked progress must use the authoritative compact classification, not a whole historical snapshot');
  await d.getByLabel('完成百分比',{exact:true}).fill('55');await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect(d).toHaveCount(0);
  const after=await read('improvement',old.id);assert.equal(after.version,old.version+1);assert.equal(after.percent,55);assert.equal(after.events.length,old.events.length+1);assert.equal(after.events.at(-1).content,'Retained synthetic progress '+fw);for(const key of ['source','sourceKey','inspectionId','findingId','itemIds','sources','content'])assert.deepEqual(after[key],old[key]);assert.deepEqual(await read('inspection',source.id),source);assert.equal(receipt.requests.filter(x=>x.case===current&&x.action==='save').length,1);
  return {recordId:old.id,version:after.version,eventCount:after.events.length};
 });
 await run('FULL_READ_FAILURE_IS_NOT_SAVE_UNKNOWN',async()=>{
  const before=await read('improvement','action-TMSA'),d=await enter('TMSA');await d.locator('.progress-text textarea').fill('Progress retained through full mode');await d.getByRole('button',{name:'完整編輯',exact:true}).click();
  await expect(d.getByText(/這是讀取提示，不是保存結果/)).toBeVisible();assert.equal(await d.getByText(/使用原操作編號核對或重播/).count(),0);assert.equal(receipt.requests.filter(x=>x.case===current&&x.action==='save').length,0);
  await snap();await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect(d).toHaveCount(0);const after=await read('improvement',before.id);assert.equal(after.version,before.version+1);assert.equal(after.events.at(-1).content,'Progress retained through full mode');for(const key of ['sourceKey','inspectionId','findingId','itemIds','content','sources'])assert.deepEqual(after[key],before[key]);
 });
 await run('GENERAL_MISSING_DETAIL_RETAINS_DRAFT_WITHOUT_FALSE_CLASS',async()=>{
  const before=await all(),d=await enter('general');await d.locator('.progress-text textarea').fill('General draft retained');await expect(d.getByText(/這是讀取提示，不是保存結果/)).toBeVisible();await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect(d.getByText(/來源發現資料尚未載入/)).toBeVisible();assert.equal(await d.getByText(/正面觀察或指引不能作為缺失/).count(),0);await expect(d.locator('.progress-text textarea')).toHaveValue('General draft retained');assert.equal(receipt.requests.filter(x=>x.case===current&&x.action==='save').length,0);await cancel(d);assert.deepEqual(await all(),before);
 });
 await run('GENERAL_COMPLETE_SOURCE_HEALTHY_CONTROL',async()=>{
  failDetail=false;const before=await read('improvement','action-general'),d=await enter('general');await expect.poll(()=>receipt.requests.filter(x=>x.case===current&&x.action==='inspection_detail').length).toBeGreaterThan(0);await page.waitForTimeout(300);await d.locator('.progress-text textarea').fill('General source verified');await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect(d).toHaveCount(0);const after=await read('improvement',before.id);assert.equal(after.version,before.version+1);assert.deepEqual(after.itemIds,[]);assert.equal(after.events.at(-1).content,'General source verified');failDetail=true;
 });
 await run('SOURCE_CLASS_SYNC_RENEW_AND_PEER_READBACK',async()=>{
  const peer=await open('admin');await nav('list',peer);const old=await read('improvement','action-DRYBMS'),source=await read('inspection','source-DRYBMS'),d=await enter('DRYBMS');const input=d.locator('.progress-text textarea');await input.fill('Draft survives source classification refresh and renewal');await input.evaluate(el=>{window.__incidentDraftNode=el;el.focus();el.setSelectionRange(7,7);});
  const lease=ok(await call('admin','claim',{kind:'inspection',id:source.id,intent:'update'}));const candidate=structuredClone(source);candidate.findings[0].classification='ofi';ok(await call('admin','save',{kind:'inspection',record:candidate,expectedVersion:source.version,leaseToken:lease.token,operationId:randomUUID(),intent:'update'}));ok(await call('admin','release',{kind:'inspection',id:source.id,leaseToken:lease.token}));const savedSource=await read('inspection',source.id);
  await expect.poll(async()=>await row('DRYBMS','list').innerText(),{timeout:18000}).toContain('建議改善');await expect.poll(()=>receipt.requests.filter(x=>x.case===current&&x.role==='owner'&&x.action==='renew').length,{timeout:25000}).toBeGreaterThan(0);
  assert.equal(receipt.requests.filter(x=>x.case===current&&x.role==='owner'&&x.action==='inspection_detail').length,0);assert.equal(await input.evaluate(el=>el===window.__incidentDraftNode),true);await expect(input).toHaveValue('Draft survives source classification refresh and renewal');assert.equal(await input.evaluate(el=>el.selectionStart),7);await snap();await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect(d).toHaveCount(0);const saved=await read('improvement',old.id);assert.equal(saved.version,old.version+1);assert.equal(saved.events.at(-1).content,'Draft survives source classification refresh and renewal');assert.deepEqual(await read('inspection',source.id),savedSource);await expect.poll(async()=>await row('DRYBMS','list',peer).innerText(),{timeout:18000}).toContain('Draft survives source classification refresh and renewal');await peer.context().close();
 });
 await run('EXTERNAL_CLOSE_PRESERVES_SOURCE_AND_GRADING',async()=>{
  const old=await read('improvement','action-TMSA'),allBefore=await all(),d=await enter('TMSA');await d.getByRole('button',{name:'結案',exact:true}).click();await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect(d).toHaveCount(0);const after=await read('improvement',old.id);assert.equal(after.status,'closed');assert.equal(after.percent,100);assert.equal(after.version,old.version+1);assert.equal(after.events.length,old.events.length+1);assert.deepEqual((await all()).filter(x=>x.id!==old.id),allBefore.filter(x=>x.id!==old.id));assert.equal(receipt.requests.filter(x=>x.case===current&&x.action==='inspection_detail').length,0);
 });
 await run('NATIVE_SOURCE_ITEM_GUARD_STILL_REJECTS',async()=>{
  const old=await read('improvement','action-DRYBMS'),lease=ok(await call('owner','claim',{kind:'improvement',id:old.id,intent:'update'}));const result=await call('owner','save',{kind:'improvement',record:{...old,itemIds:['item-a']},expectedVersion:old.version,leaseToken:lease.token,operationId:randomUUID(),intent:'update'});assert.equal(result.ok,false);assert.equal(result.code,'INVALID_EXTERNAL_SOURCE');assert.deepEqual(await read('improvement',old.id),old);ok(await call('owner','release',{kind:'improvement',id:old.id,leaseToken:lease.token}));return {rejection:result.code};
 });
 assert.equal(receipt.errors.length,0);assert.equal(receipt.blockedExternal,0);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:error.message};process.exitCode=1;}
finally{
 const ports=[];if(qa)ports.push(qa.db.port,new URL(qa.url).port);if(vite)ports.push(vite.config.server.port);
 await browser?.close().catch(()=>{});await vite?.close().catch(()=>{});await qa?.stop().catch(e=>{receipt.cleanupError=e.message;process.exitCode=1;});receipt.cleanup={ports,closed:await Promise.all(ports.map(Number).map(closed)),retained:true};
 receipt.inputsUnchanged=Object.entries(receipt.inputs).every(([p,d])=>existsSync(join(root,p))&&sha256(readFileSync(join(root,p)))===d);if(!receipt.inputsUnchanged||receipt.cleanup.closed.some(x=>!x))process.exitCode=1;persist();console.log(JSON.stringify({status:receipt.status,cases:receipt.cases,receipt:join(out,'receipt.json'),cleanup:receipt.cleanup}));
}
