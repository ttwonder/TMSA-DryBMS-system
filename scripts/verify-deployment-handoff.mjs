import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
import {createNativeDatabase,setupQaIdentities,sha256} from './native-postgres.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'qa-evidence','deployment-handoff');
fs.mkdirSync(out,{recursive:true});
const cases=[];const errors=[];let browser,db;
const receipt={label:'離線部署輔助頁＋本機PostgreSQL；非正式Supabase驗收',cases,errors,inputs:{},cleanup:{}};
const record=(id,details={})=>cases.push({id,status:'PASS',...details});
try{
 const helper=path.join(root,'docs','BOOTSTRAP.html');
 assert.ok(fs.existsSync(helper),'An offline initializer is delivered');
 receipt.inputs['docs/BOOTSTRAP.html']=sha256(fs.readFileSync(helper));
 const chrome=process.env.QA_CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe';
 browser=await chromium.launch({headless:true,executablePath:chrome});
 const context=await browser.newContext({offline:true});const page=await context.newPage();const faults=[];
 page.on('pageerror',e=>faults.push(e.message));const requests=[];
 page.on('request',r=>{if(!r.url().startsWith('file:'))requests.push(r.url());});
 await page.goto(pathToFileURL(helper).href);
 assert.equal(await page.locator('#setup-sql').inputValue(),'');
 assert.equal(await page.locator('#setup-code').inputValue(),'');
 record('H01-no-code-until-user-generates');
 await page.getByRole('button',{name:'產生一次性初始化碼',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('setup-status').dataset.state==='ready');
 const values=await page.evaluate(()=>({code:document.getElementById('setup-code').value,sql:document.getElementById('setup-sql').value}));
 assert.match(values.code,/^[a-f0-9]{64}$/);
 assert.equal(values.sql,`select compliance_private.provision_bootstrap('${sha256(values.code)}');`);
 assert.ok(!values.sql.includes(values.code));
 assert.equal(await page.locator('#setup-code').getAttribute('type'),'password');
 record('H02-high-entropy-code-and-correct-private-hash-only-sql');
 await page.getByRole('button',{name:'顯示／隱藏初始化碼',exact:true}).click();
 assert.equal(await page.locator('#setup-code').getAttribute('type'),'text');
 await page.getByRole('button',{name:'選取初始化碼',exact:true}).click();
 const selected=await page.locator('#setup-code').evaluate(n=>n.selectionStart===0&&n.selectionEnd===n.value.length);
 assert.ok(selected);record('H03-manual-copy-selection-without-clipboard-api');
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 await page.reload();assert.equal(await page.locator('#setup-code').inputValue(),'');
 assert.deepEqual(requests,[]);assert.deepEqual(faults,[]);
 record('H04-offline-no-network-no-storage-no-runtime-errors');
 await browser.close();browser=null;receipt.cleanup.browserClosed=true;
 db=await createNativeDatabase({evidenceDir:out});
 const migration=fs.readFileSync(path.join(root,'supabase','migrations','001_platform.sql'),'utf8');
 const readback=fs.readFileSync(path.join(root,'supabase','readback.sql'),'utf8');
 receipt.inputs['supabase/migrations/001_platform.sql']=sha256(migration);
 receipt.inputs['supabase/readback.sql']=sha256(readback);
 const runReadback=async()=>{
  await db.setup.query('begin read only');
  try{const results=await db.setup.query(readback);await db.setup.query('commit');return(Array.isArray(results)?results:[results]).map(r=>r.rows);}
  catch(e){await db.setup.query('rollback');throw e;}
 };
 const before=await runReadback();
 assert.ok(before.flat().some(r=>r.initialized===false));
 record('H05-full-committed-readback-executes-in-read-only-transaction-before-owner',{resultSets:before.length});
 await setupQaIdentities(db,{seed:null,handlesPath:path.join(out,'session-handles.json')});
 const after=await runReadback();
 assert.ok(after.flat().some(r=>r.initialized===true));
 assert.ok(after.flat().some(r=>Number(r.active_owners)===1));
 assert.ok(after.flat().some(r=>r.anon_private_schema_usage===false&&r.anon_rpc_execute===true));
 const tables=after.flat().filter(r=>'anon_has_any_direct_grant'in r);
 const helpers=after.flat().filter(r=>'anon_can_execute_helper'in r);
 assert.ok(tables.length>0&&tables.every(r=>r.anon_has_any_direct_grant===false));
 assert.ok(helpers.length>0&&helpers.every(r=>r.anon_can_execute_helper===false));
 assert.ok(after.flat().some(r=>r.bootstrap_status?.data?.initialized===true));
 assert.ok(after.flat().some(r=>r.roster_must_be_denied?.ok===false));
 assert.ok(after.flat().some(r=>r.sessionless_read_must_be_denied?.ok===false));
 record('H06-readback-after-owner-and-anonymous-acls',{resultSets:after.length,activeOwners:1});
 receipt.status='PASS';
}catch(e){receipt.status='FAIL';errors.push({name:e.name,message:e.message});process.exitCode=1;}
finally{
 if(browser){await browser.close();receipt.cleanup.browserClosed=true;}
 if(db){await db.stop();receipt.cleanup.databaseStopped=true;}
 receipt.generatedAt=new Date().toISOString();
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify(receipt));
}
