// Original App + synthetic data + owned native PostgreSQL; never hosted services.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import ExcelJS from 'exceljs';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
const red=process.argv.includes('--without-upgrade');
const out=join(root,'qa-evidence/safety-meeting-sources',`${red?'without-upgrade':'ui'}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const sources=[['vessel_safety_meeting','船舶安全會議','Vessel safety meeting'],['company_safety_meeting','公司安全會議','Company safety meeting'],['seminar','研討會','Seminar'],['external_regulatory_impact','外部法規規則影響','External regulatory and rule impacts']];
const inputPaths=['src/types.ts','src/main.tsx','src/domain.ts','src/improvementReferences.ts','src/ImprovementReferencePicker.tsx','src/improvementReferencePicker.css','supabase/migrations/020_improvement_chapter_links.sql','supabase/migrations/021_additional_improvement_sources.sql','supabase/additional-improvement-sources-readback.sql','src/Improvements.tsx','src/improvementTracking.ts','src/improvementList.ts','src/Reports.tsx','src/reports.ts','src/auditChanges.ts','src/useRecordEditor.ts','scripts/verify-safety-meeting-sources.mjs','supabase/migrations/019_safety_meeting_sources.sql','supabase/safety-meeting-sources-readback.sql'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fingerprints=()=>Object.fromEntries(inputPaths.map(path=>[path,hash(readFileSync(join(root,path)))]));
const receipt={layer:'真實UI＋測試資料＋owned native PostgreSQL；非正式Supabase／Pages',status:'RUNNING',cases:[],errors:[],blocked:[],screenshots:[],downloads:[],inputsBefore:fingerprints()};
const seed=syntheticSeed();seed.improvements=[{id:'legacy-self',version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:'',title:'Legacy control',content:{en:'Preserve old record',zh:'原有資料'},itemIds:['item-a'],departmentIds:[],assigneeIds:[],source:'non_external',urgency:'medium',status:'open',percent:0,targetDate:'',plan:'',events:[],closedAt:null,closedBy:null,sources:[]}];
seed.improvements=Array.from({length:17},(_,index)=>({...seed.improvements[0],id:index?'legacy-self-'+index:'legacy-self',title:'Legacy control '+index}));
let qa,vite,browser,page,current='setup',ui;
const run=async(id,fn)=>{current=id;await fn();receipt.cases.push({id,status:'PASS'});console.log('PASS',id);};
const record=async id=>(await qa.db.setup.query("select body from compliance_private.records where kind='improvement' and id=$1",[id])).rows[0]?.body;
const ledger=async()=>(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows;
const modal=p=>p.getByRole('dialog');
const field=(p,label)=>modal(p).locator('label.field').filter({hasText:new RegExp('^'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).locator('input,textarea,select,[contenteditable="true"]').first();
const itemChoice=async p=>{const g=modal(p).getByRole('group',{name:'關聯章節與小項目',exact:true});await g.getByRole('checkbox',{name:'TMSA',exact:true}).check();const expand=g.getByRole('button',{name:'選擇小項目 TMSA 1',exact:true});if(await expand.getAttribute('aria-expanded')!=='true')await expand.click();return g.getByRole('checkbox',{name:/^TMSA 1\.1\.1 ·/});};
const cancel=async p=>{await modal(p).getByRole('button',{name:/^(取消／放棄草稿|Cancel \/ discard draft)$/}).click();await expect(modal(p)).toHaveCount(0);};
const save=async p=>{await modal(p).getByRole('button',{name:'確認保存',exact:true}).click();await expect(modal(p)).toHaveCount(0);};
const nav=async(p,name='待改善項目')=>p.locator('.main-nav').getByRole('button',{name,exact:true}).click();
const rows=p=>p.locator('.improvement-table tbody tr');
const image=async(p,name)=>{const path=join(out,name+'.png');await p.screenshot({path});receipt.screenshots.push(path);};
const closed=port=>new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));});
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17});
 await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/018_person_department_heads.sql'),'utf8'));
 if(!red){await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/019_safety_meeting_sources.sql'),'utf8'));const result=await qa.db.setup.query(readFileSync(join(root,'supabase/safety-meeting-sources-readback.sql'),'utf8'));receipt.installReadback=(Array.isArray(result)?result:[result]).flatMap(r=>r.rows).find(row=>row.safety_meeting_sources_readback)?.safety_meeting_sources_readback;assert.equal(receipt.installReadback?.status,'PASS_SAFETY_MEETING_SOURCES_INSTALL_ONLY');assert(Object.values(receipt.installReadback.checks).every(value=>value===true));for(const migration of ['020_improvement_chapter_links.sql','021_additional_improvement_sources.sql'])await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',migration),'utf8'));const rb=await qa.db.setup.query(readFileSync(join(root,'supabase/additional-improvement-sources-readback.sql'),'utf8'));receipt.additionalInstallReadback=(Array.isArray(rb)?rb:[rb]).flatMap(r=>r.rows).map(row=>Object.values(row)[0]).find(value=>value?.checks);assert.equal(receipt.additionalInstallReadback?.status,'PASS_ADDITIONAL_IMPROVEMENT_SOURCES_INSTALL_ONLY');assert.equal(receipt.additionalInstallReadback.checkCount,Object.keys(receipt.additionalInstallReadback.checks).length);assert(Object.values(receipt.additionalInstallReadback.checks).every(value=>value===true));}
 const uiPort=await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const port=probe.address().port;probe.close(error=>error?reject(error):resolve(port));});});
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:uiPort,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async(role='owner',width=1440)=>{const ctx=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});await ctx.route('**/*',route=>{const origin=new URL(route.request().url()).origin;if(![ui,qa.url].includes(origin)){receipt.blocked.push(origin);return route.abort();}return route.continue();});await ctx.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users[role]});const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>receipt.errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();await nav(p);return p;};
 page=await open();const legacy=(await ledger()).filter(r=>r.kind==='improvement'),created=[];
 await run('UI-17-synthetic-legacy-records-renamed-without-data-writes',async()=>{const before=await ledger();await page.locator('.improvement-source-filter select').selectOption('non_external');await expect(rows(page)).toHaveCount(17);assert.deepEqual(await rows(page).locator('.improvement-origin').allTextContents(),Array(17).fill('內部管理需求 · 提出日期: 未填'));await page.getByRole('button',{name:'清除篩選及選取',exact:true}).click();assert.deepEqual(await ledger(),before);});
 await run('UI-source-options-preserve-order-cancel-zero-record-writes',async()=>{
  const before=await ledger();await page.getByRole('button',{name:'新增改善',exact:true}).click();
  await expect(field(page,'來源')).toBeVisible();
  assert.deepEqual(await field(page,'來源').locator('option').evaluateAll(options=>options.map(o=>o.value)),['non_external','external','management_review','management_directive',...sources.map(s=>s[0])]);
  for(const [source,label] of sources)await expect(field(page,'來源').locator(`option[value="${source}"]`)).toHaveText(label);
  await field(page,'來源').selectOption(sources[0][0]);await modal(page).getByRole('button',{name:'取消／放棄草稿',exact:true}).scrollIntoViewIfNeeded();await image(page,'create-desktop-zh');await cancel(page);assert.deepEqual(await ledger(),before);
 });
 for(const [source,label,en] of sources){
  await run(`UI-${source}-create-unlinked-save-native-readback`,async()=>{
   await page.getByRole('button',{name:'新增改善',exact:true}).click();await field(page,'標題（英文）').fill('QA '+source);await field(page,'內容（繁中）').fill(label+'合成測試內容');await field(page,'來源').selectOption(source);await field(page,'提出日期').fill('2026-02-28');await save(page);
   const found=(await qa.db.setup.query("select body from compliance_private.records where kind='improvement' and body->>'title'=$1",['QA '+source+'\n'])).rows;assert.equal(found.length,1);const saved=found[0].body;assert.equal(saved.source,source);assert.deepEqual(saved.itemIds,[]);assert.equal(saved.content.zh,label+'合成測試內容');created.push(saved);
  });
  await run(`UI-${source}-peer-edit-source-locked-optional-link-roundtrip`,async()=>{
   const p=await open('admin');const row=rows(p).filter({hasText:'QA '+source});await row.getByRole('button',{name:'完整編輯',exact:true}).click();await expect(field(p,'來源')).toHaveValue(source);await expect(field(p,'來源')).toBeDisabled();await field(p,'內容（繁中）').fill(label+'編輯後內容');await (await itemChoice(p)).check();await save(p);
   const saved=await record(created.at(-1).id);assert.equal(saved.source,source);assert.equal(saved.content.zh,label+'編輯後內容');assert.equal(saved.itemIds.length,1);assert(seed.items.some(item=>item.id===saved.itemIds[0]));assert.equal(saved.version,created.at(-1).version+1);
   await row.getByRole('button',{name:'完整編輯',exact:true}).click();await expect(field(p,'內容（繁中）')).toHaveText(label+'編輯後內容');await expect(await itemChoice(p)).toBeChecked();await (await itemChoice(p)).uncheck();await save(p);const unlinked=await record(saved.id);assert.deepEqual(unlinked.itemIds,[]);assert.equal(unlinked.source,source);assert.equal(unlinked.version,saved.version+1);await p.context().close();
  });
 }
 await page.reload();await page.locator('.main-nav').waitFor();await nav(page);
 for(const [source,label] of sources)await run(`UI-${source}-source-filter-is-exact`,async()=>{await page.locator('.improvement-source-filter select').selectOption(source);await expect(rows(page)).toHaveCount(1);await expect(rows(page)).toContainText(label);await expect(rows(page)).toContainText('QA '+source);});
 await run('UI-internal-management-requires-item-or-chapter-no-write',async()=>{const before=await ledger();await page.getByRole('button',{name:'新增改善',exact:true}).click();await field(page,'標題（英文）').fill('Do not save');await field(page,'內容（繁中）').fill('內部管理需求仍須關聯條目或章節');await modal(page).getByRole('button',{name:'確認保存',exact:true}).click();await expect(modal(page).getByRole('alert')).toContainText('請選擇至少一個相關條目或大章節');await cancel(page);assert.deepEqual(await ledger(),before);});
 await run('UI-mobile-English-four-labels-cancel-zero-write',async()=>{
  const before=await ledger(),p=await open('admin',390);await p.getByRole('button',{name:'Switch language',exact:true}).click();await p.getByRole('button',{name:'New action',exact:true}).click();await field(p,'Source').selectOption('company_safety_meeting');
  for(const [source,,label] of sources)await expect(field(p,'Source').locator(`option[value="${source}"]`)).toHaveText(label);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await modal(p).getByRole('button',{name:'Cancel / discard draft',exact:true}).scrollIntoViewIfNeeded();await image(p,'create-mobile-en');await cancel(p);assert.deepEqual(await ledger(),before);await p.context().close();
 });
 await nav(page,'報告中心');await page.getByRole('combobox',{name:'報告種類',exact:true}).selectOption('improvements');
 for(const [source,label] of sources){
  await run(`UI-${source}-report-filter-selected-cohort`,async()=>{await page.getByRole('combobox',{name:'報告來源',exact:true}).selectOption(source);const choices=page.getByRole('group',{name:'明選改善項目（搜尋後選取）',exact:true}).getByRole('checkbox');await expect(choices).toHaveCount(1);await expect(choices).not.toBeChecked();await page.getByRole('button',{name:'全選符合篩選結果',exact:true}).click();await expect(choices).toBeChecked();});
  for(const format of ['xlsx','pdf'])await run(`UI-${source}-real-${format}-download`,async()=>{
   await page.getByRole('combobox',{name:'文件格式',exact:true}).selectOption(format);const download=page.waitForEvent('download',{timeout:90000});await page.getByRole('button',{name:'生成並下載',exact:true}).click();const d=await download,path=join(out,`${source}.${format}`);await d.saveAs(path);assert(statSync(path).size>1000);
   const artifact={source,label,path,sha256:hash(readFileSync(path)),size:statSync(path).size};
   if(format==='xlsx'){const book=new ExcelJS.Workbook();await book.xlsx.readFile(path);let all='';for(const sheet of book.worksheets)sheet.eachRow(row=>row.eachCell(cell=>{all+=cell.text+'\n';}));assert(all.includes(label));assert(all.includes('QA '+source));assert(!all.includes('QA '+sources.find(s=>s[0]!==source)[0]));artifact.contentVerified=true;}
   receipt.downloads.push(artifact);
  });
 }
 await run('UI-legacy-internal-management-selected-export-cohort',async()=>{
  await page.getByRole('combobox',{name:'報告來源',exact:true}).selectOption('non_external');const choices=page.getByRole('group',{name:'明選改善項目（搜尋後選取）',exact:true}).getByRole('checkbox');await expect(choices).toHaveCount(17);await page.getByRole('group',{name:'明選改善項目（搜尋後選取）',exact:true}).getByRole('checkbox',{name:/Legacy control 0/}).check();
 });
 for(const format of ['xlsx','pdf'])await run(`UI-legacy-internal-management-real-${format}-download`,async()=>{
  await page.getByRole('combobox',{name:'文件格式',exact:true}).selectOption(format);const download=page.waitForEvent('download',{timeout:90000});await page.getByRole('button',{name:'生成並下載',exact:true}).click();const d=await download,path=join(out,`non_external.${format}`);await d.saveAs(path);assert(statSync(path).size>1000);const artifact={source:'non_external',label:'內部管理需求',path,sha256:hash(readFileSync(path)),size:statSync(path).size};
  if(format==='xlsx'){const book=new ExcelJS.Workbook();await book.xlsx.readFile(path);let text='';for(const sheet of book.worksheets)sheet.eachRow(row=>row.eachCell(cell=>{text+=cell.text+'\n';}));assert(text.includes('內部管理需求'));assert(text.includes('Legacy control 0'));assert(!text.includes('非外部'));assert(!text.includes('自行提出'));assert(!text.includes('Legacy control 1'));artifact.contentVerified=true;}receipt.downloads.push(artifact);
 });
 await run('UI-existing-records-unchanged-no-console-or-hosted-requests',async()=>{assert.deepEqual((await ledger()).filter(r=>r.kind==='improvement'&&r.id.startsWith('legacy-self')),legacy);assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.blocked,[]);});
 receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:String(error.stack)};await page?.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;receipt.inputsAfter=fingerprints();receipt.inputsUnchanged=JSON.stringify(receipt.inputsBefore)===JSON.stringify(receipt.inputsAfter);if(!receipt.inputsUnchanged||!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}receipt.caseCount=receipt.cases.length;assert.equal(new Set(receipt.cases.map(c=>c.id)).size,receipt.caseCount);writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));}
