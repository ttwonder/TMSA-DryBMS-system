// Original App + synthetic data + owned native PostgreSQL. Not hosted acceptance.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
import {richTextToPlainText,richTextRuns} from '../src/richText.ts';
const baseline=process.argv.includes('--baseline');
const out=join(root,'qa-evidence/improvement-editor-layout',`${baseline?'baseline':'green'}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const paths=['src/Improvements.tsx','src/ImprovementReferencePicker.tsx','src/improvementReferencePicker.css','src/styles.css','src/richText.css','src/RichTextEditor.tsx','src/main.tsx','scripts/verify-improvement-editor-layout.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(join(root,p))).digest('hex')]));
const receipt={status:'RUNNING',layer:'真實UI＋測試資料＋owned native PostgreSQL；非正式環境',cases:[],geometry:[],screenshots:[],violations:[],errors:[],blocked:[],inputsBefore:hashes()};
const seed=syntheticSeed(),base=seed.chapters[0];
for(let n=2;n<=12;n++)seed.chapters.push({...base,id:`layout-chapter-${n}`,code:String(n),order:n,name:{zh:n===12?'最後章節：完整長名稱仍可捲動選取且不截斷內容':'安全管理與責任 '+n,en:n===12?'Last chapter: the complete long chapter name remains available for scrolling and selection':'Safety management '+n}});
seed.improvements=[{id:'layout-existing',version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:'',title:'QA layout existing',content:{en:'Existing English content',zh:'既有中文內容'},itemIds:['item-a'],departmentIds:[],assigneeIds:[],source:'non_external',urgency:'medium',status:'open',percent:0,targetDate:'',plan:'Existing plan',events:[],closedAt:null,closedBy:null,sources:[]}];
const sourceRefs=[{source:'TMSA',file:'Synthetic evidence.pdf',pages:[3],note:'QA source detail marker — preserve this evidence'}],sourceItems=seed.items.filter(i=>i.frameworkId==='TMSA');
seed.inspections=[{id:'layout-inspection',version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:'',frameworkId:'TMSA',title:'Synthetic source inspection',organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:structuredClone(seed.frameworks[0]),chapters:structuredClone(seed.chapters.filter(c=>c.frameworkId==='TMSA')),items:structuredClone(sourceItems),scoringVersion:'company-20-equal-stage-v1'},results:sourceItems.map(i=>({itemId:i.id,response:'no',conformity:'none',reviewed:true,observation:{en:'',zh:''},recommendation:{en:'',zh:''}})),findings:[{id:'layout-finding',itemIds:['item-a'],classification:'finding',observation:{en:'Synthetic actionable finding',zh:'合成外部檢查缺失'},recommendation:{en:'Retain source',zh:'保留來源'},sources:structuredClone(sourceRefs)}]}];
seed.improvements.push({...structuredClone(seed.improvements[0]),id:'layout-external',title:'QA layout external',source:'external',inspectionId:'layout-inspection',findingId:'layout-finding',sourceKey:'layout-inspection:layout-finding',sources:structuredClone(sourceRefs)});
let qa,vite,browser,page,current='setup';
const dialog=()=>page.getByRole('dialog');
const labels=lang=>lang==='zh'?['標題（英文）','標題（繁中）','內容（英文）','內容（繁中）']:['Title (English)','Title (Traditional Chinese)','Content (English)','Content (Traditional Chinese)'];
const lowerLabels=lang=>lang==='zh'?{departments:'負責部門',assignees:'執行人',urgency:'急迫程度',proposed:'提出日期',target:'目標日期',plan:'改善計劃'}:{departments:'Responsible departments',assignees:'Assignees',urgency:'Urgency',proposed:'Proposed date',target:'Target date',plan:'Action plan'};
const lowerGeometry=async(lang)=>dialog().evaluate((root,n)=>{
 const box=e=>{assertElement(e);const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 const assertElement=e=>{if(!e)throw new Error('Expected original lower-form control is missing');};
 const field=name=>[...root.querySelectorAll('label.field')].find(e=>e.firstChild?.textContent.trim()===name);
 const group=name=>[...root.querySelectorAll('fieldset.multi-select')].find(e=>e.querySelector('legend')?.textContent===name);
 const plan=root.querySelector('[role="textbox"][aria-label="'+n.plan+'"]'),source=[...root.querySelector('.modal-body').children].find(e=>e.matches('.notice')&&e.querySelector('strong'));
 const fields=[n.urgency,n.proposed,n.target].map(name=>field(name));
 return{departments:box(group(n.departments)),assignees:box(group(n.assignees)),headShortcut:box(root.querySelector('.department-head-shortcut')),fields:fields.map(box),controls:fields.map(e=>box(e.querySelector('input,select'))),plan:box(plan.closest('.rich-editor')),planField:box(plan.closest('.field')),source:source?box(source):null,form:box(root.querySelector('.form-grid')),milestones:box(root.querySelector('.milestone-section')),content:box(root.querySelector('[role="textbox"][aria-label="'+(n.plan==='改善計劃'?'內容（英文）':'Content (English)')+'"]').closest('.rich-editor')),planFont:parseFloat(getComputedStyle(plan).fontSize)};
},lowerLabels(lang));
const picture=async name=>{const p=join(out,name+'.png');await page.screenshot({path:p});receipt.screenshots.push(p);};
const run=async(id,fn)=>{current=id;const count=receipt.violations.length;await fn();receipt.cases.push({id,status:receipt.violations.length===count?'PASS':'FAIL'});};
const cancel=async()=>{await dialog().getByRole('button',{name:/^(取消／放棄草稿|Cancel \/ discard draft)$/}).click();await expect(dialog()).toHaveCount(0);};
const ledger=async()=>(await qa.db.setup.query('select kind,id,version,body,xmin::text,ctid::text from compliance_private.records order by kind,id')).rows;
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17});
 for(const f of ['018_person_department_heads.sql','019_safety_meeting_sources.sql','020_improvement_chapter_links.sql','021_additional_improvement_sources.sql','022_improvement_milestones.sql'])await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',f),'utf8'));
 const port=await new Promise((resolve,reject)=>{const p=net.createServer();p.once('error',reject);p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(e=>e?reject(e):resolve(n));});});
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async(width,lang,theme,user=qa.users.owner)=>{
  const ctx=await browser.newContext({viewport:{width,height:1000}});
  await ctx.route('**/*',r=>{const origin=new URL(r.request().url()).origin;if(![ui,qa.url].includes(origin)){receipt.blocked.push(origin);return r.abort();}return r.continue();});
  await ctx.addInitScript(({config,user,lang,theme})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language',lang);localStorage.setItem('fpmc-compliance-theme',theme);sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user,lang,theme});
  page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>receipt.errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(ui);await page.locator('.main-nav').getByRole('button',{name:lang==='zh'?'待改善項目':'Improvements',exact:true}).click();return ctx;
 };
 const before=await ledger();
 const configs=baseline?[{width:1440,lang:'zh',theme:'normal'}]:[...[1440,390].flatMap(width=>['zh','en'].flatMap(lang=>['normal','dark','eye'].map(theme=>({width,lang,theme})))),{width:1024,lang:'zh',theme:'eye'},{width:768,lang:'en',theme:'normal'}];
 for(const {width,lang,theme} of configs){
  const ctx=await open(width,lang,theme);
  for(const entry of ['create','full'])await run(`${entry}-${width}-${lang}-${theme}`,async()=>{
   if(entry==='create')await page.getByRole('button',{name:lang==='zh'?'新增改善':'New action',exact:true}).click();
   else await page.locator('.improvement-table tbody tr').filter({hasText:'QA layout existing'}).getByRole('button',{name:lang==='zh'?'完整編輯':'Full edit',exact:true}).click();
   const names=labels(lang);await expect(dialog().getByRole('textbox',{name:names[0],exact:true})).toBeVisible();
   const g=await dialog().evaluate((root,names)=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};const fields=names.map(n=>root.querySelector('[role="textbox"][aria-label="'+n+'"]'));const form=root.querySelector('.form-grid');return {form:box(form),fields:fields.map(e=>box(e.closest('.rich-editor'))),font:fields.map(e=>parseFloat(getComputedStyle(e).fontSize)),documentOverflow:document.documentElement.scrollWidth>innerWidth+1,modalOverflow:root.querySelector('.modal-body').scrollWidth>root.querySelector('.modal-body').clientWidth+1,theme:document.documentElement.dataset.theme};},names);
   const [te,tz,ce,cz]=g.fields,fail=message=>receipt.violations.push({case:current,message});
   if(Math.abs(te.width-tz.width)>1||te.width<g.form.width*.47||Math.abs(te.y-tz.y)>2)fail('Titles must share the first row in equal half-width fields');
   if(Math.abs(ce.x-g.form.x)>2||Math.abs(cz.x-g.form.x)>2||Math.abs(ce.width-g.form.width)>2||Math.abs(cz.width-g.form.width)>2||ce.y<Math.max(te.bottom,tz.bottom)||cz.y<ce.bottom)fail('Contents must be separate full-width rows with aligned edges');
   if(ce.height>110||cz.height>110)fail('Initial content inputs should be compact (approximately three text rows)');
   if(g.documentOverflow||g.modalOverflow||g.font.some(x=>x<16))fail('Do not shrink text or introduce horizontal document/modal overflow');
   if(theme!=='normal'&&g.theme!==theme)fail('Requested theme did not load');
   await picture(current+'-form');
   const n=lowerLabels(lang),lower=await lowerGeometry(lang),[urgency,proposed,target]=lower.fields;
   if(width>900){
    if(!(lower.departments.x<lower.assignees.x&&lower.assignees.right<urgency.x&&Math.abs(urgency.x-proposed.x)<2&&Math.abs(urgency.x-target.x)<2&&lower.headShortcut.bottom<=urgency.y&&urgency.bottom<=proposed.y&&proposed.bottom<=target.y))fail('Right column must place urgency, proposed date and target date vertically below the head shortcut');
    if(Math.abs(lower.controls[2].bottom-lower.departments.bottom)>2||Math.abs(lower.controls[2].bottom-lower.assignees.bottom)>2)fail('Target date bottom must align with department and assignee selector bottoms');
   }
   if(width<=620&&!(lower.departments.bottom<=lower.assignees.y&&lower.assignees.bottom<=lower.headShortcut.y&&lower.headShortcut.bottom<=urgency.y&&urgency.bottom<=proposed.y&&proposed.bottom<=target.y))fail('Narrow screens must retain the department, assignee and date controls in readable normal flow');
   if(Math.abs(lower.plan.x-lower.content.x)>2||Math.abs(lower.plan.width-lower.content.width)>2||Math.abs(lower.plan.height-lower.content.height)>2||lower.planFont<16)fail('Action plan must match the full-width compact content editor without shrinking text');
   if(entry==='full'&&lower.source)fail('Full edit must omit the source-details panel while retaining the source selector');
   if(entry==='create'&&!lower.source)fail('New improvement must retain its source-details panel');
   if(lower.planField.y<(lower.source??lower.form).bottom||lower.planField.bottom>lower.milestones.y)fail('Action plan must follow the source controls/result and precede specific milestones');
   await dialog().getByRole('group',{name:n.departments,exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));await picture(current+'-lower');
   if(width<=620){await dialog().getByRole('textbox',{name:n.plan,exact:true}).scrollIntoViewIfNeeded();await picture(current+'-plan');}
   const picker=dialog().locator('.improvement-reference-picker'),framework=picker.locator('.irp-frameworks').getByRole('checkbox',{name:'TMSA',exact:true});await framework.check();
   const scroller=picker.locator('.irp-chapters');await scroller.scrollIntoViewIfNeeded();
   const chapters=await scroller.evaluate(el=>{const r=el.getBoundingClientRect(),rows=[...el.querySelectorAll('.irp-chapter-row')].map(x=>x.getBoundingClientRect());return {height:r.height,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,overflowY:getComputedStyle(el).overflowY,total:rows.length,fullyVisible:rows.filter(x=>x.top>=r.top&&x.bottom<=r.bottom+1).length};});
   if(chapters.scrollHeight<=chapters.clientHeight||!['auto','scroll'].includes(chapters.overflowY))fail('All chapters must remain available through vertical scrolling');
   if(width>620&&(chapters.fullyVisible<3||chapters.fullyVisible>4)||width<=620&&chapters.height>220)fail('Chapter viewport should show approximately four ordinary desktop rows, not the whole list');
   await picture(current+'-chapters');
   const last=picker.getByRole('checkbox',{name:new RegExp('^(關聯章節|Link chapter) TMSA 12 ·')});await last.focus();await last.press('Space');await expect(last).toBeChecked();
   assert(await scroller.evaluate(el=>el.scrollTop>0));assert.equal(await picker.locator('.irp-chapter-row').count(),12);
   await dialog().getByRole('textbox',{name:names[2],exact:true}).fill('UNSAVED layout draft');
   await dialog().locator('label.field').filter({hasText:new RegExp('^'+n.urgency)}).locator('select').selectOption('high');await dialog().getByLabel(n.proposed,{exact:true}).fill('2026-10-24');await dialog().getByLabel(n.target,{exact:true}).fill('2026-12-31');await dialog().getByRole('textbox',{name:n.plan,exact:true}).fill('UNSAVED full-width plan\nCancelled second line');await cancel();
   receipt.geometry.push({case:current,...g,chapters,lower});
  });
  await ctx.close();
 }
 assert.deepEqual(await ledger(),before,'Layout browsing and cancelled text/reference edits must not write business records');
 await run('external-full-edit-hides-details-only-and-readonly-detail-retains-evidence',async()=>{
  const ctx=await open(1024,'zh','eye'),row=page.locator('.improvement-table tbody tr').filter({hasText:'QA layout external'});await row.getByRole('button',{name:'完整編輯',exact:true}).click();
  await expect(dialog().getByLabel('來源檢查')).toHaveValue('layout-inspection');await expect(dialog().getByLabel('來源發現')).toHaveValue('layout-finding');await expect(dialog().getByLabel('來源檢查')).toBeDisabled();await expect(dialog().getByLabel('來源發現')).toBeDisabled();
  if((await lowerGeometry('zh')).source)receipt.violations.push({case:current,message:'External full edit must omit the expanded source-details panel, not its source selectors'});
  await dialog().getByRole('group',{name:'負責部門',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));await picture('external-full-edit-without-source-details');await cancel();
  await row.getByRole('button',{name:'QA layout external',exact:true}).click();await expect(dialog()).toContainText('QA source detail marker — preserve this evidence');await picture('external-readonly-detail-retains-source');await dialog().getByRole('button',{name:'Close',exact:true}).click();await expect(dialog()).toHaveCount(0);assert.deepEqual(await ledger(),before);await ctx.close();
 });
 assert.equal(receipt.violations.length,0,JSON.stringify(receipt.violations));
 await run('original-create-save-reopen-rich-text-and-cross-framework-references',async()=>{
  await open(1440,'zh','normal');await page.getByRole('button',{name:'新增改善',exact:true}).click();
  const values=['QA layout saved','版面保存測試','Full-width English content\nSecond line retained','中文內容滿寬\n第二行仍保留'];
  for(const [i,name] of labels('zh').entries())await dialog().getByRole('textbox',{name,exact:true}).fill(values[i]);
  const content=dialog().getByRole('textbox',{name:labels('zh')[2],exact:true});await content.focus();await content.press('Control+A');await dialog().getByRole('button',{name:'紅色',exact:true}).click();
  await dialog().locator('label.field').filter({hasText:/^急迫程度/}).locator('select').selectOption('urgent');await dialog().getByLabel('提出日期',{exact:true}).fill('2026-10-23');await dialog().getByLabel('目標日期',{exact:true}).fill('2026-12-15');
  const planText='Full-width action plan 改善計劃\nSecond line 保留換行',plan=dialog().getByRole('textbox',{name:'改善計劃',exact:true});await plan.fill(planText);await plan.press('Control+A');await dialog().getByRole('button',{name:'藍色',exact:true}).click();
  await dialog().locator('label.field').filter({hasText:/^來源/}).locator('select').selectOption('company_safety_meeting');
  const picker=dialog().locator('.improvement-reference-picker');await picker.locator('.irp-frameworks').getByRole('checkbox',{name:'TMSA',exact:true}).check();await picker.getByRole('checkbox',{name:/^關聯章節 TMSA 12 ·/}).check();await picker.getByRole('button',{name:'選擇小項目 TMSA 1',exact:true}).click();await picker.getByRole('checkbox',{name:/^TMSA 1\.1\.1 ·/}).check();await picker.locator('.irp-frameworks').getByRole('checkbox',{name:'DRYBMS',exact:true}).check();await picker.getByRole('checkbox',{name:/^關聯章節 DRYBMS 1 ·/}).check();
  await dialog().getByRole('button',{name:'確認保存',exact:true}).click();await expect(dialog()).toHaveCount(0);
  const saved=(await ledger()).find(r=>r.kind==='improvement'&&r.body.title.startsWith('QA layout saved'));assert(saved);const record=saved.body;
  assert.deepEqual(record.chapterIds.slice().sort(),['chapter-DRYBMS','layout-chapter-12']);assert.deepEqual(record.itemIds,['item-a']);assert.equal(richTextToPlainText(record.content.en),values[2]);assert.equal(richTextToPlainText(record.content.zh),values[3]);assert(richTextRuns(record.content.en).some(run=>run.color==='red'&&run.text.includes('Full-width English content')));
  assert.equal(record.urgency,'urgent');assert.equal(record.proposedDate,'2026-10-23');assert.equal(record.targetDate,'2026-12-15');assert.equal(record.source,'company_safety_meeting');assert.equal(richTextToPlainText(record.plan),planText);assert(richTextRuns(record.plan).some(run=>run.color==='blue'&&run.text.includes('Full-width action plan')));
  await page.locator('.improvement-table tbody tr').filter({hasText:'QA layout saved'}).getByRole('button',{name:'完整編輯',exact:true}).click();await expect(dialog().getByRole('textbox',{name:labels('zh')[2],exact:true})).toHaveText(values[2],{useInnerText:true});await picture('saved-full-edit');await cancel();assert.deepEqual((await ledger()).find(r=>r.id===record.id),saved);
  const ctx=page.context();await ctx.close();await open(1440,'zh','normal');await expect(page.locator('.improvement-table tbody tr').filter({hasText:'QA layout saved'})).toHaveCount(1);receipt.savedRecordId=record.id;
 });
 await run('original-full-edit-save-moved-fields-and-peer-readback',async()=>{
  const ownerPage=page,prior=(await ledger()).find(r=>r.id===receipt.savedRecordId),peer=await open(1440,'zh','eye',qa.users.peer),peerPage=page;page=ownerPage;
  await page.locator('.improvement-table tbody tr').filter({hasText:'QA layout saved'}).getByRole('button',{name:'完整編輯',exact:true}).click();
  await expect(dialog().getByRole('textbox',{name:'改善計劃',exact:true})).toHaveText('Full-width action plan 改善計劃\nSecond line 保留換行',{useInnerText:true});
  await dialog().locator('label.field').filter({hasText:/^急迫程度/}).locator('select').selectOption('high');await dialog().getByLabel('提出日期',{exact:true}).fill('2026-10-24');await dialog().getByLabel('目標日期',{exact:true}).fill('2026-12-31');
  const planText='Updated action plan 完整編輯\nSecond line unchanged format',plan=dialog().getByRole('textbox',{name:'改善計劃',exact:true});await plan.fill(planText);await plan.press('Control+A');await dialog().getByRole('button',{name:'綠色',exact:true}).click();
  await dialog().getByRole('button',{name:'確認保存',exact:true}).click();await expect(dialog()).toHaveCount(0);
  const saved=(await ledger()).find(r=>r.id===receipt.savedRecordId);assert.equal(saved.version,prior.version+1);assert.equal(saved.body.urgency,'high');assert.equal(saved.body.proposedDate,'2026-10-24');assert.equal(saved.body.targetDate,'2026-12-31');assert.equal(richTextToPlainText(saved.body.plan),planText);assert(richTextRuns(saved.body.plan).some(run=>run.color==='green'&&run.text.includes('Updated action plan')));
  for(const key of ['title','content','source','chapterIds','itemIds','departmentIds','assigneeIds','events','milestones','milestoneEvents'])assert.deepEqual(saved.body[key],prior.body[key],key+' must remain unchanged');
  page=peerPage;const row=page.locator('.improvement-table tbody tr').filter({hasText:'QA layout saved'});await expect(row).toContainText('2026-12-31',{timeout:18000});await row.getByRole('button',{name:'完整編輯',exact:true}).click();await expect(dialog().getByRole('textbox',{name:'改善計劃',exact:true})).toHaveText(planText,{useInnerText:true});await expect(dialog().getByLabel('提出日期',{exact:true})).toHaveValue('2026-10-24');await expect(dialog().getByLabel('目標日期',{exact:true})).toHaveValue('2026-12-31');await dialog().getByRole('group',{name:'負責部門',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));await picture('saved-peer-full-edit-lower');await cancel();assert.deepEqual((await ledger()).find(r=>r.id===receipt.savedRecordId),saved);await peer.close();page=ownerPage;
 });
 await run('external-save-preserves-source-identities-evidence-and-peer-detail',async()=>{
  const priorLedger=await ledger(),prior=priorLedger.find(r=>r.id==='layout-external'),ownerPage=page;
  const row=page.locator('.improvement-table tbody tr').filter({hasText:'QA layout external'});await row.getByRole('button',{name:'完整編輯',exact:true}).click();
  await expect(dialog()).not.toContainText('QA source detail marker');const planText='Updated external plan\n來源資料保持不變';await dialog().getByRole('textbox',{name:'改善計劃',exact:true}).fill(planText);
  await dialog().getByRole('button',{name:'確認保存',exact:true}).click();await expect(dialog()).toHaveCount(0);
  const afterLedger=await ledger(),saved=afterLedger.find(r=>r.id==='layout-external');assert.equal(saved.version,prior.version+1);assert.equal(richTextToPlainText(saved.body.plan),planText);
  for(const key of ['source','inspectionId','findingId','sourceKey','sources','itemIds','chapterIds','content','events','milestones','milestoneEvents'])assert.deepEqual(saved.body[key],prior.body[key],key+' must survive hidden source details');
  assert(saved.body.sources.length>0);assert.deepEqual(afterLedger.filter(r=>r.id!=='layout-external'),priorLedger.filter(r=>r.id!=='layout-external'),'No source inspection or other business record may change');
  const peer=await open(1024,'zh','eye',qa.users.peer),peerRow=page.locator('.improvement-table tbody tr').filter({hasText:'QA layout external'});await peerRow.getByRole('button',{name:'完整編輯',exact:true}).click();
  await expect(dialog().getByRole('textbox',{name:'改善計劃',exact:true})).toHaveText(planText,{useInnerText:true});assert.equal((await lowerGeometry('zh')).source,null);await expect(dialog().getByLabel('來源檢查')).toHaveValue('layout-inspection');await expect(dialog().getByLabel('來源發現')).toHaveValue('layout-finding');
  await dialog().getByRole('group',{name:'負責部門',exact:true}).evaluate(el=>el.scrollIntoView({block:'start'}));await picture('external-saved-peer-full-edit');await cancel();
  await peerRow.getByRole('button',{name:'QA layout external',exact:true}).click();await expect(dialog()).toContainText('QA source detail marker — preserve this evidence');await expect(dialog()).toContainText('Synthetic evidence.pdf');await dialog().getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual(await ledger(),afterLedger);await peer.close();page=ownerPage;
 });
 assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.blocked,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:String(error.stack)};await page?.screenshot({path:join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port]of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;receipt.inputsAfter=hashes();receipt.inputsUnchanged=JSON.stringify(receipt.inputsBefore)===JSON.stringify(receipt.inputsAfter);if(!receipt.inputsUnchanged||!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}assert.equal(new Set(receipt.cases.map(c=>c.id)).size,receipt.cases.length);writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,violations:receipt.violations,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));}
