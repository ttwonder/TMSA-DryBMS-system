// Original mounted App + owned native PostgreSQL. Synthetic data only; no hosted requests.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer,preview as startPreview} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
const baseline=process.argv.includes('--baseline'),production=process.argv.includes('--production'),profile=process.argv.includes('--profile');
const out=join(root,'qa-evidence','inspection-input',`${baseline?'baseline':'green'}${production?'-production':''}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const receipt={layer:`Original App / ${production?'production dist':'Vite development'} + synthetic data + owned PostgreSQL; NOT hosted acceptance`,cases:[],inputWindows:[],screenshots:[],errors:[],blockedExternal:0};
const base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''}),seed=syntheticSeed();
seed.chapters=[];seed.items=[];seed.assessments=[];seed.dryScores=[];
for(const frameworkId of ['TMSA','DRYBMS']){
 const count=frameworkId==='TMSA'?20:30,itemCount=frameworkId==='TMSA'?288:300;
 for(let n=0;n<count;n++){
  const chapter={...base(`${frameworkId}-c${n}`),frameworkId,code:String(n+1),name:{en:`Synthetic chapter ${n+1}`,zh:`合成章節 ${n+1}`},order:n,active:true};seed.chapters.push(chapter);
  if(frameworkId==='DRYBMS')seed.dryScores.push({...base(`dry-${n}`),chapterId:chapter.id,levels:[100,75,50,25],note:''});
 }
 for(let n=0;n<itemCount;n++){
  const item={...base(`${frameworkId}-item-${n}`),frameworkId,chapterId:`${frameworkId}-c${n%count}`,code:`QA-${frameworkId}-${String(n).padStart(3,'0')}`,level:n%4+1,order:n,active:true,kpi:{en:'Synthetic requirement: management and operational responsibility. '.repeat(2),zh:'合成要求：管理與作業責任。'.repeat(3)},guidance:{en:'Frozen synthetic guidance',zh:'凍結合成指引'},departmentIds:['marine'],sources:[{source:'Synthetic',rawItem:`RETAIN ${frameworkId} ${n}`}]};seed.items.push(item);
  seed.assessments.push({...base(`assessment-${item.id}`),itemId:item.id,response:'no',conformity:'partial',reviewed:true,selfAssessment:{en:'Keep assessment',zh:'保留自評'},evidence:{en:'Keep evidence',zh:'保留佐證'},departmentIds:['marine'],assigneeIds:[],executionStatus:'not_started',sources:[]});
 }
}
seed.inspections=['TMSA','DRYBMS'].map(frameworkId=>{
 const chapters=seed.chapters.filter(c=>c.frameworkId===frameworkId),items=seed.items.filter(i=>i.frameworkId===frameworkId);
 return {...base(`history-input-${frameworkId}`),frameworkId,title:`QA input ${frameworkId}`,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===frameworkId)),chapters:structuredClone(chapters),items:structuredClone(items),scoringVersion:frameworkId==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},results:items.map(item=>({itemId:item.id,response:'no',conformity:'partial',reviewed:true,observation:{en:'Original item observation',zh:'原逐項觀察'},recommendation:{en:'Original item recommendation',zh:'原逐項建議'}})),findings:Array.from({length:12},(_,n)=>({id:`${frameworkId}-finding-${n}`,itemIds:[items[n].id],classification:['finding','positive','guidance','no_finding','general'][n%5],observation:{en:`Original observation ${n}.\nSecond line.`,zh:`原觀察 ${n}。\n第二行。`},recommendation:{en:`Original recommendation ${n}.`,zh:`原建議 ${n}。`},sources:[{source:'Synthetic report',rawItem:`KEEP SOURCE ${n}`}],warning:`Synthetic uncertainty ${n}`})),...(frameworkId==='DRYBMS'?{dryLevels:Object.fromEntries(chapters.map(c=>[c.id,[100,75,50,25]]))}:{})};
});
seed.improvements=[{...base('input-linked-action'),title:'Linked action remains unchanged',content:{en:'Original linked content',zh:'原關聯改善'},itemIds:['TMSA-item-0'],departmentIds:['marine'],assigneeIds:[],source:'external',inspectionId:'history-input-TMSA',findingId:'TMSA-finding-0',sourceKey:'history-input-TMSA:TMSA-finding-0',urgency:'medium',status:'open',percent:0,targetDate:'',plan:'',events:[],closedAt:null,closedBy:null,sources:structuredClone(seed.inspections[0].findings[0].sources)}];
let qa,vite,browser,page,current='setup',hold=false,hit=false,release,barrier=Promise.resolve();
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const run=async(id,fn)=>{current=id;await fn();receipt.cases.push({id,status:'PASS'});writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));};
try{
 qa=await startQaServer({seed,evidenceDir:out,afterCommit:async({action,result})=>{if(action==='save'&&result.ok&&hold){hold=false;hit=true;await barrier;}return false;}});
 for(const file of readdirSync(join(root,'supabase/migrations')).filter(f=>/^(00[6-9]|010)_.*\.sql$/.test(f)).sort())await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',file),'utf8'));
 const ledger=async()=>({records:(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows,audit:(await qa.db.setup.query('select count(*)::int n from compliance_private.audit')).rows[0].n,operations:(await qa.db.setup.query('select count(*)::int n from compliance_private.operations')).rows[0].n});
 const record=async fw=>(await qa.db.setup.query("select body from compliance_private.records where kind='inspection' and id=$1",[`history-input-${fw}`])).rows[0].body;
 const initial=await ledger();
 vite=production?await startPreview({root,base:'/',preview:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'}):await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});if(!production)await vite.listen();const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const requests=[];
 const open=async(role='owner')=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',r=>{if(![ui,qa.url].includes(new URL(r.request().url()).origin)){receipt.blockedExternal++;return r.abort();}return r.continue();});
  await context.addInitScript(({config,user})=>{if(!sessionStorage.getItem('qa-initialized')){localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));sessionStorage.setItem('qa-initialized','yes');}const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const at=performance.now();const result=set.call(this,k,v);if(k.startsWith('fpmc-inspection-draft-v1:'))window.__draftWrites?.push({ms:performance.now()-at,characters:v.length});return result;};},{config:qa.config,user:qa.users[role]});
  const p=await context.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>receipt.errors.push(e.name));p.on('dialog',d=>d.accept());p.on('request',r=>{if(r.url().startsWith(qa.url)&&r.method()==='POST'){const body=r.postDataJSON();requests.push({action:body.p_action??body.action??'unknown'});}});await p.goto(ui);await p.locator('.main-nav').waitFor();return p;
 };
 page=await open();
 const modal=(p=page)=>p.getByRole('dialog');
 const articles=(p=page)=>modal(p).locator('.inspection-finding');
 const field=(index,article=0,p=page)=>articles(p).nth(article).locator('textarea').nth(index);
 const select=async(fw,p=page,editing=true)=>{await p.locator('.main-nav').getByRole('button',{name:/^(歷史檢查記錄|Inspection history)$/}).click();await p.locator('.data-table tbody tr').filter({has:p.getByRole('button',{name:`QA input ${fw}`,exact:true})}).getByRole('button',{name:editing?/^(直接修改|Edit directly)$/:/^(查看|View)$/}).click();await modal(p).waitFor();await modal(p).getByRole('navigation').getByRole('button',{name:/^(缺陷／改善建議|Findings \/ recommendations)$/}).click();await expect(articles(p)).toHaveCount(12);};
 const close=async(p=page)=>{await modal(p).locator('.page-actions').getByRole('button',{name:/^(關閉|Close|取消／放棄草稿|Cancel \/ discard draft)$/}).click();await expect(modal(p)).toHaveCount(0);};
 const draft=async()=>page.evaluate(()=>{const k=Object.keys(sessionStorage).find(k=>k.startsWith('fpmc-inspection-draft-v1:'));return k?JSON.parse(sessionStorage.getItem(k)).draft:null;});
 const image=async name=>{const path=join(out,name+'.png');await page.screenshot({path});receipt.screenshots.push(path);};
 for(const fw of ['TMSA','DRYBMS'])await run(`${fw}-four-finding-text-fields-no-unrelated-picker-rewrite-cancel-zero-write`,async()=>{
  const before=await ledger();await select(fw);const checkboxCount=await articles().locator('input[type=checkbox]').count();assert(checkboxCount>=3400);
  for(let index=0;index<4;index++){
   const input=field(index,2);await input.focus();await input.press('Control+End');await input.pressSequentially('x');const start=await input.inputValue(),requestIndex=requests.length;
   await input.evaluate(el=>{window.__inputNode=el;window.__pickerChanges=0;window.__inputTimes=[];window.__draftWrites=[];window.__pickerObserver=new MutationObserver(rows=>{window.__pickerChanges+=rows.length;});for(const picker of document.querySelectorAll('.inspection-finding fieldset.multi-select'))window.__pickerObserver.observe(picker,{subtree:true,attributes:true,childList:true,characterData:true});window.__inputListener=e=>{if(e.target===el){const at=performance.now();requestAnimationFrame(()=>window.__inputTimes.push(performance.now()-at));}};document.addEventListener('input',window.__inputListener,true);});
   const profiler=profile&&index===0?await page.context().newCDPSession(page):null;if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}
   const text='abcde中文輸入測試12345';await page.keyboard.type(text,{delay:10});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   if(profiler){const result=await profiler.send('Profiler.stop');writeFileSync(join(out,`${fw}.cpuprofile`),JSON.stringify(result.profile));await profiler.detach();}
   const sample=await input.evaluate(el=>{window.__pickerObserver.disconnect();document.removeEventListener('input',window.__inputListener,true);return {changes:window.__pickerChanges,samples:window.__inputTimes,draftWrites:window.__draftWrites,sameNode:el===window.__inputNode,focused:document.activeElement===el,caret:el.selectionStart,length:el.value.length};});
   sample.mutationRpcCount=requests.slice(requestIndex).filter(r=>['save','claim','restart_updates','finalize'].includes(r.action)).length;
   receipt.inputWindows.push({framework:fw,field:['observation.en','observation.zh','recommendation.en','recommendation.zh'][index],checkboxCount,...sample});
   assert.equal(await input.inputValue(),start+text);assert(sample.sameNode&&sample.focused);assert.equal(sample.caret,sample.length);assert.equal(sample.mutationRpcCount,0);
   if(!baseline)assert(sample.changes<=checkboxCount*4,`Text typing rewrote ${sample.changes} unrelated checkbox attributes for ${checkboxCount} controls`);
  }
  const cdp=await page.context().newCDPSession(page),input=field(1,2);await input.focus();await input.press('Control+End');const value=await input.inputValue();for(const text of ['c','ce','測試'])await cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});await cdp.send('Input.insertText',{text:'測試'});await expect(input).toHaveValue(value+'測試');await cdp.detach();
  const picker=articles().nth(2).locator('fieldset.multi-select');await picker.getByRole('checkbox',{name:new RegExp(`QA-${fw}-010`)}).check();await field(3,2).pressSequentially('保留關聯');await expect(picker.getByRole('checkbox',{name:new RegExp(`QA-${fw}-010`)})).toBeChecked();
  const local=await draft(),original=await record(fw);assert.deepEqual(local.results,original.results);assert.deepEqual(local.snapshot,original.snapshot);assert.deepEqual(local.dryLevels,original.dryLevels);assert.deepEqual(local.findings.filter((_,i)=>i!==2),original.findings.filter((_,i)=>i!==2));assert.deepEqual(local.findings[2].sources,original.findings[2].sources);assert.equal(local.findings[2].classification,original.findings[2].classification);
  assert.deepEqual(await ledger(),before);await field(0,2).scrollIntoViewIfNeeded();await image(`${fw}-desktop`);await close();assert.deepEqual(await ledger(),before);
 });
 if(baseline){
  const violations=receipt.inputWindows.filter(s=>s.changes>s.checkboxCount*4);receipt.excessWorkViolations=violations.map(s=>({framework:s.framework,field:s.field,changes:s.changes,checkboxCount:s.checkboxCount}));assert.equal(violations.length,0,'Finding text input repeatedly rewrites unchanged related-item controls');
 }else{
  await run('language-change-and-next-record-refresh-options-without-losing-draft',async()=>{
   const before=await ledger();await select('TMSA');await field(1).fill('保留語言切換草稿');await page.getByRole('button',{name:'Switch language',exact:true}).evaluate(el=>el.click());await expect(articles().first().locator('fieldset legend')).toHaveText('Finding-related items');await expect(articles().first().locator('fieldset')).toContainText('Synthetic requirement');await expect(field(1)).toHaveValue('保留語言切換草稿');await page.getByRole('button',{name:'Switch language',exact:true}).evaluate(el=>el.click());await close();await select('DRYBMS');await expect(articles().first().locator('fieldset')).toContainText('QA-DRYBMS-000');await expect(articles().first().locator('fieldset')).not.toContainText('QA-TMSA-000');await expect(field(1)).toHaveValue('原觀察 0。\n第二行。');await close();assert.deepEqual(await ledger(),before);
  });
  for(const fw of ['TMSA','DRYBMS'])await run(`${fw}-native-held-ACK-save-four-fields-and-fresh-admin-readback`,async()=>{
   const before=await ledger(),original=await record(fw);await select(fw);const expected=structuredClone(original.findings);expected[2].observation={en:'Saved observation EN',zh:'保存觀察中文'};expected[2].recommendation={en:'Saved recommendation EN',zh:'保存建議中文'};expected[2].itemIds.push(`${fw}-item-10`);
   for(const [index,value] of ['Saved observation EN','保存觀察中文','Saved recommendation EN','保存建議中文'].entries())await field(index,2).fill(value);
   await articles().nth(2).getByRole('checkbox',{name:new RegExp(`QA-${fw}-010`)}).check();assert.deepEqual(await ledger(),before);
   hold=true;hit=false;barrier=new Promise(r=>release=r);await modal().getByRole('button',{name:'保存檢查',exact:true}).click();await expect.poll(()=>hit).toBe(true);for(let i=0;i<4;i++)await expect(field(i,2)).toBeDisabled();const intended=await draft();await articles().nth(2).getByRole('checkbox',{name:new RegExp(`QA-${fw}-011`)}).click();assert.deepEqual((await draft()).findings,intended.findings);release();await expect(modal().getByRole('status')).toContainText('已由伺服器確認');
   const saved=await record(fw),after=await ledger();assert.equal(saved.id,original.id);assert.equal(saved.version,original.version+1);assert.deepEqual(saved.findings,expected);for(const k of ['snapshot','results','status','imported','dryLevels','title','organization'])assert.deepEqual(saved[k],original[k]);assert.equal(after.audit,before.audit+1);assert.equal(after.operations,before.operations+1);assert.deepEqual(after.records.filter(r=>!(r.kind==='inspection'&&r.id===saved.id)),before.records.filter(r=>!(r.kind==='inspection'&&r.id===saved.id)));await close();
   const peer=await open('admin');await select(fw,peer,false);await expect(articles(peer).nth(2)).toContainText('Saved observation EN');await expect(articles(peer).nth(2)).toContainText('保存建議中文');await expect(articles(peer).nth(2)).toContainText(`QA-${fw}-010`);assert.equal(await articles(peer).locator('textarea').count(),0);await close(peer);await peer.context().close();
   await page.reload();await page.locator('.main-nav').waitFor();await select(fw);await expect(field(3,2)).toHaveValue('保存建議中文');await articles().nth(2).getByRole('checkbox',{name:new RegExp(`QA-${fw}-010`)}).uncheck();await field(0,2).press('Control+End');await field(0,2).pressSequentially(' cancel');await expect(articles().nth(2).getByRole('checkbox',{name:new RegExp(`QA-${fw}-010`)})).not.toBeChecked();await close();assert.deepEqual(await ledger(),after);
  });
  await run('new-finding-current-options-same-editor-and-cancel-zero-write',async()=>{
   const before=await ledger();await select('TMSA');await modal().getByRole('navigation').getByRole('button').first().click();await modal().locator('.inspection-item').first().getByRole('button',{name:/加入檢查發現/}).click();await expect(articles()).toHaveCount(13);const added=articles().last();await added.locator('textarea').nth(1).fill('新增觀察草稿');await added.getByRole('checkbox',{name:/QA-TMSA-010/}).check();await added.locator('textarea').nth(3).fill('新增建議草稿');const local=await draft();assert.equal(local.findings.at(-1).observation.zh,'新增觀察草稿');assert.equal(local.findings.at(-1).recommendation.zh,'新增建議草稿');assert(local.findings.at(-1).itemIds.includes('TMSA-item-10'));await close();assert.deepEqual(await ledger(),before);
  });
  await run('narrow-mobile-original-findings-form-and-cancel-zero-write',async()=>{
   const before=await ledger();await page.setViewportSize({width:390,height:844});await select('TMSA');await field(1,2).fill('手機中文草稿');await field(1,2).scrollIntoViewIfNeeded();const geometry=await modal().evaluate(el=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,width:el.clientWidth,scroll:el.scrollWidth}));assert(geometry.documentWidth<=geometry.viewport+1);assert(geometry.scroll<=geometry.width+1);receipt.mobileGeometry=geometry;await image('mobile');await close();assert.deepEqual(await ledger(),before);
  });
  assert.deepEqual((await ledger()).records.filter(r=>r.kind!=='inspection'),initial.records.filter(r=>r.kind!=='inspection'));
 }
 assert.equal(receipt.blockedExternal,0);assert.deepEqual(receipt.errors,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:String(error.message).slice(0,1800)};if(page)await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{release?.();await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};if(vite?.close)await vite.close();else if(vite)await new Promise(resolve=>vite.httpServer.close(resolve));await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;if(!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}receipt.testedInputs=Object.fromEntries([...(production?['dist/index.html',...readdirSync(join(root,'dist/assets')).filter(f=>f.endsWith('.js')||f.endsWith('.css')).map(f=>'dist/assets/'+f)]:[]),'src/Inspections.tsx','src/ui.tsx','src/useRecordEditor.ts','src/inspectionDraft.ts','src/inspectionEditing.ts','src/domain.ts','src/App.tsx','src/api.ts','src/styles.css','scripts/verify-inspection-input.mjs','scripts/qa-server.mjs','scripts/native-postgres.mjs',...readdirSync(join(root,'supabase/migrations')).filter(f=>/^\d.*\.sql$/.test(f)).map(f=>'supabase/migrations/'+f)].map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,inputWindows:receipt.inputWindows.length,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));}
