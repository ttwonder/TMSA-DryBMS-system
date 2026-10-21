// Original Reports UI downloads; local synthetic native authority only. No report redesign.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import ExcelJS from 'exceljs';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,sha256} from './native-postgres.mjs';
import {createApiClient} from '../src/api.ts';
const out=join(root,'qa-evidence/person-department-heads',`reports-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','tests','scripts','supabase','public','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>existsSync(join(root,f)));
const hashes=()=>Object.fromEntries([...new Set(paths)].sort().map(f=>[f,sha256(readFileSync(join(root,f)))]));
const receipt={layer:'Original App Reports; actual browser downloads, native PostgreSQL/HTTP, synthetic data; not hosted',inputs:hashes(),cases:[],artifacts:[],screenshots:[],errors:[],blockedExternal:0,phase:'setup'};
const persist=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
const run=async(id,fn)=>{receipt.currentCase=id;try{const details=await fn();receipt.cases.push({id,status:'PASS',...details});}catch(e){receipt.cases.push({id,status:'FAIL',message:e.message});throw e;}finally{persist();}};
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
let qa,vite,browser,page;
try{
 qa=await startQaServer({evidenceDir:out,latestMigration:17});await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/018_person_department_heads.sql'),'utf8'));
 const q=(sql,args)=>qa.db.setup.query(sql,args),read=async(kind,id)=>(await q('select body from compliance_private.records where kind=$1 and id=$2',[kind,id])).rows[0]?.body;
 const clients=Object.fromEntries(Object.entries(qa.users).map(([role,u])=>{const api=createApiClient(qa.config);Object.assign(api,u);return [role,api];}));
 const save=async(kind,row,role='owner',intent=row.version?'update':'create')=>{const api=clients[role],lease=await api.claim(kind,row.id,intent);try{return await api.save(kind,row,row.version,lease,intent,randomUUID());}finally{await api.release(lease);}};
 for(const id of ['qa-peer','qa-admin','qa-operator'])await save('person',{...await read('person',id),departmentIds:['marine','technical'],isDepartmentHead:true});
 let item=await save('improvement',{id:'pdh-report',version:0,title:'PDH reference sample',content:{en:'Saved person references only.',zh:'只核對已保存的人員關聯。'},itemIds:['item-a'],departmentIds:['marine','technical'],assigneeIds:['qa-peer','qa-operator'],source:'non_external',urgency:'medium',status:'open',percent:0,targetDate:'',plan:'Original plan',events:[],sources:[]});
 item=await save('improvement',{...item,status:'in_progress',percent:50,events:[{id:'pdh-report-event',at:'',by:'',content:'Authored by a different multi-department head.',status:'in_progress',percent:50}]},'admin');
 item=await save('improvement',item,'operator','close');
 await save('person',{...await read('person','qa-operator'),active:false});
 await save('assessment',{...await read('assessment','assessment-item-a'),departmentIds:['technical','marine'],assigneeIds:['qa-peer','qa-operator'],remarks:'PDH saved remarks 人員關聯回歸',remarksStatus:'fully_met'});
 const expectedIds=['qa-peer','qa-operator','qa-admin'],names=Object.fromEntries(await Promise.all(expectedIds.map(async id=>[id,(await read('person',id)).name])));
 receipt.fixture={improvementId:item.id,assigneeIds:item.assigneeIds,eventAuthorId:item.events[0].by,closedBy:item.closedBy,names};
 const ledger=async()=>({records:(await q('select kind,id,version,body from compliance_private.records order by kind,id')).rows,exports:(await q('select count(*)::int n from compliance_private.exports')).rows[0].n,audit:(await q("select count(*)::int n from compliance_private.audit where action='export_authorize'")).rows[0].n});
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const uiPort=reservation.address().port;await new Promise(r=>reservation.close(r));
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:uiPort,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${uiPort}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const ctx=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
 await ctx.route('**/*',r=>{if(![ui,qa.url].includes(new URL(r.request().url()).origin)){receipt.blockedExternal++;return r.abort();}return r.continue();});
 await ctx.addInitScript(({config,u})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',u.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:u.user,sessionToken:u.sessionToken}));},{config:qa.config,u:qa.users.owner});
 page=await ctx.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>receipt.errors.push(e.message));page.on('response',async r=>{if(r.url().startsWith(qa.url)&&r.request().method()==='POST'&&r.request().postDataJSON().p_action==='export_authorize'){const body=await r.json();receipt.phase=body.ok?'authorized; browser builder/download pending':'authorization rejected';receipt.authorization={ok:body.ok,code:body.code};persist();}});
 await page.goto(ui);await page.locator('.main-nav').waitFor();await page.locator('.main-nav').getByRole('button',{name:'報告中心',exact:true}).click();
 for(const kind of ['improvements','remarks'])for(const format of ['xlsx','pdf'])await run(`PDH-R-${kind}-${format}-original-download-names`,async()=>{
  await page.getByLabel('報告種類',{exact:true}).selectOption(kind);await page.getByLabel('文件格式',{exact:true}).selectOption(format);
  if(kind==='improvements')await page.getByRole('group',{name:'明選改善項目（搜尋後選取）',exact:true}).getByRole('checkbox',{name:/PDH reference sample/}).check();
  const before=await ledger(),started=Date.now();receipt.phase='download clicked; awaiting authorization';persist();
  const pending=page.waitForEvent('download',{timeout:90000});pending.catch(()=>{});await page.getByRole('button',{name:'生成並下載',exact:true}).click();const download=await pending,path=join(out,`${kind}.${format}`);await download.saveAs(path);assert.equal(await download.failure(),null);await expect(page.getByRole('button',{name:'生成並下載',exact:true})).toBeEnabled();assert.equal(await page.locator('main [role="alert"]').count(),0);
  const after=await ledger();assert.deepEqual(after.records,before.records);assert.equal(after.exports,before.exports+1);assert.equal(after.audit,before.audit+1);
  const snapshot=(await q('select snapshot from compliance_private.exports order by at desc limit 1')).rows[0].snapshot;
  const selected=kind==='improvements'?snapshot.improvements[0]:snapshot.assessments.find(a=>a.itemId==='item-a');assert.deepEqual(selected.assigneeIds,['qa-peer','qa-operator']);
  for(const id of ['qa-peer','qa-operator']){const person=snapshot.people.find(p=>p.id===id);assert.deepEqual(person.departmentIds,['marine','technical']);assert.equal(person.name,names[id]);}assert.equal(snapshot.people.find(p=>p.id==='qa-operator').active,false);
  if(kind==='improvements'){assert.deepEqual(snapshot.improvements.map(i=>i.id),[item.id]);assert.equal(snapshot.improvements[0].events[0].by,'qa-admin');assert.equal(snapshot.improvements[0].closedBy,'qa-operator');assert.equal(snapshot.people.find(p=>p.id==='qa-admin').name,names['qa-admin']);}
  const expectedNames=(kind==='improvements'?expectedIds:['qa-peer','qa-operator']).map(id=>names[id]);
  if(format==='xlsx'){const wb=new ExcelJS.Workbook();await wb.xlsx.load(readFileSync(path));const text=wb.worksheets.map(ws=>ws.getSheetValues().map(row=>JSON.stringify(row)).join('\n')).join('\n');for(const name of expectedNames)assert(text.includes(name),name+' absent from XLSX');}
  const artifact={path,sha256:sha256(readFileSync(path)),bytes:readFileSync(path).length,kind,format,expectedNames,expectedIds:selected.assigneeIds,elapsedMs:Date.now()-started,nativeSnapshotHash:sha256(JSON.stringify(snapshot))};receipt.artifacts.push(artifact);receipt.phase='download saved and native snapshot verified';
  const image=join(out,`${kind}-${format}.png`);await page.screenshot({path:image});receipt.screenshots.push(image);return artifact;
 });
 assert.deepEqual(receipt.errors,[]);assert.equal(receipt.blockedExternal,0);receipt.result='PASS';
}catch(e){receipt.result='FAIL';receipt.failure={case:receipt.currentCase,phase:receipt.phase,message:e.message,stack:e.stack};if(page){const path=join(out,'failure.png');await page.screenshot({path}).catch(()=>{});receipt.screenshots.push(path);}process.exitCode=1;}
finally{const ports=[qa?.db.port,qa?.server.address()?.port,vite?.httpServer?.address()?.port].filter(Boolean);await browser?.close();await vite?.close();await qa?.stop();receipt.cleanup={ports,portsStopped:await Promise.all(ports.map(closed)),filesRetained:true};receipt.endingInputs=hashes();receipt.inputsUnchanged=JSON.stringify(receipt.inputs)===JSON.stringify(receipt.endingInputs);if(!receipt.inputsUnchanged||receipt.cleanup.portsStopped.some(x=>!x)){receipt.result='FAIL';process.exitCode=1;}persist();console.log(JSON.stringify({result:receipt.result,cases:receipt.cases.length,failure:receipt.failure,receipt:join(out,'receipt.json')}));}
