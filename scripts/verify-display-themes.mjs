// Original App + real ApiClient + owned native PostgreSQL; synthetic data only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {root,syntheticSeed,sha256,checkedRpc} from './native-postgres.mjs';
import {randomUUID} from 'node:crypto';
import {startQaServer} from './qa-server.mjs';
import {encodeRichText,decodeRichText,richTextRuns,richTextToPlainText} from '../src/richText.ts';
const phase=process.argv.includes('--red')?'red':'green',baselinePath=process.argv.find(s=>s.startsWith('--baseline='))?.slice(11);
const out=join(root,'qa-evidence/display-themes',`${phase}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','scripts','supabase','package.json','package-lock.json','vite.config.ts','index.html'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>existsSync(join(root,p)));
const receipt={phase,layer:'Original App + synthetic fixtures + owned native PostgreSQL. Not hosted Supabase/Pages.',inputs:Object.fromEntries([...new Set(paths)].sort().map(p=>[p,sha256(readFileSync(join(root,p)))])),cases:[],screenshots:[],contrast:[],requests:[],errors:[],external:[]};
const persist=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
const base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
const colors=['black','red','blue','green'],lines=colors.map(c=>`${c} formatted text`),richPlain=lines.join('\n');let cursor=0;
const rich=encodeRichText({text:richPlain,spans:lines.map((text,i)=>{const span={start:cursor,end:cursor+text.length,bold:true,color:colors[i]};cursor+=text.length+1;return span;}),lists:[]});
const seed=syntheticSeed();
for(const a of seed.assessments){a.selfAssessment.en=rich;a.selfAssessment.zh='完整測試自評內容';a.evidence.en='Supporting evidence';}
seed.improvements=['TMSA','DRYBMS'].map((fw,n)=>({...base('theme-action-'+fw),title:'Theme action '+fw,content:{en:rich,zh:'觀察事項完整內容'},itemIds:[n?'item-dry':'item-a'],departmentIds:['marine'],assigneeIds:[],source:'non_external',urgency:n?'high':'urgent',status:'open',percent:30,targetDate:'2026-12-31',plan:'Existing plan',events:[{id:'prior-'+fw,at:'2026-01-01T00:00:00Z',by:'qa-owner',content:'Previous progress',status:'open',percent:30}],closedAt:null,closedBy:null,sources:[]}));
seed.inspections=[{...base('theme-inspection'),frameworkId:'TMSA',title:'Theme inspection',organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:structuredClone(seed.frameworks[0]),chapters:structuredClone(seed.chapters.filter(c=>c.frameworkId==='TMSA')),items:structuredClone(seed.items.filter(i=>i.frameworkId==='TMSA')),scoringVersion:'company-20-equal-stage-v1'},results:seed.items.filter(i=>i.frameworkId==='TMSA').map(i=>({itemId:i.id,response:'no',conformity:'none',reviewed:true,observation:{en:'',zh:''},recommendation:{en:'',zh:''}})),findings:[{id:'theme-finding',itemIds:['item-a'],classification:'finding',observation:{en:rich,zh:'歷史觀察內容'},recommendation:{en:'Original recommendation',zh:'保留歷史建議'},sources:[]}]}];
const pages=['總覽','TMSA','DRYBMS','待改善項目','歷史檢查記錄','報告中心','管理'];
let qa,vite,browser,page,current='setup',ui;
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const snap=async name=>{const path=join(out,name+'.png');await page.screenshot({path,fullPage:false});receipt.screenshots.push(path);};
const run=async(id,fn)=>{current=id;try{receipt.cases.push({id,status:'PASS',...await fn()});}catch(error){receipt.cases.push({id,status:'FAIL',message:error.message});throw error;}finally{persist();}};
const nav=async name=>{await page.locator('.main-nav').getByRole('button',{name,exact:true}).click();await expect(page.locator('.page-heading')).toBeVisible();};
const pick=()=>page.getByRole('combobox',{name:/^(顯示模式|Display mode)$/});
const theme=async value=>{await pick().selectOption(value);await expect(page.locator('html')).toHaveAttribute('data-theme',value);};
const palette=()=>page.evaluate(()=>Object.fromEntries(['html','.app-header','.main-nav','.main-nav>button.active','.panel','.data-table','.data-table th','input','.btn.primary','.btn.neutral','.notice','.item-detail','.bilingual>div+div','.app-footer'].map(selector=>{const n=document.querySelector(selector);if(!n)return [selector,null];const s=getComputedStyle(n);return [selector,{color:s.color,background:s.backgroundColor,border:s.borderTopColor,fontSize:s.fontSize}];})));
const contrast=async()=>{
 const result=await page.evaluate(()=>{
  const rgba=s=>{const m=s.match(/[\d.]+/g)?.map(Number)??[];return [m[0]??0,m[1]??0,m[2]??0,m[3]??1];};
  const over=(fg,bg)=>[0,1,2].map(i=>fg[i]*fg[3]+bg[i]*(1-fg[3])).concat(1);
  const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const failures=[];let checked=0,min=100;
  for(const n of document.querySelectorAll('body *')){
   if(!n.getClientRects().length||getComputedStyle(n).visibility!=='visible'||n.closest('[aria-hidden="true"]'))continue;
   const own=[...n.childNodes].filter(x=>x.nodeType===Node.TEXT_NODE).map(x=>x.textContent).join('').trim();
   const control=n.matches('input:not([type=checkbox]):not([type=radio]),select,textarea');if(!own&&!control)continue;
   if(n.matches('script,style,option,summary')&&!own)continue;
   const chain=[];for(let p=n;p;p=p.parentElement)chain.unshift(p);
   let bg=[255,255,255,1],opacity=1;for(const p of chain){const s=getComputedStyle(p);bg=over(rgba(s.backgroundColor),bg);opacity*=Number(s.opacity);}
   const s=getComputedStyle(n),fg=rgba(s.webkitTextFillColor||s.color);fg[3]*=opacity;const a=lum(over(fg,bg)),b=lum(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   const symbolic=/^[\s★☆●◉▾▸←→×+＋−–%]+$/.test(own);const threshold=symbolic?3:4.5;checked++;min=Math.min(min,ratio);
   if(ratio+0.01<threshold)failures.push({tag:n.tagName,cls:n.className,text:(own||n.getAttribute('aria-label')||n.value||'control').slice(0,80),color:s.color,textFill:s.webkitTextFillColor,bg,ratio:Math.round(ratio*100)/100});
  }
  return {checked,minRatio:Math.round(min*100)/100,failures};
 });
 receipt.contrast.push({case:current,...result});assert(result.checked>0);assert.deepEqual(result.failures,[],JSON.stringify(result.failures.slice(0,12)));return result.checked;
};
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17});await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/018_person_department_heads.sql'),'utf8'));
 // The initial importer predates remarks (migration 012); seed them through the current RPC after migration.
 for(const a of seed.assessments){
  const user=qa.users.owner,call=(action,payload)=>checkedRpc(qa.db,action,payload,user.sessionToken,user.clientId);
  const old=(await qa.db.setup.query("select body from compliance_private.records where kind='assessment' and id=$1",[a.id])).rows[0].body;
  const lease=await call('claim',{kind:'assessment',id:old.id,intent:'update'});
  await call('save',{kind:'assessment',record:{...old,remarks:rich,remarksStatus:'partial_improvable'},expectedVersion:old.version,leaseToken:lease.token,intent:'update',operationId:randomUUID()});
  await call('release',{kind:'assessment',id:old.id,leaseToken:lease.token});
 }
 const ledger=async()=>(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows;
 const record=async id=>(await qa.db.setup.query("select body from compliance_private.records where kind='assessment' and id=$1",[id])).rows[0].body;
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async({authenticated=true,lang='zh',width=1440,os='light',savedTheme,storageDenied=false}={})=>{
  const context=await browser.newContext({viewport:{width,height:width<700?844:1000},colorScheme:os});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(![ui,qa.url].includes(u.origin)){receipt.external.push(u.origin);return r.abort();}if(u.origin===qa.url&&r.request().method()==='POST'){const b=r.request().postDataJSON();receipt.requests.push({case:current,action:b.p_action,id:b.p_payload.id??b.p_payload.record?.id});}return r.continue();});
  await context.addInitScript(({config,user,authenticated,lang,savedTheme,storageDenied})=>{
   if(!sessionStorage.getItem('theme-qa-initialized')){localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language',lang);if(savedTheme!==undefined)localStorage.setItem('fpmc-compliance-theme',savedTheme);if(authenticated){sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));}sessionStorage.setItem('theme-qa-initialized','1');}
   if(storageDenied){const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(k){if(k==='fpmc-compliance-theme')throw new DOMException('Denied','SecurityError');return get.call(this,k);};Storage.prototype.setItem=function(k,v){if(k==='fpmc-compliance-theme')throw new DOMException('Denied','QuotaExceededError');return set.call(this,k,v);};}
  },{config:qa.config,user:qa.users.owner,authenticated,lang,savedTheme,storageDenied});
  const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>receipt.errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(ui);await p.locator(authenticated?'.main-nav':'.login-card').waitFor();return p;
 };
 page=await open();const initial=await ledger(),normal={};
 await run('NORMAL-SEVEN-PAGES-BASELINE',async()=>{
  for(const name of pages){await nav(name);normal[name]=await palette();}
  await nav('TMSA');await page.emulateMedia({media:'print'});normal.print=await palette();await page.emulateMedia({media:'screen'});
  writeFileSync(join(out,'normal-baseline.json'),JSON.stringify(normal,null,2));
  if(baselinePath)assert.deepEqual(normal,JSON.parse(readFileSync(baselinePath,'utf8')),'Normal colors/typography and print must match the pre-feature baseline');
  await snap('normal-baseline');assert.deepEqual(await ledger(),initial);
 });
 await run('MODE-CONTROL-ADJACENT-TO-LANGUAGE',async()=>{
  await expect(pick()).toBeVisible();await expect(pick().locator('option')).toHaveText(['正常','暗黑','護眼']);await expect(pick()).toHaveValue('normal');
  const aligned=await pick().evaluate(n=>{const l=document.querySelector('.language-button'),a=n.getBoundingClientRect(),b=l.getBoundingClientRect();return Math.abs(a.top-b.top)<8&&a.left>=b.right&&a.left-b.right<=20;});assert(aligned,'mode picker must be beside language control');
 });
 const fingerprints=[];
 for(const value of ['normal','dark','eye'])for(const name of pages)await run(`PAGE-${value}-${name}`,async()=>{
  await theme(value);await nav(name);let checked=0;if(value!=='normal')checked=await contrast();if(name==='TMSA'){fingerprints.push(await palette());await snap(value+'-TMSA');}assert.deepEqual(await ledger(),initial);return {checked};
 });
 assert.equal(new Set(fingerprints.map(x=>JSON.stringify(x))).size,3,'three perceptibly distinct palettes');
 for(const value of ['dark','eye'])await run(`EDITOR-MENU-AND-MODALS-${value}`,async()=>{
  await theme(value);await nav('TMSA');await page.getByRole('button',{name:'修改',exact:true}).click();await page.getByRole('textbox',{name:'Self Assessment English',exact:true}).focus();await expect(page.getByRole('toolbar')).toBeVisible();await contrast();await snap(value+'-editor');
  for(const label of ['保存','取消編輯']){const button=page.getByRole('button',{name:label,exact:true});await button.hover();await contrast();await button.focus();await contrast();}
  const menu=page.locator('.responsibility-controls .multi-select-dropdown');await menu.locator('summary').click();await contrast();await menu.locator('summary').click();
  for(const status of ['fully_met','partial_improvable','partial_blocked','not_met_improvable','not_met_blocked']){await page.getByLabel('備註狀態',{exact:true}).selectOption(status);await contrast();}
  await page.getByRole('button',{name:'取消編輯',exact:true}).click();assert.deepEqual(await ledger(),initial);
  await page.locator('.linked-improvement-table').getByRole('button',{name:'結案',exact:true}).first().click();await expect(page.getByRole('dialog').getByRole('region',{name:'完整改善內容'})).toBeVisible();await contrast();await snap(value+'-close');await page.getByRole('button',{name:'取消／放棄草稿',exact:true}).click();assert.deepEqual(await ledger(),initial);
  await nav('歷史檢查記錄');await page.getByRole('button',{name:'Theme inspection',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await contrast();await snap(value+'-history');await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await nav('待改善項目');await page.getByRole('button',{name:'新增改善',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'確認保存',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();await contrast();await snap(value+'-validation');await page.getByRole('button',{name:'取消／放棄草稿',exact:true}).click();assert.deepEqual(await ledger(),initial);
 });
 await run('SWITCH-WITH-DRAFT-AND-RICH-NATIVE-ROUNDTRIP',async()=>{
  await theme('normal');await nav('TMSA');await page.getByRole('button',{name:'修改',exact:true}).click();const field=page.getByRole('textbox',{name:'Self Assessment English',exact:true});await field.evaluate(n=>{window.__themeField=n;});
  const claims=receipt.requests.filter(r=>r.action==='claim').length;
  for(const value of ['dark','eye','normal','dark']){await theme(value);assert(await field.evaluate(n=>n===window.__themeField));await expect(field).toHaveText(richPlain,{useInnerText:true});assert.equal(receipt.requests.filter(r=>r.action==='claim').length,claims);assert.deepEqual(await ledger(),initial);}
  await field.press('Control+End');await page.keyboard.insertText(' appended');
  for(const [label,color] of [['Self Assessment Chinese','紅色'],['Evidence English','藍色'],['Evidence Chinese','黑色'],['備註','綠色']]){const input=page.getByRole('textbox',{name:label,exact:true});await input.fill('Theme '+color);await input.press('Control+a');await page.getByRole('toolbar').getByRole('button',{name:color,exact:true}).click();}
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('button',{name:'修改',exact:true})).toBeVisible();const saved=await record('assessment-item-a');assert.equal(richTextToPlainText(saved.selfAssessment.en),richPlain+' appended');
  const before=decodeRichText(rich),after=decodeRichText(saved.selfAssessment.en);for(const s of before.spans){const actual=after.spans.find(x=>x.start===s.start);assert(actual&&actual.color===s.color&&actual.bold===s.bold);}
  for(const [fieldValue,color] of [[saved.selfAssessment.zh,'red'],[saved.evidence.en,'blue'],[saved.evidence.zh,'black'],[saved.remarks,'green']])assert(richTextRuns(fieldValue).some(r=>r.color===color));
  await theme('normal');await page.reload();await page.locator('.main-nav').waitFor();await nav('TMSA');assert.deepEqual(await record('assessment-item-a'),saved);await expect(page.locator('.assessment-column')).toContainText('appended');
  assert.equal(receipt.requests.filter(r=>r.case===current&&r.action==='save').length,1);assert.deepEqual((await ledger()).filter(r=>r.id!=='assessment-item-a'),initial.filter(r=>r.id!=='assessment-item-a'));
 });
 for(const value of ['normal','dark','eye'])await run(`PRINT-UNAFFECTED-${value}`,async()=>{
  await theme(value);await page.emulateMedia({media:'print'});await expect(page.locator('.main-nav')).toBeHidden();
  // Hidden navigation can retain Chromium's prior :hover state; compare printed colors, not that invisible state.
  const actual=await palette(),expected={...normal.print};delete actual['.main-nav>button.active'];delete expected['.main-nav>button.active'];assert.deepEqual(actual,expected);
  const richColors=await page.locator('.rich-text-content [data-rich-color]').evaluateAll(nodes=>nodes.map(n=>({saved:n.style.color,printed:getComputedStyle(n).color})));
  assert(richColors.length>0);for(const color of richColors)assert.equal(color.printed,color.saved,'Print must retain canonical saved rich-text color');
  await page.emulateMedia({media:'screen'});
 });
 await page.context().close();
 for(const lang of ['zh','en'])for(const value of ['normal','dark','eye'])await run(`MOBILE-${lang}-${value}`,async()=>{
  page=await open({lang,width:390,os:'dark',savedTheme:value});await expect(pick()).toHaveValue(value);await expect(page.locator('html')).toHaveAttribute('data-theme',value);assert.equal(await page.locator('html').evaluate(n=>getComputedStyle(n).colorScheme),value==='dark'?'dark':'light');await page.locator('.main-nav').getByRole('button',{name:'TMSA',exact:true}).click();if(value!=='normal')await contrast();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await snap(current);await page.context().close();
 });
 await run('PREFERENCE-RELOAD-INVALID-AND-STORAGE-DENIAL',async()=>{
  page=await open({savedTheme:'invalid',os:'dark'});await expect(pick()).toHaveValue('normal');await theme('eye');await page.reload();await page.locator('.main-nav').waitFor();await expect(pick()).toHaveValue('eye');await page.getByRole('button',{name:'Switch language',exact:true}).click();await expect(pick().locator('option')).toHaveText(['Normal','Dark','Eye care']);await expect(pick()).toHaveValue('eye');await page.context().close();
  page=await open({storageDenied:true});await expect(pick()).toHaveValue('normal');await theme('dark');await expect(pick()).toHaveValue('dark');await page.context().close();
 });
 for(const value of ['normal','dark','eye'])await run(`GATE-${value}`,async()=>{page=await open({authenticated:false,savedTheme:value});await expect(pick()).toHaveValue(value);if(value!=='normal')await contrast();await snap(current);await page.context().close();});
 assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.external,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:error.message};if(page&&!page.isClosed())await snap('failure').catch(()=>{});process.exitCode=1;}
finally{
 const ports=[qa?.db.port,qa?.server.address()?.port,vite?.httpServer.address()?.port].filter(Boolean);await browser?.close();await vite?.close();await qa?.stop();
 receipt.cleanup={browserClosed:browser?!browser.isConnected():true,portsStopped:await Promise.all(ports.map(closed)),retained:true};receipt.inputsUnchanged=Object.entries(receipt.inputs).every(([p,h])=>existsSync(join(root,p))&&sha256(readFileSync(join(root,p)))===h);
 if(!receipt.inputsUnchanged||receipt.cleanup.portsStopped.some(x=>!x)){receipt.status='FAIL';process.exitCode=1;}persist();console.log(JSON.stringify({status:receipt.status,passed:receipt.cases.filter(c=>c.status==='PASS').length,failure:receipt.failure,receipt:join(out,'receipt.json'),baseline:join(out,'normal-baseline.json'),cleanup:receipt.cleanup}));
}
