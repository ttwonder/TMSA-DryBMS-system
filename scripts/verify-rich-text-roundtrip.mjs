// Original App + synthetic fixtures + owned native PostgreSQL. No hosted calls.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
import {isRichText,richTextRuns,richTextToPlainText} from '../src/richText.ts';
const out=join(root,'qa-evidence','rich-text-roundtrip',new Date().toISOString().replaceAll(':','-'));mkdirSync(out,{recursive:true});
const receipt={layer:'Original App + synthetic data + owned native PostgreSQL; NOT hosted Supabase/Pages',status:'RUNNING',cases:[],errors:[],blocked:[],screenshots:[],downloads:[],fields:[]};
const seed=syntheticSeed(),base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
for(const a of seed.assessments){a.selfAssessment.en='Initial\n\n  untouched';a.evidence.zh='原有佐證\n\n保留空白行';}
seed.improvements=['TMSA','DRYBMS'].map((fw,index)=>({...base('rich-action-'+fw),title:'Original action '+fw+'\n原始改善',content:{en:'Original content\n\n  retained',zh:'原有內容'},itemIds:[index?'item-dry':'item-a'],departmentIds:['marine'],assigneeIds:[],source:'non_external',urgency:'medium',status:'open',percent:0,targetDate:'',plan:'Original plan\n\n  retained',events:[],closedAt:null,closedBy:null,sources:[]}));
let qa,vite,browser,page,current='setup',releaseSave,holdSave=false,saveHeld=false,ui,peer;
const run=async(name,fn)=>{current=name;await fn();receipt.cases.push({name,status:'PASS'});writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log('PASS',name);};
const record=async(kind,id)=>(await qa.db.setup.query('select body from compliance_private.records where kind=$1 and id=$2',[kind,id])).rows[0]?.body;
const ledger=async()=>(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows;
const isClosed=port=>new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));});
const text=(label,p=page)=>p.getByRole('textbox',{name:label,exact:true});
const modal=()=>page.getByRole('dialog');
const nav=async(name,p=page)=>{await p.locator('.main-nav').getByRole('button',{name,exact:true}).click();};
const image=async name=>{const path=join(out,name+'.png');await page.screenshot({path,fullPage:true});receipt.screenshots.push(path);};
const assertRich=(value,plain,color='red')=>{assert.equal(richTextToPlainText(value),plain);assert(isRichText(value),plain+' format absent');assert(richTextRuns(value).some(r=>r.bold&&r.color===color),plain+' bold/color absent');};
const format=async(field,value,color='紅色',list)=>{
 await field.fill(value);await field.press('Control+a');const bar=page.getByRole('toolbar');await expect(bar).toBeVisible();await expect(bar).toHaveCount(1);await bar.getByRole('button',{name:color,exact:true}).click();
 const bold=bar.getByRole('button',{name:'加粗',exact:true});if(await bold.getAttribute('aria-pressed')!=='true')await bold.click();if(list)await bar.getByRole('button',{name:list,exact:true}).click();
 receipt.fields.push({case:current,label:await field.getAttribute('aria-label'),value,color,list:list??null});
};
const cancelModal=async()=>{await modal().getByRole('button',{name:/^(取消|取消／放棄草稿|關閉)$/}).last().click();await expect(modal()).toHaveCount(0);};
const saveModal=async()=>{await modal().getByRole('button',{name:'確認保存',exact:true}).click();await expect(modal()).toHaveCount(0);};
const download=async(button,name)=>{const waiting=page.waitForEvent('download',{timeout:90000});await button.click();const d=await waiting,path=join(out,name);await d.saveAs(path);assert(statSync(path).size>1000);assert(!d.suggestedFilename().includes('\u001eRT1:'));receipt.downloads.push({path,size:statSync(path).size,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')});};
const inputPaths=['src/RichTextEditor.tsx','src/richText.ts','src/richText.css','src/themes.css','src/FrameworkPage.tsx','src/Improvements.tsx','src/useRecordEditor.ts','src/reports.ts','scripts/verify-rich-text-roundtrip.mjs'];
const fingerprints=()=>Object.fromEntries(inputPaths.map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));receipt.inputsBefore=fingerprints();
const pointerSnapshot=field=>field.evaluate(async root=>{const core=await import('/src/richText.ts'),raw=core.encodeRichText(core.editorElementToDocument(root)),s=getSelection();return{raw,runs:core.richTextRuns(raw),collapsed:s?.isCollapsed,selected:s?.toString(),focused:document.activeElement===root};});
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17,afterCommit:async({action,clientId})=>{if(action==='save'&&clientId===qa.users.owner.clientId&&holdSave){holdSave=false;saveHeld=true;await new Promise(resolve=>{releaseSave=resolve;});}return false;}});
 await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/018_person_department_heads.sql'),'utf8'));
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async(role='owner',options={})=>{
  const ctx=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true,...options});
  await ctx.route('**/*',route=>{const url=new URL(route.request().url());if(![ui,qa.url].includes(url.origin)){receipt.blocked.push(url.origin);return route.abort();}return route.continue();});
  await ctx.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users[role]});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>receipt.errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();return p;
 };
 page=await open();
 await nav('待改善項目');
 const openProgress=async()=>{await page.locator('.improvement-table tbody tr').filter({hasText:'Original action TMSA'}).getByRole('button',{name:'直接更新',exact:true}).click();return text('本次新增進度（保存前可修改）');};
 const pointerBefore=await ledger();
 for(const mode of ['eye','normal','dark']){
  await page.getByRole('combobox',{name:'顯示模式',exact:true}).selectOption(mode);const field=await openProgress();
  for(const [label,color] of [['紅色','red'],['藍色','blue'],['綠色','green'],['黑色','black']])await run(`progress-${mode}-${color}-select-all-click-text-and-blank-no-recolor`,async()=>{
   const plain='盡快按照其建議進行購買和配置';await field.fill(plain);await field.press('Control+a');await page.getByRole('toolbar').getByRole('button',{name:label,exact:true}).click();
   const before=await pointerSnapshot(field);assert.deepEqual(before.runs,[{text:plain,color}]);
   await page.evaluate(()=>{window.__pointerTrace=[];document.addEventListener('click',e=>window.__pointerTrace.push({tag:e.target.tagName,label:e.target.getAttribute?.('aria-label'),detail:e.detail,selected:getSelection()?.toString()}),{capture:true,signal:(window.__pointerAbort=new AbortController()).signal});});
   await field.click({position:{x:40,y:15}});const after=await pointerSnapshot(field);receipt.lastPointer={case:current,before,after,trace:await page.evaluate(()=>{window.__pointerAbort.abort();return window.__pointerTrace;})};
   assert.equal(after.collapsed,true,'Clicking progress text must collapse select-all');assert.equal(after.focused,true);assert.deepEqual(after.runs,before.runs,'Caret placement must not change progress color');
   await field.press('Control+a');const box=await field.boundingBox();await field.click({position:{x:box.width-20,y:box.height-20}});const blank=await pointerSnapshot(field);assert.equal(blank.collapsed,true);assert.equal(blank.focused,true);assert.deepEqual(blank.runs,before.runs);
   await field.click({position:{x:40,y:15}});assert.deepEqual((await pointerSnapshot(field)).runs,before.runs,'Clicking without a selection must not force black');
   await field.press('Control+End');await page.keyboard.insertText('。');assert.deepEqual((await pointerSnapshot(field)).runs,[{text:plain+'。',color}]);assert.deepEqual(await ledger(),pointerBefore);
  });
  await run(`progress-${mode}-pointer-selection-cancel-zero-write`,async()=>{
   await field.fill('Alpha beta gamma');await field.press('Control+a');await page.getByRole('toolbar').getByRole('button',{name:'紅色',exact:true}).click();
   await field.click({position:{x:40,y:15}});assert.equal((await pointerSnapshot(field)).collapsed,true);
   const points=await field.evaluate(root=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),node=w.nextNode();return[2,6].map(offset=>{const r=document.createRange();r.setStart(node,offset);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};});});
   await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:6});await page.mouse.up();assert.equal(await page.evaluate(()=>getSelection()?.toString()),'pha ');
   await page.getByRole('toolbar').getByRole('button',{name:'藍色',exact:true}).click();assert.deepEqual((await pointerSnapshot(field)).runs,[{text:'Al',color:'red'},{text:'pha ',color:'blue'},{text:'beta gamma',color:'red'}]);
   await field.press('Control+a');await page.getByRole('toolbar').getByRole('button',{name:'綠色',exact:true}).click();assert.deepEqual((await pointerSnapshot(field)).runs,[{text:'Alpha beta gamma',color:'green'}]);
   await image('progress-pointer-'+mode);await cancelModal();assert.deepEqual(await ledger(),pointerBefore);
  });
 }
 await page.getByRole('combobox',{name:'顯示模式',exact:true}).selectOption('eye');
 await run('progress-pointer-formatted-native-save-held-ACK-and-reload',async()=>{
  const before=await record('improvement','rich-action-TMSA'),field=await openProgress();await field.fill('保存後仍保留顏色');await field.press('Control+a');await page.getByRole('toolbar').getByRole('button',{name:'綠色',exact:true}).click();const box=await field.boundingBox();await field.click({position:{x:box.width-20,y:box.height-20}});await page.keyboard.insertText('。');
  const expected=await pointerSnapshot(field);assert.deepEqual(expected.runs,[{text:'保存後仍保留顏色。',color:'green'}]);holdSave=true;saveHeld=false;await modal().getByRole('button',{name:'確認保存',exact:true}).click();await expect.poll(()=>saveHeld).toBe(true);await expect(modal()).toBeVisible();await expect(field).toHaveAttribute('contenteditable','false');await expect(page.getByRole('toolbar')).toHaveCount(0);
  const saved=await record('improvement','rich-action-TMSA');assert.equal(saved.events.at(-1).content,expected.raw);assert.deepEqual(saved.events.slice(0,-1),before.events);for(const key of Object.keys(before))if(!['events','version','updatedAt','updatedBy'].includes(key))assert.deepEqual(saved[key],before[key]);
  releaseSave();releaseSave=null;await expect(modal()).toHaveCount(0);await page.reload();await page.locator('.main-nav').waitFor();await nav('待改善項目');await openProgress();await expect(text('本次新增進度（保存前可修改）')).toBeEmpty();await expect(modal().locator('.progress-history [data-rich-color="green"]')).toHaveText('保存後仍保留顏色。');await cancelModal();assert.deepEqual(await record('improvement','rich-action-TMSA'),saved);
 });
 await page.getByRole('combobox',{name:'顯示模式',exact:true}).selectOption('normal');
 await nav('TMSA');await page.getByRole('button',{name:'修改',exact:true}).click();
 await run('focus-small-toolbar-no-overlap-and-cancel-zero-write',async()=>{const before=await ledger(),field=text('Self Assessment English');await field.focus();const a=await field.boundingBox(),b=await page.getByRole('toolbar').boundingBox();assert(b.height<=38);assert(b.y+b.height<=a.y+1);receipt.toolbar=b;await image('laptop-toolbar');await format(text('備註'),'Cancel marker');await page.evaluate(()=>{window.__clicks=[];for(const e of ['pointerdown','mousedown','blur','pointerup','mouseup','click'])document.addEventListener(e,x=>window.__clicks.push({type:e,target:x.target?.textContent?.slice(0,50),scrollY}),true);});await page.getByRole('button',{name:'取消編輯',exact:true}).click();receipt.cancelEvents=await page.evaluate(()=>window.__clicks);await expect(page.getByRole('button',{name:'修改',exact:true})).toBeVisible();assert.deepEqual(await ledger(),before);await expect(page.getByRole('toolbar')).toHaveCount(0);});
 for(const fw of ['TMSA','DRYBMS'])await run(fw+'-all-assessment-fields-native-save-reopen-peer',async()=>{
  await nav(fw);await page.getByRole('button',{name:'修改',exact:true}).click();
  for(const [label,value] of [['Self Assessment English',fw+' Self English'],['Self Assessment Chinese',fw+' 自評繁中'],['Evidence English',fw+' Evidence English'],['Evidence Chinese',fw+' 佐證繁中']])await format(text(label),value);
  await format(text('備註'),fw+' Remarks first\n'+fw+' Remarks second','藍色','項目符號');holdSave=true;saveHeld=false;await page.getByRole('button',{name:'保存',exact:true}).click();await expect.poll(()=>saveHeld).toBe(true);
  await expect(text('Self Assessment English')).toHaveAttribute('contenteditable','false');await expect(page.getByRole('toolbar')).toHaveCount(0);releaseSave();releaseSave=null;await expect(page.getByRole('button',{name:'修改',exact:true})).toBeVisible();
  const id=fw==='TMSA'?'assessment-item-a':'assessment-item-dry',saved=await record('assessment',id);assertRich(saved.selfAssessment.en,fw+' Self English');assertRich(saved.selfAssessment.zh,fw+' 自評繁中');assertRich(saved.evidence.en,fw+' Evidence English');assertRich(saved.evidence.zh,fw+' 佐證繁中');assertRich(saved.remarks,'• '+fw+' Remarks first\n• '+fw+' Remarks second','blue');assert.equal(saved.response,'no');assert.equal(saved.reviewed,false);
  peer??=await open('peer');await peer.reload();await peer.locator('.main-nav').waitFor();await nav(fw,peer);await expect(peer.locator('.assessment-column')).toContainText(fw+' Self English');assert(await peer.locator('.assessment-column span[style*="color"]').count()>0);await expect(peer.getByRole('toolbar')).toHaveCount(0);
  await page.getByRole('button',{name:'修改',exact:true}).click();await expect(text('Self Assessment English')).toHaveText(fw+' Self English');await expect(text('備註').locator('ul > li')).toHaveCount(2);await page.getByRole('button',{name:'取消編輯',exact:true}).click();assert.deepEqual(await record('assessment',id),saved);
 });
 await run('dry-score-note-save-numerics-unchanged',async()=>{const before=await record('dryScore','dry-score');await page.getByRole('button',{name:'調整百分比',exact:true}).click();await format(text('評定說明'),'DRY score note','綠色');await page.getByRole('button',{name:'保存百分比',exact:true}).click();await expect(page.getByRole('button',{name:'調整百分比',exact:true})).toBeVisible();const saved=await record('dryScore','dry-score');assertRich(saved.note,'DRY score note','green');assert.deepEqual(saved.levels,before.levels);});
 await run('lease-conflict-no-second-editor',async()=>{await nav('TMSA');await page.getByRole('button',{name:'修改',exact:true}).click();await nav('TMSA',peer);await peer.getByRole('button',{name:'修改',exact:true}).click();await expect(peer.locator('.notice.error,.toast.error').first()).toBeVisible();await expect(peer.locator('.rich-editor-input[contenteditable="true"]')).toHaveCount(0);await page.getByRole('button',{name:'取消編輯',exact:true}).click();});
 await run('improvement-title-content-plan-save-and-reopen',async()=>{
  await nav('待改善項目');await page.locator('.improvement-table tbody tr').filter({hasText:'Original action TMSA'}).getByRole('button',{name:'完整編輯',exact:true}).click();
  for(const [label,value] of [['標題（英文）','Rich action TMSA'],['標題（繁中）','富文字改善'],['內容（英文）','Rich action content'],['內容（繁中）','富文字內容'],['改善計劃','Rich action plan']])await format(text(label),value);
  await saveModal();const saved=await record('improvement','rich-action-TMSA');assertRich(saved.title,'Rich action TMSA\n富文字改善');assertRich(saved.content.en,'Rich action content');assertRich(saved.content.zh,'富文字內容');assertRich(saved.plan,'Rich action plan');
  await page.locator('.improvement-table tbody tr').filter({hasText:'Rich action TMSA'}).getByRole('button',{name:'完整編輯',exact:true}).click();await expect(text('標題（英文）')).toHaveText('Rich action TMSA');await expect(text('標題（繁中）')).toHaveText('富文字改善');await cancelModal();assert.deepEqual(await record('improvement','rich-action-TMSA'),saved);
 });
 for(const [action,expected] of [['直接更新','open'],['結案','closed'],['重開','open']])await run('improvement-event-'+action+'-format-and-history',async()=>{
  const before=await record('improvement','rich-action-TMSA');await page.locator('.improvement-table tbody tr').filter({hasText:'Rich action TMSA'}).getByRole('button',{name:action,exact:true}).click();await format(text('本次新增進度（保存前可修改）'),'Progress '+action,'綠色','編號清單');await saveModal();const saved=await record('improvement','rich-action-TMSA');assert.equal(saved.status,expected);assert.deepEqual(saved.events.slice(0,-1),before.events);assertRich(saved.events.at(-1).content,'1. Progress '+action,'green');assert.equal(saved.title,before.title);assert.equal(saved.plan,before.plan);
 });
 for(const fw of ['TMSA','DRYBMS'])await run(fw+'-inline-create-update-cancel-zero-write',async()=>{await nav(fw);const before=await ledger();await page.getByRole('button',{name:'＋增加',exact:true}).click();await format(text('標題（英文）'),fw+' inline title');await cancelModal();await page.locator('.linked-improvements').getByRole('button',{name:'更新',exact:true}).first().click();await format(text('本次新增進度（保存前可修改）'),fw+' inline progress');await cancelModal();assert.deepEqual(await ledger(),before);});
 await run('search-has-plain-content-no-metadata',async()=>{await nav('待改善項目');await text('搜尋').fill('Rich action content');await expect(page.locator('.improvement-table tbody tr')).toHaveCount(1);assert(!(await page.locator('body').innerText()).includes('\u001eRT1:'));await text('搜尋').fill('');});
 await run('real-authorized-framework-pdf-xlsx-download',async()=>{await nav('TMSA');await download(page.locator('.page-heading').getByRole('button',{name:'PDF',exact:true}),'ui-framework.pdf');await download(page.locator('.page-heading').getByRole('button',{name:'Excel',exact:true}),'ui-framework.xlsx');});
 await run('touch-edit-retains-format-no-toolbar',async()=>{
  const laptop=page;page=await open('operator',{viewport:{width:390,height:844},isMobile:true,hasTouch:true});await nav('TMSA');await page.getByRole('button',{name:'修改',exact:true}).click();const before=await record('assessment','assessment-item-a'),field=text('Self Assessment English');await field.focus();await expect(page.getByRole('toolbar')).not.toBeVisible();assert(await field.locator('b,strong').count()>0);await field.press('Control+End');await page.keyboard.insertText(' touch');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('button',{name:'修改',exact:true})).toBeVisible();const saved=await record('assessment','assessment-item-a');assert.equal(richTextToPlainText(saved.selfAssessment.en),'TMSA Self English touch');assert(isRichText(saved.selfAssessment.en));assert.equal(saved.evidence.zh,before.evidence.zh);const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(geometry.scroll<=geometry.width+1);receipt.mobile=geometry;await image('touch-readonly');await page.close();page=laptop;
 });
 await run('untouched-legacy-exact-bytes',async()=>{const a=await record('assessment','assessment-item-b');assert.equal(a.selfAssessment.en,'Initial\n\n  untouched');assert.equal(a.evidence.zh,'原有佐證\n\n保留空白行');const b=await record('improvement','rich-action-DRYBMS');assert.equal(b.plan,'Original plan\n\n  retained');assert.equal(b.content.en,'Original content\n\n  retained');});
 assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.blocked,[]);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:String(error.message).slice(0,2200)};if(page){const path=join(out,'failure.png');await page.screenshot({path,fullPage:true}).catch(()=>{});receipt.screenshots.push(path);}process.exitCode=1;
}finally{
 releaseSave?.();const ports=[qa?.db.port,qa?.server.address()?.port,vite?.httpServer.address()?.port].filter(Boolean);await browser?.close();await vite?.close();await qa?.stop();receipt.portsClosed=await Promise.all(ports.map(isClosed));
 receipt.inputs=fingerprints();receipt.inputsUnchanged=JSON.stringify(receipt.inputsBefore)===JSON.stringify(receipt.inputs);if(!receipt.inputsUnchanged||receipt.portsClosed.some(closed=>!closed)){receipt.status='FAIL';process.exitCode=1;}
 writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,fields:receipt.fields.length,failure:receipt.failure,portsClosed:receipt.portsClosed,receipt:join(out,'receipt.json')}));
}
