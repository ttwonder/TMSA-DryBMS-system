// Original App + synthetic fixtures + owned native PostgreSQL. Never hosted acceptance.
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {chromium, expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root, syntheticSeed} from './native-postgres.mjs';
const red = process.argv.includes('--red');
const out = join(root,'qa-evidence','rich-text-app',`${red?'red':'green'}-${new Date().toISOString().replaceAll(':','-')}`);
mkdirSync(out,{recursive:true});
const receipt = {layer:'Original App + synthetic data + owned native PostgreSQL; NOT hosted Supabase/Pages',status:'RUNNING',cases:[],errors:[],blocked:[],screenshots:[]};
const seed = syntheticSeed();
let qa, vite, browser, page, current='setup';
const run = async(name,fn)=>{current=name;await fn();receipt.cases.push({name,status:'PASS'});};
try {
  qa = await startQaServer({seed,evidenceDir:out,latestMigration:17});
  await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/018_person_department_heads.sql'),'utf8'));
  vite = await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});
  await vite.listen();
  const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context = await browser.newContext({viewport:{width:1366,height:900}});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(![ui,qa.url].includes(url.origin)){receipt.blocked.push(url.origin);return route.abort();}return route.continue();});
  await context.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));localStorage.setItem('fpmc-compliance-language','zh');sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users.owner});
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>receipt.errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto(ui);await page.locator('.main-nav').waitFor();
  await page.locator('.main-nav').getByRole('button',{name:'TMSA',exact:true}).click();
  await page.getByRole('button',{name:'修改',exact:true}).click();
  await run('original-assessment-focus-shows-compact-toolbar-without-selection',async()=>{
    const field=page.getByRole('textbox',{name:'Self Assessment English',exact:true});
    await field.focus();
    await expect(page.getByRole('toolbar')).toBeVisible({timeout:2500});
    const geometry=await page.getByRole('toolbar').evaluate(el=>{const b=el.getBoundingClientRect();return {width:b.width,height:b.height};});
    assert(geometry.height<=38,'Toolbar must remain a compact single row');receipt.toolbar=geometry;
  });
  assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.blocked,[]);receipt.status='PASS';
} catch(error) {
  receipt.status='FAIL';receipt.failure={case:current,message:String(error.message).slice(0,1800)};
  if(page){const path=join(out,'failure.png');await page.screenshot({path,fullPage:true}).catch(()=>{});receipt.screenshots.push(path);}
  process.exitCode=1;
} finally {
  await browser?.close();await vite?.close();await qa?.stop();
  receipt.inputs=Object.fromEntries(['src/FrameworkPage.tsx','src/useRecordEditor.ts','scripts/verify-rich-text-app.mjs'].map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));
  writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,failure:receipt.failure,receipt:join(out,'receipt.json')}));
}
