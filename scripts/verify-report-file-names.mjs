// Original App + synthetic native PostgreSQL. Never native Save As or production.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import ExcelJS from 'exceljs';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
import {createApiClient} from '../src/api.ts';
import {reportDescriptor} from '../src/reportNaming.ts';
const out=join(root,'qa-evidence/report-file-names','browser-'+new Date().toISOString().replaceAll(':','-'));mkdirSync(out,{recursive:true});
const digest=v=>createHash('sha256').update(v).digest('hex');
const files=['src/reportNaming.ts','src/useReportPrint.ts','src/Improvements.tsx','src/Reports.tsx','src/reports.ts','src/styles.css','src/types.ts','scripts/verify-report-file-names.mjs','tests/report-file-names.test.ts'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,digest(readFileSync(join(root,p)))]));
const receipt={status:'RUNNING',baseHEAD:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),layer:'Original App/CSS + synthetic native PostgreSQL migration 23; real downloads; stubbed print() + actual Chromium PDF; NOT native Save As or hosted acceptance',inputsBefore:hashes(),artifacts:[],cases:[],actions:[],blocked:[],errors:[]};
const persist=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
let qa,vite,browser,page,ctx,current='setup';
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const seed=syntheticSeed(),base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
seed.inspections=[0,1].map(i=>({...base('name-inspection-'+i),frameworkId:'TMSA',title:'FULL_INSPECTION_'+i,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:seed.frameworks[0],chapters:[seed.chapters[0]],items:seed.items.filter(x=>x.frameworkId==='TMSA'),scoringVersion:'synthetic-v1'},results:[],findings:[{id:'name-finding-'+i,itemIds:['item-a'],classification:'finding',observation:{en:'Synthetic finding',zh:'合成發現'},recommendation:{en:'Advice',zh:'建議'},sources:[]}]}));
seed.improvements=[0,1,2,3].map(i=>({...base('name-action-'+i),title:'NAME_ACTION_'+i,content:{en:'FULL_CONTENT_'+i,zh:'完整內容 '+i},source:i===0||i===3?'non_external':'external',...(i>0&&i<3?{inspectionId:'name-inspection-'+(i-1),findingId:'name-finding-'+(i-1),sourceKey:`name-inspection-${i-1}:name-finding-${i-1}`} : {}),itemIds:['item-a'],departmentIds:[i===3?'technical':'marine'],assigneeIds:['qa-owner'],urgency:'high',status:'open',percent:0,targetDate:'2026-12-31',plan:'Complete plan',events:[],closedAt:null,closedBy:null,sources:[]}));
receipt.fixtureSha256=digest(JSON.stringify(seed));
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:23,afterCommit:({action})=>{receipt.actions.push(action);return false;}});
 const api=createApiClient(qa.config),user=qa.users.owner;Object.assign(api,{user:user.user,sessionToken:user.sessionToken,clientId:user.clientId});
 const initial=await api.read();
 for(const row of initial.assessments){const lease=await api.claim('assessment',row.id,'update');try{await api.save('assessment',{...row,remarks:'CANONICAL_REMARK_'+row.itemId,remarksStatus:'partial_improvable'},row.version,lease,'update',randomUUID());}finally{await api.release(lease);}}
 const settings=initial.settings,lease=await api.claim('settings',settings.id,'update');try{await api.save('settings',{...settings,departments:settings.departments.map(d=>d.id==='marine'?{...d,name:{zh:'管理組',en:'Management'}}:{...d,name:{zh:'QA '+d.name.zh,en:'QA '+d.name.en}})},settings.version,lease,'update',randomUUID());}finally{await api.release(lease);}
 const business=async()=>(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows;
 const audit=async()=>(await qa.db.setup.query("select * from compliance_private.audit where action <> 'export_authorize' order by id")).rows;
 const before=await business(),auditBefore=await audit();receipt.businessBefore=digest(JSON.stringify(before));receipt.auditBefore=digest(JSON.stringify(auditBefore));receipt.actions=[];
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});});
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui='http://127.0.0.1:'+port;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await ctx.route('**/*',r=>{const o=new URL(r.request().url()).origin;if(![ui,qa.url].includes(o)){receipt.blocked.push(o);return r.abort();}if(o===qa.url&&r.request().method()==='POST'){const a=r.request().postDataJSON()?.p_action;if(!['bootstrap_status','current_user','read','sync','sync_check','inspection_detail','export_authorize'].includes(a)){receipt.blocked.push('mutation:'+a);return r.abort();}}return r.continue();});
 await ctx.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));const open=window.open.bind(window);window.__printCalls=[];window.open=(...args)=>{const w=open(...args);if(w)w.print=()=>{window.__printCalls.push(w);w.dispatchEvent(new Event('afterprint'));};return w;};},{config:qa.config,user});
 page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>receipt.errors.push(e.message));await page.goto(ui);await page.locator('.main-nav').waitFor();
 const nav=async name=>{for(const b of await page.locator('.toast button').all())await b.click();await page.locator('.main-nav').getByRole('button',{name,exact:true}).click();};
 const pick=async(label,names)=>{const p=page.locator('.improvement-multifilter').filter({has:page.locator(`summary[aria-label="${label}"]`)});await p.locator('summary').click();for(const name of names)await p.getByRole('checkbox',{name,exact:typeof name==='string'}).check();await p.locator('summary').click();};
 const counts=async()=>Number((await qa.db.setup.query('select count(*) n from compliance_private.exports')).rows[0].n);
 const output=async(id,format,stem,expectedIds,kind,trigger,surface='report-center')=>{
  current=id;const folder=join(out,id);mkdirSync(folder);const prior=await counts();let suggestedName,popup,path,body='';
  if(format==='xlsx'){const pending=page.waitForEvent('download');await trigger();const d=await pending;suggestedName=d.suggestedFilename();path=join(folder,suggestedName);await d.saveAs(path);assert.equal(await d.failure(),null);const book=new ExcelJS.Workbook();await book.xlsx.readFile(path);book.worksheets.forEach(s=>s.eachRow(r=>r.eachCell(c=>body+=c.text+'\n')));}
  else{const n=await page.evaluate(()=>window.__printCalls.length);await trigger();await expect.poll(()=>page.evaluate(()=>window.__printCalls.length),{timeout:20000}).toBe(n+1);popup=ctx.pages().at(-1);suggestedName=await popup.title();body=await popup.locator('body').innerText();path=join(folder,suggestedName+'.pdf');await popup.pdf({path,printBackground:true,preferCSSPageSize:true});writeFileSync(join(folder,'report.html'),await popup.content());await popup.close();}
  assert.equal(await counts(),prior+1);const stored=(await qa.db.setup.query('select request,snapshot from compliance_private.exports order by at desc limit 1')).rows[0];
  const expected=stem+' '+stored.snapshot.serverTime.slice(0,10)+(format==='xlsx'?'.xlsx':'');assert.equal(suggestedName,expected);assert.equal(stored.request.kind,kind);assert.equal(stored.request.format,format);assert.deepEqual([...stored.request.ids].sort(),[...expectedIds].sort());assert(!JSON.stringify(stored.request).includes('improvement-list'));
  const descriptor=reportDescriptor(stored.snapshot,stored.request,'zh',surface);assert.equal(suggestedName,format==='xlsx'?descriptor.filename:descriptor.name);assert(body.includes(descriptor.scope),'full canonical scope remains inside artifact');
  if(kind==='improvements'){assert.deepEqual(stored.snapshot.improvements.map(r=>r.id).sort(),[...expectedIds].sort());for(const r of seed.improvements)assert.equal(body.includes(r.title),expectedIds.includes(r.id));}
  if(stored.request.filters?.reportVariant==='remarks'){assert(body.includes('CANONICAL_REMARK_item-a'));assert(!body.includes('CANONICAL_REMARK_item-dry'));}
  const canonical=join(folder,'canonical.json');writeFileSync(canonical,JSON.stringify(stored,null,2));writeFileSync(join(folder,'text.txt'),body);
  receipt.artifacts.push({id,format,path,suggestedName,sha256:digest(readFileSync(path)),canonical,canonicalSha256:digest(readFileSync(canonical)),scope:descriptor.scope,request:stored.request});receipt.cases.push({id,status:'PASS'});persist();
 };
 const reportClick=()=>page.locator('.panel .toolbar .btn.primary').first().click();
 await nav('報告中心');
 await page.getByRole('group',{name:'部門篩選（多選）',exact:true}).getByRole('checkbox',{name:'管理組',exact:true}).check();
 for(const kind of ['framework','remarks']){await page.getByLabel('報告種類',{exact:true}).selectOption(kind);for(const format of ['xlsx','pdf']){await page.getByLabel('文件格式',{exact:true}).selectOption(format);await output('center-'+kind+'-'+format,format,'管理組 TMSA-'+(kind==='remarks'?'條目備註':'框架完整自評'),['chapter-TMSA'],'framework',reportClick);}}
 await page.getByLabel('報告種類',{exact:true}).selectOption('improvements');
 await page.getByRole('group',{name:'明選改善項目（搜尋後選取）',exact:true}).getByRole('checkbox',{name:/NAME_ACTION_0/}).check();
 for(const format of ['xlsx','pdf']){await page.getByLabel('文件格式',{exact:true}).selectOption(format);await output('center-improvements-'+format,format,'全部-全部 全部-明選改善項目',['name-action-0'],'improvements',reportClick);}
 await page.getByLabel('報告種類',{exact:true}).selectOption('inspection');await page.getByLabel('檢查快照',{exact:true}).selectOption('name-inspection-0');await output('center-inspection-pdf','pdf','全部 TMSA-凍結歷史檢查',['name-inspection-0'],'inspection',reportClick);
 await page.getByLabel('報告種類',{exact:true}).selectOption('overview');await output('center-overview-pdf','pdf','全部 TMSA-管控總覽',['chapter-TMSA'],'overview',reportClick);
 await nav('待改善項目');
 await pick('來源（多選）',[/FULL_INSPECTION_0/,/FULL_INSPECTION_1/,'內部管理需求']);
 const more=page.locator('.secondary-filters');if(await more.getAttribute('open')===null)await more.locator(':scope>summary').click();
 await pick('部門（多選）',['管理組']);await pick('人員（多選）',['測試 Owner']);await page.getByRole('button',{name:'全部選中',exact:true}).click();
 for(const format of ['xlsx','pdf'])await output('list-multi-'+format,format,'管理組-測試 Owner 外部檢查+內部管理需求待改善項目',['name-action-0','name-action-1','name-action-2'],'improvements',()=>page.getByRole('button',{name:format==='xlsx'?/^匯出已選Excel/:/^列印已選／另存PDF/}).click(),'improvement-list');
 await page.getByRole('button',{name:'清除篩選及選取',exact:true}).click();await page.getByRole('checkbox',{name:'選取 NAME_ACTION_0',exact:true}).check();
 for(const format of ['xlsx','pdf'])await output('list-all-'+format,format,'全部-全部 全部待改善項目',['name-action-0'],'improvements',()=>page.getByRole('button',{name:format==='xlsx'?/^匯出已選Excel/:/^列印已選／另存PDF/}).click(),'improvement-list');
 assert.deepEqual(await business(),before);assert.deepEqual(await audit(),auditBefore);receipt.businessAfter=digest(JSON.stringify(await business()));receipt.auditAfter=digest(JSON.stringify(await audit()));assert.deepEqual(receipt.blocked,[]);assert.deepEqual(receipt.errors,[]);assert(!receipt.actions.some(a=>['save','delete','import_seed'].includes(a)));assert.equal(receipt.artifacts.length,12);receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.failure={case:current,message:e.stack};process.exitCode=1;await page?.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server.address()?.port,pg:qa?.db.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name+'PortClosed']=port?await closed(port):true;if(qa)receipt.cleanup.postmasterPidAbsent=!existsSync(join(qa.db.dataDir,'postmaster.pid'));receipt.inputsAfter=hashes();if(JSON.stringify(receipt.inputsBefore)!==JSON.stringify(receipt.inputsAfter)||!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}receipt.counts={total:receipt.artifacts.length,xlsx:receipt.artifacts.filter(a=>a.format==='xlsx').length,pdf:receipt.artifacts.filter(a=>a.format==='pdf').length};persist();console.log(JSON.stringify({status:receipt.status,counts:receipt.counts,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));}
