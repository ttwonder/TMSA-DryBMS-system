// Original App, isolated native PostgreSQL and real Chrome. Never production.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
import {createApiClient} from '../src/api.ts';
import {checkpointMilestones} from '../src/improvementMilestones.ts';
import {reportingFixture} from '../tests/fpmc-reporting-fixture.ts';
import {encodeRichText,richTextToPlainText,compactRichText} from '../src/richText.ts';
import ExcelJS from 'exceljs';
const red=process.argv.includes('--red'),out=join(root,'qa-evidence/report-refinement/browser-print',`${red?'red':'green'}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const receipt={status:'RUNNING',mode:red?'RED':'GREEN',layer:'Original App + synthetic owned native PostgreSQL + Chrome; print() stub, actual CDP PDFs; not native dialog or production',cases:[],artifacts:[],downloads:[],fontRequests:[],blocked:[],errors:[]};
const save=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const seed=syntheticSeed();
const long=Array.from({length:90},(_,i)=>`LONG_${String(i).padStart(3,'0')} Full original line 保留完整中文 → CO₂ H₂O`).join('\n');
const rich=encodeRichText({text:'• Bold red 中文 → CO₂\n'+long+'\nEND_OF_LONG <script>window.BAD=1</script>',spans:[{start:2,end:10,bold:true,color:'red'}],lists:[{start:0,end:'• Bold red 中文 → CO₂'.length,kind:'bullet'}]});
seed.inspections=[{...reportingFixture().inspections[0],id:'print-inspection',version:0,findings:reportingFixture().inspections[0].findings.map(f=>({...f,classification:'finding'}))}];
seed.improvements=[{id:'print-action',version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:'',title:'Print long action',source:'non_external',itemIds:['item-a'],content:{en:rich,zh:'完整改善尾端'},departmentIds:['marine'],assigneeIds:[],urgency:'high',status:'open',targetDate:'2026-12-31',plan:'COMPLETE_PLAN\n'+long,events:[],sources:[],percent:0,closedAt:null,closedBy:null}];
let qa,vite,browser,page,before,current='setup';
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const business=async()=>JSON.stringify((await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows);
const counts=async()=>(await qa.db.setup.query("select (select count(*)::int from compliance_private.exports) exports,(select count(*)::int from compliance_private.audit where action='export_authorize') audits")).rows[0];
const run=async(id,fn)=>{current=id;try{await fn();receipt.cases.push({id,status:'PASS'});}catch(e){receipt.cases.push({id,status:'FAIL',message:e.message});throw e;}finally{save();}};
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17});
 for(const f of ['018_person_department_heads.sql','019_safety_meeting_sources.sql','020_improvement_chapter_links.sql','021_additional_improvement_sources.sql','022_improvement_milestones.sql'])await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',f),'utf8'));
 const api=createApiClient(qa.config),user=qa.users.owner;Object.assign(api,{user:user.user,sessionToken:user.sessionToken,clientId:user.clientId});
 for(const a of (await api.read()).assessments){const lease=await api.claim('assessment',a.id,'update');try{await api.save('assessment',{...a,remarks:rich,remarksStatus:'partial_improvable'},a.version,lease,'update',randomUUID());}finally{await api.release(lease);}}
 const action=(await api.read()).improvements[0],at=new Date().toISOString(),lease=await api.claim('improvement',action.id,'update');
 try{const staged=checkpointMilestones(action,{...action,events:[{id:'print-progress',at,by:user.user.id,status:'in_progress',percent:0,content:rich}],milestones:[{id:'print-stage',goal:'COMPLETE_MILESTONE_GOAL',plannedDate:'2026-12-31',achievedDate:''}]},()=>({id:'print-history',at,by:user.user.id}));await api.save('improvement',staged,action.version,lease,'update',randomUUID());}finally{await api.release(lease);}
 before=await business();
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui='http://127.0.0.1:'+vite.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(/\/fonts\/|\.(ttf|woff2?|otf)(\?|$)/i.test(u.href)){receipt.fontRequests.push(u.pathname);return r.abort();}if(![ui,qa.url].includes(u.origin)){receipt.blocked.push(u.origin);return r.abort();}return r.continue();});
 await ctx.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));const open=window.open.bind(window);window.__printCalls=[];window.open=(...args)=>{const w=open(...args);if(w)w.print=()=>{window.__printCalls.push(w);w.dispatchEvent(new Event('afterprint'));};return w;};},{config:qa.config,user});
 page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>receipt.errors.push(e.message));await page.goto(ui);await page.locator('.main-nav').waitFor();
 const nav=name=>page.locator('.main-nav').getByRole('button',{name,exact:true}).click();
 await nav('報告中心');await page.getByLabel('報告種類',{exact:true}).selectOption('remarks');await page.getByLabel('文件格式',{exact:true}).selectOption('pdf');
 const print=async(name,trigger=()=>page.locator('.panel .toolbar .btn.primary').first().click())=>{
  const prior=await counts(),n=await page.evaluate(()=>window.__printCalls.length),start=performance.now();await trigger();
  await expect.poll(()=>page.evaluate(()=>window.__printCalls.length),{timeout:12000,message:'Font-blocked original mounted entry must prepare a complete report and call print'}).toBe(n+1);
  const popup=ctx.pages().at(-1);assert.notEqual(popup,page);await expect(popup.locator('body')).not.toBeEmpty();
  const printElapsedMs=performance.now()-start;
  const html=join(out,name+'.html'),pdf=join(out,name+'.pdf'),text=join(out,name+'-dom.txt'),png=join(out,name+'.png');
  writeFileSync(html,await popup.content());writeFileSync(text,await popup.locator('body').innerText());await popup.screenshot({path:png});
  const session=await ctx.newCDPSession(popup);const result=await session.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});writeFileSync(pdf,Buffer.from(result.data,'base64'));await session.detach();
  const stored=(await qa.db.setup.query('select snapshot,request from compliance_private.exports order by at desc limit 1')).rows[0];const canonical=join(out,name+'-canonical.json');writeFileSync(canonical,JSON.stringify(stored.snapshot,null,2));
  assert.deepEqual(await counts(),{exports:prior.exports+1,audits:prior.audits+1});assert.equal(await business(),before);
  receipt.artifacts.push({name,html,pdf,text,png,canonical,request:stored.request,printElapsedMs,elapsedMs:performance.now()-start,sha256:hash(pdf),htmlSha256:hash(html)});save();return popup;
 };
 await run('mounted-remarks-works-with-all-font-network-blocked',async()=>{const p=await print('remarks-long');await expect(p.locator('body')).toContainText('END_OF_LONG');assert.equal(await p.locator('script').count(),0);assert.equal(await p.evaluate(()=>window.BAD),undefined);await p.close();});
 if(!red){
  for(const kind of ['framework','improvements','inspection','overview'])await run('report-center-'+kind,async()=>{
   await page.getByLabel('報告種類',{exact:true}).selectOption(kind);
   if(kind==='improvements')await page.getByRole('button',{name:'全選符合篩選結果',exact:true}).click();
   if(kind==='inspection')await page.getByLabel('檢查快照',{exact:true}).selectOption('print-inspection');
   const p=await print(kind);if(kind==='improvements'){await expect(p.locator('body')).toContainText('END_OF_LONG');await expect(p.locator('body')).toContainText('COMPLETE_MILESTONE_GOAL');await expect(p.locator('body')).toContainText('階段變更歷史');}await p.close();
  });
  await page.getByLabel('報告種類',{exact:true}).selectOption('remarks');await page.getByLabel('報告框架',{exact:true}).selectOption('DRYBMS');
  await run('DRYBMS-remarks',async()=>{const p=await print('dry-remarks');await expect(p.locator('body')).toContainText('D-1');await p.close();});
  await run('popup-denied-no-authorization-and-retry',async()=>{const prior=await counts();await page.evaluate(()=>{window.__savedOpen=window.open;window.open=()=>null;});await page.locator('.panel .toolbar .btn.primary').first().click();await expect(page.locator('.panel').getByRole('alert')).toContainText('阻擋');assert.deepEqual(await counts(),prior);await page.evaluate(()=>{window.open=window.__savedOpen;});const p=await print('popup-retry');await p.close();});
  await run('empty-chapter-selection-no-authorization',async()=>{await page.getByRole('button',{name:'取消全部章節',exact:true}).click();const prior=await counts();await page.locator('.panel .toolbar .btn.primary').first().click();await expect(page.locator('.panel').getByRole('alert')).toContainText('空選');assert.deepEqual(await counts(),prior);await page.getByRole('button',{name:'全部選中章節',exact:true}).click();});
  for(const framework of ['TMSA','DRYBMS'])await run('framework-page-'+framework,async()=>{await nav(framework);const p=await print('entry-'+framework,()=>page.getByRole('button',{name:'列印／另存PDF',exact:true}).click());await expect(p.locator('body')).toContainText('Guidance');await p.close();
   const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Excel',exact:true}).click();const d=await pending,name='entry-'+framework+'-xlsx',path=join(out,name+'.xlsx');await d.saveAs(path);const stored=(await qa.db.setup.query('select snapshot,request from compliance_private.exports order by at desc limit 1')).rows[0],canonical=join(out,name+'-canonical.json');writeFileSync(canonical,JSON.stringify(stored.snapshot,null,2));
   const book=new ExcelJS.Workbook();await book.xlsx.load(readFileSync(path));assert(book.worksheets.every(sheet=>sheet.getCell('A1').text.includes('章節=')));assert(/^\d{4}-\d{2}-\d{2}-/.test(d.suggestedFilename()));assert.equal(stored.request.format,'xlsx');assert.equal(stored.request.frameworkId,framework);
   receipt.downloads.push({name,path,suggestedName:d.suggestedFilename(),request:stored.request,canonical,sha256:hash(path),canonicalSha256:hash(canonical)});save();
  });
  await run('overview-page',async()=>{await nav('總覽');const p=await print('entry-overview',()=>page.getByRole('button',{name:'列印總覽／另存PDF',exact:true}).click());await p.close();});
  await run('inspection-list-page',async()=>{await nav('歷史檢查記錄');const p=await print('entry-inspection',()=>page.getByRole('button',{name:'列印／另存PDF',exact:true}).click());await p.close();});
  await run('inspection-readonly-modal',async()=>{await page.getByRole('button',{name:'查看',exact:true}).first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();const p=await print('entry-inspection-modal',()=>dialog.getByRole('button',{name:'列印／另存PDF',exact:true}).click());await p.close();await dialog.getByRole('button',{name:'關閉',exact:true}).click();});
  await run('improvement-list-page',async()=>{await nav('待改善項目');await page.locator('.improvement-table input[type="checkbox"]').check();const p=await print('entry-improvements',()=>page.getByRole('button',{name:/^列印已選／另存PDF/}).click());await expect(p.locator('body')).toContainText('END_OF_LONG');await p.close();});
  await nav('報告中心');await page.getByLabel('文件格式',{exact:true}).selectOption('pdf');
  await run('English-print-labels-and-complete-source',async()=>{await page.getByRole('button',{name:'Switch language',exact:true}).click();const p=await print('english-framework');await expect(p.locator('body')).toContainText('Full self-assessment report');await expect(p.locator('body')).toContainText('測試');await p.close();await page.getByRole('button',{name:'Switch language',exact:true}).click();});
  await run('original-App-extreme-rich-XLSX-and-native-inputs',async()=>{
   const extreme='EXTREME_BEGIN\n'+Array.from({length:1000},(_,i)=>`XLSX_${i} Full preserved rich narrative 完整富文字內容 → CO₂`).join('\n')+'\nEXTREME_END';
   const currentAction=(await api.read()).improvements[0],lock=await api.claim('improvement',currentAction.id,'update');
   try{await api.save('improvement',{...currentAction,content:{en:encodeRichText({text:extreme,spans:[{start:0,end:13,bold:true,color:'red'}],lists:[]}),zh:'完整改善尾端'},plan:extreme},currentAction.version,lock,'update',randomUUID());}finally{await api.release(lock);}
   before=await business();await page.reload();await page.locator('.main-nav').waitFor();await nav('待改善項目');await page.locator('.improvement-table input[type="checkbox"]').check();
   const download=async(name,trigger)=>{const pending=page.waitForEvent('download');await trigger();const d=await pending,path=join(out,name+'.xlsx');await d.saveAs(path);const stored=(await qa.db.setup.query('select snapshot,request from compliance_private.exports order by at desc limit 1')).rows[0],canonical=join(out,name+'-canonical.json');writeFileSync(canonical,JSON.stringify(stored.snapshot,null,2));receipt.downloads.push({name,path,suggestedName:d.suggestedFilename(),request:stored.request,canonical,sha256:hash(path),canonicalSha256:hash(canonical)});const book=new ExcelJS.Workbook();await book.xlsx.load(readFileSync(path));return {book,state:stored.snapshot};};
   const {book,state}=await download('extreme-improvements',()=>page.getByRole('button',{name:/^匯出已選Excel/}).click());const sheet=book.worksheets[0],rows=[];sheet.eachRow(r=>{if(r.number>4)rows.push(r);});assert(rows.length>1);const source=state.improvements[0];assert.equal(rows.map(r=>r.getCell(14).text).join(''),richTextToPlainText(compactRichText(source.title+'\n'+source.content.en+'\n'+source.content.zh)));assert.equal(rows.map(r=>r.getCell(15).text).join(''),extreme);assert(rows.every(r=>r.getCell(12).value instanceof Date));assert(rows.slice(1).every(r=>r.getCell(2).font.color.argb==='FFFFFFFF'));assert(rows.every(r=>r.height<=409.5));
   await nav('報告中心');await page.getByLabel('報告種類',{exact:true}).selectOption('remarks');await page.getByLabel('文件格式',{exact:true}).selectOption('xlsx');await download('long-remarks',()=>page.locator('.panel .toolbar .btn.primary').first().click());await page.getByLabel('報告種類',{exact:true}).selectOption('framework');await page.getByLabel('文件格式',{exact:true}).selectOption('pdf');
  });
  await run('native-PDF-permission-denied-no-authorization',async()=>{const blocked=createApiClient(qa.config),who=qa.users.vessel;Object.assign(blocked,{user:who.user,sessionToken:who.sessionToken,clientId:who.clientId});const prior=await counts();await assert.rejects(()=>blocked.authorizeExport({format:'pdf',kind:'framework',frameworkId:'TMSA',ids:['chapter-TMSA'],snapshotToken:'test'}),/FORBIDDEN/);assert.deepEqual(await counts(),prior);});
  await run('pending-user-close-no-print-and-busy-clears',async()=>{
   let release,arrived;const held=new Promise(r=>release=r),ready=new Promise(r=>arrived=r),n=await page.evaluate(()=>window.__printCalls.length),prior=await counts();
   await page.route(qa.url+'/**',async route=>{if(route.request().postDataJSON()?.p_action==='export_authorize'){const response=await route.fetch();arrived();await held;await route.fulfill({response});}else await route.continue();});
   await page.locator('.panel .toolbar .btn.primary').first().click();await ready;const pending=ctx.pages().at(-1);await pending.close();release();await expect(page.locator('.panel').getByRole('alert')).toContainText('取消');await expect(page.locator('.panel .toolbar .btn.primary').first()).toBeEnabled();assert.equal(await page.evaluate(()=>window.__printCalls.length),n);assert.deepEqual(await counts(),{exports:prior.exports+1,audits:prior.audits+1});await page.unroute(qa.url+'/**');
  });
  await run('canonical-changed-no-data-written-after-authorization',async()=>{
   const prior=await counts(),n=await page.evaluate(()=>window.__printCalls.length);
   await page.route(qa.url+'/**',async route=>{if(route.request().postDataJSON()?.p_action==='export_authorize'){const response=await route.fetch(),body=await response.json();const canonical=body.data;assert(canonical?.items);canonical.items=[];await route.fulfill({response,json:body});}else await route.continue();});
   await page.locator('.panel .toolbar .btn.primary').first().click();await expect(page.locator('.panel').getByRole('alert')).toContainText('沒有符合');assert.equal(await page.evaluate(()=>window.__printCalls.length),n);assert.deepEqual(await counts(),{exports:prior.exports+1,audits:prior.audits+1});await page.unroute(qa.url+'/**');
  });
  await run('pending-navigation-closes-reserved-window-and-never-prints',async()=>{
   let release,arrived;const held=new Promise(r=>release=r),ready=new Promise(r=>arrived=r),n=await page.evaluate(()=>window.__printCalls.length),prior=await counts();
   await page.route(qa.url+'/**',async route=>{if(route.request().postDataJSON()?.p_action==='export_authorize'){const response=await route.fetch();arrived();await held;await route.fulfill({response});}else await route.continue();});
   await page.locator('.panel .toolbar .btn.primary').first().click();await ready;const pending=ctx.pages().at(-1);assert.notEqual(pending,page);assert(!(await pending.locator('body').innerText()).includes('Guidance'));await nav('總覽');await expect.poll(()=>pending.isClosed()).toBe(true);release();await expect(page.locator('.toast')).toContainText(/EXPORT_SESSION_CHANGED/);assert.equal(await page.evaluate(()=>window.__printCalls.length),n);assert.deepEqual(await counts(),{exports:prior.exports+1,audits:prior.audits+1});await page.unroute(qa.url+'/**');
  });
  await nav('報告中心');await page.getByLabel('文件格式',{exact:true}).selectOption('pdf');
  await run('pending-signout-never-prints',async()=>{
   let release,arrived;const held=new Promise(r=>release=r),ready=new Promise(r=>arrived=r),n=await page.evaluate(()=>window.__printCalls.length);
   await page.route(qa.url+'/**',async route=>{if(route.request().postDataJSON()?.p_action==='export_authorize'){const response=await route.fetch();arrived();await held;await route.fulfill({response});}else await route.continue();});
   await page.locator('.panel .toolbar .btn.primary').first().click();await ready;const pending=ctx.pages().at(-1);await page.getByRole('button',{name:'切換／退出',exact:true}).click();await expect(page.locator('.main-nav')).toHaveCount(0);release();await expect.poll(()=>pending.isClosed()).toBe(true);await expect(page.locator('.toast')).toContainText(/STALE_SESSION|EXPORT_SESSION_CHANGED/);assert.equal(await page.evaluate(()=>window.__printCalls.length),n);await page.unroute(qa.url+'/**');
  });
  assert.deepEqual(receipt.fontRequests,[]);

 }
 assert.equal(await business(),before);receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.failure={case:current,message:e.stack};process.exitCode=1;await page?.screenshot({path:join(out,'failure.png')}).catch(()=>{});}
finally{const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db.port};await browser?.close();await vite?.close();await qa?.stop();receipt.cleanup={};for(const [k,p] of Object.entries(ports))receipt.cleanup[k]=p?await closed(p):true;if(!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}save();console.log(JSON.stringify({status:receipt.status,cases:receipt.cases,fontRequests:receipt.fontRequests,receipt:join(out,'receipt.json'),cleanup:receipt.cleanup}));}
