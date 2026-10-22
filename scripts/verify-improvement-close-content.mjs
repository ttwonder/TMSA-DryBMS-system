// Original App + real ApiClient + owned native PostgreSQL. Synthetic data only.
// Scope: selected closure context, rich/bilingual display, cancel and existing ACK flow.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed,sha256} from './native-postgres.mjs';
import {encodeRichText,richTextToPlainText,compactRichText} from '../src/richText.ts';

const phase=process.argv.includes('--red')?'red':'green';
const out=join(root,'qa-evidence/improvement-close-content',`${phase}-${new Date().toISOString().replaceAll(':','-')}`);
mkdirSync(out,{recursive:true});
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','scripts','supabase','package.json','package-lock.json','vite.config.ts','index.html'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>existsSync(join(root,f)));
const receipt={phase,layer:'Original App / real ApiClient / owned native PostgreSQL / synthetic data. Not hosted acceptance.',inputs:Object.fromEntries([...new Set(files)].sort().map(f=>[f,sha256(readFileSync(join(root,f)))])),cases:[],screenshots:[],requests:[],errors:[],blockedExternal:0};
const persist=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
const base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
const rich=(text,color)=>encodeRichText({text,spans:[{start:0,end:text.indexOf('\n'),bold:true,color}],lists:[]});
const content=fw=>({
 en:rich(`Check the ${fw} cargo-handling procedure.\n\n1. Verify the operating instructions for a newly introduced chemical cargo.\n2. Confirm responsibility and retain the supporting records.\nFinal observation line ${fw}.`,'red'),
 zh:rich(`核對 ${fw} 貨物作業程序。\n\n1. 引入新的化學品貨物時，須核對現行操作指引及相關程序。\n2. 確認負責人及保存完整佐證紀錄。\n最後一行觀察內容 ${fw}。`,'blue')
});
const provenance=[{source:'Synthetic provenance',file:'INTERNAL_SOURCE_FILE.json',pages:[62,63],note:'Source record: INTERNAL_LOCATOR_ONLY; closure unverified; import note.'}];
const seed=syntheticSeed();
seed.inspections=['TMSA','DRYBMS'].map(fw=>{
 const items=seed.items.filter(i=>i.frameworkId===fw);
 return {...base('close-source-'+fw),frameworkId:fw,title:'Synthetic inspection '+fw,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,
  snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===fw)),chapters:structuredClone(seed.chapters.filter(c=>c.frameworkId===fw)),items:structuredClone(items),scoringVersion:fw==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},
  results:items.map(i=>({itemId:i.id,response:'no',conformity:'none',reviewed:true,observation:{en:'',zh:''},recommendation:{en:'',zh:''}})),
  findings:[{id:'linked',itemIds:[items[0].id],classification:'finding',observation:{en:'Historical source observation, not the current action body.',zh:'歷史來源文字，不是當筆改善正文。'},recommendation:{en:'Source recommendation',zh:'來源建議'},sources:structuredClone(provenance)}]};
});
seed.improvements=seed.inspections.map(i=>({...base('close-'+i.frameworkId),title:'Action '+i.frameworkId,content:content(i.frameworkId),itemIds:[...i.findings[0].itemIds],departmentIds:['marine'],assigneeIds:[],source:'external',inspectionId:i.id,findingId:'linked',sourceKey:i.id+':linked',urgency:'medium',status:'open',percent:20,targetDate:'',plan:'Existing action plan',events:[{id:'old-'+i.frameworkId,at:'2026-01-01T00:00:00Z',by:'qa-owner',content:'Immutable prior progress',status:'open',percent:20}],closedAt:null,closedBy:null,sources:structuredClone(provenance)}));
for(const lang of ['en','zh'])seed.improvements.push({...structuredClone(seed.improvements[0]),...base('close-'+lang),title:'Action '+lang,source:'non_external',inspectionId:undefined,findingId:undefined,sourceKey:undefined,itemIds:['item-b'],content:{en:lang==='en'?'English-only action body.\nKeep this final line.':'',zh:lang==='zh'?'只有中文的觀察事項正文。\n這是最後一行。':''},events:[],sources:[]});
let qa,vite,browser,page,barrier,current='setup';
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const snap=async name=>{const path=join(out,name+'.png');await page.screenshot({path,fullPage:false});receipt.screenshots.push(path);};
const run=async(id,fn)=>{current=id;try{receipt.cases.push({id,status:'PASS',...await fn()});}catch(error){await snap(id+'-failure').catch(()=>{});receipt.cases.push({id,status:'FAIL',message:error.message});throw error;}finally{persist();}};
try{
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17,afterCommit:async({action,result})=>{if(action==='save'&&result.ok&&barrier){barrier.committed=true;await barrier.wait;}return false;}});
 await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/018_person_department_heads.sql'),'utf8'));
 const read=async id=>(await qa.db.setup.query("select body from compliance_private.records where kind='improvement' and id=$1",[id])).rows[0].body;
 const ledger=async()=>({records:(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows,operations:(await qa.db.setup.query('select count(*)::int n from compliance_private.operations')).rows[0].n,audit:(await qa.db.setup.query('select count(*)::int n from compliance_private.audit')).rows[0].n});
 const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const open=async(role='owner',lang='zh')=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',async r=>{const url=r.request().url();if(![ui,qa.url].includes(new URL(url).origin)){receipt.blockedExternal++;return r.abort();}if(url.startsWith(qa.url)&&r.request().method()==='POST'){const b=r.request().postDataJSON();receipt.requests.push({case:current,role,action:b.p_action,id:b.p_payload.id??b.p_payload.record?.id,intent:b.p_payload.intent});}return r.continue();});
  await context.addInitScript(({config,user,lang})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language',lang);sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users[role],lang});
  const p=await context.newPage();p.setDefaultTimeout(8000);p.on('pageerror',e=>receipt.errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(ui);await p.locator('.main-nav').waitFor();return p;
 };
 const nav=async(route,p=page,lang='zh')=>p.locator('.main-nav').getByRole('button',{name:route==='list'?(lang==='zh'?'待改善項目':'Improvements'):route,exact:true}).click();
 const row=(key,route='list',p=page)=>p.locator(route==='list'?'.improvement-table':'.linked-improvement-table').locator('tbody tr').filter({has:p.getByRole('button',{name:'Action '+key,exact:true})});
 const enter=async(key,route='list',progress=false,lang='zh')=>{await nav(route,page,lang);await row(key,route).getByRole('button',{name:progress?(route==='list'?'直接更新':'更新'):(lang==='zh'?'結案':'Close'),exact:true}).click();const d=page.getByRole('dialog');await expect(d.getByRole('button',{name:lang==='zh'?'確認保存':'Confirm save',exact:true})).toBeEnabled();return d;};
 const cancel=async(d,lang='zh')=>{await d.getByRole('button',{name:lang==='zh'?'取消／放棄草稿':'Cancel / discard draft',exact:true}).click();await expect(d).toHaveCount(0);};
 const verifyBody=async(d,record,lang='zh')=>{
  // Assert the actual user-visible text first: RED must be missing body, not a CSS selector.
  for(const value of Object.values(record.content))if(value)await expect(d).toContainText(richTextToPlainText(compactRichText(value)).split('\n').at(-1));
  const region=d.getByRole('region',{name:lang==='zh'?'完整改善內容':'Full action content',exact:true});
  await expect(region).toBeVisible();
  for(const [key,value] of Object.entries(record.content))if(value)await expect(region.locator(`[lang="${key==='zh'?'zh-Hant':'en'}"]`)).toHaveText(richTextToPlainText(compactRichText(value)));
  await expect(region.locator('[contenteditable="true"]')).toHaveCount(0);
  await expect(d).not.toContainText('INTERNAL_LOCATOR_ONLY');await expect(d).not.toContainText('INTERNAL_SOURCE_FILE.json');await expect(d).not.toContainText('Historical source observation');
  if(record.source==='external')for(const [key,color] of [['en','rgb(198, 40, 40)'],['zh','rgb(21, 101, 192)']]){
   const first=region.getByText(richTextToPlainText(record.content[key]).split('\n')[0],{exact:true});
   await expect(first).toHaveCSS('font-weight','700');await expect(first).toHaveCSS('color',color);
  }
  assert(await d.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'dialog horizontal overflow');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document horizontal overflow');
 };
 const verifyClose=async(d,lang='zh')=>{await expect(d.getByRole('heading',{name:lang==='zh'?'確認結案':'Confirm close',exact:true})).toBeVisible();const check=d.getByRole('checkbox',{name:lang==='zh'?'已經完成作業':'Work completed',exact:true});await expect(check).toBeChecked();await expect(check).toBeDisabled();await expect(d.getByLabel(lang==='zh'?'完成百分比':'Completion percentage',{exact:true})).toHaveValue('100');};
 const claims=()=>receipt.requests.filter(x=>x.role==='owner'&&x.action==='claim').length;
 page=await open();
 for(const [key,route,width] of [['TMSA','list',1440],['TMSA','TMSA',1440],['DRYBMS','DRYBMS',390]])await run(`CLOSE-CONTEXT-${key}-${route}-${width}`,async()=>{
  await page.setViewportSize({width,height:width===390?844:1000});const before=await ledger(),record=await read('close-'+key),d=await enter(key,route);
  await verifyClose(d);await verifyBody(d,record);await expect(d.locator('.progress-history')).toContainText(record.events[0].content);await snap(current);
  assert.equal(receipt.requests.filter(x=>x.case===current&&x.action==='inspection_detail').length,0,'closure does not fetch historical source details');
  await cancel(d);assert.deepEqual(await ledger(),before,'opening/cancelling must not change business records, audit or operations');
  return {recordId:record.id,route,width,cancelUnchanged:true};
 });
 await page.setViewportSize({width:1440,height:1000});
 await run('PROGRESS-TO-CLOSE-CANCEL',async()=>{
  const before=await ledger(),record=await read('close-TMSA'),d=await enter('TMSA','TMSA',true),input=d.locator('.progress-text [role="textbox"]');
  await input.fill('Retained closure draft');const n=claims();await d.getByRole('button',{name:'結案',exact:true}).click();await verifyClose(d);await verifyBody(d,record);await expect(input).toHaveText('Retained closure draft');assert.equal(claims(),n,'mode change must retain the existing lease');await cancel(d);assert.deepEqual(await ledger(),before);
 });
 const peer=await open('admin');await nav('list',peer);
 for(const [key,route,progress] of [['TMSA','list',false],['DRYBMS','DRYBMS',true]])await run(`CLOSE-SAVE-ACK-${key}`,async()=>{
  const before=await ledger(),record=await read('close-'+key),d=await enter(key,route,progress),input=d.locator('.progress-text [role="textbox"]');await input.fill('Confirmed completion '+key);
  if(progress){const n=claims();await d.getByRole('button',{name:'結案',exact:true}).click();assert.equal(claims(),n);await expect(input).toHaveText('Confirmed completion '+key);}
  await verifyClose(d);await verifyBody(d,record);assert.deepEqual(await ledger(),before);
  let release;const wait=new Promise(r=>{release=r;});barrier={wait,release,committed:false};
  await d.getByRole('button',{name:'確認保存',exact:true}).click();await expect.poll(()=>barrier.committed).toBe(true);
  const saved=await read(record.id);assert.equal(saved.status,'closed');assert.equal(saved.percent,100);assert.equal(saved.version,record.version+1);assert.equal(saved.events.length,record.events.length+1);assert.deepEqual(saved.events.slice(0,-1),record.events);assert.equal(saved.events.at(-1).content,'Confirmed completion '+key);
  for(const field of ['title','content','plan','source','sourceKey','inspectionId','findingId','sources','itemIds'])assert.deepEqual(saved[field],record[field]);
  assert.deepEqual((await ledger()).records.filter(r=>r.id!==record.id),before.records.filter(r=>r.id!==record.id),'other records, assessments and frozen inspections remain unchanged');
  await expect(d).toBeVisible();await expect(d.getByRole('button',{name:'保存中…',exact:true})).toBeDisabled();await expect(row(key,route)).toHaveCount(1);
  barrier.release();barrier=null;await expect(d).toHaveCount(0);await expect(row(key,'list',peer)).toContainText('已結案',{timeout:25000});
  assert.equal(receipt.requests.filter(x=>x.case===current&&x.role==='owner'&&x.action==='save').length,1);assert.equal(receipt.requests.filter(x=>x.case===current&&x.action==='inspection_detail').length,0);
  return {recordId:record.id,version:saved.version,heldAck:true,peerReadback:true};
 });
 await peer.context().close();await page.context().close();
 for(const lang of ['en','zh'])await run(`CLOSE-SINGLE-LANGUAGE-${lang}`,async()=>{
  page=await open('owner',lang);const before=await ledger(),record=await read('close-'+lang),d=await enter(lang,'list',false,lang);await verifyClose(d,lang);await verifyBody(d,record,lang);await snap(current);await cancel(d,lang);assert.deepEqual(await ledger(),before);await page.context().close();
 });
 await run('DETAIL-PROVENANCE-REMAINS-AVAILABLE',async()=>{
  page=await open();const before=await ledger();await nav('list');await row('TMSA').getByRole('button',{name:'Action TMSA',exact:true}).click();const d=page.getByRole('dialog');await expect(d.getByRole('heading',{name:'改善詳情',exact:true})).toBeVisible();await expect(d).toContainText('INTERNAL_LOCATOR_ONLY');await expect(d).toContainText('INTERNAL_SOURCE_FILE.json');await d.getByRole('button',{name:'Close',exact:true}).click();assert.deepEqual(await ledger(),before);
 });
 assert.deepEqual(receipt.errors,[]);assert.equal(receipt.blockedExternal,0);assert.equal(receipt.cases.length,9);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure={case:current,message:error.message};process.exitCode=1;}
finally{
 barrier?.release();const ports=[qa?.db.port,qa?.server.address()?.port,vite?.httpServer.address()?.port].filter(Boolean);
 await browser?.close();await vite?.close();await qa?.stop();
 receipt.cleanup={browserClosed:browser?!browser.isConnected():true,ports,portsStopped:await Promise.all(ports.map(closed)),filesRetained:true};
 receipt.inputsUnchanged=Object.entries(receipt.inputs).every(([p,d])=>existsSync(join(root,p))&&sha256(readFileSync(join(root,p)))===d);
 if(!receipt.inputsUnchanged||receipt.cleanup.portsStopped.some(x=>!x)){receipt.status='FAIL';process.exitCode=1;}
 persist();console.log(JSON.stringify({status:receipt.status,cases:receipt.cases,receipt:join(out,'receipt.json'),cleanup:receipt.cleanup}));
}
