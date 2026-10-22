// Original mounted App + synthetic fixtures + owned native PostgreSQL only.
// No private seed, hosted writes, production edits, staging, deletion or push.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';

const out=join(root,'qa-evidence','rich-text-management',new Date().toISOString().replaceAll(':','-'));
mkdirSync(out,{recursive:true});
const receipt={layer:'Original App + synthetic data + owned native PostgreSQL; NOT hosted acceptance',status:'RUNNING',cases:[],fields:[],screenshots:[],errors:[],blocked:[]};
const inputFiles=['src/main.tsx','src/App.tsx','src/Management.tsx','src/Inspections.tsx','src/Improvements.tsx','src/RichTextEditor.tsx','src/richText.ts','src/richText.css','src/ui.tsx','src/domain.ts','src/useRecordEditor.ts','src/inspectionEditing.ts','src/inspectionDraft.ts','src/api.ts','scripts/native-postgres.mjs','scripts/qa-server.mjs','scripts/verify-rich-text-management.mjs','supabase/migrations/018_person_department_heads.sql'];
const hashes=()=>Object.fromEntries(inputFiles.map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));
receipt.inputsAtStart=hashes();
const seed=syntheticSeed(),base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
for(const chapter of seed.chapters)chapter.aim={en:'Original aim\n\nLiteral <not HTML>',zh:'原始目標\n\n保留空行'};
for(const item of seed.items){item.aliases=[];item.sources=[{source:'Synthetic immutable source',file:'fixture.txt',sheet:'Raw',cell:'A1',rawItem:'Literal <original>\n\nRAW '+item.id,note:'Original note\n\nKeep bytes',pages:[1]}];}
seed.inspections=['TMSA','DRYBMS'].map(frameworkId=>{
 const chapters=seed.chapters.filter(c=>c.frameworkId===frameworkId),items=seed.items.filter(i=>i.frameworkId===frameworkId);
 return {...base('rich-history-'+frameworkId),frameworkId,title:'Rich QA '+frameworkId,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,
  snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===frameworkId)),chapters:structuredClone(chapters),items:structuredClone(items),scoringVersion:frameworkId==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},
  results:items.map(item=>({itemId:item.id,response:'no',conformity:'partial',reviewed:true,observation:{en:'Original observation '+item.id,zh:'原觀察 '+item.id},recommendation:{en:'Original recommendation '+item.id,zh:'原建議 '+item.id}})),
  findings:[{id:'rich-finding-'+frameworkId,itemIds:[items[0].id],classification:'finding',observation:{en:'Full original observation',zh:'完整原始觀察'},recommendation:{en:'Full original recommendation',zh:'完整原始建議'},sources:[{source:'Synthetic report',rawItem:'IMMUTABLE <raw>\n\nSOURCE',note:'Frozen note\n\nUnchanged',pages:[2]}],warning:'Original uncertainty'}],
  ...(frameworkId==='DRYBMS'?{dryLevels:Object.fromEntries(chapters.map(c=>[c.id,[25,50,75,100]]))}:{})};
});
let qa,vite,browser,page,current='setup';
const writeReceipt=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
const run=async(name,fn)=>{current=name;await fn();receipt.cases.push({name,status:'PASS'});writeReceipt();};
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.setTimeout(2000,()=>{s.destroy();resolve(false);});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17});
 await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/018_person_department_heads.sql'),'utf8'));
 const read=async(kind,id)=>(await qa.db.setup.query('select body from compliance_private.records where kind=$1 and id=$2',[kind,id])).rows[0].body;
 const ledger=async()=>({records:(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows,audit:(await qa.db.setup.query('select count(*)::int n from compliance_private.audit')).rows[0].n,operations:(await qa.db.setup.query('select count(*)::int n from compliance_private.operations')).rows[0].n});
 const initial=await ledger();
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();
 const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 const rich=await vite.ssrLoadModule('/src/richText.ts');
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async({touch=false,role='owner'}={})=>{
  const context=await browser.newContext({viewport:touch?{width:820,height:1180}:{width:1366,height:900},hasTouch:touch,isMobile:touch});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(![ui,qa.url].includes(url.origin)){receipt.blocked.push(url.origin);return route.abort();}return route.continue();});
  await context.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users[role]});
  const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',error=>receipt.errors.push(error.message));p.on('dialog',dialog=>dialog.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();return p;
 };
 page=await open();
 const modal=(p=page)=>p.getByRole('dialog');
 const fields=(scope)=>scope.locator('.rich-editor-input[role="textbox"]');
 const image=async(name,p=page)=>{const path=join(out,name+'.png');await p.screenshot({path});receipt.screenshots.push(path);};
 const format=async(field,text,{single=false,list=false}={})=>{
  await expect(field).toHaveAttribute('contenteditable','true');await field.fill(text);await field.press('Control+a');
  const toolbar=page.getByRole('toolbar');await expect(toolbar).toHaveCount(1);await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('button')).toHaveCount(single?5:7);
  await toolbar.getByRole('button',{name:'紅色',exact:true}).click();await toolbar.getByRole('button',{name:'加粗',exact:true}).click();
  if(list)await toolbar.getByRole('button',{name:'項目符號',exact:true}).click();
  const geometry=await field.evaluate(el=>{const t=el.parentElement.querySelector('[role=toolbar]').getBoundingClientRect(),r=el.getBoundingClientRect();return {height:t.height,toolbarBottom:t.bottom,inputTop:r.top};});
  assert(geometry.height<=38&&geometry.toolbarBottom<=geometry.inputTop+1,'Toolbar reserves space above content');
 };
 const check=(value,text,path,{list=false}={})=>{
  assert(rich.isRichText(value),path+' must persist rich data');const visible=rich.richTextToPlainText(value);
  assert.equal(visible,list?'• '+text:text,path+' complete visible text');const runs=rich.richTextRuns(value).filter(r=>r.text.includes(text));
  assert(runs.length>0&&runs.every(r=>r.bold&&r.color==='red'),path+' red and bold retained');receipt.fields.push({path,plain:visible,sha256:createHash('sha256').update(value).digest('hex')});
 };
 const unchanged=(after,before,keys)=>{const a=structuredClone(after),b=structuredClone(before);for(const k of ['version','updatedAt','updatedBy',...keys]){delete a[k];delete b[k];}assert.deepEqual(a,b);assert.equal(after.version,before.version+1);};
 const nativeSaveCheck=async(kind,id,before,beforeLedger)=>{
  const after=await read(kind,id),state=await ledger(),dependent=kind==='item'?beforeLedger.records.find(r=>r.kind==='assessment'&&r.body.itemId===id):null;
  assert.equal(state.audit,beforeLedger.audit+1+(dependent?1:0));assert.equal(state.operations,beforeLedger.operations+1);
  if(dependent){const assessed=await read('assessment',dependent.id);unchanged(assessed,dependent.body,['reviewed']);assert.equal(assessed.reviewed,false);}
  const unrelated=r=>(r.kind!==kind||r.id!==id)&&!(dependent&&r.kind==='assessment'&&r.id===dependent.id);
  assert.deepEqual(state.records.filter(unrelated),beforeLedger.records.filter(unrelated));
  const audits=(await qa.db.setup.query('select before_value,after_value from compliance_private.audit where kind=$1 and entity_id=$2 order by at desc limit 1',[kind,id])).rows;
  assert.equal(audits.length,1);assert.deepEqual(audits[0].before_value,before);assert.deepEqual(audits[0].after_value,after);return after;
 };
 const management=async(fw,p=page)=>{await p.locator('.main-nav').getByRole('button',{name:'管理',exact:true}).click();await p.getByRole('button',{name:'框架／條目',exact:true}).click();const selects=p.locator('.toolbar select');await expect(selects).toHaveCount(2);await selects.first().selectOption(fw);};
 const editButton=(kind,id,p=page)=>kind==='framework'?p.getByRole('button',{name:'編輯框架',exact:true}):kind==='chapter'?p.locator('.data-table').nth(0).getByRole('button',{name:'編輯／停用／再啟用',exact:true}):p.locator('.data-table').nth(1).locator('tbody tr').filter({hasText:seed.items.find(i=>i.id===id).code}).getByRole('button',{name:'編輯／停用／再啟用',exact:true});
 for(const fw of ['TMSA','DRYBMS']){
  await management(fw);
  for(const [kind,id,keys] of [['framework',fw,['name','description','scopeLabel']],['chapter','chapter-'+fw,['name','aim']],['item',fw==='TMSA'?'item-a':'item-dry',['kpi','guidance']]])await run(`${fw}-${kind}-all-bilingual-rich-fields-save-readback-reopen-cancel`,async()=>{
   const before=await read(kind,id),beforeLedger=await ledger();await editButton(kind,id).click();const m=modal(),f=fields(m),count=keys.length*2+(kind==='item'?1:0);await expect(f).toHaveCount(count);
   const texts=[];
   for(let i=0;i<keys.length*2;i++){const text=`${fw} ${kind} ${keys[Math.floor(i/2)]} ${i%2?'繁中':'English'}`;texts.push(text);await format(f.nth(i),text,{single:keys[Math.floor(i/2)]==='name'});}
   if(kind==='item'){
    await expect(f.last()).toHaveAttribute('contenteditable','false');await m.getByRole('button',{name:'新增補充來源',exact:true}).click();await expect(f).toHaveCount(count+1);
    const source=m.locator('fieldset.multi-select').filter({has:page.getByRole('button',{name:'新增補充來源',exact:true})}).locator('.form-grid.notice').last();
    await expect(source.locator('textarea')).toHaveCount(5);await source.locator('textarea').nth(0).fill('Synthetic new supporting source');await source.locator('textarea').nth(3).fill('B2');
    await format(f.last(),fw+' new supporting note 新補證',{list:true});
   }
   if(fw==='TMSA'&&kind==='framework')await image('desktop-framework-toolbar');
   assert.deepEqual(await ledger(),beforeLedger,'Typing cannot autosave');await m.getByRole('button',{name:'確認保存',exact:true}).click();await expect(modal()).toHaveCount(0);
   const after=await nativeSaveCheck(kind,id,before,beforeLedger);unchanged(after,before,kind==='item'?[...keys,'sources']:keys);
   for(let i=0;i<texts.length;i++)check(after[keys[Math.floor(i/2)]][i%2?'zh':'en'],texts[i],`${id}.${keys[Math.floor(i/2)]}.${i%2?'zh':'en'}`);
   if(kind==='item'){assert.deepEqual(after.sources.slice(0,before.sources.length),before.sources);check(after.sources.at(-1).note,fw+' new supporting note 新補證',id+'.sources.new.note',{list:true});assert.equal(after.sources.at(-1).source,'Synthetic new supporting source');assert.equal(after.sources.at(-1).cell,'B2');}
   await editButton(kind,id).click();for(let i=0;i<texts.length;i++)await expect(fields(modal()).nth(i)).toHaveText(texts[i]);
   const savedLedger=await ledger();await fields(modal()).first().fill('Discarded draft');await modal().getByRole('button',{name:'取消',exact:true}).click();await expect(modal()).toHaveCount(0);assert.deepEqual(await ledger(),savedLedger);
  });
 }
 const inspect=async(fw,editing=true,p=page)=>{await p.locator('.main-nav').getByRole('button',{name:'歷史檢查記錄',exact:true}).click();const row=p.locator('.data-table tbody tr').filter({hasText:'Synthetic QA'}).filter({hasText:fw});await row.getByRole('button',{name:editing?'直接修改':'查看',exact:true}).click();await modal(p).waitFor();};
 const findings=async(p=page)=>modal(p).getByRole('button',{name:'缺陷／改善建議',exact:true}).click();
 for(const fw of ['TMSA','DRYBMS'])await run(`${fw}-historical-title-results-findings-all-languages-native-audit-preservation`,async()=>{
  const id='rich-history-'+fw,before=await read('inspection',id),beforeLedger=await ledger();await inspect(fw);const m=modal();
  await format(m.getByRole('textbox',{name:'標題',exact:true}),fw+' formatted history 富文字',{single:true});
  await expect(m.locator('.inspection-item')).toHaveCount(before.results.length);
  const keys=['observation','recommendation'];
  for(let n=0;n<before.results.length;n++)for(let i=0;i<4;i++)await format(fields(m.locator('.inspection-item').nth(n)).nth(i),`${fw} result ${n} ${keys[Math.floor(i/2)]} ${i%2?'繁中':'English'}`);
  await findings();await expect(fields(m.locator('.inspection-finding'))).toHaveCount(4);
  for(let i=0;i<4;i++)await format(fields(m.locator('.inspection-finding')).nth(i),`${fw} finding ${keys[Math.floor(i/2)]} ${i%2?'繁中':'English'}`);
  if(fw==='TMSA')await image('desktop-inspection-findings-toolbar');assert.deepEqual(await ledger(),beforeLedger);
  await m.getByRole('button',{name:'保存檢查',exact:true}).click();await expect(m.getByRole('status')).toContainText('已由伺服器確認');await expect(m.getByRole('button',{name:'保存檢查',exact:true})).toBeEnabled();
  const after=await nativeSaveCheck('inspection',id,before,beforeLedger);unchanged(after,before,['title','results','findings']);assert.deepEqual(after.snapshot,before.snapshot);assert.equal(after.status,'final');
  check(after.title,fw+' formatted history 富文字',id+'.title');
  for(let n=0;n<after.results.length;n++){const a=after.results[n],b=before.results[n];for(const key of ['itemId','response','conformity','reviewed'])assert.deepEqual(a[key],b[key]);for(let i=0;i<4;i++)check(a[keys[Math.floor(i/2)]][i%2?'zh':'en'],`${fw} result ${n} ${keys[Math.floor(i/2)]} ${i%2?'繁中':'English'}`,`${id}.results.${n}.${keys[Math.floor(i/2)]}.${i%2?'zh':'en'}`);}
  for(const key of ['id','itemIds','classification','sources','warning'])assert.deepEqual(after.findings[0][key],before.findings[0][key]);for(let i=0;i<4;i++)check(after.findings[0][keys[Math.floor(i/2)]][i%2?'zh':'en'],`${fw} finding ${keys[Math.floor(i/2)]} ${i%2?'繁中':'English'}`,`${id}.findings.0.${keys[Math.floor(i/2)]}.${i%2?'zh':'en'}`);
  await m.getByRole('button',{name:'取消／放棄草稿',exact:true}).click();await expect(modal()).toHaveCount(0);
  await inspect(fw);await expect(modal().getByRole('textbox',{name:'標題',exact:true})).toHaveText(fw+' formatted history 富文字');
  for(let n=0;n<before.results.length;n++)for(let i=0;i<4;i++)await expect(fields(modal().locator('.inspection-item').nth(n)).nth(i)).toHaveText(`${fw} result ${n} ${keys[Math.floor(i/2)]} ${i%2?'繁中':'English'}`);
  await findings();for(let i=0;i<4;i++)await expect(fields(modal().locator('.inspection-finding')).nth(i)).toHaveText(`${fw} finding ${keys[Math.floor(i/2)]} ${i%2?'繁中':'English'}`);
  const savedLedger=await ledger();await fields(modal().locator('.inspection-finding')).first().fill('Discard this finding');await modal().getByRole('button',{name:'取消／放棄草稿',exact:true}).click();await expect(modal()).toHaveCount(0);assert.deepEqual(await ledger(),savedLedger);
 });
 await run('inspection-source-create-action-plan-format-cancel-zero-writes',async()=>{
  const before=await ledger();await inspect('TMSA',false);await findings();await modal().getByRole('button',{name:'建立改善（先確認再保存）',exact:true}).click();
  const action=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'確認由檢查發現建立改善',exact:true})});await expect(fields(action)).toHaveCount(1);await format(fields(action).first(),'Source action plan 來源改善計劃',{list:true});await image('desktop-source-action-plan');
  await action.getByRole('button',{name:'取消',exact:true}).click();await expect(modal()).toHaveCount(1);await modal().getByRole('button',{name:'關閉',exact:true}).click();await expect(modal()).toHaveCount(0);assert.deepEqual(await ledger(),before);
 });
 await run('fresh-peer-management-and-inspection-readback-touch-format-preserved',async()=>{
  const before=await ledger(),peer=await open({touch:true,role:'admin'});await management('TMSA',peer);await editButton('framework','TMSA',peer).click();
  const field=fields(modal(peer)).first();await expect(field).toHaveText('TMSA framework name English');await field.focus();await expect(peer.getByRole('toolbar')).toBeHidden();
  const styled=await field.evaluate((el,palette)=>{const color=document.createElement('span');color.style.color=palette;const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,count=0;while((node=walker.nextNode()))if(node.textContent.trim()){count++;const style=getComputedStyle(node.parentElement);if(style.color!==color.style.color||Number(style.fontWeight)<700)return false;}return count>0;},rich.RICH_COLORS.red);assert(styled,'Touch retains exact palette and bold on every text node');
  await image('tablet-framework-format-preserved',peer);assert(await peer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await modal(peer).getByRole('button',{name:'取消',exact:true}).click();await inspect('TMSA',false,peer);await findings(peer);await expect(modal(peer)).toContainText('TMSA finding observation English');await expect(modal(peer)).toContainText('IMMUTABLE <raw>');await expect(peer.getByRole('toolbar')).toHaveCount(0);await image('tablet-readonly-findings',peer);await modal(peer).getByRole('button',{name:'關閉',exact:true}).click();await peer.context().close();assert.deepEqual(await ledger(),before);
 });
 await run('unrelated-assessments-improvements-and-frozen-source-bytes-unchanged',async()=>{
  const final=await ledger(),untouched=r=>!['framework','chapter','item','inspection'].includes(r.kind)&&!(r.kind==='assessment'&&['item-a','item-dry'].includes(r.body.itemId));assert.deepEqual(final.records.filter(untouched),initial.records.filter(untouched));
  for(const itemId of ['item-a','item-dry']){const original=initial.records.find(r=>r.kind==='assessment'&&r.body.itemId===itemId);const now=await read('assessment',original.id);unchanged(now,original.body,['reviewed']);assert.equal(now.reviewed,false);}
  for(const old of initial.records.filter(r=>r.kind==='inspection')){const now=await read('inspection',old.id);assert.deepEqual(now.snapshot,old.body.snapshot);assert.deepEqual(now.findings.map(f=>f.sources),old.body.findings.map(f=>f.sources));}
  assert.equal(final.audit,initial.audit+10);assert.equal(final.operations,initial.operations+8);
 });
 assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.blocked,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:String(error.stack||error)};process.exitCode=1;if(page){await page.screenshot({path:join(out,'failure.png')}).catch(()=>{});writeFileSync(join(out,'failure-dom.txt'),await page.locator('body').innerText().catch(()=>''));}}
finally{
 const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};await browser?.close();await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;
 if(!Object.values(receipt.cleanup).every(Boolean)){receipt.status='FAIL';process.exitCode=1;}
 receipt.inputsAtEnd=hashes();receipt.changedInputs=inputFiles.filter(file=>receipt.inputsAtStart[file]!==receipt.inputsAtEnd[file]);writeReceipt();console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,richFields:receipt.fields.length,failure:receipt.failure,cleanup:receipt.cleanup,changedInputs:receipt.changedInputs,receipt:join(out,'receipt.json')}));
}
