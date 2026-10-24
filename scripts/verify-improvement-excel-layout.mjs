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
import {selectedImprovementRows} from '../src/reports.ts';
import {compactRichText,richTextToPlainText,encodeRichText} from '../src/richText.ts';
import {checkpointMilestones} from '../src/improvementMilestones.ts';
import {reportDescriptor} from '../src/reportNaming.ts';
import {improvementSources} from '../src/improvementTracking.ts';
const out=join(root,'qa-evidence/improvement-excel-layout','browser-'+new Date().toISOString().replaceAll(':','-'));mkdirSync(out,{recursive:true});
const digest=v=>createHash('sha256').update(v).digest('hex');
const files=['src/reportNaming.ts','src/useReportPrint.ts','src/Improvements.tsx','src/Reports.tsx','src/reports.ts','src/styles.css','src/types.ts','scripts/verify-improvement-excel-layout.mjs','tests/report-file-names.test.ts'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,digest(readFileSync(join(root,p)))]));
const receipt={status:'RUNNING',baseHEAD:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),layer:'Original App/CSS + synthetic native PostgreSQL migration 23; real downloads; stubbed print() + actual Chromium PDF; NOT native Save As or hosted acceptance',inputsBefore:hashes(),artifacts:[],cases:[],actions:[],blocked:[],errors:[]};
const persist=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
let qa,vite,browser,page,ctx,current='setup',lang='zh';
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const seed=syntheticSeed(),base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
seed.inspections=[0,1].map(i=>({...base('name-inspection-'+i),frameworkId:'TMSA',title:'FULL_INSPECTION_'+i,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:seed.frameworks[0],chapters:[seed.chapters[0]],items:seed.items.filter(x=>x.frameworkId==='TMSA'),scoringVersion:'synthetic-v1'},results:[],findings:[{id:'name-finding-'+i,itemIds:['item-a'],classification:'finding',observation:{en:'Synthetic finding',zh:'合成發現'},recommendation:{en:'Advice',zh:'建議'},sources:[]}]}));
seed.improvements=Array.from({length:8},(_,i)=>({...base('layout-action-'+i),title:'LAYOUT_ACTION_'+i,content:{en:i===5?'LONG_BEGIN '+('Complete English paragraph. '.repeat(1600))+' LONG_END':'Full bilingual content '+i+'\n'+('Complete procedure and evidence. '.repeat(i===0?12:2)),zh:'完整雙語內容 '+i+'\n'+('完整程序與佐證。'.repeat(i===0?12:2))},source:i===1||i===2?'external':'non_external',...(i===1||i===2?{inspectionId:'name-inspection-'+(i-1),findingId:'name-finding-'+(i-1),sourceKey:`name-inspection-${i-1}:name-finding-${i-1}`} : {}),itemIds:[['item-a','item-b','item-gap'][i%3]],departmentIds:[i===6?'technical':'marine'],assigneeIds:['qa-owner'],urgency:i===0?'urgent':'high',status:'open',percent:0,proposedDate:'2026-01-0'+(i+1),targetDate:'2026-12-'+(20+i),plan:'Complete plan '+i+' 計劃完整末端',events:[{id:'layout-event-'+i,at:'2026-02-01T00:00:00Z',by:'qa-owner',status:'open',percent:0,content:'Complete progress event '+i+' 完整進度'}],closedAt:null,closedBy:null,sources:[]}));
const longSource={zh:'極長來源名稱'.repeat(24)+'末端',en:'LONG_SOURCE_LABEL_'.repeat(8)+'END'},longPerson=('LONG_PERSON_'+('驗證人名'.repeat(30))).slice(0,96)+'_END';
seed.improvements[7].source='management_review';seed.improvements[7].assigneeIds=['qa-operator'];
seed.inspections[0].findings[0].itemIds=['item-b'];seed.inspections[1].findings[0].itemIds=['item-gap'];
seed.improvements[0].plan=encodeRichText({text:seed.improvements[0].plan,spans:[{start:0,end:8,bold:true,color:'red'}],lists:[]});
seed.improvements[0]=checkpointMilestones(seed.improvements[0],{...seed.improvements[0],milestones:[{id:'layout-stage',goal:'Full stage goal 完整階段目標',plannedDate:'2026-11-01',achievedDate:''}]},()=>({id:'layout-stage-event',at:'2026-02-01T00:00:00Z',by:'qa-owner'}));
const desired=structuredClone(seed.improvements);seed.improvements.pop();for(const row of seed.improvements){delete row.proposedDate;delete row.milestones;delete row.milestoneEvents;}
receipt.fixtureSha256=digest(JSON.stringify(desired));
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:23,afterCommit:({action})=>{receipt.actions.push(action);return false;}});
 const api=createApiClient(qa.config),user=qa.users.owner;Object.assign(api,{user:user.user,sessionToken:user.sessionToken,clientId:user.clientId});
 const initial=await api.read();
 for(const row of initial.improvements){const expected=desired.find(r=>r.id===row.id),lease=await api.claim('improvement',row.id,'update');try{await api.save('improvement',{...row,proposedDate:expected.proposedDate,...(expected.milestones?{milestones:expected.milestones,milestoneEvents:expected.milestoneEvents}:{})},row.version,lease,'update',randomUUID());}finally{await api.release(lease);}}
 const extra=desired.at(-1),extraLease=await api.claim('improvement',extra.id,'create');try{await api.save('improvement',extra,0,extraLease,'create',randomUUID());}finally{await api.release(extraLease);}
 for(const row of initial.assessments){const lease=await api.claim('assessment',row.id,'update');try{await api.save('assessment',{...row,remarks:'CANONICAL_REMARK_'+row.itemId,remarksStatus:'partial_improvable'},row.version,lease,'update',randomUUID());}finally{await api.release(lease);}}
 const settings=initial.settings,lease=await api.claim('settings',settings.id,'update');try{await api.save('settings',{...settings,improvementSources:improvementSources(settings).map(s=>s.id==='management_review'?{...s,name:longSource}:s),departments:settings.departments.map(d=>d.id==='marine'?{...d,name:{zh:'管理組',en:'Management'}}:{...d,name:{zh:'QA '+d.name.zh,en:'QA '+d.name.en}})},settings.version,lease,'update',randomUUID());}finally{await api.release(lease);}
 const person=initial.people.find(p=>p.id==='qa-operator');assert(person);const personLease=await api.claim('person',person.id,'update');try{await api.save('person',{...person,name:longPerson},person.version,personLease,'update',randomUUID());}finally{await api.release(personLease);}
 const business=async()=>(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows;
 const audit=async()=>(await qa.db.setup.query("select * from compliance_private.audit where action <> 'export_authorize' order by id")).rows;
 const before=await business(),auditBefore=await audit();receipt.businessBefore=digest(JSON.stringify(before));receipt.auditBefore=digest(JSON.stringify(auditBefore));receipt.actions=[];
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});});
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui='http://127.0.0.1:'+port;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await ctx.route('**/*',r=>{const o=new URL(r.request().url()).origin;if(![ui,qa.url].includes(o)){receipt.blocked.push(o);return r.abort();}if(o===qa.url&&r.request().method()==='POST'){const a=r.request().postDataJSON()?.p_action;if(!['bootstrap_status','current_user','read','sync','sync_check','inspection_detail','export_authorize'].includes(a)){receipt.blocked.push('mutation:'+a);return r.abort();}}return r.continue();});
 await ctx.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));if(!localStorage.getItem('fpmc-compliance-language'))localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));const open=window.open.bind(window);window.__printCalls=[];window.open=(...args)=>{const w=open(...args);if(w)w.print=()=>{window.__printCalls.push(w);w.dispatchEvent(new Event('afterprint'));};return w;};},{config:qa.config,user});
 page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>receipt.errors.push(e.message));await page.goto(ui);await page.locator('.main-nav').waitFor();
 const nav=async name=>{for(const b of await page.locator('.toast button').all())await b.click();await page.locator('.main-nav').getByRole('button',{name,exact:true}).click();};
 const pick=async(label,names)=>{const p=page.locator('.improvement-multifilter').filter({has:page.locator(`summary[aria-label="${label}"]`)});await p.locator('summary').click();for(const name of names)await p.getByRole('checkbox',{name,exact:typeof name==='string'}).check();await p.locator('summary').click();};
 const counts=async()=>Number((await qa.db.setup.query('select count(*) n from compliance_private.exports')).rows[0].n);
 const output=async(id,format,stem,expectedIds,kind,trigger,surface='report-center')=>{
  current=id;const folder=join(out,id);mkdirSync(folder);const prior=await counts();let suggestedName,popup,path,body='';
  if(format==='xlsx'){const pending=page.waitForEvent('download');await trigger();const d=await pending;suggestedName=d.suggestedFilename();path=join(folder,suggestedName);await d.saveAs(path);assert.equal(await d.failure(),null);const book=new ExcelJS.Workbook();await book.xlsx.readFile(path);book.worksheets.forEach(s=>s.eachRow(r=>r.eachCell(c=>body+=c.text+'\n')));}
  else{const n=await page.evaluate(()=>window.__printCalls.length);await trigger();await expect.poll(()=>page.evaluate(()=>window.__printCalls.length),{timeout:20000}).toBe(n+1);popup=ctx.pages().at(-1);suggestedName=await popup.title();body=await popup.locator('body').innerText();path=join(folder,suggestedName+'.pdf');await popup.pdf({path,printBackground:true,preferCSSPageSize:true});writeFileSync(join(folder,'report.html'),await popup.content());await popup.close();}
  assert.equal(await counts(),prior+1);const stored=(await qa.db.setup.query('select request,snapshot from compliance_private.exports order by at desc limit 1')).rows[0];
  if(stem){const expected=stem+' '+stored.snapshot.serverTime.slice(0,10)+(format==='xlsx'?'.xlsx':'');assert.equal(suggestedName,expected);}assert.equal(stored.request.kind,kind);assert.equal(stored.request.format,format);assert.deepEqual([...stored.request.ids].sort(),[...expectedIds].sort());assert(!JSON.stringify(stored.request).includes('improvement-list'));
  const descriptor=reportDescriptor(stored.snapshot,stored.request,lang,surface);assert.equal(suggestedName,format==='xlsx'?descriptor.filename:descriptor.name);assert(body.includes(descriptor.scope),'full canonical scope remains inside artifact');
  if(kind==='improvements'&&format==='xlsx'){const b=new ExcelJS.Workbook();await b.xlsx.readFile(path);const main=b.worksheets[0];assert.equal(main.autoFilter,`A2:S${main.rowCount}`);assert.equal(main.getCell('C1').text,descriptor.scope);const ordered=selectedImprovementRows(stored.snapshot,expectedIds);for(const [i,source] of ordered.entries()){const parts=[];main.eachRow(r=>{if(r.number>2&&r.getCell(1).value===i+1)parts.push(r);});parts.sort((a,b)=>a.getCell(11).value-b.getCell(11).value);assert.equal(parts.map(r=>r.getCell(6).text).join(''),richTextToPlainText(compactRichText([source.title,source.content.en,source.content.zh].join('\n'))));assert.equal(parts.map(r=>r.getCell(7).text).join(''),richTextToPlainText(compactRichText(source.plan)));assert.equal(parts[0].getCell(3).value.toISOString().slice(0,10),source.proposedDate);assert.equal(parts[0].getCell(15).numFmt,'yyyy-mm-dd');assert(parts.every(r=>r.getCell(19).text.includes(['1.1.1','1.1.2','1.1.3'][Number(source.id.split('-').at(-1))%3])));if(expectedIds.length===5)assert.equal(parts.length,1);else if(source.id==='layout-action-5')assert(parts.length>1);if(source.id==='layout-action-7'){for(const [column,value] of [[4,longSource[lang]],[9,longPerson]]){const chunks=parts.map(r=>r.getCell(column).text);if(chunks[0]===value)assert(chunks.every(s=>s===value));else assert.equal(chunks.join(''),value);}}}assert.equal(b.worksheets[1].getCell('A4').text,lang==='zh'?'文件序號':'Document no.');if(expectedIds.length===5){assert.equal(b.worksheets.length,4);assert.equal(b.worksheets[2].getCell('D5').text,'Full stage goal 完整階段目標');}receipt.schemas??={};receipt.schemas[id]={headers:main.getRow(2).values,widths:main.columns.map(c=>c.width),rows:main.rowCount};}
  if(kind==='improvements'){assert.deepEqual(stored.snapshot.improvements.map(r=>r.id).sort(),[...expectedIds].sort());for(const r of desired)assert.equal(body.includes(r.title),expectedIds.includes(r.id));}
  if(stored.request.filters?.reportVariant==='remarks'){assert(body.includes('CANONICAL_REMARK_item-a'));assert(!body.includes('CANONICAL_REMARK_item-dry'));}
  const canonical=join(folder,'canonical.json');writeFileSync(canonical,JSON.stringify(stored,null,2));writeFileSync(join(folder,'text.txt'),body);
  receipt.artifacts.push({id,format,path,suggestedName,sha256:digest(readFileSync(path)),canonical,canonicalSha256:digest(readFileSync(canonical)),scope:descriptor.scope,request:stored.request});receipt.cases.push({id,status:'PASS'});persist();
 };
 const reportClick=()=>page.locator('.panel .toolbar .btn.primary').first().click();
 await nav('報告中心');
 await page.getByRole('group',{name:'部門篩選（多選）',exact:true}).getByRole('checkbox',{name:'管理組',exact:true}).check();
 for(const kind of ['framework','remarks']){await page.getByLabel('報告種類',{exact:true}).selectOption(kind);await page.getByLabel('文件格式',{exact:true}).selectOption('xlsx');await output('control-'+kind,'xlsx','管理組 TMSA-'+(kind==='remarks'?'條目備註':'框架完整自評'),['chapter-TMSA'],'framework',reportClick);}
 const ids=seed.improvements.slice(0,5).map(r=>r.id);
 for(lang of ['zh','en']){
  if(lang==='en'){await page.evaluate(()=>localStorage.setItem('fpmc-compliance-language','en'));await page.reload();await page.locator('.main-nav').waitFor();}
  const tr=(zh,en)=>lang==='zh'?zh:en;
  // Navigation position is unchanged; labels are language-dependent.
  await nav(tr('報告中心','Reports'));
  await page.getByLabel(tr('報告種類','Report type'),{exact:true}).selectOption('improvements');
  const group=page.getByRole('group',{name:tr('明選改善項目（搜尋後選取）','Select improvements after searching'),exact:true});
  for(let i=0;i<5;i++)await group.getByRole('checkbox',{name:new RegExp('LAYOUT_ACTION_'+i+' ')}).check();
  await page.getByLabel(tr('文件格式','File format'),{exact:true}).selectOption('xlsx');
  await output('center-'+lang,'xlsx',null,ids,'improvements',reportClick);
  await page.locator('.main-nav button').filter({hasText:tr('待改善項目','Improvements')}).click();
  for(let i=0;i<5;i++)await page.getByRole('checkbox',{name:tr('選取 ','Select ')+'LAYOUT_ACTION_'+i,exact:true}).check();
  await output('list-'+lang,'xlsx',null,ids,'improvements',()=>page.getByRole('button',{name:tr(/^匯出已選Excel/,/^Export selected Excel/)}).click(),'improvement-list');
  assert.deepEqual(receipt.schemas['center-'+lang],receipt.schemas['list-'+lang]);
  await page.getByRole('button',{name:tr('取消全部勾選','Clear selection'),exact:true}).click();await page.getByRole('checkbox',{name:tr('選取 ','Select ')+'LAYOUT_ACTION_7',exact:true}).check();await output('list-long-names-'+lang,'xlsx',null,['layout-action-7'],'improvements',()=>page.getByRole('button',{name:tr(/^匯出已選Excel/,/^Export selected Excel/)}).click(),'improvement-list');
  if(lang==='en'){await page.getByRole('button',{name:'Clear selection',exact:true}).click();await page.getByRole('checkbox',{name:'Select LAYOUT_ACTION_5',exact:true}).check();await output('list-extreme-en','xlsx',null,['layout-action-5'],'improvements',()=>page.getByRole('button',{name:/^Export selected Excel/}).click(),'improvement-list');}
 }
 // Separate browser-renderer stress probe, not another authorized UI-entry claim.
 const canonical=JSON.parse(readFileSync(receipt.artifacts.find(a=>a.id==='center-zh').canonical,'utf8'));const scope='LONG_SCOPE_BEGIN '+('完整篩選說明'.repeat(450))+' LONG_SCOPE_END';
 const bytes=await page.evaluate(async({state,scope})=>{const {buildImprovementsExcel}=await import('/src/reports.ts');return Array.from(await buildImprovementsExcel(state,['layout-action-0'],'zh',{reportScope:scope}));},{state:canonical.snapshot,scope});
 const path=join(out,'browser-builder-long-scope.xlsx');writeFileSync(path,Buffer.from(bytes));const stress=new ExcelJS.Workbook();await stress.xlsx.readFile(path);const main=stress.worksheets[0],header=Number(String(main.autoFilter).match(/^A(\d+):/)[1]);assert(header>2);assert.equal(Array.from({length:header-1},(_,i)=>main.getCell(i+1,3).text).join(''),scope);
 const stressInput=join(out,'browser-builder-long-scope-input.json');writeFileSync(stressInput,JSON.stringify({sourceCanonical:receipt.artifacts.find(a=>a.id==='center-zh').canonical,scope,ids:['layout-action-0'],lang:'zh'},null,2));
 receipt.artifacts.push({id:'browser-builder-long-scope',origin:'browser-builder-stress-not-entrypoint',format:'xlsx',path,sha256:digest(readFileSync(path)),scope,request:{kind:'improvements',ids:['layout-action-0']},stressInput,stressInputSha256:digest(readFileSync(stressInput))});receipt.cases.push({id:'browser-builder-long-scope',status:'PASS',scopeChars:scope.length,header});
 assert.deepEqual(await business(),before);assert.deepEqual(await audit(),auditBefore);receipt.businessAfter=digest(JSON.stringify(await business()));receipt.auditAfter=digest(JSON.stringify(await audit()));assert.deepEqual(receipt.blocked,[]);assert.deepEqual(receipt.errors,[]);assert(!receipt.actions.some(a=>['save','delete','import_seed'].includes(a)));assert.equal(receipt.artifacts.filter(a=>!a.origin).length,9);assert.equal(receipt.artifacts.filter(a=>a.origin).length,1);assert.equal(receipt.artifacts.length,10);receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.failure={case:current,message:e.stack};process.exitCode=1;await page?.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server.address()?.port,pg:qa?.db.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name+'PortClosed']=port?await closed(port):true;if(qa)receipt.cleanup.postmasterPidAbsent=!existsSync(join(qa.db.dataDir,'postmaster.pid'));receipt.inputsAfter=hashes();if(JSON.stringify(receipt.inputsBefore)!==JSON.stringify(receipt.inputsAfter)||!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}receipt.counts={total:receipt.artifacts.length,xlsx:receipt.artifacts.filter(a=>a.format==='xlsx').length,pdf:receipt.artifacts.filter(a=>a.format==='pdf').length};persist();console.log(JSON.stringify({status:receipt.status,counts:receipt.counts,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));}
