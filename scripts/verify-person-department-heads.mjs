// Original App, synthetic data, owned native PostgreSQL/HTTP; never hosted.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed,rpc,sha256,opaque} from './native-postgres.mjs';

const baseline=process.argv.includes('--baseline');
const phase=baseline?'red':'green';
const out=join(root,'qa-evidence/person-department-heads',`${phase}-${new Date().toISOString().replaceAll(':','-')}`);
mkdirSync(out,{recursive:true});
const inputs=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','tests','scripts','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','supabase'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>existsSync(join(root,f))))].sort();
const hashes=()=>Object.fromEntries(inputs.map(f=>[f,sha256(readFileSync(join(root,f)))]));
const receipt={phase,layer:'真實UI＋測試資料；獨立本機PostgreSQL/HTTP adapter，不是正式Supabase／Pages',baselineHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),inputs:hashes(),cases:[],screenshots:[],observations:[],writes:[],errors:[],blockedExternal:0};
const persist=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
let current='setup',qa,vite,browser,page;
const run=async(id,fn)=>{assert(!receipt.cases.some(c=>c.id===id),'Unique caseID');current=id;try{const details=await fn();receipt.cases.push({...details,id,status:'PASS'});}catch(e){receipt.cases.push({id,status:'FAIL',message:e.message});if(!baseline)throw e;}finally{persist();}};
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const ok=r=>{assert.equal(r.ok,true,r.code);return r.data;};
const seed=syntheticSeed();
const bi=en=>({en,zh:'合成資料 '+en});
seed.inspections=['TMSA','DRYBMS'].map(fw=>({id:'filter-history-'+fw,version:0,frameworkId:fw,title:'Filter history '+fw,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===fw)),chapters:structuredClone(seed.chapters.filter(c=>c.frameworkId===fw)),items:structuredClone(seed.items.filter(i=>i.frameworkId===fw)),scoringVersion:fw==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},results:seed.items.filter(i=>i.frameworkId===fw).map(i=>({itemId:i.id,response:null,conformity:'none',reviewed:false,observation:bi('FROZEN_OBSERVATION'),recommendation:bi('FROZEN_ADVICE')})),findings:[{id:'finding',itemIds:[fw==='TMSA'?'item-a':'item-dry'],classification:'finding',observation:bi('FROZEN_FINDING_'+fw),recommendation:bi('FROZEN_RECOMMENDATION'),sources:[]}],...(fw==='DRYBMS'?{dryLevels:{'chapter-DRYBMS':[25,50,null,0]}}:{})}));
const entries=[{id:'list-create',mode:'create',route:'list'},{id:'list-full',mode:'full',route:'list'},{id:'list-progress',mode:'progress',route:'list'},...['TMSA','DRYBMS'].flatMap(route=>['assessment','create','full','progress'].map(mode=>({id:route+'-'+mode,route,mode}))),...['TMSA','DRYBMS'].map(route=>({id:'history-'+route+'-create',route,mode:'history'}))];
receipt.entryInventory=entries;
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17});
 if(!baseline)await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/018_person_department_heads.sql'),'utf8'));
 const call=async(role,action,payload={})=>rpc(qa.db,action,payload,qa.users[role].sessionToken,qa.users[role].clientId);
 const read=async(kind,id)=>(await qa.db.setup.query('select body from compliance_private.records where kind=$1 and id=$2',[kind,id])).rows[0]?.body;
 const saveRecord=async(kind,record,intent=record.version?'update':'create')=>{const lease=ok(await call('owner','claim',{kind,id:record.id,intent}));const saved=ok(await call('owner','save',{kind,record,expectedVersion:record.version,leaseToken:lease.token,intent,operationId:randomUUID()}));ok(await call('owner','release',{kind,id:record.id,leaseToken:lease.token}));return saved;};
 const people=[['qa-tech','QA Technical Selected','technical'],['qa-tech-new','QA Technical New','technical'],['qa-inactive','QA Inactive Selected','marine'],['qa-inactive-new','QA Inactive New','marine']];
 for(const [id,name,departmentId] of people)await saveRecord('person',{id,version:0,name,username:id,departmentId,role:'operator',active:true,hasPassword:false});
 const initialSelected=['qa-operator','qa-tech','qa-inactive'];
 for(const row of (await qa.db.setup.query("select body from compliance_private.records where kind='assessment'")).rows)await saveRecord('assessment',{...row.body,assigneeIds:initialSelected,remarks:'MANUAL_REMARKS_UNCHANGED\n完整原文'});
 const action=await saveRecord('improvement',{id:'filter-action',version:0,title:'Filter action\n篩選改善',content:bi('AUTHORED_CONTENT\n\n  Preserve spacing.'),itemIds:['item-a','item-dry'],departmentIds:['marine'],assigneeIds:initialSelected,source:'non_external',urgency:'medium',status:'open',percent:20,targetDate:'',plan:'Original plan',events:[],closedAt:null,closedBy:null,sources:[]});
 await saveRecord('improvement',{...action,events:[{id:'original-progress',at:'',by:'',content:'ORIGINAL_PROGRESS\n不可變歷史',status:action.status,percent:action.percent}]});
 for(const id of ['qa-inactive','qa-inactive-new'])await saveRecord('person',{...await read('person',id),active:false},'archive');
 const viewerHash=sha256(opaque());
 await saveRecord('person',{id:'qa-filter-viewer',version:0,name:'QA Management Viewer',username:'qa-filter-viewer',departmentId:'technical',role:'management_viewer',active:true,credentialHash:viewerHash});
 const gate=ok(await rpc(qa.db,'gate',{passwordHash:qa.db.qaCredentials.gateHash}));
 const viewer=ok(await rpc(qa.db,'login',{gateToken:gate.gateToken,personId:'qa-filter-viewer',passwordHash:viewerHash},'','qa-filter-viewer-client'));
 qa.users.viewer={...viewer,clientId:'qa-filter-viewer-client'};
 const records=async()=>(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows;
 const historyBefore=(await records()).filter(r=>r.kind==='inspection');
 const ledger=async()=>({records:await records(),operations:(await qa.db.setup.query('select count(*)::int n from compliance_private.operations')).rows[0].n,audit:(await qa.db.setup.query('select count(*)::int n from compliance_private.audit')).rows[0].n});
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const uiPort=reservation.address().port;await new Promise(r=>reservation.close(r));
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:uiPort,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${uiPort}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async(role='operator',lang='zh')=>{const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.route('**/*',r=>{const url=r.request().url();if(![ui,qa.url].includes(new URL(url).origin)){receipt.blockedExternal++;return r.abort();}if(url.startsWith(qa.url)&&r.request().method()==='POST'){const b=r.request().postDataJSON();if(b.p_action==='save')receipt.writes.push({role,kind:b.p_payload.kind,id:b.p_payload.record.id,departmentIds:b.p_payload.record.departmentIds,assigneeIds:b.p_payload.record.assigneeIds,operationId:b.p_payload.operationId,payloadHash:sha256(JSON.stringify(b.p_payload.record))});}return r.continue();});await ctx.addInitScript(({config,user,lang})=>{if(!sessionStorage.getItem('qa-initialized')){localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language',lang);sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));sessionStorage.setItem('qa-initialized','yes');}},{config:qa.config,user:qa.users[role],lang});const p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>receipt.errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();return p;};
 const nav=async(route,p=page,lang='zh')=>p.locator('.main-nav').getByRole('button',{name:route==='list'?(lang==='zh'?'待改善項目':'Improvements'):route==='history'?(lang==='zh'?'歷史檢查記錄':'Inspection history'):route,exact:true}).click();
 const actionRow=(route,p=page)=>p.locator(route==='list'?'.improvement-table':'.linked-improvement-table').locator('tbody tr').filter({has:p.getByRole('button',{name:'Filter action 篩選改善',exact:true})});
 const enter=async(e,p=page,lang='zh')=>{
  await nav(e.mode==='history'?'history':e.route,p,lang);
  if(e.mode==='assessment'){await p.locator('.item-actions').getByRole('button',{name:lang==='zh'?'修改':'Edit',exact:true}).click();await expect(p.locator('.assessment-editor')).toBeVisible();return p.locator('.item-responsibility');}
  if(e.mode==='history'){await p.getByRole('button',{name:'Filter history '+e.route,exact:true}).click();await p.getByRole('button',{name:lang==='zh'?'缺陷／改善建議':'Findings / recommendations',exact:true}).click();await p.locator('.inspection-finding').getByRole('button',{name:lang==='zh'?'建立改善（先確認再保存）':'Create action (confirm before saving)',exact:true}).click();}
  else if(e.mode==='create')await p.getByRole('button',{name:e.route==='list'?(lang==='zh'?'新增改善':'New action'):(lang==='zh'?'＋增加':'Add action'),exact:true}).click();
  else if(e.mode==='full'&&e.route!=='list'){await actionRow(e.route,p).locator('.text-button').click();await p.getByRole('dialog').getByRole('button',{name:lang==='zh'?'完整編輯':'Full edit',exact:true}).click();}
  else await actionRow(e.route,p).getByRole('button',{name:e.mode==='full'?(lang==='zh'?'完整編輯':'Full edit'):e.route==='list'?(lang==='zh'?'直接更新':'Update progress'):(lang==='zh'?'更新':'Update'),exact:true}).click();
  const d=p.getByRole('dialog').last();await expect(d.getByRole('button',{name:e.mode==='history'?(lang==='zh'?'確認建立及保存':'Confirm create and save'):(lang==='zh'?'確認保存':'Confirm save'),exact:true})).toBeEnabled();return d;
 };
 const groups=async(scope,e,lang='zh')=>{
  if(['assessment','progress'].includes(e.mode)){for(const name of lang==='zh'?['執行跟進人',...(e.mode==='progress'?['涉及部門']:[])]:['Assignees',...(e.mode==='progress'?['Departments']:[])]){const summary=scope.locator('summary').filter({hasText:name});if(await summary.getAttribute('aria-expanded')!=='true'&&!(await summary.evaluate(n=>n.parentElement.open)))await summary.click();}}
  return {departments:scope.getByRole('group',{name:e.mode==='full'||e.mode==='create'?(lang==='zh'?'負責部門':'Responsible departments'):e.mode==='history'?(lang==='zh'?'部門':'Departments'):(lang==='zh'?'涉及部門':'Departments'),exact:true}),people:scope.getByRole('group',{name:['assessment','progress'].includes(e.mode)?(lang==='zh'?'執行跟進人':'Assignees'):(lang==='zh'?'執行人':'Assignees'),exact:true})};
 };
 const setDepartments=async(g,names)=>{for(const box of await g.departments.getByRole('checkbox').all()){const label=await box.evaluate(n=>n.parentElement.textContent);await box.setChecked(names.includes(label));}};
 const snapshot=async(id,p=page)=>{const path=join(out,id+'.png');await p.screenshot({path,fullPage:false});receipt.screenshots.push(path);};
 const cancel=async(e,p=page,lang='zh')=>{if(e.mode==='assessment'){await p.getByRole('button',{name:lang==='zh'?'取消編輯':'Cancel edit',exact:true}).click();await expect(p.locator('.assessment-editor')).toHaveCount(0);}else{const d=p.getByRole('dialog').last();await d.getByRole('button',{name:e.mode==='history'?(lang==='zh'?'取消':'Cancel'):(lang==='zh'?'取消／放棄草稿':'Cancel / discard draft'),exact:true}).click();if(e.mode==='history')await p.getByRole('dialog').getByRole('button',{name:lang==='zh'?'關閉':'Close',exact:true}).last().click();await expect(p.getByRole('dialog')).toHaveCount(0);}};
 page=await open('owner');
 if(process.argv.includes('--management-layout-only')){
  for(const lang of ['zh','en']){await page.context().close();page=await open('owner',lang);for(const width of [1440,390])await run(`PDH-layout-management-helper-separated-${lang}-${width}`,async()=>{
   await page.setViewportSize({width,height:width===390?844:1000});await page.locator('.main-nav').getByRole('button',{name:lang==='zh'?'管理':'Management',exact:true}).click();await page.getByRole('row').filter({has:page.getByRole('cell',{name:'qa-tech',exact:true})}).getByRole('button').click();const d=page.getByRole('dialog');await expect(d.getByRole('button',{name:lang==='zh'?'確認保存':'Confirm save',exact:true})).toBeEnabled();await d.locator('.person-department-fields').scrollIntoViewIfNeeded();await snapshot(current);const geometry=await d.locator('.person-department-fields').evaluate(n=>({label:n.querySelector(':scope>label').getBoundingClientRect().toJSON(),note:n.querySelector(':scope>small').getBoundingClientRect().toJSON(),width:innerWidth,document:document.documentElement.scrollWidth}));assert(geometry.note.top>=geometry.label.bottom,'Helper note must start below the head label, not concatenate to it');assert(geometry.document<=width+1);await d.getByRole('button',{name:lang==='zh'?'取消':'Cancel',exact:true}).click();return geometry;
  });}
 }else{
 await run('PDH-N01-native-person-two-departments',async()=>{
  const original=await read('person','qa-tech-new');
  const next=await saveRecord('person',{...original,departmentIds:['marine','technical'],isDepartmentHead:true});
  assert.deepEqual(next.departmentIds,['marine','technical']);assert.equal(next.isDepartmentHead,true);
  return {personId:next.id,version:next.version,departmentIds:next.departmentIds,isDepartmentHead:next.isDepartmentHead};
 });
 await run('PDH-M01-original-management-multiselect',async()=>{
  await page.locator('.main-nav').getByRole('button',{name:'管理',exact:true}).click();
  await page.getByRole('row').filter({has:page.getByRole('cell',{name:'QA Technical Selected',exact:true})}).getByRole('button').click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'確認保存',exact:true})).toBeEnabled();
  await snapshot('PDH-M01-original-management');
  await expect(dialog.getByRole('group',{name:'隸屬部門',exact:true})).toHaveCount(1);
  await dialog.getByRole('group',{name:'隸屬部門',exact:true}).getByRole('checkbox',{name:'海技組',exact:true}).check();
  await expect(dialog.getByRole('group',{name:'隸屬部門',exact:true}).locator('input:checked')).toHaveCount(2);
  await expect(dialog.getByRole('checkbox',{name:'負責人',exact:true})).toHaveCount(1);
 });
 if(await page.getByRole('dialog').count())await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
 for(const e of entries){
  const before=await ledger(),scope=await enter(e),g=await groups(scope,e);await setDepartments(g,['海技組']);
  await run('PDH-'+e.id+'-head-shortcut',async()=>{
   await snapshot('PDH-'+e.id+'-shortcut');
   await expect(scope.getByRole('button',{name:'勾選部門負責人',exact:true})).toHaveCount(1);
  });
  await cancel(e);assert.deepEqual(await ledger(),before);
 }

 if(!baseline){
  await saveRecord('person',{...await read('person','qa-inactive-new'),isDepartmentHead:true});
  await saveRecord('person',{id:'qa-head',version:0,name:'QA Marine Head',username:'qa-head',departmentId:'marine',departmentIds:['marine'],isDepartmentHead:true,role:'operator',active:true,hasPassword:false});
  await page.reload();await page.locator('.main-nav').waitFor();
  const peer=await open('peer');
  const findRecord=(v,predicate)=>{if(!v||typeof v!=='object')return undefined;if(!Array.isArray(v)&&predicate(v))return v;for(const part of Object.values(v)){const found=findRecord(part,predicate);if(found)return found;}return undefined;};
  const peerNext=predicate=>{const promise=peer.waitForResponse(async r=>{if(!r.url().startsWith(qa.url)||r.request().method()!=='POST'||r.request().postDataJSON().p_action!=='sync')return false;const body=await r.json();return body.ok&&!!findRecord(body.data,predicate);},{timeout:30000});promise.catch(()=>{});return promise;};
  const bodyExcept=(row,fields)=>Object.fromEntries(Object.entries(row).filter(([k])=>!['version','updatedAt','updatedBy',...fields].includes(k)));
  const management=async(p=page,lang='zh')=>p.locator('.main-nav').getByRole('button',{name:lang==='zh'?'管理':'Management',exact:true}).click();
  const personRow=(id,p=page)=>p.getByRole('row').filter({has:p.getByRole('cell',{name:id,exact:true})});
  const editPerson=async(id,p=page,lang='zh')=>{await management(p,lang);await personRow(id,p).getByRole('button').click();const d=p.getByRole('dialog');await expect(d.getByRole('button',{name:lang==='zh'?'確認保存':'Confirm save',exact:true})).toBeEnabled();return d;};
  const personDepts=async(d,labels,lang='zh')=>{const g=d.getByRole('group',{name:lang==='zh'?'隸屬部門':'Member departments',exact:true});for(const box of await g.getByRole('checkbox').all()){const label=await box.evaluate(n=>n.parentElement.textContent);await box.setChecked(labels.includes(label));}};
  await run('PDH-M02-management-save-multi-head-peer-reopen',async()=>{
   const before=await records(),original=await read('person','qa-tech'),d=await editPerson('qa-tech');
   await personDepts(d,['海技組','船工處']);await d.getByRole('checkbox',{name:'負責人',exact:true}).check();
   assert.deepEqual(await records(),before);
   const waiting=peerNext(r=>r.id===original.id&&r.version===original.version+1);const writes=receipt.writes.length;
   await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
   const saved=await read('person',original.id),response=await waiting;assert.deepEqual(saved.departmentIds,['technical','marine']);assert.equal(saved.isDepartmentHead,true);assert.equal(saved.version,original.version+1);assert.equal(receipt.writes.length,writes+1);
   assert.deepEqual(findRecord((await response.json()).data,r=>r.id===saved.id&&r.version===saved.version),saved);
   assert.deepEqual(bodyExcept(saved,['departmentIds','isDepartmentHead']),bodyExcept(original,['departmentIds','isDepartmentHead']));assert.deepEqual((await records()).filter(r=>r.id!==saved.id),before.filter(r=>r.id!==saved.id));
   const again=await editPerson(saved.username);await expect(again.getByRole('group',{name:'隸屬部門',exact:true}).locator('input:checked')).toHaveCount(2);await expect(again.getByRole('checkbox',{name:'負責人',exact:true})).toBeChecked();await again.getByRole('button',{name:'取消',exact:true}).click();
   return {recordId:saved.id,version:saved.version,departmentIds:saved.departmentIds,head:saved.isDepartmentHead,peerReadAction:'sync',sameID:true,otherRecordsUnchanged:true};
  });
  await run('PDH-M03-cancel-toggle-zero-writes',async()=>{const before=await ledger(),d=await editPerson('qa-tech');await d.getByRole('checkbox',{name:'負責人',exact:true}).uncheck();await personDepts(d,['海技組']);await d.getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual(await ledger(),before);});
  await run('PDH-M04-uncheck-and-change-departments-save',async()=>{const before=await read('person','qa-tech'),d=await editPerson('qa-tech');await d.getByRole('checkbox',{name:'負責人',exact:true}).uncheck();await personDepts(d,['海技組']);await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);const saved=await read('person','qa-tech');assert.deepEqual(saved.departmentIds,['marine']);assert.equal(saved.isDepartmentHead,false);assert.equal(saved.role,before.role);const reopened=await editPerson('qa-tech');await expect(reopened.getByRole('checkbox',{name:'負責人',exact:true})).not.toBeChecked();await reopened.getByRole('button',{name:'取消',exact:true}).click();return {version:saved.version,departmentIds:saved.departmentIds,head:saved.isDepartmentHead};});
  await run('PDH-M05-add-person-original-form-one-account',async()=>{await management();const before=await records();await page.getByRole('button',{name:'新增人員',exact:true}).click();const d=page.getByRole('dialog');await expect(d.getByRole('button',{name:'確認保存',exact:true})).toBeEnabled();await d.getByLabel('姓名',{exact:true}).fill('UI Created Head');await d.getByLabel('登入名稱（不用Email）',{exact:true}).fill('qa-ui-created');await personDepts(d,['海技組','船工處']);await d.getByRole('checkbox',{name:'負責人',exact:true}).check();assert.deepEqual(await records(),before);await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);const saved=(await records()).find(r=>r.kind==='person'&&r.body.username==='qa-ui-created').body;assert.equal(saved.version,1);assert.equal(saved.isDepartmentHead,true);assert.deepEqual(new Set(saved.departmentIds),new Set(['marine','technical']));assert.equal((await records()).filter(r=>r.kind==='person'&&r.body.username==='qa-ui-created').length,1);return {recordId:saved.id,version:saved.version,departmentIds:saved.departmentIds};});
  await run('PDH-M06-management-filter-and-search-secondary-membership',async()=>{await management();for(const id of ['marine','technical']){await page.getByLabel('人員部門篩選',{exact:true}).selectOption(id);await expect(personRow('qa-ui-created')).toHaveCount(1);await expect(personRow('qa-ui-created')).toContainText('負責人');}await page.getByLabel('人員部門篩選',{exact:true}).selectOption('');await page.getByLabel('姓名／帳號／部門',{exact:true}).fill('船工處');await expect(personRow('qa-ui-created')).toHaveCount(1);await page.getByLabel('姓名／帳號／部門',{exact:true}).fill('');});
  await page.reload();await page.locator('.main-nav').waitFor();
  const roster=()=>records().then(rows=>rows.filter(r=>r.kind==='person').map(r=>r.body));
  const checkedIds=async(g)=>{const people=await roster(),labels=await g.people.locator('label').filter({has:page.locator('input:checked')}).allTextContents();return labels.map(label=>{const person=people.find(p=>label===p.name||label.startsWith(p.name+'（'));assert(person,'Unresolved synthetic option label');return person.id;}).sort();};
  const heads=async(depts)=>(await roster()).filter(p=>p.active&&p.isDepartmentHead===true&&(p.departmentIds??[p.departmentId]).some(id=>depts.includes(id))).map(p=>p.id);
  for(const e of entries)await run('PDH-'+e.id+'-union-retention-cancel-zero-write',async()=>{
   const before=await ledger(),scope=await enter(e),g=await groups(scope,e),button=scope.getByRole('button',{name:'勾選部門負責人',exact:true}),initial=await checkedIds(g);
   await setDepartments(g,[]);await expect(button).toBeDisabled();await expect(scope.locator('.department-head-shortcut')).toContainText('請先選擇部門');assert.deepEqual(await checkedIds(g),initial);
   await setDepartments(g,['航運處']);await expect(button).toBeDisabled();await expect(scope.locator('.department-head-shortcut')).toContainText('沒有符合的部門負責人');assert.deepEqual(await checkedIds(g),initial);
   await setDepartments(g,['海技組']);await expect(button).toBeEnabled();assert.deepEqual(await checkedIds(g),initial);await button.click();let expected=[...new Set([...initial,...await heads(['marine'])])].sort();assert.deepEqual(await checkedIds(g),expected);await button.click();assert.deepEqual(await checkedIds(g),expected);
   await setDepartments(g,['海技組','船工處']);assert.deepEqual(await checkedIds(g),expected);await button.click();expected=[...new Set([...expected,...await heads(['marine','technical'])])].sort();assert.deepEqual(await checkedIds(g),expected);
   await setDepartments(g,['航運處']);assert.deepEqual(await checkedIds(g),expected);await expect(g.people.getByRole('checkbox',{name:/^QA Technical New/})).toHaveAccessibleName(/不在目前涉及部門/);
   await g.people.getByRole('checkbox',{name:/^QA Technical New/}).click();await expect(g.people.getByRole('checkbox',{name:/^QA Technical New/})).toHaveCount(0);
   await cancel(e);assert.deepEqual(await ledger(),before);return {entry:e.id,initialIDs:initial,unionIDs:expected,zeroBusinessWrites:true};
  });
  for(const e of entries.filter(e=>['TMSA-assessment','list-full','list-progress','history-TMSA-create'].includes(e.id)))await run('PDH-'+e.id+'-roster-refresh-same-node-keeps-selection',async()=>{
   const scope=await enter(e),g=await groups(scope,e);await setDepartments(g,['海技組']);await g.people.getByRole('checkbox',{name:'測試同事',exact:true}).check();const selected=await checkedIds(g);
   const field=e.mode==='assessment'?page.getByLabel('Self Assessment English',{exact:true}):e.mode==='progress'?scope.locator('.progress-text textarea'):scope.locator('label.field').filter({hasText:e.mode==='history'?/^計劃/:/^改善計劃/}).locator('textarea');await field.fill('PDH_UNSAVED_TEXT');const node=await field.elementHandle();
   const person=await read('person','qa-peer');await saveRecord('person',{...person,departmentIds:['technical'],departmentId:'technical',isDepartmentHead:true});await expect(g.people.getByRole('checkbox',{name:/^測試同事/})).toHaveAccessibleName(/不在目前涉及部門/,{timeout:30000});assert.deepEqual(await checkedIds(g),selected);assert(await field.evaluate((el,old)=>el===old,node));await expect(field).toHaveValue('PDH_UNSAVED_TEXT');await cancel(e);
   await saveRecord('person',{...await read('person','qa-peer'),departmentId:'marine',departmentIds:['marine'],isDepartmentHead:false});await page.reload();await page.locator('.main-nav').waitFor();return {entry:e.id,sameNode:true,selectedIDs:selected,noAutomaticSelection:true};
  });

  for(const lang of ['zh','en']){
   const p=await open('owner',lang);
   for(const width of [1440,390])for(const e of entries.filter(e=>e.mode==='history'))await run(`PDH-layout-${e.id}-${lang}-${width}`,async()=>{
    await p.setViewportSize({width,height:width===390?844:1000});const scope=await enter(e,p,lang),g=await groups(scope,e,lang);await setDepartments(g,lang==='zh'?['海技組','船工處']:['Marine','Technical']);const button=scope.getByRole('button',{name:lang==='zh'?'勾選部門負責人':'Select department heads',exact:true});await button.click();await button.scrollIntoViewIfNeeded();const path=join(out,`PDH-layout-${e.id}-${lang}-${width}.png`);await p.screenshot({path});receipt.screenshots.push(path);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const rect=await button.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width+1);await cancel(e,p,lang);return {entry:e.id,width,lang,rect};
   });await p.context().close();
  }

  for(const [i,e] of entries.entries())await run('PDH-'+e.id+'-save-native-peer-reopen',async()=>{
   const kind=e.mode==='assessment'?'assessment':'improvement',creating=['create','history'].includes(e.mode),id=e.mode==='assessment'?'assessment-'+(e.route==='TMSA'?'item-a':'item-dry'):'filter-action';
   const before=creating?null:await read(kind,id),allBefore=await records(),scope=await enter(e),g=await groups(scope,e);
   // Explicit ordinary assignee remains even when the shortcut's department differs.
   await setDepartments(g,['海技組']);await g.people.getByRole('checkbox',{name:'測試同事',exact:true}).check();const chosen=await checkedIds(g);
   const depts=i%2?['marine']:['technical'];await setDepartments(g,depts[0]==='marine'?['海技組']:['船工處']);await scope.getByRole('button',{name:'勾選部門負責人',exact:true}).click();const expected=[...new Set([...chosen,...await heads(depts)])].sort();assert.deepEqual(await checkedIds(g),expected);
   let title=before?.title;
   if(e.mode==='create'){title='PDH saved '+e.id;await scope.getByLabel('標題（英文）',{exact:true}).fill(title);await scope.getByLabel('內容（英文）',{exact:true}).fill('Original App person-head assignment '+e.id);if(e.route==='list')await scope.getByRole('group',{name:'相關Item（可跨框架）',exact:true}).getByRole('checkbox',{name:/^TMSA 1\.1\.1/}).check();}
   if(e.mode==='history')title='FROZEN_FINDING_'+e.route+'\n合成資料 FROZEN_FINDING_'+e.route;
   const predicate=r=>before?r.id===before.id&&r.version===before.version+1:r.title?.trim()===title.trim()&&r.version===1;
   const waiting=peerNext(predicate),writesBefore=receipt.writes.length;
   await (e.mode==='assessment'?page.getByRole('button',{name:'保存',exact:true}):scope.getByRole('button',{name:e.mode==='history'?'確認建立及保存':'確認保存',exact:true})).click();
   if(e.mode==='assessment')await expect(page.locator('.assessment-editor')).toHaveCount(0);else if(e.mode==='history'){await expect(page.getByRole('dialog')).toHaveCount(1);await page.getByRole('dialog').getByRole('button',{name:'關閉',exact:true}).click();}else await expect(page.getByRole('dialog')).toHaveCount(0);
   const writes=receipt.writes.slice(writesBefore);assert.equal(writes.length,1);const saved=await read(kind,writes[0].id);assert.deepEqual([...saved.assigneeIds].sort(),expected);assert.deepEqual(saved.departmentIds,depts);assert.equal(saved.version,(before?.version??0)+1);if(before)assert.deepEqual(bodyExcept(saved,['departmentIds','assigneeIds']),bodyExcept(before,['departmentIds','assigneeIds']));
   assert.deepEqual((await records()).filter(r=>r.kind!==kind||r.id!==saved.id),allBefore.filter(r=>r.kind!==kind||r.id!==saved.id));const response=await waiting,other=findRecord((await response.json()).data,predicate);assert.deepEqual(other,saved);
   if(kind==='assessment'){const again=await enter(e),rg=await groups(again,e);assert.deepEqual(await checkedIds(rg),expected);await cancel(e);}else{await nav('list');await page.locator('.improvement-table tbody tr').filter({has:page.getByRole('button',{name:saved.title.trim().replaceAll('\n',' '),exact:true})}).getByRole('button',{name:'完整編輯',exact:true}).click();await expect(page.getByRole('dialog').getByRole('button',{name:'確認保存',exact:true})).toBeEnabled();const re={mode:'full',route:'list'},rg=await groups(page.getByRole('dialog'),re);assert.deepEqual(await checkedIds(rg),expected);await cancel(re);}
   return {entry:e.id,kind,recordId:saved.id,version:saved.version,actualSavedIds:saved.assigneeIds,expectedIds:expected,departmentIds:saved.departmentIds,peerIds:other.assigneeIds,peerReadAction:'sync',operationId:writes[0].operationId,unrelatedRecordsAndFieldsUnchanged:true};
  });
  await peer.context().close();
  const loginPage=async(lang='zh')=>{const c=await browser.newContext({viewport:{width:1440,height:1000}});await c.route('**/*',r=>{if(![ui,qa.url].includes(new URL(r.request().url()).origin)){receipt.blockedExternal++;return r.abort();}return r.continue();});await c.addInitScript(({config,gateToken,lang})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language',lang);sessionStorage.setItem('fpmc-compliance-gate',gateToken);},{config:qa.config,gateToken:ok(await rpc(qa.db,'gate',{passwordHash:qa.db.qaCredentials.gateHash})).gateToken,lang});const p=await c.newPage();p.on('pageerror',e=>receipt.errors.push(e.message));await p.goto(ui);await p.getByLabel('Login department',{exact:true}).waitFor();return p;};
  for(const dept of ['marine','technical'])await run('PDH-L01-login-same-account-'+dept,async()=>{const p=await loginPage();await p.getByLabel('Login department',{exact:true}).selectOption(dept);const select=p.getByLabel('Login person',{exact:true});await expect(select.locator('option[value="qa-tech-new"]')).toHaveCount(1);await select.selectOption('qa-tech-new');const response=p.waitForResponse(r=>r.url().startsWith(qa.url)&&r.request().method()==='POST'&&r.request().postDataJSON().p_action==='login');await p.getByRole('button',{name:'登入',exact:true}).click();await p.locator('.main-nav').waitFor();const result=await (await response).json();assert.equal(result.data.user.id,'qa-tech-new');assert.equal(result.data.user.role,'operator');await expect(p.locator('.identity')).toContainText('QA Technical New');await p.context().close();return {departmentId:dept,personId:'qa-tech-new',role:'operator',nativeLogin:true};});
  for(const lang of ['zh','en']){
   await page.context().close();page=await open('owner',lang);
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===390?844:1000});
    await run(`PDH-layout-management-${lang}-${width}`,async()=>{const d=await editPerson('qa-ui-created',page,lang);await d.locator('.person-department-fields').scrollIntoViewIfNeeded();await snapshot(`PDH-layout-management-${lang}-${width}`);const geometry=await d.evaluate(n=>({width:innerWidth,document:document.documentElement.scrollWidth,dialog:n.getBoundingClientRect().toJSON(),fields:[...n.querySelectorAll('.person-department-fields, .person-department-fields label')].map(x=>({left:x.getBoundingClientRect().left,right:x.getBoundingClientRect().right,scroll:x.scrollWidth,client:x.clientWidth}))}));assert(geometry.document<=width+1);assert(geometry.fields.every(x=>x.left>=0&&x.right<=width+1&&x.scroll<=x.client+1));receipt.observations.push({id:current,...geometry});await d.getByRole('button',{name:lang==='zh'?'取消':'Cancel',exact:true}).click();});
    for(const e of entries.filter(e=>['TMSA-assessment','DRYBMS-assessment','list-full','list-progress'].includes(e.id)))await run(`PDH-layout-${e.id}-${lang}-${width}`,async()=>{const scope=await enter(e,page,lang),g=await groups(scope,e,lang);await setDepartments(g,lang==='zh'?['海技組']:['Marine']);await scope.locator('.department-head-shortcut').scrollIntoViewIfNeeded();await snapshot(`PDH-layout-${e.id}-${lang}-${width}`);const geometry=await scope.locator('.department-head-shortcut').evaluate(n=>({width:innerWidth,document:document.documentElement.scrollWidth,rect:n.getBoundingClientRect().toJSON(),button:n.querySelector('button').getBoundingClientRect().toJSON()}));assert(geometry.document<=width+1);assert(geometry.button.left>=0&&geometry.button.right<=width+1);receipt.observations.push({id:current,...geometry});await cancel(e,page,lang);});
    await run(`PDH-layout-login-${lang}-${width}`,async()=>{const p=await loginPage(lang);await p.setViewportSize({width,height:width===390?844:1000});await p.getByLabel('Login department',{exact:true}).selectOption('technical');await p.getByLabel('Login person',{exact:true}).selectOption('qa-tech-new');const path=join(out,`PDH-layout-login-${lang}-${width}.png`);await p.screenshot({path});receipt.screenshots.push(path);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.context().close();});
   }
  }
  await page.context().close();page=await open('owner');
  const gm=await open('viewer');
  for(const fw of ['TMSA','DRYBMS'])await run('PDH-GM-'+fw+'-readonly-no-head-shortcut',async()=>{await nav(fw,gm);await expect(gm.locator('.DepartmentHeadsButton,.department-head-shortcut,.item-responsibility input,.item-remarks,.linked-improvements')).toHaveCount(0);await expect(gm.locator('.item-actions').getByRole('button',{name:'修改',exact:true})).toHaveCount(0);assert.equal(await gm.locator('.main-nav>button').count(),6);});
  await run('PDH-GM-management-readonly-head-labels',async()=>{await management(gm);await expect(personRow('qa-ui-created',gm)).toContainText('負責人');await expect(gm.getByRole('button',{name:'新增人員',exact:true})).toHaveCount(0);await expect(personRow('qa-ui-created',gm).getByRole('button')).toHaveCount(0);});await gm.context().close();
  const admin=await open('admin');await run('PDH-admin-owner-edit-disabled',async()=>{await management(admin);await expect(personRow('qa-owner',admin).getByRole('button')).toBeDisabled();});await admin.context().close();
  const op=await open('operator');await run('PDH-operator-management-absent',async()=>{await expect(op.locator('.main-nav').getByRole('button',{name:'管理',exact:true})).toHaveCount(0);});await op.context().close();
  await run('PDH-history-snapshots-remain-byte-equal',async()=>{assert.deepEqual((await records()).filter(r=>r.kind==='inspection'),historyBefore);});
  await run('PDH-browser-network-boundary',async()=>{assert.deepEqual(receipt.errors,[]);assert.equal(receipt.blockedExternal,0);});
 }

 }
 receipt.result=receipt.cases.some(c=>c.status==='FAIL')?'FAIL':'PASS';if(receipt.result==='FAIL')process.exitCode=1;
}catch(e){receipt.result='FAIL';receipt.failure={case:current,message:e.message,stack:e.stack};if(page)await page.screenshot({path:join(out,'failure.png'),fullPage:false}).catch(()=>{});process.exitCode=1;}
finally{
 const ports=[qa?.db.port,qa?.server.address()?.port,vite?.httpServer.address()?.port].filter(Boolean);
 await browser?.close();await vite?.close();await qa?.stop();
 receipt.cleanup={ports,portsStopped:await Promise.all(ports.map(closed)),browserClosed:browser?!browser.isConnected():true,filesRetained:true};
 receipt.endingInputs=hashes();receipt.inputsUnchanged=JSON.stringify(receipt.inputs)===JSON.stringify(receipt.endingInputs);
 if(!receipt.inputsUnchanged||receipt.cleanup.portsStopped.some(v=>!v)){receipt.result='FAIL';process.exitCode=1;}
 persist();console.log(JSON.stringify({result:receipt.result,passed:receipt.cases.filter(c=>c.status==='PASS').length,failed:receipt.cases.filter(c=>c.status==='FAIL').length,failure:receipt.failure,receipt:join(out,'receipt.json')}));
}
