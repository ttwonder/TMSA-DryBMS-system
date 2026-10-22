// Real component + synthetic controlled React state. NOT App/DB/hosted acceptance.
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium, expect} from '@playwright/test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'qa-evidence/improvement-reference-picker', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(out, {recursive:true});
const inputs = ['src/ImprovementReferencePicker.tsx', 'src/improvementReferencePicker.css', 'scripts/verify-improvement-reference-picker.mjs'];
const hashes = () => Object.fromEntries(inputs.map(f => [f, createHash('sha256').update(readFileSync(join(root, f))).digest('hex')]));
const redPath = 'qa-evidence/improvement-chapter-links/red-2026-10-22T20-47-03.008Z/receipt.json';
// Retain the actual original-App RED when available; clean clones can still run
// component regressions without pretending to reproduce that historical RED.
const baseline = {path:redPath, available:existsSync(join(root, redPath))};
if (baseline.available) {
 const bytes=readFileSync(join(root, redPath)), red=JSON.parse(bytes.toString('utf8'));
 assert.equal(red.failure.case, 'original-create-has-hierarchical-reference-picker');
 assert.match(red.failure.message, /HIERARCHICAL_PICKER_MISSING/);
 Object.assign(baseline,{sha256:createHash('sha256').update(bytes).digest('hex'),failure:red.failure.case});
}
const receipt = {layer:'Real ImprovementReferencePicker + synthetic controlled React state; NOT App/native DB/hosted acceptance', baseline, status:'RUNNING', cases:[], screenshots:[], geometry:[], errors:[], externalRequests:[], inputsBefore:hashes()};
const save = () => writeFileSync(join(out, 'receipt.json'), JSON.stringify(receipt, null, 2));
const entry = relative(root, out).replaceAll('\\', '/');
writeFileSync(join(out, 'harness.html'), '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Component synthetic QA</title><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="./harness.tsx"></script></body></html>');
writeFileSync(join(out, 'harness.tsx'), `import React,{useState,useMemo,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {ImprovementReferencePicker} from '/src/ImprovementReferencePicker';
import {encodeRichText} from '/src/richText';
import '/src/styles.css';import '/src/themes.css';import '/src/improvementReferencePicker.css';
const base={version:1,createdAt:'',updatedAt:'',updatedBy:''};
const chapters=[
 {...base,id:'c1',frameworkId:'TMSA',code:'1',name:{zh:encodeRichText({text:'安全管理與完整章節名稱',spans:[{start:0,end:4,bold:true}],lists:[]}),en:'Management and the complete chapter name'},order:1,active:true},
 {...base,id:'c2',frameworkId:'TMSA',code:'2',name:{zh:'船員培訓、持續改進與完整責任分配',en:'Crew training, continuous improvement and full responsibility allocation'},order:2,active:true},
 {...base,id:'d1',frameworkId:'DRYBMS',code:'1',name:{zh:'乾散貨管理',en:'Dry bulk management'},order:1,active:true},
 {...base,id:'c-empty',frameworkId:'TMSA',code:'3',name:{zh:'',en:'English fallback chapter'},order:3,active:true},
 {...base,id:'c-off',frameworkId:'TMSA',code:'9',name:{zh:'停用章節',en:'Inactive chapter'},order:9,active:false}];
const make=(id,chapterId,code,frameworkId='TMSA',active=true)=>({...base,id,chapterId,code,frameworkId,active,order:1,level:1,kpi:{zh:'完整測試要求 '+id+'：保留條文全文並自然換行，不截斷也不暗中全選。',en:'Complete synthetic requirement '+id+': preserve all text with natural wrapping, without truncation or implicit selection.'},guidance:{zh:'',en:''},departmentIds:[],sources:[]});
const items=[make('i11','c1','1.1.1'),make('i12','c1','1.1.2'),make('i21','c2','2.1.1'),make('id1','d1','1.1','DRYBMS'),make('i-off','c1','1.1.9','TMSA',false),make('i-parent-off','c-off','9.1.1'),...Array.from({length:18},(_,n)=>make('long-'+n,'c2','2.2.'+(n+1)))];
const params=new URLSearchParams(location.search),preset=params.get('preset')||'empty';
const retained={chapterIds:['c-off','c-missing','c2'],itemIds:['i-off','i-missing','i-parent-off','i21']};
const starts={empty:{chapterIds:[],itemIds:[]},selected:{chapterIds:['c1'],itemIds:['id1']},retained,blocked:{chapterIds:[],itemIds:[]},limited:{chapterIds:[],itemIds:[]}};
function Harness(){const [value,setValue]=useState(starts[preset]),[lang,setLang]=useState('zh'),[disabled,setDisabled]=useState(false),[text,setText]=useState(''),[revision,setRevision]=useState(0),[calls,setCalls]=useState(0);
 const onChange=useCallback(v=>{setValue(v);setCalls(n=>n+1);},[]);
 const c=useMemo(()=>chapters.map(x=>({...x})),[revision]),i=useMemo(()=>items.map(x=>({...x})),[revision]);
 const allowedChapters=useMemo(()=>preset==='blocked'?[]:['retained','limited'].includes(preset)?['c1']:undefined,[]);
 const allowedItems=useMemo(()=>preset==='blocked'?[]:['retained','limited'].includes(preset)?['i11']:undefined,[]);
 return <main style={{maxWidth:1040,margin:'0 auto',padding:12}}><h2>Component / synthetic QA</h2><p>Local controlled state only — not App / database acceptance.</p><div style={{display:'flex',flexWrap:'wrap',gap:6,margin:'8px 0'}}><button type="button" onClick={()=>setLang(l=>l==='zh'?'en':'zh')}>Locale</button><button type="button" onClick={()=>setDisabled(d=>!d)}>Disabled</button><button type="button" onClick={()=>setRevision(n=>n+1)}>Refresh props</button><label>Other field <input aria-label="Other field" value={text} onChange={e=>setText(e.target.value)}/></label></div><div className="form-grid"><ImprovementReferencePicker chapters={c} items={i} chapterIds={value.chapterIds} itemIds={value.itemIds} lang={lang} disabled={disabled} allowedChapterIds={allowedChapters} allowedItemIds={allowedItems} onChange={onChange}/></div><output id="value" style={{display:'block',overflowWrap:'anywhere',fontSize:14}}>{JSON.stringify(value)}</output><output id="calls">{calls}</output></main>;
}createRoot(document.getElementById('root')).render(<Harness/>);`);
let vite, browser, page, port, current='setup';
const closed = p => new Promise(resolve => {const s=net.connect({host:'127.0.0.1',port:p});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const run = async(id,fn) => {current=id;await fn();receipt.cases.push({id,status:'PASS'});save();};
const contrast = (fg,bg) => {const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
try {
 vite=await createServer({configFile:false,root,base:'/',cacheDir:join(out,'vite-cache'),server:{host:'127.0.0.1',port:0,strictPort:true,hmr:false,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});
 await vite.listen();port=vite.httpServer.address().port;const origin='http://127.0.0.1:'+port;
 browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){receipt.externalRequests.push(r.request().url());return r.abort();}return r.continue();});
 page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>receipt.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')receipt.errors.push(m.text());});
 const open=async(preset='empty')=>{await page.goto(origin+'/'+entry+'/harness.html?preset='+preset);await page.getByRole('group',{name:'關聯章節與小項目',exact:true}).waitFor();};
 const picker=()=>page.locator('.improvement-reference-picker');
 const check=name=>picker().getByRole('checkbox',{name,exact:true});
 const chapter=code=>picker().getByRole('checkbox',{name:new RegExp('^(關聯章節|Link chapter) '+code+' ·')});
 const item=code=>picker().getByRole('checkbox',{name:new RegExp('^'+code.replaceAll('.','\\.')+' ·')});
 const expand=(code,en=false)=>picker().getByRole('button',{name:(en?'Choose items ':'選擇小項目 ')+code,exact:true});
 const value=async()=>JSON.parse(await page.locator('#value').textContent());
 const state=async(c,i)=>assert.deepEqual(await value(),{chapterIds:c,itemIds:i});
 const shot=async(name)=>{const p=join(out,name+'.png');await page.screenshot({path:p,fullPage:true});receipt.screenshots.push({path:p,sha256:createHash('sha256').update(readFileSync(p)).digest('hex')});};
 await open();
 await run('empty-no-framework-no-implicit-selection',async()=>{await expect(check('TMSA')).not.toBeChecked();await expect(check('DRYBMS')).not.toBeChecked();await state([],[]);});
 await run('pointer-both-frameworks-browse-only',async()=>{await check('TMSA').click();await check('DRYBMS').click();await expect(chapter('TMSA 1')).toBeVisible();await expect(chapter('DRYBMS 1')).toBeVisible();await state([],[]);assert.equal(await page.locator('#calls').textContent(),'0');});
 await run('chapter-only-does-not-select-items',async()=>{await chapter('TMSA 1').click();await state(['c1'],[]);});
 await run('expand-is-independent-not-label-activation',async()=>{await expand('TMSA 1').click();await expand('TMSA 2').click();await expand('DRYBMS 1').click();await state(['c1'],[]);await expect(item('TMSA 1.1.1')).toBeVisible();await expect(item('TMSA 2.1.1')).toBeVisible();await expect(item('DRYBMS 1.1')).toBeVisible();});
 await run('mixed-cross-framework-multi-chapter-selection',async()=>{await item('TMSA 1.1.1').click();await item('TMSA 2.1.1').click();await item('DRYBMS 1.1').click();await chapter('DRYBMS 1').click();await state(['c1','d1'],['i11','i21','id1']);});
 await run('framework-off-preserves-visible-summary',async()=>{await check('TMSA').click();await check('DRYBMS').click();await state(['c1','d1'],['i11','i21','id1']);await expect(picker().getByRole('region',{name:'已選關聯',exact:true})).toContainText('TMSA 1');await expect(picker().getByRole('button',{name:/^移除小項目 DRYBMS 1.1 ·/})).toBeVisible();await check('TMSA').click();await check('DRYBMS').click();});
 await run('chapter-uncheck-keeps-independent-items',async()=>{await chapter('TMSA 1').click();await state(['d1'],['i11','i21','id1']);});
 await run('item-uncheck-keeps-independent-chapter',async()=>{await item('DRYBMS 1.1').click();await state(['d1'],['i11','i21']);});
 await run('rich-text-full-name-and-fallback',async()=>{await expect(chapter('TMSA 1')).toHaveAccessibleName('關聯章節 TMSA 1 · 安全管理與完整章節名稱');await expect(chapter('TMSA 3')).toHaveAccessibleName('關聯章節 TMSA 3 · English fallback chapter');assert(!((await picker().textContent()).includes('RT1:')));});
 await run('refresh-locale-and-other-input-preserve-browse',async()=>{await check('DRYBMS').click();await page.getByRole('button',{name:'Refresh props',exact:true}).click();await expect(check('DRYBMS')).not.toBeChecked();await expect(expand('TMSA 1')).toHaveAttribute('aria-expanded','true');await page.getByRole('button',{name:'Locale',exact:true}).click();await expect(page.getByRole('group',{name:'Related chapters and items',exact:true})).toBeVisible();await expect(check('DRYBMS')).not.toBeChecked();await expect(expand('TMSA 1',true)).toHaveAttribute('aria-expanded','true');await page.evaluate(()=>{window.pickerNode=document.querySelector('.improvement-reference-picker');window.pickerMutations=[];window.pickerObserver=new MutationObserver(m=>window.pickerMutations.push(...m));window.pickerObserver.observe(window.pickerNode,{subtree:true,childList:true,attributes:true,characterData:true});});await page.getByRole('textbox',{name:'Other field'}).fill('Unrelated typing');assert(await page.evaluate(()=>window.pickerNode===document.querySelector('.improvement-reference-picker')));assert.equal(await page.evaluate(()=>window.pickerMutations.length),0);await page.evaluate(()=>window.pickerObserver.disconnect());await state(['d1'],['i11','i21']);});
 await run('disabled-all-controls-and-pointer-no-change',async()=>{await page.getByRole('button',{name:'Disabled',exact:true}).click();assert.equal(await picker().locator('input:not(:disabled),button:not(:disabled)').count(),0);const before=await value();for(const el of [check('TMSA'),expand('TMSA 1',true),picker().getByRole('button',{name:/^Remove chapter/}).first()]){const b=await el.boundingBox();assert(b);await page.mouse.click(b.x+b.width/2,b.y+b.height/2);}assert.deepEqual(await value(),before);await expect(expand('TMSA 1',true)).toHaveAttribute('aria-expanded','true');await page.getByRole('button',{name:'Disabled',exact:true}).click();});
 await run('initial-selection-infers-both-frameworks',async()=>{await open('selected');await expect(check('TMSA')).toBeChecked();await expect(check('DRYBMS')).toBeChecked();await state(['c1'],['id1']);});
 await run('inactive-missing-out-of-scope-preserved-removable',async()=>{await open('retained');await state(['c-off','c-missing','c2'],['i-off','i-missing','i-parent-off','i21']);await expect(chapter('TMSA 9')).toHaveCount(0);await expect(chapter('TMSA 2')).toHaveCount(0);await expect(picker()).toContainText('c-missing');await expect(picker()).toContainText('i-missing');await shot('retained-zh');const removes=picker().getByRole('region',{name:'已選關聯',exact:true}).getByRole('button');while(await removes.count())await removes.first().click();await state([],[]);await expect(chapter('TMSA 9')).toHaveCount(0);await expect(chapter('TMSA 2')).toHaveCount(0);await expand('TMSA 1').click();await expect(item('TMSA 1.1.9')).toHaveCount(0);await expect(item('TMSA 9.1.1')).toHaveCount(0);});
 await run('allowed-empty-means-no-new-candidates',async()=>{await open('blocked');await check('TMSA').click();await check('DRYBMS').click();assert.equal(await picker().getByRole('checkbox').count(),2);await state([],[]);});
 await run('allowed-intersection-restricts-candidates',async()=>{await open('limited');await check('TMSA').click();await check('DRYBMS').click();await expect(chapter('TMSA 1')).toBeVisible();await expect(chapter('TMSA 2')).toHaveCount(0);await expect(chapter('DRYBMS 1')).toHaveCount(0);await expand('TMSA 1').click();await expect(item('TMSA 1.1.1')).toBeVisible();await expect(item('TMSA 1.1.2')).toHaveCount(0);await item('TMSA 1.1.1').click();await state([],['i11']);});
 await run('empty-chapter-only-and-keyboard',async()=>{await open();await check('TMSA').click();await chapter('TMSA 3').focus();await page.keyboard.press('Space');await state(['c-empty'],[]);await expand('TMSA 3').click();await expect(picker()).toContainText('沒有可新增的小項目');});
 await open('selected');await expand('TMSA 1').click();await expand('TMSA 2').click();await expand('DRYBMS 1').click();
 for(const lang of ['zh','en']){
  if(lang==='en')await page.getByRole('button',{name:'Locale',exact:true}).click();
  for(const width of [1440,390])for(const theme of ['normal','dark','eye'])await run('layout-'+lang+'-'+width+'-'+theme,async()=>{
   await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const g=await picker().evaluate(e=>{const s=getComputedStyle(e),list=e.querySelector('.irp-chapters');return {documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,pickerWidth:e.getBoundingClientRect().width,color:s.color,background:s.backgroundColor,font:s.fontSize,gridColumn:s.gridColumn,scroll:list.scrollHeight>list.clientHeight,clipped:[...e.querySelectorAll('label,button,.irp-selected-text')].filter(n=>n.clientWidth&&n.scrollWidth>n.clientWidth+1).map(n=>n.textContent)};});
   receipt.geometry.push({lang,width,theme,...g});assert(g.documentWidth<=width+1);assert.equal(g.gridColumn,'1 / -1');assert.equal(g.clipped.length,0);assert(Number.parseFloat(g.font)>=14);assert(contrast(g.color,g.background)>=4.5);assert(g.scroll);await picker().locator('.irp-chapters').evaluate(e=>e.scrollTop=0);await shot('picker-'+lang+'-'+width+'-'+theme);
  });
 }
 await run('local-scroll-last-item-reachable',async()=>{const last=item('TMSA 2.2.18');await last.click();await expect(last).toBeChecked();await state(['c1'],['id1','long-17']);});
 await run('browser-console-and-network-boundary',async()=>{assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.externalRequests,[]);});
 assert.deepEqual(hashes(),receipt.inputsBefore);receipt.status='PASS';
} catch(e) {receipt.status='FAIL';receipt.failure={case:current,message:e.stack};process.exitCode=1;if(page)await page.screenshot({path:join(out,'failure.png'),fullPage:true}).catch(()=>{});}
finally {
 await browser?.close();await vite?.close();receipt.cleanup={browserClosed:!browser?.isConnected(),ownedPortClosed:port?await closed(port):true};
 if(!receipt.cleanup.browserClosed||!receipt.cleanup.ownedPortClosed){receipt.status='FAIL';process.exitCode=1;}
 receipt.inputsAfter=hashes();receipt.caseCount=receipt.cases.length;save();console.log(JSON.stringify({status:receipt.status,cases:receipt.caseCount,failure:receipt.failure,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));
}
