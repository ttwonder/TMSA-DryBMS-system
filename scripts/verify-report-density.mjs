// Real HTML renderer + synthetic report fixture. Not native Save-as-PDF or hosted acceptance.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {reportingFixture} from '../tests/fpmc-reporting-fixture.ts';
import {HtmlReport} from '../src/reportHtml.ts';
import {renderFrameworkReport,renderInspectionReport,renderOverviewReport} from '../src/reports.ts';
const root=process.cwd(),out=join(root,'qa-evidence/report-refinement/density',new Date().toISOString().replaceAll(':','-'));mkdirSync(out,{recursive:true});
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const receipt={status:'RUNNING',layer:'actual renderer and Chrome CDP PDFs with synthetic unbalanced prose; same 12pt CSS; no production writes',inputs:Object.fromEntries(['src/reports.ts','src/reportHtml.ts','scripts/verify-report-density.mjs'].map(p=>[p,hash(join(root,p))])),cases:[]};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1512,height:1000}});await page.route('**/*',r=>r.abort());await page.emulateMedia({media:'print'});
 for(const kind of ['framework','inspection','overview'])for(const lang of ['zh','en']){
  const s=reportingFixture(),text=Array.from({length:120},(_,i)=>`DENSE_${String(i).padStart(3,'0')} Complete source paragraph 中文內容與編號全部保留. `).join('');
  s.items[0].guidance={en:text,zh:'完整末端 DENSE_END'};s.inspections[0].snapshot.items[0].guidance={en:text,zh:'完整末端 DENSE_END'};
  s.improvements[0].itemIds=[s.items[0].id];s.improvements[0].plan=text+' DENSE_END';
  const entry={kind,lang,variants:[]};
  for(const variant of ['comparison','compact']){
   const create=async(title,language)=>{const r=new HtmlReport(title,language);if(variant==='comparison')r.compactRows=row=>[row];return r;};
   const html=kind==='framework'?await renderFrameworkReport(create,s,'TMSA',lang,['chapter-TMSA']):kind==='inspection'?await renderInspectionReport(create,s,s.inspections[0].id,lang):await renderOverviewReport(create,s,'TMSA',lang,['chapter-TMSA']);
   const stem=kind+'-'+lang+'-'+variant,htmlPath=join(out,stem+'.html'),pdf=join(out,stem+'.pdf');writeFileSync(htmlPath,html);await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
   const height=await page.locator('main').evaluate(n=>n.getBoundingClientRect().height);assert((await page.locator('main').innerText()).includes('DENSE_119'));const cdp=await page.context().newCDPSession(page);const result=await cdp.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});await cdp.detach();writeFileSync(pdf,Buffer.from(result.data,'base64'));
   entry.variants.push({variant,height,html:htmlPath,pdf,sha256:hash(pdf)});
  }
  assert(entry.variants[1].height<entry.variants[0].height*.9,JSON.stringify(entry));entry.status='PASS';receipt.cases.push(entry);
 }
 receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.error=e.stack;process.exitCode=1;}
finally{await browser.close();receipt.ownedBrowserClosed=true;writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,receipt:join(out,'receipt.json'),error:receipt.error}));}
