// Original mounted UI + owned native PostgreSQL. Synthetic data only; no hosted requests.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
const red=process.argv.includes('--red');
const out=join(root,'qa-evidence','improvement-input',`${red?'red':'green'}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const receipt={layer:'Original UI + synthetic data + owned PostgreSQL; NOT hosted acceptance',cases:[],inputWindows:[],screenshots:[],errors:[],blockedExternal:0};
const seed=syntheticSeed(),base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
for(const frameworkId of ['TMSA','DRYBMS']){
 const template=seed.items.find(i=>i.frameworkId===frameworkId),count=350-seed.items.filter(i=>i.frameworkId===frameworkId).length;
 for(let index=0;index<count;index++)seed.items.push({...structuredClone(template),id:`extra-${frameworkId}-${index}`,code:`QA-${frameworkId}-${String(index).padStart(3,'0')}`,level:index%4+1,order:index+10,kpi:{en:'Synthetic related standard text '.repeat(3),zh:'合成關聯標準內容。'.repeat(8)}});
}
seed.items.push({...structuredClone(seed.items[0]),id:'inactive-item',code:'INACTIVE',active:false,order:1000});
seed.assessments=seed.items.filter(i=>i.active).map(i=>({...structuredClone(seed.assessments[0]),id:`assessment-${i.id}`,itemId:i.id}));
seed.improvements=[{...base('input-action'),title:'QA shared action\n測試改善',content:{en:'Original English content.',zh:'原有繁中內容。'},itemIds:['item-a','item-dry','inactive-item'],departmentIds:['marine'],assigneeIds:['qa-owner'],source:'non_external',urgency:'medium',status:'open',percent:0,targetDate:'',plan:'Original plan',events:[],closedAt:null,closedBy:null,sources:[{source:'Synthetic provenance',rawItem:'RAW MUST STAY'}]}, {...base('other-action'),title:'Other action\n另一改善',content:{en:'Other content',zh:'另一內容'},itemIds:['item-b'],departmentIds:[],assigneeIds:[],source:'non_external',urgency:'low',status:'open',percent:0,targetDate:'',plan:'',events:[],closedAt:null,closedBy:null,sources:[]}];
let qa,vite,browser,page,current='setup',hold=false,hit=false,release,barrier=Promise.resolve();
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const run=async(id,fn)=>{current=id;await fn();receipt.cases.push({id,status:'PASS'});writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));};
try{
 qa=await startQaServer({seed,evidenceDir:out,afterCommit:async({action,result})=>{if(action==='save'&&result.ok&&hold){hold=false;hit=true;await barrier;}return false;}});
 for(const file of ['006_restart_updates.sql','007_shared_targets.sql','008_inspection_history.sql'])await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',file),'utf8'));
 // Anonymous option-volume fixtures, not accounts used for login.
 for(let index=0;index<115;index++){
  const body={...base(`input-person-${index}`),version:1,username:`input-person-${index}`,name:`匿名人員 ${index}`,departmentId:'marine',role:'operator',active:true,hasPassword:false};
  await qa.db.setup.query("insert into compliance_private.records(kind,id,version,body) values('person',$1,1,$2::jsonb)",[body.id,JSON.stringify(body)]);
 }
 const ledger=async()=>({records:(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows,audit:(await qa.db.setup.query('select count(*)::int n from compliance_private.audit')).rows[0].n,operations:(await qa.db.setup.query('select count(*)::int n from compliance_private.operations')).rows[0].n});
 const record=async id=>(await qa.db.setup.query("select body from compliance_private.records where kind='improvement' and id=$1",[id])).rows[0]?.body;
 const initial=await ledger();
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async(role='owner')=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>{if(![ui,qa.url].includes(new URL(route.request().url()).origin)){receipt.blockedExternal++;return route.abort();}return route.continue();});
  await context.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users[role]});
  const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>receipt.errors.push(e.name));p.on('dialog',d=>d.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();return p;
 };
 page=await open();
 const modal=(p=page)=>p.getByRole('dialog');
 const field=(name,p=page)=>modal(p).locator('label.field').filter({hasText:name}).locator('input,textarea').first();
 const pickers=(p=page)=>modal(p).locator('fieldset.multi-select');
 const nav=(route,p=page)=>p.locator('.main-nav').getByRole('button',{name:route==='main'?'待改善項目':route,exact:true}).click();
 const enter=async(route,mode,p=page)=>{
  await nav(route,p);
  if(route!=='main'){const first=p.locator('.item-nav').first();if(!await first.count())await p.locator('.chapter-button').first().click();await first.click();}
  if(mode==='create')await p.getByRole('button',{name:route==='main'?'新增改善':'＋增加',exact:true}).click();
  else if(route==='main')await p.locator('.improvement-table tbody tr').filter({has:p.getByText('QA shared action',{exact:true})}).getByRole('button',{name:'完整編輯',exact:true}).click();
  else{await p.locator('.linked-improvements .text-button').first().click();await modal(p).getByRole('button',{name:'完整編輯',exact:true}).click();}
  await expect(field('標題（英文）',p)).toBeVisible();await expect(pickers(p)).toHaveCount(3);
 };
 const cancel=async(p=page)=>{await modal(p).getByRole('button',{name:'取消／放棄草稿',exact:true}).click();await expect(modal(p)).toHaveCount(0);};
 const image=async name=>{const path=join(out,`${name}.png`);await page.screenshot({path});receipt.screenshots.push(path);};
 const matrix=red?[['TMSA','edit']]:[['TMSA','edit'],['DRYBMS','edit'],['main','edit'],['TMSA','create'],['DRYBMS','create'],['main','create']];
 for(const [route,mode] of matrix)await run(`${route}-${mode}-typing-does-not-rewrite-unrelated-checkboxes-cancel-zero-write`,async()=>{
  const before=await ledger();await enter(route,mode);const checkboxCount=await pickers().locator('input').count();assert(checkboxCount>=820);
  for(const label of ['標題（英文）','標題（繁中）','內容（英文）','內容（繁中）']){
   const input=field(label);await input.focus();await page.keyboard.press('Control+End');await page.keyboard.type('x');const start=await input.inputValue();
   await input.evaluate(el=>{window.__inputNode=el;window.__pickerChanges=0;window.__inputTimes=[];window.__pickerObserver=new MutationObserver(rows=>{window.__pickerChanges+=rows.length;});for(const picker of document.querySelectorAll('.modal fieldset.multi-select'))window.__pickerObserver.observe(picker,{subtree:true,attributes:true,childList:true,characterData:true});window.__inputListener=e=>{if(e.target===el){const at=performance.now();requestAnimationFrame(()=>window.__inputTimes.push(performance.now()-at));}};document.addEventListener('input',window.__inputListener,true);});
   const text='abcde中文輸入測試12345';await page.keyboard.type(text,{delay:10});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const sample=await input.evaluate(el=>{window.__pickerObserver.disconnect();document.removeEventListener('input',window.__inputListener,true);return {changes:window.__pickerChanges,samples:window.__inputTimes,sameNode:el===window.__inputNode,focused:document.activeElement===el,caret:el.selectionStart,length:el.value.length};});
   receipt.inputWindows.push({route,mode,label,checkboxCount,...sample});
   assert.equal(await input.inputValue(),start+text);assert(sample.sameNode&&sample.focused);assert.equal(sample.caret,sample.length);
   // Permit one unrelated whole-App background refresh, not per-key option updates.
   assert(sample.changes<=checkboxCount*4,`Text typing rewrote ${sample.changes} unrelated option attributes/nodes for ${checkboxCount} checkboxes`);
  }
  const cdp=await page.context().newCDPSession(page),input=field('內容（繁中）');await input.focus();await page.keyboard.press('Control+End');const value=await input.inputValue();
  for(const text of ['c','ce','測試'])await cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});await cdp.send('Input.insertText',{text:'測試'});await expect(input).toHaveValue(value+'測試');await cdp.detach();
  if(mode==='edit'){await expect(pickers().nth(0).getByRole('checkbox',{name:/INACTIVE/})).toBeChecked();await expect(pickers().nth(2).getByRole('checkbox',{name:'測試 Owner',exact:true})).toBeChecked();}
  await pickers().nth(0).getByRole('checkbox',{name:/QA-TMSA-000/}).check();await pickers().nth(1).getByRole('checkbox',{name:'海技組',exact:true}).check();const department=pickers().nth(1).locator('input:not(:checked)').first();await department.check();const departmentsChecked=await pickers().nth(1).locator('input:checked').count();await pickers().nth(2).getByRole('checkbox',{name:'測試操作員',exact:true}).check();await field('標題（繁中）').pressSequentially('保留勾選');assert.equal(await pickers().nth(1).locator('input:checked').count(),departmentsChecked);
  await expect(pickers().nth(0).getByRole('checkbox',{name:/QA-TMSA-000/})).toBeChecked();await expect(pickers().nth(2).getByRole('checkbox',{name:'測試操作員',exact:true})).toBeChecked();
  assert.deepEqual(await ledger(),before);if(route==='TMSA'&&mode==='edit')await image('desktop-edit');await cancel();assert.deepEqual(await ledger(),before);
 });
 if(!red){
  await run('live-language-switch-and-subsequent-record-use-current-options-and-selection',async()=>{
   const before=await ledger();await enter('TMSA','edit');const input=field('內容（繁中）');await input.fill('LANGUAGE_DRAFT');
   // Exercise the existing language handler while the modal remains mounted; not a pointer path through the backdrop.
   await page.getByRole('button',{name:'Switch language',exact:true}).evaluate(el=>el.click());await expect(modal().getByText('Related items (cross-framework)',{exact:true})).toBeVisible();await expect(field('Content (Traditional Chinese)')).toHaveValue('LANGUAGE_DRAFT');await expect(pickers().nth(0).getByRole('checkbox',{name:/INACTIVE.*inactive/})).toBeChecked();
   await page.getByRole('button',{name:'Switch language',exact:true}).evaluate(el=>el.click());await cancel();await nav('main');await page.locator('.improvement-table tbody tr').filter({has:page.getByText('Other action',{exact:true})}).getByRole('button',{name:'完整編輯',exact:true}).click();await expect(field('內容（英文）')).toHaveValue('Other content');assert.equal(await pickers().nth(0).locator('input:checked').count(),1);assert.equal(await pickers().nth(2).locator('input:checked').count(),0);await field('內容（英文）').press('Control+End');await field('內容（英文）').pressSequentially(' kept');await expect(field('內容（英文）')).toHaveValue('Other content kept');await cancel();assert.deepEqual(await ledger(),before);
  });
  await run('native-edit-ACK-and-fresh-peer-readback-preserve-text-selection-and-source',async()=>{
   const before=await record('input-action');await enter('DRYBMS','edit');await field('內容（繁中）').fill('保存完整中文內容');await field('標題（英文）').fill('Saved action');await pickers().nth(0).getByRole('checkbox',{name:/QA-TMSA-000/}).check();await pickers().nth(2).getByRole('checkbox',{name:'測試操作員',exact:true}).check();await field('標題（繁中）').press('Control+End');await field('標題（繁中）').pressSequentially('修改');
   const department=initial.records.find(r=>r.kind==='settings').body.departments.find(d=>d.active&&!before.departmentIds.includes(d.id));assert(department);await pickers().nth(1).getByRole('checkbox',{name:department.name.zh||department.name.en,exact:true}).check();
   hold=true;hit=false;barrier=new Promise(r=>release=r);await modal().getByRole('button',{name:'確認保存',exact:true}).click();await expect.poll(()=>hit).toBe(true);await expect(modal()).toBeVisible();await expect(modal().getByRole('button',{name:'保存中…',exact:true})).toBeDisabled();release();await expect(modal()).toHaveCount(0);
   const saved=await record('input-action');assert.equal(saved.version,before.version+1);assert.equal(saved.content.zh,'保存完整中文內容');assert.equal(saved.title,'Saved action\n測試改善修改');assert.deepEqual(saved.itemIds,[...before.itemIds,'extra-TMSA-0']);assert.deepEqual(saved.assigneeIds,[...before.assigneeIds,'qa-operator']);assert.deepEqual(saved.departmentIds,[...before.departmentIds,department.id]);for(const key of ['sources','events','plan','source'])assert.deepEqual(saved[key],before[key]);
   const peer=await open('admin');await nav('main',peer);await peer.locator('.improvement-table tbody tr').filter({has:peer.getByText('Saved action',{exact:true})}).getByRole('button',{name:'完整編輯',exact:true}).click();await expect(field('內容（繁中）',peer)).toHaveValue(saved.content.zh);await expect(pickers(peer).nth(0).getByRole('checkbox',{name:/QA-TMSA-000/})).toBeChecked();await expect(pickers(peer).nth(2).getByRole('checkbox',{name:'測試操作員',exact:true})).toBeChecked();await cancel(peer);await peer.context().close();
  });
  await run('native-inline-create-saves-once-and-stays-on-original-item',async()=>{
   const before=await ledger();await enter('TMSA','create');await field('標題（繁中）').fill('新建改善');await field('內容（繁中）').fill('新建後確認保存');await pickers().nth(0).getByRole('checkbox',{name:/QA-DRYBMS-000/}).check();await pickers().nth(2).getByRole('checkbox',{name:'測試操作員',exact:true}).check();await field('改善計劃').fill('按原操作保存');await modal().getByRole('button',{name:'確認保存',exact:true}).click();await expect(modal()).toHaveCount(0);await expect(page.locator('.item-detail')).toBeVisible();
   const after=await ledger(),created=after.records.filter(r=>r.kind==='improvement'&&!before.records.some(o=>o.kind===r.kind&&o.id===r.id));assert.equal(created.length,1);assert.equal(created[0].body.title,'\n新建改善');assert.deepEqual(created[0].body.itemIds,['item-a','extra-DRYBMS-0']);assert.deepEqual(created[0].body.assigneeIds,['qa-operator']);assert.equal(created[0].body.plan,'按原操作保存');assert.equal(after.audit,before.audit+1);assert.equal(after.operations,before.operations+1);await expect(page.locator('.linked-improvements')).toContainText('新建改善');
  });
  for(const route of ['main','TMSA'])await run(`${route}-existing-progress-editor-still-saves-percent-and-metadata`,async()=>{
   await nav(route);const before=await record('input-action');const row=page.locator(route==='main'?'.improvement-table tbody tr':'.linked-improvement-table tbody tr').filter({has:page.getByText('Saved action',{exact:true})});await row.getByRole('button',{name:route==='main'?'直接更新':'更新',exact:true}).click();await modal().getByLabel('完成百分比',{exact:true}).fill(route==='main'?'12':'34');await modal().getByLabel('急迫程度',{exact:true}).selectOption(route==='main'?'high':'urgent');await modal().getByRole('button',{name:'確認保存',exact:true}).click();await expect(modal()).toHaveCount(0);const saved=await record('input-action');assert.equal(saved.percent,route==='main'?12:34);assert.equal(saved.urgency,route==='main'?'high':'urgent');assert.equal(saved.events.length,before.events.length+1);assert.deepEqual(saved.events.slice(0,-1),before.events);for(const key of ['title','content','itemIds','departmentIds','assigneeIds','sources'])assert.deepEqual(saved[key],before[key]);
  });
  await run('mobile-full-editor-keeps-original-geometry-and-working-pickers',async()=>{
   await page.setViewportSize({width:390,height:844});const before=await ledger();await enter('DRYBMS','create');await field('標題（繁中）').fill('手機草稿');await pickers().nth(0).getByRole('checkbox',{name:/QA-TMSA-000/}).check();await field('內容（繁中）').fill('手機測試內容');const geometry=await modal().evaluate(el=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,modalWidth:el.clientWidth,modalScroll:el.scrollWidth}));assert(geometry.documentWidth<=geometry.width+1);assert(geometry.modalScroll<=geometry.modalWidth+1);receipt.mobileGeometry=geometry;await field('標題（繁中）').scrollIntoViewIfNeeded();await image('mobile-create');await cancel();assert.deepEqual(await ledger(),before);
  });
  const final=await ledger();assert.deepEqual(final.records.filter(r=>r.kind!=='improvement'),initial.records.filter(r=>r.kind!=='improvement'));
 }
 assert.equal(receipt.blockedExternal,0);assert.deepEqual(receipt.errors,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:String(error.message).slice(0,1800)};if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{release?.();await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;if(!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}receipt.testedInputs=Object.fromEntries(['src/Improvements.tsx','src/ui.tsx','src/FrameworkPage.tsx','src/useRecordEditor.ts','src/App.tsx','src/styles.css','scripts/verify-improvement-input.mjs','scripts/qa-server.mjs','scripts/native-postgres.mjs'].map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,inputWindows:receipt.inputWindows.length,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));}
