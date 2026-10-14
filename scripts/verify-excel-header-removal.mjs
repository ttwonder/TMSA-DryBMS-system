// Original App + actual source-copy bodies + synthetic identities + owned PostgreSQL.
// Explicit private fixture required; never attach to production or a user's browser profile.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,checkedRpc} from './native-postgres.mjs';
const fixture=process.env.REPORT_FIXTURE_PATH;
if(!fixture)throw Error('Explicit private REPORT_FIXTURE_PATH required');
const seed=JSON.parse(readFileSync(fixture,'utf8'));
const out=resolve(process.env.REPORT_EXCEL_QA_DIR??join(root,'qa-evidence/excel-header-removal/final/ui'));
mkdirSync(out,{recursive:true});
const receipt={layer:'Original App + source-copy corpus + synthetic identities + owned PostgreSQL; NOT hosted or native Excel acceptance',cases:[],downloads:[],errors:[],blockedExternal:0,productionBusinessRequests:0};
let qa,vite,browser,current='setup',lastExport;
const digest=b=>createHash('sha256').update(b).digest('hex');
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false)});s.once('error',()=>resolve(true));});
const failUnless=(condition,message)=>assert.ok(condition,message);
try {
 // Baseline is exact pre-removal source, except its two relative import paths.
 const baselinePath=join(root,'qa-evidence/excel-header-removal/baseline-reports.ts');
 receipt.fixtureSha256=digest(readFileSync(fixture));receipt.baselineModuleSha256=digest(readFileSync(baselinePath));
 qa=await startQaServer({seed,evidenceDir:out,afterCommit:async({action,result})=>{if(action==='export_authorize')lastExport=result;return false;}});
 for(const p of ['006_restart_updates.sql','007_shared_targets.sql'])await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',p),'utf8'));
 const initial=(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows;
 const before=await checkedRpc(qa.db,'read',{},qa.users.owner.sessionToken,qa.users.owner.clientId);
 failUnless(before.items.length===700&&before.chapters.length===50,'Source-copy corpus must contain all 700 items / 50 chapters');
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.route('**/*',r=>{if(![ui,qa.url].includes(new URL(r.request().url()).origin)){receipt.blockedExternal++;return r.abort();}return r.continue();});
 await context.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users.owner});
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>receipt.errors.push(e.name));await page.goto(ui);await page.locator('.main-nav').waitFor();await page.evaluate(()=>document.fonts.ready);
 let language='zh';const t=(zh,en)=>language==='zh'?zh:en;
 const template=new ExcelJS.Workbook();await template.xlsx.load(readFileSync(join(root,'public/templates/tmsa-template.xlsx')));
 for(const fw of ['TMSA','DRYBMS'])for(const lang of ['zh','en']) {
  current=`${fw}-${lang}-original-report-download-header-only-delta`;
  if(language!==lang){await page.getByRole('button',{name:'Switch language',exact:true}).click();language=lang;}
  await page.locator('.main-nav').getByRole('button',{name:t('報告中心','Reports'),exact:true}).click();
  await page.getByLabel(t('報告種類','Report type'),{exact:true}).selectOption('framework');
  await page.getByLabel(t('報告框架','Report framework'),{exact:true}).selectOption(fw);
  await page.getByLabel(t('文件格式','File format'),{exact:true}).selectOption('xlsx');
  const chapters=seed.chapters.filter(c=>c.frameworkId===fw&&c.active),items=seed.items.filter(i=>i.frameworkId===fw&&i.active);
  await expect(page.getByRole('group',{name:t('完整分章選取','Complete chapter selection'),exact:true}).getByRole('checkbox',{checked:true})).toHaveCount(chapters.length);
  lastExport=undefined;
  const count=Number((await qa.db.setup.query("select count(*) n from compliance_private.audit where action='export_authorize'")).rows[0].n);
  const pending=page.waitForEvent('download',{timeout:180000});await page.getByRole('button',{name:t('生成並下載','Generate and download'),exact:true}).click();
  const download=await pending,folder=join(out,'downloads',`${fw}-${lang}`);mkdirSync(folder,{recursive:true});const path=join(folder,download.suggestedFilename());await download.saveAs(path);
  failUnless(await download.failure()===null,'Actual browser download must complete');failUnless(lastExport?.ok===true,'Download must use actual authorized native snapshot');
  const canonical=structuredClone(lastExport.data);writeFileSync(join(folder,'private-authorized-state.json'),JSON.stringify(canonical));
  const nextCount=Number((await qa.db.setup.query("select count(*) n from compliance_private.audit where action='export_authorize'")).rows[0].n);failUnless(nextCount-count===1,'One real export authorization audit per UI download');
  await expect(page.getByRole('button',{name:t('生成並下載','Generate and download'),exact:true})).toBeEnabled();await expect(page.locator('[role="alert"]')).toHaveCount(0);
  // Same authorized input and same real browser Canvas planner as the downloaded file.
  const baselineBytes=await page.evaluate(async({state,framework,language,ids})=>{const module=await import('/qa-evidence/excel-header-removal/baseline-reports.ts');const bytes=await module.buildFrameworkExcel(state,framework,language,ids);return Array.from(bytes);},{state:canonical,framework:fw,language:lang,ids:chapters.map(c=>c.id)});
  const originalPath=join(folder,'private-baseline.xlsx');writeFileSync(originalPath,new Uint8Array(baselineBytes));
  const savedBytes=readFileSync(path),book=new ExcelJS.Workbook(),old=new ExcelJS.Workbook();await book.xlsx.load(savedBytes);await old.xlsx.load(new Uint8Array(baselineBytes));
  failUnless(book.worksheets.length===chapters.length,'Keep complete selected chapter set');
  const expectedCodes=new Set(items.map(i=>i.code)),seenCodes=new Set();let comparedCells=0,bodyRows=0;
  for(const sheet of book.worksheets) {
   const previous=old.getWorksheet(sheet.name);failUnless(!!previous,'Preserve chapter sheet names/order');
   const styleSource=fw==='TMSA'?template.getWorksheet(sheet.name):template.worksheets[0];
   failUnless(sheet.getCell('E2').text==='','Requested E2 intro block must be empty');
   failUnless(sheet.getRow(2).height===(styleSource?.getRow(2).height??24),'Restore ordinary template row 2 height');
   for(const key of ['pageSetup','views','autoFilter','headerFooter'])failUnless(JSON.stringify(sheet[key])===JSON.stringify(previous[key]),`Keep ${key}`);
   failUnless(JSON.stringify(sheet.model.merges)===JSON.stringify(previous.model.merges),'Keep merged coordinates');
   failUnless(sheet.rowCount===previous.rowCount&&sheet.columnCount===previous.columnCount,'Keep table dimensions and continuation rows');
   for(let col=1;col<=sheet.columnCount;col++)failUnless(sheet.getColumn(col).width===previous.getColumn(col).width&&sheet.getColumn(col).hidden===previous.getColumn(col).hidden,'Keep original column widths/visibility');
   for(let row=1;row<=sheet.rowCount;row++) {
    if(row!==2)failUnless(sheet.getRow(row).height===previous.getRow(row).height,'Only intro row height may change');
    if(row>=7&&sheet.getCell(row,1).text){seenCodes.add(sheet.getCell(row,1).text);bodyRows++;}
    for(let col=1;col<=sheet.columnCount;col++) {
     const cell=sheet.getCell(row,col),prior=previous.getCell(row,col);
     if(cell.address==='E2'||cell.master.address==='E2'||prior.master.address==='E2')continue;
     failUnless(JSON.stringify(cell.value)===JSON.stringify(prior.value),`Preserve saved cell value at ${sheet.name}:${cell.address}`);
     failUnless(JSON.stringify(cell.style)===JSON.stringify(prior.style),`Preserve saved cell style at ${sheet.name}:${cell.address}`);comparedCells++;
    }
   }
  }
  failUnless(seenCodes.size===expectedCodes.size&&[...expectedCodes].every(c=>seenCodes.has(c)),'Keep exact complete Item code universe');
  const zip=await JSZip.loadAsync(savedBytes);let sheetsChecked=0;
  for(const [name,file] of Object.entries(zip.files))if(/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
   const xml=await file.async('string'),inside=/<sheetPr[^>]*>([\s\S]*?)<\/sheetPr>/.exec(xml)?.[1]??'';
   if(inside.includes('<outlinePr')&&inside.includes('<pageSetUpPr'))failUnless(inside.indexOf('<outlinePr')<inside.indexOf('<pageSetUpPr'),'Keep native-compatible sheetPr order');sheetsChecked++;
  }
  failUnless(sheetsChecked===chapters.length,'Check all saved worksheet XML parts');
  receipt.cases.push({id:current,status:'PASS',framework:fw,language:lang,sheets:book.worksheets.length,uniqueItems:seenCodes.size,bodyRows,comparedNonIntroCells:comparedCells,onlyAllowedDifferences:['E2 intro value/alignment','row 2 height'],realExportAuditDelta:1});
  receipt.downloads.push({case:current,path,bytes:savedBytes.length,sha256:digest(savedBytes)});
 }
 current='source-copy-business-records-unchanged-after-four-real-exports';
 failUnless(JSON.stringify((await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows)===JSON.stringify(initial),'Exports must not mutate business records');receipt.cases.push({id:current,status:'PASS'});
 failUnless(receipt.blockedExternal===0&&receipt.errors.length===0,'No external requests or browser runtime errors');receipt.status='PASS';
} catch(e) {receipt.status='FAIL';receipt.failure={case:current,name:e?.name??'Error',code:e?.code??null};writeFileSync(join(out,'private-failure.txt'),e?.stack??String(e));process.exitCode=1;}
finally {
 await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;
 receipt.testedInputs={};for(const p of ['src/reports.ts','tests/reports.test.ts','src/Reports.tsx','src/api.ts','src/domain.ts','src/useRecordEditor.ts','src/styles.css','scripts/verify-excel-header-removal.mjs','scripts/qa-server.mjs','scripts/native-postgres.mjs','public/templates/tmsa-template.xlsx','supabase/migrations/006_restart_updates.sql','supabase/migrations/007_shared_targets.sql'])receipt.testedInputs[p]=digest(readFileSync(join(root,p)));
 writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,downloads:receipt.downloads.length,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));
}
