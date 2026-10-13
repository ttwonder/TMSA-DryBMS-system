import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {syntheticSeed,checkedRpc,root} from './native-postgres.mjs';
const red=process.argv.includes('--red-ack');
const output=join(root,'qa-evidence','performance-20261013',red?'red-ack':process.argv.includes('--p4')?'p4-ack':'green');mkdirSync(output,{recursive:true});
const receipt={layer:'Original mounted App + native PostgreSQL; loopback RPC adapter; not hosted acceptance',productionRequests:0,cases:[]};
let qa,vite,browser,hold=false,acked=false,unhold;const gate=new Promise(r=>unhold=r);
const closed=port=>new Promise(r=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();r(false);});s.once('error',()=>r(true));});
const hashes={};for(const p of ['src/api.ts','src/App.tsx','src/useRecordEditor.ts','src/types.ts','src/syncState.ts','supabase/migrations/005_performance.sql','scripts/qa-server.mjs','scripts/verify-performance.mjs'])if(existsSync(join(root,p)))hashes[p]=createHash('sha256').update(readFileSync(join(root,p))).digest('hex');receipt.testedInputs=hashes;
try{
 qa=await startQaServer({seed:syntheticSeed(),evidenceDir:output,afterCommit:async({action})=>{if(action==='save'){acked=true;hold=true;}else if(hold&&['release','read','sync'].includes(action))await gate;return false;}});
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();
 const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});const errors=[],blocked=[];
 await ctx.route('**/*',r=>{if(![ui,qa.url].includes(new URL(r.request().url()).origin)){blocked.push('external');return r.abort();}return r.continue();});
 await ctx.addInitScript(({config,u})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));sessionStorage.setItem('fpmc-compliance-client-id',u.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:u.user,sessionToken:u.sessionToken}));},{config:qa.config,u:qa.users.operator});
 const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.name));p.on('dialog',d=>d.accept());
 await p.goto(ui);await p.locator('.main-nav').waitFor();await p.locator('.main-nav').getByRole('button',{name:'TMSA',exact:true}).click();await p.getByRole('button',{name:'修改',exact:true}).click();await p.locator('.assessment-editor').waitFor();
 await p.locator('.assessment-editor textarea').first().fill('PERFORMANCE-ACK-CANONICAL');
 const start=performance.now();await p.locator('.item-detail-heading').getByRole('button',{name:'保存',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('.assessment-readonly')?.textContent?.includes('PERFORMANCE-ACK-CANONICAL'),null,{timeout:1800});
 assert(acked);await p.getByText('已保存並由伺服器確認。',{exact:true}).waitFor({timeout:500});
 receipt.cases.push({id:'P1-ACK-authoritative-render-and-success-with-release-and-sync-held',status:'PASS',elapsedMs:Math.round(performance.now()-start)});
 const saved=await checkedRpc(qa.db,'read',{},qa.users.owner.sessionToken,qa.users.owner.clientId);assert(saved.assessments.some(a=>a.selfAssessment.en==='PERFORMANCE-ACK-CANONICAL'));receipt.cases.push({id:'P1-exact-native-record-readback',status:'PASS'});
 await p.screenshot({path:join(output,'ack-with-background-held.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.error=e instanceof Error?e.message:String(e);process.exitCode=1;}
finally{
 hold=false;unhold();await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [key,port] of Object.entries(ports))receipt.cleanup[key]=port?await closed(port):true;receipt.artifactsRetained=true;writeFileSync(join(output,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases,error:receipt.error,cleanup:receipt.cleanup,receipt:join(output,'receipt.json')}));
}
