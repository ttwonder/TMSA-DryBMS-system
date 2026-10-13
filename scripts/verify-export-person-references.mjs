// Focused native regression for selected-export progress/closure person references.
// Owned loopback PostgreSQL + actual ApiClient/PDF builder; synthetic identities only.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import net from 'node:net';
import {startQaServer} from './qa-server.mjs';
import {root} from './native-postgres.mjs';
import {createApiClient} from '../src/api.ts';
import {peopleLabel} from '../src/domain.ts';
import {buildImprovementsPdf} from '../src/reports.ts';
const phase=process.argv.includes('--red')?'red':'green';
const out=join(root,'qa-evidence','performance-20261013',`export-person-references-${phase}-${process.pid}`);mkdirSync(out,{recursive:true});
const receipt={layer:'Owned native PostgreSQL + actual ApiClient and production PDF builder; synthetic data, not hosted',phase,cases:[],errors:[],productionRequests:0};
const check=id=>receipt.cases.push({id,status:'PASS'});
const closed=p=>new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port:p});socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));});
let qa,vite,browser;
try{
 const baselinePath=process.env.EXPORT_PERSON_BASELINE_SQL;
 receipt.installedPerformanceSqlSha256=createHash('sha256').update(readFileSync(baselinePath??join(root,'supabase/migrations/005_performance.sql'))).digest('hex');receipt.migrationSource=baselinePath?'exact reviewed pre-fix blob':'canonical current migration';
 qa=await startQaServer({evidenceDir:out,performance:!baselinePath});
 if(baselinePath){const sql=readFileSync(baselinePath);assert.equal(createHash('sha256').update(sql).digest('hex'),'93998e125e4383d8fb40976c886d6561a7429193ca6d5cc09418fd8c4b588adc','RED requires the exact reviewed pre-fix migration');await qa.db.setup.query(sql.toString('utf8'));}
 const clients=Object.fromEntries(Object.entries(qa.users).map(([key,u])=>{const api=createApiClient(qa.config);api.user=u.user;api.sessionToken=u.sessionToken;api.clientId=u.clientId;return [key,api];}));
 const save=async(api,record,intent)=>{const lease=await api.claim('improvement',record.id,intent);try{return await api.save('improvement',record,record.version,lease,intent,randomUUID());}finally{await api.release(lease);}};
 const create=id=>({id,version:0,createdAt:'',updatedAt:'',updatedBy:'',source:'non_external',title:'Synthetic person-reference regression',content:{en:'Every author and closer must remain named.',zh:'所有進度作者與結案人員均保留姓名。'},itemIds:['item-a'],departmentIds:['marine'],assigneeIds:['qa-peer'],urgency:'medium',targetDate:'',plan:'Synthetic plan',status:'open',percent:0,events:[],sources:[]});
 let item=await save(clients.owner,create('qa-export-reference'),'create');
 item=await save(clients.admin,{...item,status:'in_progress',percent:50,events:[{id:'qa-event-admin',at:'',by:'',content:'Synthetic independent progress author',status:'in_progress',percent:50}]},'update');
 // Close without adding a progress event, so closedBy is independent from events[].by.
 item=await save(clients.operator,item,'close');
 assert.deepEqual(item.assigneeIds,['qa-peer']);assert.equal(item.events[0].by,'qa-admin');assert.equal(item.events.length,1);assert.equal(item.closedBy,'qa-operator');check('legal-non-assignee-progress-and-close-through-real-save');
 const outside=await save(clients.owner,{...create('qa-unselected-reference'),assigneeIds:['qa-vessel']},'create');
 const business=async()=>JSON.stringify((await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows);
 const before=await business();const exportCount=async()=>Number((await qa.db.setup.query('select count(*) as n from compliance_private.exports')).rows[0].n);const auditCount=async()=>Number((await qa.db.setup.query("select count(*) as n from compliance_private.audit where action='export_authorize'")).rows[0].n);
 const initial=await clients.owner.sync(),full=await clients.owner.read(),exportsBefore=await exportCount(),auditsBefore=await auditCount();
 const request={format:'pdf',kind:'improvements',ids:[item.id],snapshotToken:initial.snapshotToken};const snapshot=await clients.owner.authorizeExport(request);
 assert.deepEqual(snapshot.improvements,[item]);assert(!snapshot.improvements.some(row=>row.id===outside.id));assert.equal(await business(),before);assert.equal(await exportCount()-exportsBefore,1);assert.equal(await auditCount()-auditsBefore,1);assert.deepEqual((await qa.db.setup.query('select snapshot from compliance_private.exports order by at desc limit 1')).rows[0].snapshot,snapshot);check('selected-exact-body-native-stored-snapshot-audit-once-business-unchanged');
 const expectedIds=['qa-owner','qa-peer','qa-admin','qa-operator'];receipt.projection={expectedIds,actualIds:snapshot.people.map(p=>p.id),authors:item.events.map(e=>e.by),closedBy:item.closedBy};
 const fontBytes=new Uint8Array(readFileSync(join(root,'public/fonts/NotoSansTC-Regular.ttf'))),fallbackFontBytes=['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(name=>new Uint8Array(readFileSync(join(root,'public/fonts',name))));
 writeFileSync(join(out,'selected-improvements.pdf'),await buildImprovementsPdf(snapshot,[item.id],'zh',undefined,{fontBytes,fallbackFontBytes}));
 writeFileSync(join(out,'private-expected-authors.json'),JSON.stringify(expectedIds.map(id=>({id,name:full.people.find(p=>p.id===id).name})),null,2));
 for(const id of expectedIds)assert.equal(peopleLabel(snapshot,[id]),peopleLabel(full,[id]),'Selected export must resolve every progress/closure person reference');
 assert.deepEqual(new Set(snapshot.people.map(p=>p.id)),new Set(expectedIds));check('progress-author-closer-exporter-and-assignee-name-equality');check('unselected-related-person-and-unrelated-roster-excluded');
 const deniedExports=await exportCount(),deniedAudit=await auditCount();for(const r of [{...request,ids:[]},{...request,ids:['qa-missing']},{...request,snapshotToken:'stale'}]){await assert.rejects(clients.owner.authorizeExport(r));}assert.equal(await exportCount(),deniedExports);assert.equal(await auditCount(),deniedAudit);assert.equal(await business(),before);check('empty-missing-stale-selection-zero-effects');
 const closer=full.people.find(p=>p.id==='qa-operator'),lease=await clients.owner.claim('person',closer.id);try{await clients.owner.save('person',{...closer,active:false},closer.version,lease,'update');}finally{await clients.owner.release(lease);}
 const fresh=await clients.owner.sync(),historical=await clients.owner.authorizeExport({...request,snapshotToken:fresh.snapshotToken});assert.equal(historical.people.find(p=>p.id==='qa-operator').active,false);assert.equal(peopleLabel(historical,['qa-operator']),peopleLabel(full,['qa-operator']));check('inactive-closer-historical-name-retained-without-reactivation');
 if(process.argv.includes('--ui')){
  const {createServer}=await import('vite'),{chromium,expect}=await import('@playwright/test'),{checkedRpc}=await import('./native-postgres.mjs');
  const gate=await checkedRpc(qa.db,'gate',{passwordHash:qa.db.qaCredentials.gateHash},'','qa-report-gate');
  vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();
  const ui=`http://127.0.0.1:${vite.httpServer.address().port}`,u=qa.users.owner;browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});receipt.blockedExternal=0;receipt.pageErrors=[];
  await context.route('**/*',route=>{if(![ui,qa.url].includes(new URL(route.request().url()).origin)){receipt.blockedExternal++;return route.abort();}return route.continue();});
  await context.addInitScript(({config,u,gateToken})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));sessionStorage.setItem('fpmc-compliance-client-id',u.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:u.user,sessionToken:u.sessionToken}));sessionStorage.setItem('fpmc-compliance-gate',gateToken);},{config:qa.config,u,gateToken:gate.gateToken});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>receipt.pageErrors.push(e.name));await page.goto(ui);await page.locator('.main-nav').waitFor();await page.locator('.main-nav').getByRole('button',{name:'報告中心',exact:true}).click();await page.getByLabel('報告種類').selectOption('improvements');
  const group=page.getByRole('group',{name:'明選改善項目（搜尋後選取）',exact:true});await group.getByRole('checkbox',{name:new RegExp(item.id.slice(0,12))}).check();
  const graphBefore=await business(),auditBefore=await auditCount(),exportsBefore=await exportCount();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'生成並下載',exact:true}).click();const download=await pending;await download.saveAs(join(out,'original-ui.pdf'));assert.equal(await download.failure(),null);await expect(page.getByRole('button',{name:'生成並下載',exact:true})).toBeEnabled();assert.equal(await page.locator('[role="alert"]').count(),0);
  const stored=(await qa.db.setup.query('select snapshot from compliance_private.exports order by at desc limit 1')).rows[0].snapshot;assert.deepEqual(stored.improvements,[item]);assert.deepEqual(new Set(stored.people.map(p=>p.id)),new Set(expectedIds));for(const id of expectedIds)assert.equal(peopleLabel(stored,[id]),peopleLabel(full,[id]));assert.equal(await business(),graphBefore);assert.equal(await auditCount()-auditBefore,1);assert.equal(await exportCount()-exportsBefore,1);assert.equal(receipt.blockedExternal,0);assert.deepEqual(receipt.pageErrors,[]);await page.screenshot({path:join(out,'original-ui.png')});receipt.originalUiDownloadSha256=createHash('sha256').update(readFileSync(join(out,'original-ui.pdf'))).digest('hex');check('original-App-Reports-selected-download-inactive-author-names-exact-audit-once-no-business-write');
 }
 receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.errors.push({name:e?.name??'Error',code:e?.code??null,message:e?.name==='AssertionError'?e.message:'Native probe failed; see private detail'});writeFileSync(join(out,'private-failure.txt'),e?.stack??String(e));process.exitCode=1;}
finally{
 const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};await browser?.close();await vite?.close();await qa?.stop();receipt.cleanup={};for(const [key,port] of Object.entries(ports))receipt.cleanup[key]=port?await closed(port):true;
 receipt.testedInputs=Object.fromEntries(['scripts/verify-export-person-references.mjs','scripts/qa-server.mjs','scripts/native-postgres.mjs','src/api.ts','src/domain.ts','src/reports.ts','src/types.ts',...['001_platform.sql','002_import_timeout.sql','003_read_timeout.sql','004_office_directory.sql','005_performance.sql'].map(f=>'supabase/migrations/'+f)].map(path=>[path,createHash('sha256').update(readFileSync(join(root,path))).digest('hex')]));
 writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,phase,cases:receipt.cases,projection:receipt.projection,errors:receipt.errors,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));
}
