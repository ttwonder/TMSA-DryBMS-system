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
const out=join(root,'qa-evidence/department-assignee-filter',`${phase}-${new Date().toISOString().replaceAll(':','-')}`);
mkdirSync(out,{recursive:true});
const inputs=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','tests','scripts','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','supabase'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>existsSync(join(root,f))))].sort();
const hashes=()=>Object.fromEntries(inputs.map(f=>[f,sha256(readFileSync(join(root,f)))]));
const receipt={phase,layer:'真實UI＋測試資料；獨立本機PostgreSQL/HTTP adapter，不是正式Supabase／Pages',baselineHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),inputs:hashes(),cases:[],screenshots:[],observations:[],writes:[],errors:[],blockedExternal:0};
const persist=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
let current='setup',qa,vite,browser,page;
const run=async(id,fn)=>{assert(!receipt.cases.some(c=>c.id===id),'Unique caseID');current=id;try{const details=await fn();receipt.cases.push({id,status:'PASS',...details});}catch(e){receipt.cases.push({id,status:'FAIL',message:e.message});if(!baseline)throw e;}finally{persist();}};
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const ok=r=>{assert.equal(r.ok,true,r.code);return r.data;};
const seed=syntheticSeed();
const bi=en=>({en,zh:'合成資料 '+en});
seed.inspections=['TMSA','DRYBMS'].map(fw=>({id:'filter-history-'+fw,version:0,frameworkId:fw,title:'Filter history '+fw,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===fw)),chapters:structuredClone(seed.chapters.filter(c=>c.frameworkId===fw)),items:structuredClone(seed.items.filter(i=>i.frameworkId===fw)),scoringVersion:fw==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},results:seed.items.filter(i=>i.frameworkId===fw).map(i=>({itemId:i.id,response:null,conformity:'none',reviewed:false,observation:bi('FROZEN_OBSERVATION'),recommendation:bi('FROZEN_ADVICE')})),findings:[{id:'finding',itemIds:[fw==='TMSA'?'item-a':'item-dry'],classification:'finding',observation:bi('FROZEN_FINDING_'+fw),recommendation:bi('FROZEN_RECOMMENDATION'),sources:[]}],...(fw==='DRYBMS'?{dryLevels:{'chapter-DRYBMS':[25,50,null,0]}}:{})}));
const entries=[{id:'list-create',mode:'create',route:'list'},{id:'list-full',mode:'full',route:'list'},{id:'list-progress',mode:'progress',route:'list'},...['TMSA','DRYBMS'].flatMap(route=>['assessment','create','full','progress'].map(mode=>({id:route+'-'+mode,route,mode}))),...['TMSA','DRYBMS'].map(route=>({id:'history-'+route+'-create',route,mode:'history'}))];
receipt.entryInventory=entries;
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:14});
 const migration15=readdirSync(join(root,'supabase/migrations')).find(f=>f.startsWith('015_'));
 await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',migration15),'utf8'));
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
 for(const e of entries){
  const before=await ledger();const scope=await enter(e);const g=await groups(scope,e);await setDepartments(g,['海技組']);
  await run(e.id+'-single-department',async()=>{await snapshot(e.id+'-marine');await expect(g.people.getByRole('checkbox',{name:'QA Technical New',exact:true})).toHaveCount(0);await expect(g.people.getByRole('checkbox',{name:'測試同事',exact:true})).toHaveCount(1);await expect(g.people.getByRole('checkbox',{name:'QA Inactive New',exact:true})).toHaveCount(0);return {entry:e.id,layer:'mounted original App'};});
  if(!baseline)await run(e.id+'-union-empty-retention-removal',async()=>{
   const existing=!['create','history'].includes(e.mode),selected=existing?[...initialSelected]:[];
   const roster=(await records()).filter(r=>r.kind==='person').map(r=>r.body);
   const assertPicker=async(depts,chosen)=>{
    const expected=roster.filter(p=>chosen.includes(p.id)||p.active&&(!depts.length||depts.includes(p.departmentId)));
    const labels=await g.people.locator('label').allTextContents();
    assert.deepEqual(labels.map(label=>{const person=roster.find(p=>label===p.name||label.startsWith(p.name+'（'));assert(person,`Unknown option ${label}`);return person.id;}).sort(),expected.map(p=>p.id).sort());
    const checked=await g.people.locator('label').filter({has:page.locator('input:checked')}).allTextContents();
    assert.deepEqual(checked.map(label=>roster.find(p=>label===p.name||label.startsWith(p.name+'（')).id).sort(),[...chosen].sort());
    for(const id of chosen){const p=roster.find(p=>p.id===id);if(depts.length&&!depts.includes(p.departmentId))await expect(g.people.getByRole('checkbox',{name:new RegExp('^'+p.name)})).toHaveAccessibleName(/不在目前涉及部門，請核對/);}
   };
   await assertPicker(['marine'],selected);
   await setDepartments(g,['海技組','船工處']);await assertPicker(['marine','technical'],selected);
   await g.people.getByRole('checkbox',{name:'QA Technical New',exact:true}).check();selected.push('qa-tech-new');
   await setDepartments(g,['海技組']);await assertPicker(['marine'],selected);
   await g.people.getByRole('checkbox',{name:/^QA Technical New/}).click();selected.splice(selected.indexOf('qa-tech-new'),1);
   await assertPicker(['marine'],selected);await expect(g.people.getByRole('checkbox',{name:/^QA Technical New/})).toHaveCount(0);
   await setDepartments(g,[]);await assertPicker([],selected);
   await setDepartments(g,['航運處']);await assertPicker(['shipping'],selected);
   if(existing){await g.people.getByRole('checkbox',{name:/^QA Inactive Selected/}).click();selected.splice(selected.indexOf('qa-inactive'),1);await setDepartments(g,[]);await assertPicker([],selected);await expect(g.people.getByRole('checkbox',{name:/^QA Inactive Selected/})).toHaveCount(0);}
   assert.deepEqual(await ledger(),before);return {entry:e.id,noAutomaticSelection:true,noBusinessWrites:true};
  });
  await cancel(e);await run(e.id+'-cancel-zero-write',async()=>{assert.deepEqual(await ledger(),before);return {entry:e.id,recordsAuditOperationsUnchanged:true};});
 }
 if(!baseline){
  // Four original field layouts, both languages and actual open dropdowns.
  for(const lang of ['zh','en']){
   await page.context().close();page=await open('operator',lang);
   for(const width of [1440,390])for(const e of entries.filter(e=>['TMSA-assessment','DRYBMS-assessment','list-full','list-progress','history-TMSA-create'].includes(e.id)))await run(`layout-${e.id}-${lang}-${width}`,async()=>{
    await page.setViewportSize({width,height:width===390?844:1000});const scope=await enter(e,page,lang),g=await groups(scope,e,lang);
    await setDepartments(g,[lang==='zh'?'海技組':'Marine']);
    if(e.mode==='progress')await scope.locator('summary').filter({hasText:lang==='zh'?'涉及部門':'Departments'}).click();
    await g.people.scrollIntoViewIfNeeded();
    await snapshot(`layout-${e.id}-${lang}-${width}`);
    // The original picker has its own scroll height. Inspect the retained tail too.
    await g.people.locator('label').last().scrollIntoViewIfNeeded();
    await snapshot(`layout-${e.id}-${lang}-${width}-retained`);
    const geometry=await g.people.evaluate(n=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,box:{x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height},labels:[...n.querySelectorAll('label')].map(l=>({text:l.textContent,scroll:l.scrollWidth,client:l.clientWidth,whiteSpace:getComputedStyle(l).whiteSpace}))}));
    assert(geometry.documentWidth<=width+1);assert(geometry.box.x>=-1&&geometry.box.x+geometry.box.width<=width+1);assert(geometry.labels.every(l=>l.scroll<=l.client+1),'Option labels wrap without clipping');
    if(!['create','history'].includes(e.mode))await expect(g.people.getByRole('checkbox',{name:/^QA Technical Selected/})).toHaveAccessibleName(lang==='zh'?/不在目前涉及部門，請核對/:/Outside current departments; please check/);
    await cancel(e,page,lang);receipt.observations.push({id:current,...geometry});return {entry:e.id,lang,width};
   });
  }
  await page.context().close();page=await open('operator');
  // Background roster changes through the existing native command; no draft setter.
  for(const e of entries.filter(e=>['TMSA-assessment','list-full','list-progress','history-TMSA-create'].includes(e.id)))await run(e.id+'-roster-refresh-keeps-draft',async()=>{
   const before=await records(),scope=await enter(e),g=await groups(scope,e);await setDepartments(g,['海技組']);await g.people.getByRole('checkbox',{name:'測試同事',exact:true}).check();
   const field=e.mode==='assessment'?page.getByLabel('Self Assessment English',{exact:true}):e.mode==='progress'?scope.locator('.progress-text textarea'):scope.locator('label.field').filter({hasText:e.mode==='history'?/^計劃/:/^改善計劃/}).locator('textarea');
   await field.fill('UNSAVED_ROSTER_DRAFT');const node=await field.elementHandle();const selectedCount=await g.people.locator('input:checked').count();
   const peerOriginal=await read('person','qa-peer');await saveRecord('person',{...peerOriginal,departmentId:'technical'});
   await expect(g.people.getByRole('checkbox',{name:/^測試同事/})).toHaveAccessibleName(/不在目前涉及部門，請核對/,{timeout:30000});
   await expect(field).toHaveValue('UNSAVED_ROSTER_DRAFT');assert(await field.evaluate((el,old)=>el===old,node));assert.equal(await g.people.locator('input:checked').count(),selectedCount);
   assert.deepEqual((await records()).filter(r=>r.kind!=='person'),before.filter(r=>r.kind!=='person'));await cancel(e);
   const moved=await read('person','qa-peer');await saveRecord('person',{...moved,departmentId:'marine'});
   const again=await enter(e),g2=await groups(again,e);await expect(g2.people.getByRole('checkbox',{name:'測試同事',exact:true})).toHaveCount(1,{timeout:30000});await cancel(e);
   return {entry:e.id,draftSameNode:true,selectedCount,refresh:'normal 10-second sync',mutation:'native RPC person update only; draft cancelled'};
  });
  const peer=await open('peer');
  const findRecord=(value,predicate)=>{if(!value||typeof value!=='object')return undefined;if(!Array.isArray(value)&&Array.isArray(value.assigneeIds)&&predicate(value))return value;for(const part of Object.values(value)){const found=findRecord(part,predicate);if(found)return found;}return undefined;};
  const business=record=>Object.fromEntries(Object.entries(record).filter(([k])=>!['version','updatedAt','updatedBy','departmentIds','assigneeIds'].includes(k)));
  for(const e of entries)await run(e.id+'-save-native-peer-reopen',async()=>{
   const kind=e.mode==='assessment'?'assessment':'improvement',creating=['create','history'].includes(e.mode);
   const before=creating?null:await read(kind,e.mode==='assessment'?'assessment-'+(e.route==='TMSA'?'item-a':'item-dry'):'filter-action');
   const ledgerBefore=await records(),scope=await enter(e),g=await groups(scope,e);
   let selected=before?[...before.assigneeIds]:[],title=before?.title;
   if(creating){await setDepartments(g,['船工處']);await g.people.getByRole('checkbox',{name:'QA Technical Selected',exact:true}).check();selected.push('qa-tech');}
   await setDepartments(g,['海技組']);const chosen=!selected.includes('qa-peer');await g.people.getByRole('checkbox',{name:'測試同事',exact:true}).setChecked(chosen);selected=chosen?[...selected,'qa-peer']:selected.filter(id=>id!=='qa-peer');
   if(e.mode==='create'){title='Saved '+e.id;await scope.getByLabel('標題（英文）',{exact:true}).fill(title);await scope.getByLabel('內容（英文）',{exact:true}).fill('Created via original UI '+e.id);if(e.route==='list')await scope.getByRole('group',{name:'相關Item（可跨框架）',exact:true}).getByRole('checkbox',{name:/^TMSA 1\.1\.1/}).check();}
   if(e.mode==='history')title='FROZEN_FINDING_'+e.route+'\n合成資料 FROZEN_FINDING_'+e.route;
   await nav(e.mode==='assessment'?e.route:'list',peer);
   const predicate=r=>before?r.id===before.id&&r.version===before.version+1:r.title?.trim()===title.trim()&&r.version===1;
   const peerResponse=peer.waitForResponse(async r=>{if(!r.url().startsWith(qa.url)||r.request().method()!=='POST')return false;const b=r.request().postDataJSON();if(b.p_action!=='sync')return false;const body=await r.json();return body.ok&&!!findRecord(body.data,predicate);},{timeout:30000});
   // Attach a handler immediately so a timeout is recorded by the main case, not unhandled.
   peerResponse.catch(()=>{});
   const writesBefore=receipt.writes.length;
   await (e.mode==='assessment'?page.getByRole('button',{name:'保存',exact:true}):scope.getByRole('button',{name:e.mode==='history'?'確認建立及保存':'確認保存',exact:true})).click();
   if(e.mode==='assessment')await expect(page.locator('.assessment-editor')).toHaveCount(0);else if(e.mode==='history'){await expect(page.getByRole('dialog')).toHaveCount(1);await page.getByRole('dialog').getByRole('button',{name:'關閉',exact:true}).click();}else await expect(page.getByRole('dialog')).toHaveCount(0);
   const writes=receipt.writes.slice(writesBefore);assert.equal(writes.length,1);const saved=await read(kind,writes[0].id);assert.deepEqual(saved.departmentIds,['marine']);assert.deepEqual(saved.assigneeIds,selected);assert.deepEqual(writes[0].assigneeIds,selected);assert.equal(saved.version,(before?.version??0)+1);
   if(before)assert.deepEqual(business(saved),business(before));
   assert.deepEqual((await records()).filter(r=>r.kind!==kind||r.id!==saved.id),ledgerBefore.filter(r=>r.kind!==kind||r.id!==saved.id));
   const response=await peerResponse,peerRecord=findRecord((await response.json()).data,predicate);assert.deepEqual(peerRecord.assigneeIds,selected);assert.deepEqual(peerRecord.departmentIds,['marine']);
   if(kind==='assessment')await expect(peer.locator('.item-responsibility')).toContainText('QA Technical Selected');
   else await expect(peer.locator('.improvement-table tbody tr').filter({has:peer.getByRole('button',{name:saved.title.trim().replaceAll('\n',' '),exact:true})})).toHaveCount(1);
   if(kind==='assessment'){const reopened=await enter(e),rg=await groups(reopened,e);await expect(rg.people.locator('input:checked')).toHaveCount(selected.length);await cancel(e);}
   else{await nav('list');const row=page.locator('.improvement-table tbody tr').filter({has:page.getByRole('button',{name:saved.title.trim().replaceAll('\n',' '),exact:true})});await row.getByRole('button',{name:'完整編輯',exact:true}).click();const re={mode:'full',route:'list'},rg=await groups(page.getByRole('dialog'),re);await expect(rg.people.locator('input:checked')).toHaveCount(selected.length);await expect(rg.people.getByRole('checkbox',{name:/^QA Technical Selected/})).toBeChecked();await cancel(re);}
   return {entry:e.id,kind,savedId:saved.id,savedVersion:saved.version,actualSavedIds:saved.assigneeIds,expectedIds:selected,peerSavedIds:peerRecord.assigneeIds,peerReadAction:'sync',peerClient:'qa-peer-client',originalOtherFieldsAndRecordsUnchanged:true,recordHash:sha256(JSON.stringify(saved)),operationId:writes[0].operationId};
  });
  await peer.context().close();
  await run('empty-departments-save-retains-all-selected-and-explicit-removal-persists',async()=>{
   const e=entries.find(e=>e.id==='list-full'),before=await read('improvement','filter-action');
   let scope=await enter(e),g=await groups(scope,e);await setDepartments(g,[]);
   await expect(g.people.locator('input:checked')).toHaveCount(before.assigneeIds.length);
   await scope.getByRole('button',{name:'確認保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
   const cleared=await read('improvement','filter-action');assert.deepEqual(cleared.departmentIds,[]);assert.deepEqual(cleared.assigneeIds,before.assigneeIds);assert.deepEqual(business(cleared),business(before));
   scope=await enter(e);g=await groups(scope,e);await setDepartments(g,['海技組']);
   await g.people.getByRole('checkbox',{name:/^QA Technical Selected/}).click();await expect(g.people.getByRole('checkbox',{name:/^QA Technical Selected/})).toHaveCount(0);
   await scope.getByRole('button',{name:'確認保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
   const removed=await read('improvement','filter-action');assert.deepEqual(removed.assigneeIds,before.assigneeIds.filter(id=>id!=='qa-tech'));assert.deepEqual(business(removed),business(before));
   scope=await enter(e);g=await groups(scope,e);await expect(g.people.getByRole('checkbox',{name:/^QA Technical Selected/})).toHaveCount(0);await expect(g.people.locator('input:checked')).toHaveCount(removed.assigneeIds.length);await cancel(e);
   return {clearedDepartmentIds:cleared.departmentIds,clearedSavedIds:cleared.assigneeIds,manuallyRemovedId:'qa-tech',afterRemovalSavedIds:removed.assigneeIds,eventsHash:sha256(JSON.stringify(removed.events))};
  });
  await run('history-and-source-originals-unchanged',async()=>{const after=(await records()).filter(r=>r.kind==='inspection');assert.deepEqual(after,historyBefore);return {beforeHash:sha256(JSON.stringify(historyBefore)),afterHash:sha256(JSON.stringify(after))};});
  const gm=await open('viewer');
  for(const fw of ['TMSA','DRYBMS'])await run('GM-'+fw+'-absence-readonly',async()=>{await nav(fw,gm);await expect(gm.locator('.item-responsibility')).toContainText('QA Technical Selected');await expect(gm.locator('.item-responsibility input,.item-remarks,.linked-improvements')).toHaveCount(0);await expect(gm.locator('.item-actions').getByRole('button',{name:'修改',exact:true})).toHaveCount(0);assert.equal(await gm.locator('.main-nav>button').count(),6);});
  await run('GM-history-no-create-assignee-editor',async()=>{await nav('history',gm);await gm.getByRole('button',{name:'Filter history TMSA',exact:true}).click();await gm.getByRole('button',{name:'缺陷／改善建議',exact:true}).click();await expect(gm.getByRole('dialog')).toContainText('FROZEN_FINDING_TMSA');await expect(gm.locator('.inspection-finding button')).toHaveCount(0);});
  await gm.context().close();
  await run('browser-and-network-boundary',async()=>{assert.deepEqual(receipt.errors,[]);assert.equal(receipt.blockedExternal,0);assert.equal(receipt.writes.filter(w=>w.role==='viewer').length,0);});
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
