import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer as createPortProbe} from 'node:net';
import {createServer} from 'vite';
import ts from 'typescript';
import {chromium,expect} from '@playwright/test';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const evidence=path.join(repo,'qa-evidence','rich-text-core',stamp);
const scratch=path.join('C:/Users/tuotu/AppData/Local/hermes/cache/scratch','rich-text-core-'+stamp);
await mkdir(evidence,{recursive:true});await mkdir(scratch,{recursive:true});
const baseline=process.argv.includes('--baseline');
const receipt={scope:'Real Chromium component-only; no App, config, backend or private data',baseline,cases:[],errors:[],blocked:[],screenshots:[],inputs:{},evidence,scratch};
for(const name of ['src/richText.ts','src/RichTextEditor.tsx','src/richText.css','tests/rich-text.test.ts','scripts/verify-rich-text-editor.mjs']){
 try{receipt.inputs[name]=createHash('sha256').update(await readFile(path.join(repo,name))).digest('hex');}catch{receipt.inputs[name]='absent';}
}
const entry=`import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
${baseline?"":"import {RichTextEditor,RichText} from '/src/RichTextEditor.tsx';"}
import * as core from '/src/richText.ts';
import '/src/richText.css';
window.core=core;
function Harness(){
 const [initial,setInitial]=useState('Alpha beta'),[generation,setGeneration]=useState(0);
 const [values,setValues]=useState({a:initial,b:'Second',title:'Title'}),[disabled,setDisabled]=useState(false);
 window.qaReset=(value='Alpha beta')=>{setInitial(value);setValues({a:value,b:'Second',title:'Title'});setGeneration(x=>x+1);window.changes=[];setDisabled(false);};
 window.qaDisable=()=>setDisabled(true);
 window.qaExternal=value=>setValues(v=>({...v,a:value}));
 window.values=values;window.changes??=[];
 const edit=(name,value)=>{window.changes.push({name,value});setValues(v=>({...v,[name]:value}));};
 const Editor=${baseline?"({value,onChange,...props})=><textarea {...props} value={value} onChange={e=>onChange(e.target.value)}/>":'RichTextEditor'};
 return <main><h1>真實元件＋測試資料｜不連 production</h1><div className="pair" key={generation}>
 <label className="field">Self Assessment English<Editor value={values.a} onChange={v=>edit('a',v)} aria-label="Self Assessment English" rows={3} disabled={disabled} /></label>
 <label className="field">第二欄<Editor value={values.b} onChange={v=>edit('b',v)} aria-label="Second editor" rows={3}/></label>
 <label className="field">標題<Editor value={values.title} onChange={v=>edit('title',v)} aria-label="Title" singleLine rows={1}/></label>
 <label className="field">Compact untouched<Editor value={'Line 1\\n\\n  Line 2'} onChange={v=>edit('compact',v)} compact aria-label="Compact" rows={2}/></label>
 <label className="field">Read only<Editor value={initial} onChange={v=>edit('readonly',v)} readOnly aria-label="Read only" rows={2}/></label>
 <label className="field">Disabled<Editor value={initial} onChange={v=>edit('disabled',v)} disabled aria-label="Disabled" rows={2}/></label>
 </div><button id="outside">Outside</button><button id="save" onClick={()=>{window.actionClicks=(window.actionClicks||[]).concat('save');}}>Save</button><button id="cancel" onClick={()=>{window.actionClicks=(window.actionClicks||[]).concat('cancel');}}>Cancel</button>
 ${baseline?'':'<div id="display"><RichText value={values.a}/></div><div id="plain-display"><RichText value="literal"/></div>'}
 </main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);`;
await writeFile(path.join(scratch,'harness.tsx'),entry);
let server,browser;
// Vite 8 treats port:0 as its default 5173; reserve an OS-selected port explicitly.
const portProbe=createPortProbe();
await new Promise((resolve,reject)=>{portProbe.once('error',reject);portProbe.listen(0,'127.0.0.1',resolve);});
const selectedPort=portProbe.address().port;
await new Promise(resolve=>portProbe.close(resolve));
try{
 server=await createServer({root:repo,configFile:false,envDir:false,publicDir:false,cacheDir:path.join(scratch,'vite-cache'),appType:'custom',plugins:[{name:'isolated-rich-core-qa',resolveId(id){if(id==='/rich-core-entry.tsx')return '\0rich-core-entry.tsx';},load(id){if(id==='\0rich-core-entry.tsx')return ts.transpileModule(entry,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;},configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url?.split('?')[0]!=='/qa.html')return next();res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:");res.end(await s.transformIndexHtml('/qa.html','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated rich text QA</title><style>body{font:16px/1.5 Arial,sans-serif;color:#193447;margin:20px}h1{font-size:18px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:3px;min-width:0}button{font:inherit}#display{white-space:pre-wrap;margin-top:12px}@media(max-width:600px){.pair{grid-template-columns:1fr}body{margin:10px}}</style></head><body><div id="root"></div><script type="module" src="/rich-core-entry.tsx"></script></body></html>'));});}}],server:{host:'127.0.0.1',port:selectedPort,strictPort:true,fs:{allow:[repo,scratch]}},optimizeDeps:{include:['react','react-dom/client','react/jsx-runtime']}});
 await server.listen();const port=server.httpServer.address().port;const origin=`http://127.0.0.1:${port}`;receipt.origin=origin;
 browser=await chromium.launchPersistentContext(path.join(scratch,'chrome-profile'),{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,viewport:{width:1152,height:900},args:['--disable-background-networking','--disable-component-update','--no-first-run','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 await browser.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();receipt.blocked.push(url.origin);return route.abort();});
 const page=browser.pages()[0];page.on('pageerror',e=>receipt.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')receipt.errors.push(m.text());});
 await page.goto(origin+'/qa.html');
 const a=page.getByRole('textbox',{name:'Self Assessment English',exact:true});
 await expect(a).toBeVisible();
 const run=async(id,fn)=>{await fn();receipt.cases.push({id,status:'PASS'});console.log('PASS',id);};
 const reset=async(value='Alpha beta')=>{await page.evaluate(v=>window.qaReset(v),value);await expect(a).toHaveText(value);};
 const select=async(locator,start,end)=>locator.evaluate((root,[start,end])=>{root.focus();const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node,offset=0,sn,en,so,eo;while(node=walk.nextNode()){if(sn===undefined&&start<=offset+node.length){sn=node;so=start-offset;}if(end<=offset+node.length){en=node;eo=end-offset;break;}offset+=node.length;}const range=document.createRange();range.setStart(sn||root,so||0);range.setEnd(en||root,eo||0);const s=getSelection();s.removeAllRanges();s.addRange(range);document.dispatchEvent(new Event('selectionchange'));},[start,end]);
 const value=()=>page.evaluate(()=>({raw:window.values.a,doc:window.core.decodeRichText(window.values.a),runs:window.core.richTextRuns(window.values.a)}));
 await a.focus();
 if(baseline){await expect(page.getByRole('toolbar')).toBeVisible({timeout:1500});throw new Error('Unexpected baseline toolbar');}
 await run('focus-toolbar-seven-controls-and-layout',async()=>{
  const bar=page.getByRole('toolbar');await expect(bar).toBeVisible();assert.equal(await bar.getByRole('button').count(),7);
  const input=await a.boundingBox(),toolbar=await bar.boundingBox();assert.ok(toolbar.y+toolbar.height<=input.y+1);assert.ok(toolbar.height<=34);
  assert.equal(await a.getAttribute('aria-label'),'Self Assessment English');
  assert.equal(await page.locator('#plain-display').innerHTML(),'literal');
 });
 await run('selection-red-bold-retains-selection',async()=>{
  await select(a,0,5);await page.getByRole('button',{name:'紅色',exact:true}).click();await page.getByRole('button',{name:'加粗',exact:true}).click();
  const result=await value();assert.deepEqual(result.runs,[{text:'Alpha',bold:true,color:'red'},{text:' beta'}]);
 });
 await run('collapsed-style-future-typing-and-caret',async()=>{
  await select(a,10,10);await page.getByRole('button',{name:'藍色',exact:true}).click();await page.getByRole('button',{name:'加粗',exact:true}).click();
  for(const key of ['X','Y','Z'])await page.keyboard.type(key);
  assert.equal((await value()).doc.text,'Alpha betaXYZ');assert.deepEqual((await value()).runs.at(-1),{text:'XYZ',bold:true,color:'blue'});
  await select(a,7,7);await page.keyboard.type('123');assert.equal((await value()).doc.text,'Alpha b123etaXYZ');
 });
 await run('keyboard-bold-native-undo-redo',async()=>{
  await reset('Undo');await select(a,0,4);await page.keyboard.press('Control+b');assert.equal((await value()).runs[0].bold,true);
  await page.keyboard.press('Control+z');assert.equal((await value()).runs[0].bold,undefined);
  await page.keyboard.press('Control+Shift+z');assert.equal((await value()).runs[0].bold,true);
 });
 await run('single-pointer-save-cancel-survive-toolbar-blur-collapse',async()=>{
  await page.evaluate(()=>{window.actionClicks=[];});
  for(const action of ['save','cancel']){
   await reset('Pointer test');await select(a,0,7);await page.getByRole('button',{name:'紅色',exact:true}).click();
   await page.locator('#'+action).click();
   assert.ok((await page.evaluate(()=>window.actionClicks)).includes(action),'A single '+action+' click was swallowed by toolbar collapse');
   await expect(page.getByRole('toolbar')).toHaveCount(0);
  }
 });
 await run('legacy-crlf-and-literal-html-roundtrip',async()=>{
  await reset('A\r\n\r\n  B');assert.equal(await a.evaluate(root=>window.core.editorElementToDocument(root).text),'A\n\n  B');
  assert.equal(await a.evaluate(root=>{const lines=root.children;return lines[2].getBoundingClientRect().top-lines[0].getBoundingClientRect().top===2*parseFloat(getComputedStyle(root).lineHeight);}),true);
  await a.focus();await page.keyboard.press('Control+End');await page.keyboard.type('X');assert.equal((await value()).doc.text,'A\n\n  BX');
  await reset('<b>literal</b> &#x110000;');assert.equal(await a.locator('b').count(),0);
  await a.focus();await page.keyboard.press('Control+End');await page.keyboard.type('!');assert.equal((await value()).doc.text,'<b>literal</b> &#x110000;!');
 });
 await run('four-palette-colors-and-empty-future-typing',async()=>{
  for(const [label,color] of [['黑色','black'],['紅色','red'],['藍色','blue'],['綠色','green']]){
   await reset('');await a.focus();await page.getByRole('button',{name:label,exact:true}).click();assert.equal(await page.evaluate(()=>window.changes.length),0);
   await page.keyboard.type('New');assert.deepEqual((await value()).runs,[{text:'New',color}]);
   await page.keyboard.press('Control+z');assert.equal((await value()).doc.text,'');await page.keyboard.press('Control+y');assert.equal((await value()).doc.text,'New');
  }
 });
 await run('same-node-external-value-aba-and-focused-rerender',async()=>{
  await reset('A');await select(a,1,1);await page.keyboard.type('B');const emitted=(await value()).raw;
  await page.locator('#outside').focus();await page.evaluate(()=>window.qaExternal('C'));await expect(a).toHaveText('C');
  await page.evaluate(v=>window.qaExternal(v),emitted);await expect(a).toHaveText('AB');
  await select(a,1,1);await a.evaluate(node=>{window.retained=node;});
  await page.evaluate(()=>window.qaExternal('Incoming'));assert.equal(await a.evaluate(node=>node===window.retained),true);assert.equal(await a.innerText(),'AB');
  await page.keyboard.type('X');assert.equal((await value()).doc.text,'AXB');
 });
 await run('switch-two-editors-wrapper-focus-and-readonly',async()=>{
  const b=page.getByRole('textbox',{name:'Second editor',exact:true});await b.focus();assert.equal(await page.getByRole('toolbar').count(),1);await expect(b.locator('..').getByRole('toolbar')).toBeVisible();
  await b.locator('..').getByRole('button',{name:'綠色',exact:true}).focus();await expect(page.getByRole('toolbar')).toBeVisible();
  await page.locator('#outside').focus();await expect(page.getByRole('toolbar')).toHaveCount(0);
  for(const label of ['Read only','Disabled']){const target=page.getByRole('textbox',{name:label,exact:true});assert.equal(await target.getAttribute('contenteditable'),'false');await target.click({force:true});await expect(page.getByRole('toolbar')).toHaveCount(0);}
 });
 await run('compact-projection-untouched-by-focus-blur',async()=>{
  const c=page.getByRole('textbox',{name:'Compact',exact:true});await expect(c).toHaveText('Line 1  Line 2');
  const before=await page.evaluate(()=>window.changes.length);await c.focus();await page.locator('#outside').focus();assert.equal(await page.evaluate(()=>window.changes.length),before);
  await c.focus();await page.keyboard.press('Control+End');await page.keyboard.press('Enter');await page.keyboard.type('New');assert.match(await c.innerText(),/Line 2\nNew$/);
 });
 await run('ordered-list-enter-softbreak-empty-exit-reopen',async()=>{
  await reset('First');await select(a,0,5);await page.getByRole('button',{name:'編號清單',exact:true}).click();await expect(a.locator('ol > li')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('Second');
  assert.equal((await value()).doc.text,'1. First\n2. Second');
  await page.keyboard.press('Shift+Enter');await page.keyboard.type('soft');assert.equal((await value()).doc.text,'1. First\n2. Second\nsoft');assert.equal((await value()).doc.lists.length,2);
  await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.type('Outside');await expect(a.locator('ol > li')).toHaveCount(2);
  const saved=(await value()).raw;await page.evaluate(v=>window.qaReset(v),saved);await expect(a.locator('ol > li')).toHaveCount(2);assert.match(await a.innerText(),/Outside$/);
 });
 await run('bullet-list-roundtrip',async()=>{
  await reset('Bullet');await select(a,0,6);await page.getByRole('button',{name:'項目符號',exact:true}).click();await page.keyboard.press('ArrowRight');await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('Next');
  assert.equal((await value()).doc.text,'• Bullet\n• Next');const saved=(await value()).raw;await page.evaluate(v=>window.qaReset(v),saved);await expect(a.locator('ul > li')).toHaveCount(2);
 });
 await run('external-paste-is-plain-and-safe',async()=>{
  await reset('Paste:');await select(a,6,6);await a.evaluate(root=>{const data=new DataTransfer();data.setData('text/plain','<img src=x onerror=alert(1)>\nSafe');data.setData('text/html','<img src=x onerror=alert(1)><b>ATTACK</b>');root.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  assert.equal((await value()).doc.text,'Paste:<img src=x onerror=alert(1)>\nSafe');assert.equal(await a.locator('img').count(),0);
 });
 await run('single-line-title-five-controls-blocks-newline',async()=>{
  const title=page.getByRole('textbox',{name:'Title',exact:true});await title.focus();assert.equal(await page.getByRole('toolbar').getByRole('button').count(),5);
  await page.keyboard.press('Control+End');await page.keyboard.press('Enter');await page.keyboard.type('X');assert.equal(await title.innerText(),'TitleX');
 });
 await run('ime-composition-no-intermediate-write',async()=>{
  await reset('IME');await select(a,3,3);const before=await page.evaluate(()=>window.changes.length);const cdp=await browser.newCDPSession(page);
  await cdp.send('Input.imeSetComposition',{text:'中文',selectionStart:2,selectionEnd:2});assert.equal(await page.evaluate(()=>window.changes.length),before);
  await cdp.send('Input.insertText',{text:'中文'});assert.equal((await value()).doc.text,'IME中文');await cdp.detach();
 });
 await run('dynamic-disabled-revokes-editability',async()=>{await a.focus();await page.evaluate(()=>window.qaDisable());await expect(a).toHaveAttribute('contenteditable','false');await expect(page.getByRole('toolbar')).toHaveCount(0);});
 await reset('Alpha beta');await select(a,0,5);await page.getByRole('button',{name:'紅色',exact:true}).click();await page.getByRole('button',{name:'加粗',exact:true}).click();
 const desktop=path.join(evidence,'desktop.png');await page.screenshot({path:desktop,fullPage:true});receipt.screenshots.push(desktop);
 await run('narrow-fine-pointer-keeps-toolbar',async()=>{await page.setViewportSize({width:440,height:900});await a.focus();await expect(page.getByRole('toolbar')).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);});
 const styled=(await value()).raw;
 for(const device of [{name:'phone',width:390,height:844},{name:'tablet',width:820,height:1180}]){
  await run(device.name+'-touch-preserves-styles-without-toolbar',async()=>{
   const mobile=await browser.browser().newContext({viewport:{width:device.width,height:device.height},isMobile:true,hasTouch:true});await mobile.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
   const p=await mobile.newPage();await p.goto(origin+'/qa.html');await p.getByRole('textbox',{name:'Self Assessment English',exact:true}).waitFor();await p.evaluate(v=>window.qaReset(v),styled);
   const input=p.getByRole('textbox',{name:'Self Assessment English',exact:true});await input.tap();await expect(p.getByRole('toolbar')).toBeHidden();assert.equal(await input.locator('b').count(),1);assert.equal(await input.getAttribute('contenteditable'),'true');
   await p.keyboard.press('Control+End');await p.keyboard.type(' touch');assert.ok((await p.evaluate(()=>window.core.decodeRichText(window.values.a))).spans.some(s=>s.color==='red'));
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const shot=path.join(evidence,device.name+'.png');await p.screenshot({path:shot,fullPage:true});receipt.screenshots.push(shot);await mobile.close();
  });
 }
 assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.blocked,[]);receipt.status='PASS';
}catch(error){receipt.status=baseline?'EXPECTED_RED':'FAIL';receipt.failure=String(error.stack||error);console.error(receipt.failure);process.exitCode=baseline?0:1;}
finally{
 const chrome=browser?.browser();
 if(browser)await browser.close();
 if(server)await server.close();
 receipt.cleanup={browserDisconnected:!chrome?.isConnected(),serverListening:server?.httpServer?.listening??false,retained:'Evidence and isolated profile retained; no files deleted'};
 if(!receipt.cleanup.browserDisconnected||receipt.cleanup.serverListening){receipt.status='FAIL';process.exitCode=1;}
 receipt.passed=receipt.cases.filter(c=>c.status==='PASS').length;
 await writeFile(path.join(evidence,'receipt.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({status:receipt.status,passed:receipt.passed,receipt:path.join(evidence,'receipt.json'),screenshots:receipt.screenshots,cleanup:receipt.cleanup},null,2));
}
