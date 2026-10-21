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
const phase='guards';
const out=join(root,'qa-evidence/person-department-heads',`${phase}-${new Date().toISOString().replaceAll(':','-')}`);
mkdirSync(out,{recursive:true});
const inputs=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','tests','scripts','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','supabase'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>existsSync(join(root,f))))].sort();
const hashes=()=>Object.fromEntries(inputs.map(f=>[f,sha256(readFileSync(join(root,f)))]));
const receipt={phase,layer:'真實UI＋測試資料；獨立本機PostgreSQL/HTTP adapter，不是正式Supabase／Pages',baselineHead:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),inputs:hashes(),cases:[],screenshots:[],observations:[],writes:[],errors:[],blockedExternal:0};
const persist=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
let current='setup',qa,vite,browser,page,dropNext=false,holdCommit=null;
const run=async(id,fn)=>{assert(!receipt.cases.some(c=>c.id===id),'Unique caseID');current=id;try{const details=await fn();receipt.cases.push({id,status:'PASS',...details});}catch(e){receipt.cases.push({id,status:'FAIL',message:e.message});if(!baseline)throw e;}finally{persist();}};
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const ok=r=>{assert.equal(r.ok,true,r.code);return r.data;};
const seed=syntheticSeed();
const bi=en=>({en,zh:'合成資料 '+en});
seed.inspections=['TMSA','DRYBMS'].map(fw=>({id:'filter-history-'+fw,version:0,frameworkId:fw,title:'Filter history '+fw,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===fw)),chapters:structuredClone(seed.chapters.filter(c=>c.frameworkId===fw)),items:structuredClone(seed.items.filter(i=>i.frameworkId===fw)),scoringVersion:fw==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},results:seed.items.filter(i=>i.frameworkId===fw).map(i=>({itemId:i.id,response:null,conformity:'none',reviewed:false,observation:bi('FROZEN_OBSERVATION'),recommendation:bi('FROZEN_ADVICE')})),findings:[{id:'finding',itemIds:[fw==='TMSA'?'item-a':'item-dry'],classification:'finding',observation:bi('FROZEN_FINDING_'+fw),recommendation:bi('FROZEN_RECOMMENDATION'),sources:[]}],...(fw==='DRYBMS'?{dryLevels:{'chapter-DRYBMS':[25,50,null,0]}}:{})}));
const entries=[{id:'list-create',mode:'create',route:'list'},{id:'list-full',mode:'full',route:'list'},{id:'list-progress',mode:'progress',route:'list'},...['TMSA','DRYBMS'].flatMap(route=>['assessment','create','full','progress'].map(mode=>({id:route+'-'+mode,route,mode}))),...['TMSA','DRYBMS'].map(route=>({id:'history-'+route+'-create',route,mode:'history'}))];
receipt.entryInventory=entries;
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17,afterCommit:async({action})=>{if(action==='save'&&holdCommit){holdCommit.arrived();await holdCommit.gate;}return action==='save'&&dropNext;}});
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
 await saveRecord('person',{...await read('person','qa-tech-new'),departmentIds:['marine','technical'],isDepartmentHead:true});

 page=await open('owner');
 const selectedEntries=entries.filter(e=>['list-full','list-progress','TMSA-assessment','history-TMSA-create'].includes(e.id));
 for(const e of selectedEntries)await run('PDH-G02-'+e.id+'-lost-lease-freezes-shortcut',async()=>{
  const before=await ledger(),scope=await enter(e),g=await groups(scope,e);await setDepartments(g,['海技組']);const button=scope.getByRole('button',{name:'勾選部門負責人',exact:true});await expect(button).toBeEnabled();const count=await g.people.locator('input:checked').count();
  await qa.db.setup.query("update compliance_private.leases set expires_at=clock_timestamp()-interval '1 second' where client_id=$1",[qa.users.owner.clientId]);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(button).toBeDisabled();assert.equal(await g.people.locator('input:checked').count(),count);assert.deepEqual(await ledger(),before);await cancel(e);return {entry:e.id,leaseExpiredNatively:true,zeroBusinessWrites:true};
 });
 for(const e of selectedEntries)await run('PDH-G03-'+e.id+'-busy-unknownACK-replay',async()=>{
  const scope=await enter(e),g=await groups(scope,e);await setDepartments(g,['海技組']);const button=scope.getByRole('button',{name:'勾選部門負責人',exact:true});await button.click();
  const field=e.mode==='assessment'?page.getByLabel('Self Assessment English',{exact:true}):e.mode==='progress'?scope.locator('.progress-text textarea'):scope.locator('label.field').filter({hasText:e.mode==='history'?/^計劃/:/^改善計劃/}).locator('textarea');await field.fill('PDH_GUARD_'+e.id);const node=await field.elementHandle();
  let release;const gate=new Promise(resolve=>{release=resolve;});let arrived;const committed=new Promise(resolve=>{arrived=resolve;});holdCommit={gate,arrived};const before=await ledger(),writes=receipt.writes.length;
  const submit=()=>e.mode==='assessment'?page.getByRole('button',{name:'保存',exact:true}):scope.getByRole('button',{name:e.mode==='history'?'確認建立及保存':'確認保存',exact:true});
  await submit().click();await committed;await expect(button).toBeDisabled();await expect(field).toHaveValue('PDH_GUARD_'+e.id);assert(await field.evaluate((el,old)=>el===old,node));dropNext=true;holdCommit=null;release();
  await expect((e.mode==='assessment'?page.locator('main'):scope).getByRole('alert')).toContainText('NETWORK_UNKNOWN',{timeout:25000});await expect(button).toBeDisabled();await expect(field).toHaveValue('PDH_GUARD_'+e.id);
  const after=await ledger(),op=receipt.writes[writes].operationId;assert.equal(after.operations,before.operations+1);const saved=await read(receipt.writes[writes].kind,receipt.writes[writes].id);dropNext=false;
  await submit().click();if(e.mode==='assessment')await expect(page.locator('.assessment-editor')).toHaveCount(0);else if(e.mode==='history'){await expect(page.getByRole('dialog')).toHaveCount(1);await page.getByRole('dialog').getByRole('button',{name:'關閉',exact:true}).click();}else await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.deepEqual(await ledger(),after);assert.deepEqual(await read(receipt.writes[writes].kind,saved.id),saved);assert(receipt.writes.slice(writes).every(w=>w.operationId===op));return {entry:e.id,operationId:op,committedVersion:saved.version,busyDisabled:true,unknownDisabled:true,sameNode:true,replayExactlyOnce:true};
 });
 const editPerson=async()=>{await page.locator('.main-nav').getByRole('button',{name:'管理',exact:true}).click();await page.getByRole('row').filter({has:page.getByRole('cell',{name:'qa-tech',exact:true})}).getByRole('button').click();const d=page.getByRole('dialog');await expect(d.getByRole('button',{name:'確認保存',exact:true})).toBeEnabled();return d;};
 await run('PDH-G04-management-lost-lease-freezes-membership-and-head',async()=>{const d=await editPerson(),before=await ledger();await qa.db.setup.query("update compliance_private.leases set expires_at=clock_timestamp()-interval '1 second' where client_id=$1",[qa.users.owner.clientId]);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(d.getByRole('checkbox',{name:'負責人',exact:true})).toBeDisabled();for(const b of await d.getByRole('group',{name:'隸屬部門',exact:true}).getByRole('checkbox').all())await expect(b).toBeDisabled();assert.deepEqual(await ledger(),before);await d.getByRole('button',{name:'取消',exact:true}).click();});
 await run('PDH-G05-management-busy-unknownACK-replay',async()=>{const d=await editPerson();await d.getByRole('group',{name:'隸屬部門',exact:true}).getByRole('checkbox',{name:'海技組',exact:true}).check();await d.getByRole('checkbox',{name:'負責人',exact:true}).check();let release;const gate=new Promise(resolve=>{release=resolve;});let arrived;const committed=new Promise(resolve=>{arrived=resolve;});holdCommit={gate,arrived};const before=await ledger(),writes=receipt.writes.length;await d.getByRole('button',{name:'確認保存',exact:true}).click();await committed;await expect(d.getByRole('checkbox',{name:'負責人',exact:true})).toBeDisabled();for(const b of await d.getByRole('group',{name:'隸屬部門',exact:true}).getByRole('checkbox').all())await expect(b).toBeDisabled();dropNext=true;holdCommit=null;release();await expect(d.getByRole('alert')).toContainText('NETWORK_UNKNOWN',{timeout:25000});await expect(d.getByRole('checkbox',{name:'負責人',exact:true})).toBeDisabled();for(const b of await d.getByRole('group',{name:'隸屬部門',exact:true}).getByRole('checkbox').all())await expect(b).toBeDisabled();const after=await ledger(),op=receipt.writes[writes].operationId;assert.equal(after.operations,before.operations+1);dropNext=false;await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);assert.deepEqual(await ledger(),after);assert(receipt.writes.slice(writes).every(w=>w.operationId===op));return {operationId:op,replayExactlyOnce:true};});
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
