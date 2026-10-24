// Original App + synthetic records + owned native PostgreSQL, never production.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import ExcelJS from 'exceljs';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
import {createApiClient} from '../src/api.ts';
import {checkpointMilestones} from '../src/improvementMilestones.ts';
const baseline=process.argv.includes('--baseline'),out=join(root,'qa-evidence/report-refinement/selection',`${baseline?'baseline':'green'}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const paths=['src/Reports.tsx','src/Improvements.tsx','src/reports.ts','scripts/verify-report-selection.mjs','tests/report-department-filter.test.ts'];
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),hashes=()=>Object.fromEntries(paths.map(p=>[p,digest(join(root,p))]));
const receipt={status:'RUNNING',layer:'真實UI＋合成資料＋owned native PostgreSQL；非正式環境',cases:[],downloads:[],screenshots:[],errors:[],blocked:[],inputsBefore:hashes()};
const seed=syntheticSeed(),base={...seed.items[0]},assessment={...seed.assessments[0]};
seed.chapters.push({...seed.chapters[0],id:'report-second',code:'2',order:2,name:{en:'Second QA chapter',zh:'第二測試章節'}},{...seed.chapters[0],id:'report-empty',code:'3',order:3,name:{en:'Empty QA chapter',zh:'空白測試章節'}});
seed.items[1].departmentIds=['marine'];seed.assessments[1].departmentIds=['technical'];seed.assessments[2].departmentIds=[];
seed.items.push({...base,id:'report-both',code:'1.1.4',order:4},{...base,id:'report-second-item',chapterId:'report-second',code:'2.1.1',order:1});
seed.assessments.push({...assessment,id:'assessment-report-both',itemId:'report-both',departmentIds:['marine','technical']},{...assessment,id:'assessment-report-second',itemId:'report-second-item'});
for(const item of seed.items){item.kpi={en:'KPI_MARKER_'+item.id,zh:'測試指標 '+item.code};item.guidance={en:'GUIDANCE_MARKER_'+item.id,zh:'保留完整指引'};}
for(const a of seed.assessments){a.selfAssessment={en:'ASSESSMENT_MARKER_'+a.itemId,zh:'完整已保存自評'};a.evidence={en:'EVIDENCE_MARKER_'+a.itemId,zh:'完整佐證'};}
seed.improvements=Array.from({length:53},(_,i)=>({id:'report-action-'+String(i).padStart(2,'0'),version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:'',title:`${i<45?'MATCH':'OTHER'} Action ${String(i).padStart(2,'0')}`,content:{en:'COMPLETE_ACTION_'+i+'\nSecond line retained',zh:'完整改善內容 '+i},itemIds:[i%2?'report-second-item':'item-gap'],departmentIds:[i%2?'marine':'technical'],assigneeIds:[],source:'non_external',urgency:['urgent','high','medium','low'][i%4],status:'open',percent:0,targetDate:'2026-12-31',plan:'PLAN_MARKER_'+i,events:[],closedAt:null,closedBy:null,sources:[]}));
let qa,vite,browser,page,current='setup';
const saveReceipt=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
const run=async(id,fn)=>{current=id;try{await fn();receipt.cases.push({id,status:'PASS'});}catch(e){receipt.cases.push({id,status:'FAIL',message:e.message});if(!baseline)throw e;}finally{saveReceipt();}};
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const snap=async name=>{for(const button of await page.locator('.toast button').all())await button.click();const p=join(out,name+'.png');await page.screenshot({path:p});receipt.screenshots.push(p);};
const business=async()=>JSON.stringify((await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows);
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17});
 for(const f of ['018_person_department_heads.sql','019_safety_meeting_sources.sql','020_improvement_chapter_links.sql','021_additional_improvement_sources.sql','022_improvement_milestones.sql'])await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',f),'utf8'));
 const api=createApiClient(qa.config),user=qa.users.owner;Object.assign(api,{user:user.user,sessionToken:user.sessionToken,clientId:user.clientId});
 for(const a of (await api.read()).assessments){const lease=await api.claim('assessment',a.id,'update');try{await api.save('assessment',{...a,remarks:'REMARK_MARKER_'+a.itemId,remarksStatus:'partial_improvable'},a.version,lease,'update',randomUUID());}finally{await api.release(lease);}}
 const original=(await api.read()).improvements.find(r=>r.id==='report-action-00'),at=new Date().toISOString();
 const staged=checkpointMilestones(original,{...original,status:'in_progress',events:[{id:'report-progress',at,by:user.user.id,status:'in_progress',percent:0,content:'PROGRESS_MARKER_COMPLETE'}],milestones:[{id:'report-stage',goal:'MILESTONE_MARKER_COMPLETE 階段目標',plannedDate:'2026-12-01',achievedDate:''}]},()=>({id:'report-plan-event',at,by:user.user.id}));
 const actionLease=await api.claim('improvement',original.id,'update');try{await api.save('improvement',staged,original.version,actionLease,'update',randomUUID());}finally{await api.release(actionLease);}
 for(let n=0;n<3;n++){const id='multi-action-0'+n,lease=await api.claim('improvement',id,'create');try{await api.save('improvement',{...seed.improvements[n],id,title:'MULTI Action '+n,source:n===0?'management_review':n===1?'management_directive':'non_external',assigneeIds:[n===1?qa.users.operator.user.id:user.user.id]},0,lease,'create',randomUUID());}finally{await api.release(lease);}}
 const before=await business();
 const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(e=>e?reject(e):resolve(n));});});
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui='http://127.0.0.1:'+port;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await ctx.route('**/*',r=>{const o=new URL(r.request().url()).origin;if(![ui,qa.url].includes(o)){receipt.blocked.push(o);return r.abort();}return r.continue();});
 await ctx.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user});
 await ctx.addInitScript(()=>{const open=window.open.bind(window);window.__printCalls=[];window.open=(...args)=>{const w=open(...args);if(w)w.print=()=>{window.__printCalls.push(w);w.dispatchEvent(new Event('afterprint'));};return w;};});
 page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>receipt.errors.push(e.message));await page.goto(ui);await page.locator('.main-nav').waitFor();
 const nav=name=>page.locator('.main-nav').getByRole('button',{name,exact:true}).click();
 await nav('待改善項目');await page.locator('.improvement-table').waitFor();
 await run('main-improvements-offers-Excel-alongside-PDF',async()=>{assert.equal(await page.getByRole('button',{name:/^匯出已選Excel/}).count(),1,'Main improvement list is missing Excel export');});
 await run('main-improvements-offers-all-matching-selection',async()=>{assert.equal(await page.getByRole('button',{name:'全部選中',exact:true}).count(),1,'Main improvement list is missing select-all-matching');});
 await snap('main-controls');await nav('報告中心');
 await run('report-center-has-multi-department-filter-above-chapters',async()=>{const group=page.getByRole('group',{name:'部門篩選（多選）',exact:true});assert.equal(await group.count(),1,'Framework report has no multi-department filter');await expect(group).toBeVisible();const department=await group.boundingBox(),chapters=await page.getByRole('group',{name:'完整分章選取',exact:true}).boundingBox();assert(department.y<chapters.y);});
 await run('report-center-has-select-all-chapters',async()=>{assert.equal(await page.getByRole('button',{name:'全部選中章節',exact:true}).count(),1,'Report center has no select-all-chapters action');});
 await snap('report-controls');
 if(!baseline){
 const counts=async()=>(await qa.db.setup.query("select (select count(*)::int from compliance_private.exports) exports,(select count(*)::int from compliance_private.audit where action='export_authorize') audits")).rows[0];
 const download=async(name,format,kind,ids,expectedItems=[],deps=[],trigger=()=>page.getByRole('button',{name:/^(生成並下載|列印／另存PDF)$/}).click())=>{
  const prior=await counts(),path=join(out,name+'.'+format);let suggestedName='';
  if(format==='pdf'){const n=await page.evaluate(()=>window.__printCalls.length);await trigger();await expect.poll(()=>page.evaluate(()=>window.__printCalls.length),{timeout:120000}).toBe(n+1);const popup=ctx.pages().at(-1),session=await ctx.newCDPSession(popup);suggestedName=await popup.title();assert(/ \d{4}-\d{2}-\d{2}(?:\.xlsx)?$/.test(suggestedName));writeFileSync(join(out,name+'.html'),await popup.content());const pdf=await session.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});writeFileSync(path,Buffer.from(pdf.data,'base64'));await session.detach();await popup.close();}
  else{const pending=page.waitForEvent('download',{timeout:120000});await trigger();const d=await pending;suggestedName=d.suggestedFilename();assert(/ \d{4}-\d{2}-\d{2}(?:\.xlsx)?$/.test(suggestedName));assert(suggestedName.length<=175);await d.saveAs(path);assert.equal(await d.failure(),null);}
  const stored=(await qa.db.setup.query('select snapshot,request from compliance_private.exports order by at desc limit 1')).rows[0];assert.equal(stored.request.format,format);assert.equal(stored.request.kind,kind);assert.deepEqual([...stored.request.ids].sort(),[...ids].sort());if(kind==='framework')assert.deepEqual(stored.request.filters.departmentIds,deps);
  assert.deepEqual(await counts(),{exports:prior.exports+1,audits:prior.audits+1});assert.equal(await business(),before);
  const canonical=join(out,name+'-canonical.json');writeFileSync(canonical,JSON.stringify(stored.snapshot,null,2));
  const entry={name,path,suggestedName,format,kind,request:stored.request,expectedItems,canonical,sha256:digest(path),canonicalSha256:digest(canonical)};
  if(format==='xlsx'){
   const book=new ExcelJS.Workbook();await book.xlsx.load(readFileSync(path));const codes=new Set();for(const sheet of book.worksheets)sheet.eachRow(row=>{const code=row.getCell(stored.request.filters?.reportVariant==='remarks'?2:1).text;if(/^(?:\d+\.\d+\.\d+|D-\d+)$/.test(code))codes.add(code);});
   if(kind==='framework')assert.deepEqual([...codes].sort(),expectedItems.map(id=>seed.items.find(i=>i.id===id).code).sort());
   if(kind==='improvements'){
    const sheet=book.worksheets[0],titles=new Set();for(let r=5;r<=sheet.rowCount;r++){titles.add(sheet.getRow(r).getCell(2).text);assert.equal(sheet.getRow(r).getCell(14).alignment.wrapText,true);assert(sheet.getRow(r).getCell(12).value instanceof Date);}
    assert.deepEqual([...titles].sort(),ids.map(id=>stored.snapshot.improvements.find(r=>r.id===id).title).sort());assert.equal(sheet.views[0].ySplit,4);assert.equal(sheet.autoFilter,`A4:${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}`);assert(sheet.getColumn(14).width>sheet.getColumn(1).width);assert(!sheet.model.merges.some(m=>Number(/\d+/.exec(m)[0])>=4));
    if(ids.includes('report-action-00')){assert.equal(book.worksheets.length,4);assert(book.worksheets[1].getCell('G5').text.includes('PROGRESS_MARKER_COMPLETE'));assert(book.worksheets[2].getCell('D5').text.includes('MILESTONE_MARKER_COMPLETE'));}
   }
   entry.sheets=book.worksheets.map(s=>s.name);
  }
  receipt.downloads.push(entry);saveReceipt();
 };
 const search=()=>page.getByPlaceholder('標題、內容、章節、Item或進度'),mainBoxes=()=>page.locator('.improvement-table input[type="checkbox"]');
 await nav('待改善項目');
 await run('all-filtered-45-not-only-first-40-keyboard-idempotent-and-clear',async()=>{
  await search().fill('MATCH');await expect(mainBoxes()).toHaveCount(40);await page.getByRole('button',{name:'全部選中',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.list-selection-summary')).toContainText('已選: 45');await page.getByRole('button',{name:'全部選中',exact:true}).click();await expect(page.locator('.list-selection-summary')).toContainText('已選: 45');
  await page.getByRole('combobox',{name:'跳至頁碼',exact:true}).first().selectOption('2');await expect(mainBoxes()).toHaveCount(5);assert.equal(await mainBoxes().evaluateAll(ns=>ns.filter(n=>n.checked).length),5);await mainBoxes().last().uncheck();await expect(page.locator('.list-selection-summary')).toContainText('已選: 44');await page.getByRole('button',{name:'全部選中',exact:true}).click();await expect(page.locator('.list-selection-summary')).toContainText('已選: 45');
 });
 await run('main-cross-page-45-Excel-exact-canonical-cohort',()=>download('main-all-matching','xlsx','improvements',seed.improvements.filter(r=>r.title.startsWith('MATCH')).map(r=>r.id),[],[],()=>page.getByRole('button',{name:/^匯出已選Excel/}).click()));
 await run('narrow-zero-restore-and-clear-selection',async()=>{await search().fill('MATCH Action 00');await expect(page.locator('.list-selection-summary')).toContainText('已選: 1');await search().fill('NO_MATCH_XYZ');await expect(page.getByRole('button',{name:'全部選中',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:/^匯出已選Excel/})).toBeDisabled();await search().fill('MATCH');await expect(page.locator('.list-selection-summary')).toContainText('已選: 45');await page.getByRole('button',{name:'取消全部勾選',exact:true}).click();await expect(page.locator('.list-selection-summary')).toContainText('已選: 0');await search().fill('MATCH Action 00');await mainBoxes().check();});
 for(const format of ['pdf','xlsx'])await run('main-single-'+format+'-progress-milestones-preserved',()=>download('main-single-'+format,format,'improvements',['report-action-00'],[],[],()=>page.getByRole('button',{name:format==='pdf'?/^列印已選／另存PDF/:/^匯出已選Excel/}).click()));
 await run('multi-main-four-dimensions-union-intersection-canonical-Excel',async()=>{
  await search().fill('');await page.locator('.secondary-filters>summary').click();
  const pick=async(label,values)=>{const d=page.locator('.improvement-multifilter').filter({has:page.locator('summary[aria-label="'+label+'"]')});await d.locator('summary').click();for(const cb of await d.getByRole('checkbox').all()){const text=(await cb.locator('..').innerText()).trim();await cb.setChecked(values.some(v=>text.includes(v)));}await d.locator('summary').click();};
  await pick('來源（多選）',['管理審查會議','管理層指令']);await pick('章節（多選）',['TMSA 1','TMSA 2']);await pick('部門（多選）',['海技組','船工處']);await pick('人員（多選）',[user.user.name,qa.users.operator.user.name]);
  await expect(page.locator('.list-selection-summary')).toContainText('符合篩選: 2');await page.getByRole('button',{name:'全部選中',exact:true}).click();
  await download('multi-main','xlsx','improvements',['multi-action-00','multi-action-01'],[],[],()=>page.getByRole('button',{name:/^匯出已選Excel/}).click());
  for(const lang of ['zh','en']){if(lang==='en')await page.getByRole('button',{name:'Switch language',exact:true}).click();await page.setViewportSize({width:390,height:844});for(const d of await page.locator('.improvement-multifilter').all()){await d.locator('summary').click();const box=await d.boundingBox();assert(box.x>=0&&box.x+box.width<=391);const cb=await d.getByRole('checkbox').first().boundingBox();assert(cb.width<=18);await snap('multi-main-'+lang+'-'+(await d.locator('summary').innerText()).replace(/[^a-z]/gi,''));await d.locator('summary').click();}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.getByRole('button',{name:'Switch language',exact:true}).click();await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'清除篩選及選取',exact:true}).click();
 });
 await nav('報告中心');await page.getByLabel('報告種類',{exact:true}).selectOption('improvements');
 await run('multi-report-center-same-four-dimensions-and-PDF',async()=>{
  for(const [label,wanted] of [['來源（多選）',['管理審查會議','管理層指令']],['章節（多選）',['TMSA 1','TMSA 2']],['部門（多選）',['海技組','船工處']],['人員（多選）',[user.user.name,qa.users.operator.user.name]]]){const d=page.locator('.improvement-multifilter').filter({has:page.locator('summary[aria-label="'+label+'"]')});await d.locator('summary').click();for(const cb of await d.getByRole('checkbox').all()){const text=(await cb.locator('..').innerText()).trim();await cb.setChecked(wanted.some(v=>text.includes(v)));}await d.locator('summary').click();}
  await page.getByRole('button',{name:'全選符合篩選結果',exact:true}).click();await page.getByLabel('文件格式',{exact:true}).selectOption('pdf');await download('multi-reports','pdf','improvements',['multi-action-00','multi-action-01']);
 });
 await run('multi-report-center-expanded-desktop-mobile-zh-en',async()=>{
  for(const lang of ['zh','en']){
   if(lang==='en')await page.getByRole('button',{name:'Switch language',exact:true}).click();
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===390?844:1000});
    for(const [index,d] of (await page.locator('.improvement-multifilter').all()).entries()){
     await d.locator('summary').click();const box=await d.locator('.multi-select').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
     const boxes=await d.getByRole('checkbox').evaluateAll(ns=>ns.map(n=>({width:n.getBoundingClientRect().width,checked:n.checked})));assert(boxes.every(n=>n.width<=18&&n.width>=12));assert.equal(boxes.filter(n=>n.checked).length,2);
     await snap(`multi-report-${lang}-${width}-${index}`);await d.locator('summary').click();
    }
   }
  }
  await page.getByRole('button',{name:'Switch language',exact:true}).click();await page.setViewportSize({width:1440,height:1000});
 });
 await page.getByLabel('報告種類',{exact:true}).selectOption('framework');await page.getByLabel('文件格式',{exact:true}).selectOption('xlsx');
 await snap('main-selected-desktop');await nav('報告中心');
 const chapterBoxes=()=>page.getByRole('group',{name:'完整分章選取',exact:true}).getByRole('checkbox');
 const setDepartments=async(labels)=>{const group=page.getByRole('group',{name:'部門篩選（多選）',exact:true});for(const cb of await group.getByRole('checkbox').all()){const text=(await cb.locator('..').innerText()).trim();await cb.setChecked(labels.includes(text));}};
 await run('chapter-clear-empty-reject-select-all-and-manual-reduction',async()=>{await page.getByRole('button',{name:'取消全部章節',exact:true}).click();assert.equal(await chapterBoxes().evaluateAll(ns=>ns.filter(n=>n.checked).length),0);const prior=await counts();await page.getByRole('button',{name:/^(生成並下載|列印／另存PDF)$/}).click();await expect(page.locator('.panel').getByRole('alert')).toContainText('空選');assert.deepEqual(await counts(),prior);await page.getByRole('button',{name:'全部選中章節',exact:true}).click();assert.equal(await chapterBoxes().evaluateAll(ns=>ns.filter(n=>n.checked).length),3);await chapterBoxes().nth(1).uncheck();await chapterBoxes().last().uncheck();});
 await run('single-and-multiple-departments-use-saved-assignment-with-chapter-AND',async()=>{await setDepartments(['海技組']);await expect(page.locator('.panel')).toContainText('符合部門及章節的條目: 2');await setDepartments(['海技組','船工處']);await expect(page.locator('.panel')).toContainText('符合部門及章節的條目: 3');});
 for(const kind of ['framework','remarks'])for(const format of ['xlsx','pdf'])await run(`TMSA-${kind}-${format}-department-chapter-exact-intersection`,async()=>{await page.getByLabel('報告種類',{exact:true}).selectOption(kind);await page.getByLabel('文件格式',{exact:true}).selectOption(format);await download('TMSA-'+kind+'-'+format,format,'framework',['chapter-TMSA'],['item-a','item-b','report-both'],['marine','technical']);});
 await run('no-matching-department-stops-without-export-record',async()=>{await page.getByLabel('報告種類',{exact:true}).selectOption('framework');await setDepartments(['管理組']);const prior=await counts();await page.getByRole('button',{name:/^(生成並下載|列印／另存PDF)$/}).click();await expect(page.locator('.panel').getByRole('alert')).toContainText('沒有符合');assert.deepEqual(await counts(),prior);await setDepartments([]);await expect(page.locator('.panel')).toContainText('符合部門及章節的條目: 4');});
 for(const format of ['xlsx','pdf'])await run(`R1-empty-departments-empty-active-chapter-${format}-no-download-or-audit`,async()=>{
  await page.getByLabel('報告種類',{exact:true}).selectOption('framework');await page.getByLabel('文件格式',{exact:true}).selectOption(format);await setDepartments([]);await page.getByRole('button',{name:'取消全部章節',exact:true}).click();await chapterBoxes().last().check();
  const prior=await counts();let downloads=0;const observe=()=>downloads++;page.on('download',observe);
  try{await page.getByRole('button',{name:/^(生成並下載|列印／另存PDF)$/}).click();await expect(page.locator('.panel').getByRole('alert')).toContainText('沒有符合');assert.equal(downloads,0);assert.deepEqual(await counts(),prior);assert.equal(await business(),before);receipt.r1Rejections??=[];receipt.r1Rejections.push({format,chapterIds:['report-empty'],departmentIds:[],downloads,exportsDelta:0,auditsDelta:0});}finally{page.off('download',observe);}
 });
 for(const format of ['xlsx','pdf'])await run(`R1-empty-departments-nonempty-chapter-${format}-all-items-positive`,async()=>{
  await page.getByRole('button',{name:'取消全部章節',exact:true}).click();await chapterBoxes().first().check();await page.getByLabel('文件格式',{exact:true}).selectOption(format);
  await download('R1-unrestricted-'+format,format,'framework',['chapter-TMSA'],['item-a','item-b','item-gap','report-both'],[]);
 });
 for(const [kind,format] of [['framework','xlsx'],['remarks','pdf']])await run(`DRYBMS-${kind}-${format}-same-department-filter`,async()=>{await setDepartments(['海技組']);await page.getByLabel('報告種類',{exact:true}).selectOption(kind);await page.getByLabel('報告框架',{exact:true}).selectOption('DRYBMS');await page.getByLabel('文件格式',{exact:true}).selectOption(format);await download('DRYBMS-'+kind+'-'+format,format,'framework',['chapter-DRYBMS'],['item-dry'],['marine']);});
 await run('overview-original-scope-no-department-multifilter-bleed',async()=>{await page.getByLabel('報告種類',{exact:true}).selectOption('overview');await page.getByLabel('報告框架',{exact:true}).selectOption('TMSA');assert.equal(await page.getByRole('group',{name:'部門篩選（多選）',exact:true}).count(),0);await expect(page.getByLabel('報告部門',{exact:true})).toHaveValue('');await download('overview-control','pdf','overview',['chapter-TMSA','report-second']);assert.equal(Object.hasOwn(receipt.downloads.at(-1).request.filters,'departmentIds'),false);});
 await page.getByLabel('報告種類',{exact:true}).selectOption('framework');
 for(const lang of ['zh','en'])for(const width of [1440,390])for(const theme of ['normal','dark','eye'])await run(`original-UI-${lang}-${width}-${theme}`,async()=>{
  if(lang==='en'&&width===1440&&theme==='normal')await page.getByRole('button',{name:'Switch language',exact:true}).click();await page.setViewportSize({width,height:width===390?844:1000});await page.getByRole('combobox',{name:lang==='zh'?'顯示模式':'Display mode',exact:true}).selectOption(theme);
  const group=page.getByRole('group',{name:lang==='zh'?'部門篩選（多選）':'Department filter (multiple)',exact:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const box=await group.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);const departmentBox=await group.getByRole('checkbox').first().boundingBox(),chapterBox=await page.getByRole('group',{name:lang==='zh'?'完整分章選取':'Complete chapter selection',exact:true}).getByRole('checkbox').first().boundingBox();assert(Math.abs(departmentBox.width-chapterBox.width)<1);await snap(`report-${lang}-${width}-${theme}`);
  await nav(lang==='zh'?'待改善項目':'Improvements');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await snap(`main-${lang}-${width}-${theme}`);await nav(lang==='zh'?'報告中心':'Reports');
 });
 const openAs=async(who)=>{const c=await browser.newContext({acceptDownloads:true,viewport:{width:1024,height:800}});await c.route('**/*',r=>[ui,qa.url].includes(new URL(r.request().url()).origin)?r.continue():r.abort());await c.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users[who]});const p=await c.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>receipt.errors.push(e.message));await p.goto(ui);await p.locator('.main-nav').getByRole('button',{name:'待改善項目',exact:true}).click();return p;};
 await run('peer-selection-is-local-and-no-export-role-stays-denied',async()=>{const p=await openAs('vessel');await expect(p.locator('.list-selection-summary')).toContainText('已選: 0');assert.equal(await p.getByRole('button',{name:/^(匯出已選|列印已選)/}).count(),0);const forbidden=createApiClient(qa.config),u=qa.users.vessel;Object.assign(forbidden,{user:u.user,sessionToken:u.sessionToken,clientId:u.clientId});const prior=await counts();await assert.rejects(()=>forbidden.authorizeExport({kind:'improvements',format:'xlsx',ids:['report-action-00'],snapshotToken:'test',filters:{}}),/FORBIDDEN/);assert.deepEqual(await counts(),prior);await p.context().close();});
 await run('main-Excel-native-authorized-response-sign-out-prevents-download',async()=>{const p=await openAs('operator');await p.getByPlaceholder('標題、內容、章節、Item或進度').fill('MATCH Action 00');await p.locator('.improvement-table input[type="checkbox"]').check();let release,arrived;const ready=new Promise(r=>arrived=r),held=new Promise(r=>release=r);let downloads=0;p.on('download',()=>downloads++);await p.route(qa.url+'/**',async route=>{if(route.request().postDataJSON()?.p_action==='export_authorize'){const response=await route.fetch();arrived();await held;await route.fulfill({response});}else await route.continue();});await p.getByRole('button',{name:/^匯出已選Excel/}).click();await ready;await p.getByRole('button',{name:'切換／退出',exact:true}).click();await expect(p.locator('.main-nav')).toHaveCount(0);release();await expect(p.locator('.toast')).toContainText(/STALE_SESSION|EXPORT_SESSION_CHANGED/);assert.equal(downloads,0);await p.context().close();});
 }

 assert.deepEqual(await business(),before);assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.blocked,[]);assert(receipt.cases.every(c=>c.status==='PASS'));receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.failure={case:current,message:e.stack};process.exitCode=1;await page?.screenshot({path:join(out,'failure.png')}).catch(()=>{});}
finally{const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db.port};receipt.ownedRuntime={nodePid:process.pid,pgPid:qa?Number(readFileSync(join(qa.db.dataDir,'postmaster.pid'),'utf8').split(/\r?\n/)[0]):null,ports};await browser?.close();await vite?.close();await qa?.stop();receipt.cleanup={};for(const [k,p] of Object.entries(ports))receipt.cleanup[k]=p?await closed(p):true;receipt.inputsAfter=hashes();receipt.inputsUnchanged=JSON.stringify(receipt.inputsBefore)===JSON.stringify(receipt.inputsAfter);if(!receipt.inputsUnchanged||!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}assert.equal(receipt.cases.length,new Set(receipt.cases.map(c=>c.id)).size);saveReceipt();console.log(JSON.stringify({status:receipt.status,cases:receipt.cases,receipt:join(out,'receipt.json'),cleanup:receipt.cleanup}));}
