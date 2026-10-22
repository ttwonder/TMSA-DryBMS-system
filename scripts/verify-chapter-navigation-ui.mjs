// Original App + owned PostgreSQL + synthetic data. No hosted interactions.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed} from './native-postgres.mjs';
const red=process.argv.includes('--red'),noteRed=process.argv.includes('--note-red'),aggregateRed=process.argv.includes('--aggregate-red');
const out=join(root,'qa-evidence','chapter-navigation',`${aggregateRed?'aggregate-red':red?'navigation-red':noteRed?'note-red':'ui'}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const receipt={layer:'Real original UI + owned PostgreSQL; synthetic data, NOT hosted acceptance',productionRequests:0,cases:[],errors:[],blockedExternal:0,screenshots:[]};
const groups={green:['green','green'],yellow:['green','yellow'],red:['red','red'],purple:['green','purple'],mixedGR:['green','red'],mixedYR:['yellow','red'],mixedGYR:['green','yellow','red'],allYellow:['yellow','yellow'],incompleteR:['red','purple']};
const colors=Object.keys(groups),expectedColors={mixedGR:'yellow',mixedYR:'yellow',mixedGYR:'yellow',allYellow:'yellow',incompleteR:'purple'};let qa,vite,browser,current='setup';
const inputPaths=['src/App.tsx','src/FrameworkPage.tsx','src/Overview.tsx','src/domain.ts','src/styles.css','src/themes.css','src/useRecordEditor.ts','src/api.ts','scripts/verify-chapter-navigation-ui.mjs','scripts/native-postgres.mjs','scripts/qa-server.mjs'];
const fingerprints=()=>Object.fromEntries(inputPaths.map(path=>[path,createHash('sha256').update(readFileSync(join(root,path))).digest('hex')]));receipt.inputs=fingerprints();
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false)});s.once('error',()=>resolve(true));});
try{
 const seed=syntheticSeed(),chapterModel=seed.chapters[0],itemModel=seed.items[0],assessmentModel=seed.assessments[0];seed.chapters=[];seed.items=[];seed.assessments=[];seed.dryScores=[];
 for(const fw of ['TMSA','DRYBMS'])for(const [order,color] of [...colors,'empty'].entries()){
  const id=`chapter-${fw}-${color}`;seed.chapters.push({...chapterModel,id,frameworkId:fw,code:String(order+1),order:order+1,name:{en:`${color} chapter`,zh:`${color} 狀態章節`}});
  if(color==='empty')continue;
  for(const [index,status] of groups[color].entries()){const n=index+1;
   const itemId=`item-${fw}-${color}-${n}`;seed.items.push({...itemModel,id:itemId,frameworkId:fw,chapterId:id,code:`QA-${fw}-${color}-${n}`,level:n,order:n,departmentIds:[n===1?'marine':'technical'],kpi:{en:`${color} requirement ${n}`,zh:`${color} 要求 ${n}`}});
   seed.assessments.push({...assessmentModel,id:`assessment-${itemId}`,itemId,response:status==='green'?'yes':'no',conformity:status==='green'?'all':status==='yellow'?'partial':'none',reviewed:status!=='purple',departmentIds:[n===1?'marine':'technical']});
  }
 }
 qa=await startQaServer({seed,evidenceDir:out,latestMigration:17});
 await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/018_person_department_heads.sql'),'utf8'));
 vite=await createServer({root,base:'/',server:{host:'127.0.0.1',port:0,strictPort:true,watch:{ignored:['**/qa-evidence/**','**/private-seed/**']}},logLevel:'error'});await vite.listen();const ui=`http://127.0.0.1:${vite.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>{if(![ui,qa.url].includes(new URL(route.request().url()).origin)){receipt.blockedExternal++;return route.abort();}return route.continue();});
 await context.addInitScript(({config,user})=>{localStorage.setItem('fpmc-compliance-config',JSON.stringify(config));sessionStorage.setItem('fpmc-compliance-client-id',user.clientId);sessionStorage.setItem('fpmc-compliance-session',JSON.stringify({user:user.user,sessionToken:user.sessionToken}));},{config:qa.config,user:qa.users.owner});
 const page=await context.newPage();page.setDefaultTimeout(red?3000:15000);page.on('pageerror',e=>receipt.errors.push(e.name));await page.goto(ui);await page.locator('.main-nav').waitFor();let lang='zh';
 const text=(zh,en)=>lang==='zh'?zh:en,nav=name=>page.locator('.main-nav').getByRole('button',{name,exact:true});
 const changeLanguage=async value=>{if(lang!==value){await page.getByRole('button',{name:'Switch language',exact:true}).click();lang=value;}};
 const chapter=color=>page.locator('.chapter-button').filter({hasText:new RegExp(`\\s${color} ${text('狀態章節','chapter')}`)});
 const durable=async()=>({records:(await qa.db.setup.query('select kind,id,version,body from compliance_private.records order by kind,id')).rows,operations:(await qa.db.setup.query('select count(*)::int n from compliance_private.operations')).rows[0].n,audit:(await qa.db.setup.query('select count(*)::int n from compliance_private.audit')).rows[0].n});
 const initial=await durable();
 const run=async(id,fn)=>{current=id;await fn();receipt.cases.push({id,status:'PASS'});};
 const expectColor=async(color,expected=expectedColors[color]??color)=>{
  const actual=await chapter(color).locator('span').first().evaluate(el=>getComputedStyle(el).color);
  const lamp=await page.locator(`.navigation-legend .status-dot.${expected}`).evaluate(el=>getComputedStyle(el).backgroundColor);
  receipt.lastColor={chapter:color,actual,expected:lamp};assert.equal(actual,lamp,`Chapter ${color} text must match its aggregate status lamp`);
 };
 await nav('TMSA').click();await page.locator('.chapter-button').first().waitFor();
 const beforeImage=join(out,'baseline-TMSA-desktop.png');await page.screenshot({path:beforeImage});receipt.screenshots.push(beforeImage);
 await run('TMSA-all-updated-and-fully-met-chapter-name-is-green',()=>expectColor('green'));
 for(const fw of ['TMSA','DRYBMS'])await run(`${fw}-updated-mixed-green-red-is-yellow`,async()=>{await nav(fw).click();await expectColor('mixedGR');await expectColor('mixedYR');await expectColor('mixedGYR');});
 if(!red&&!aggregateRed){
  for(const fw of ['TMSA','DRYBMS'])await run(`${fw}-four-aggregate-colors-and-empty-chapter`,async()=>{await nav(fw).click();for(const color of colors)await expectColor(color);await expectColor('empty','purple');});
  for(const fw of ['TMSA','DRYBMS'])await run(`${fw}-stage-status-search-and-department-filters-do-not-greenwash-chapter`,async()=>{
   await nav(fw).click();await page.getByLabel('Stage filter',{exact:true}).selectOption('1');for(const color of colors)await expectColor(color);await page.getByLabel('Stage filter',{exact:true}).selectOption('');
   await page.getByLabel('Status filter',{exact:true}).selectOption('green');for(const color of colors)await expectColor(color);await page.getByLabel('Status filter',{exact:true}).selectOption('');
   await page.getByLabel('搜尋條目',{exact:true}).fill(`QA-${fw}-green-1`);for(const color of colors)await expectColor(color);await page.getByLabel('搜尋條目',{exact:true}).fill('');
   const group=page.locator('.navigation-department-filter'),departments=(await qa.db.setup.query("select body->'departments' departments from compliance_private.records where kind='settings' and id='settings'")).rows[0].departments,marine=departments.find(d=>d.id==='marine');assert(marine,'Synthetic seed must have marine department');await group.locator('summary').click();await group.getByRole('checkbox',{name:marine.name.zh||marine.name.en,exact:true}).check();for(const color of colors)await expectColor(color);await group.getByRole('button',{name:'清除部門篩選',exact:true}).click();await group.locator('summary').click();
  });
  for(const mode of ['normal','dark','eye'])for(const fw of ['TMSA','DRYBMS'])await run(`${fw}-${mode}-aggregate-colors`,async()=>{await page.getByRole('combobox',{name:'顯示模式',exact:true}).selectOption(mode);await nav(fw).click();for(const color of colors)await expectColor(color);});
  await page.getByRole('combobox',{name:'顯示模式',exact:true}).selectOption('normal');
  await run('read-only-navigation-and-filters-zero-business-writes',async()=>assert.deepEqual(await durable(),initial));
  for(const fw of ['TMSA','DRYBMS'])for(const language of ['zh','en'])for(const width of [1440,390])await run(`${fw}-${language}-${width}-palette-selected-state-and-geometry`,async()=>{
   await changeLanguage(language);await page.setViewportSize({width,height:width===390?844:1000});await nav(fw).click();
   for(const color of colors){await chapter(color).click();await expectColor(color);await expect(chapter(color)).toHaveClass(/current/);}
   const geometry=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,chapters:[...document.querySelectorAll('.chapter-button')].map(el=>({rect:el.getBoundingClientRect().toJSON(),fontSize:getComputedStyle(el).fontSize,spanWidth:el.querySelector('span').getBoundingClientRect().width,spanScroll:el.querySelector('span').scrollWidth}))}));
   assert(geometry.documentWidth<=geometry.viewport+1,'Document must not overflow');assert(geometry.chapters.every(c=>c.fontSize==='14px'),'Keep original navigation typography');assert(geometry.chapters.every(c=>c.rect.x>=0&&c.rect.right<=geometry.viewport+1&&c.spanScroll<=c.spanWidth+1),'Keep chapter labels inside navigation');
   const image=join(out,`${fw}-${language}-${width}.png`);await page.screenshot({path:image});receipt.screenshots.push(image);receipt.cases.push({id:`${fw}-${language}-${width}-measured-layout`,status:'PASS',geometry});
  });
  current='overview-requested-explanation-absent-in-both-languages';
  for(const language of ['zh','en']){await changeLanguage(language);await nav(text('總覽','Overview')).click();await expect(page.locator('.calculation-note')).toHaveCount(0);await expect(page.getByText(/TMSA採公司總表20分章等權平均|TMSA is the equal mean of the company/)).toHaveCount(0);await expect(page.locator('.simulation')).toBeVisible();}
  receipt.cases.push({id:current,status:'PASS'});
  await run('draft-and-cancel-do-not-change-chapter-color-or-saved-assessment',async()=>{
   await changeLanguage('zh');await page.setViewportSize({width:1440,height:1000});await nav('TMSA').click();await chapter('green').click();const before=await durable();await page.locator('.item-actions').getByRole('button',{name:'修改',exact:true}).click();await page.getByLabel('已完成本次更新',{exact:true}).uncheck();await expectColor('green');await page.locator('.item-actions').getByRole('button',{name:'取消編輯',exact:true}).click();await expectColor('green');assert.deepEqual(await durable(),before);
  });
  await run('native-save-ACK-refresh-updates-navigation-to-purple-no-other-business-change',async()=>{
   const before=await durable();await page.locator('.item-actions').getByRole('button',{name:'修改',exact:true}).click();await page.getByLabel('已完成本次更新',{exact:true}).uncheck();await page.locator('.item-actions').getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.assessment-editor')).toHaveCount(0);await expect.poll(()=>chapter('green').locator('span').first().evaluate(el=>getComputedStyle(el).color)).toBe(await page.locator('.navigation-legend .status-dot.purple').evaluate(el=>getComputedStyle(el).backgroundColor));
   const after=await durable(),id='assessment-item-TMSA-green-1';assert.equal(after.audit,before.audit+1);assert.equal(after.operations,before.operations+1);assert.deepEqual(after.records.filter(r=>!(r.kind==='assessment'&&r.id===id)),before.records.filter(r=>!(r.kind==='assessment'&&r.id===id)));const old=before.records.find(r=>r.kind==='assessment'&&r.id===id),saved=after.records.find(r=>r.kind==='assessment'&&r.id===id);assert.equal(saved.body.reviewed,false);assert.equal(saved.version,old.version+1);for(const key of Object.keys(old.body))if(!['reviewed','version','updatedAt','updatedBy'].includes(key))assert.deepEqual(saved.body[key],old.body[key]);await page.reload();await page.locator('.main-nav').waitFor();await nav('TMSA').click();await expectColor('green','purple');
  });
  for(const fw of ['TMSA','DRYBMS'])await run(`${fw}-all-red-to-mixed-yellow-only-after-native-save`,async()=>{
   await nav(fw).click();await chapter('red').click();await expectColor('red');const before=await durable();
   await page.locator('.item-actions').getByRole('button',{name:'修改',exact:true}).click();await page.getByLabel('Y/N',{exact:true}).selectOption('yes');await expectColor('red');
   await page.locator('.item-actions').getByRole('button',{name:'取消編輯',exact:true}).click();assert.deepEqual(await durable(),before);await expectColor('red');
   await page.locator('.item-actions').getByRole('button',{name:'修改',exact:true}).click();await page.getByLabel('Y/N',{exact:true}).selectOption('yes');
   await page.locator('.item-actions').getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.assessment-editor')).toHaveCount(0);await expectColor('red','yellow');
   const after=await durable(),id=`assessment-item-${fw}-red-1`,saved=after.records.find(r=>r.kind==='assessment'&&r.id===id),old=before.records.find(r=>r.kind==='assessment'&&r.id===id);
   assert.equal(saved.body.response,'yes');assert.equal(saved.body.conformity,'all');assert.equal(saved.body.reviewed,true);assert.equal(saved.version,old.version+1);assert.equal(after.operations,before.operations+1);assert.equal(after.audit,before.audit+1);
   assert.deepEqual(after.records.filter(r=>!(r.kind==='assessment'&&r.id===id)),before.records.filter(r=>!(r.kind==='assessment'&&r.id===id)));
   for(const key of Object.keys(old.body))if(!['response','conformity','version','updatedAt','updatedBy'].includes(key))assert.deepEqual(saved.body[key],old.body[key]);
   await page.reload();await page.locator('.main-nav').waitFor();await nav(fw).click();await expectColor('red','yellow');
  });
 }
 assert.equal(receipt.blockedExternal,0);assert.deepEqual(receipt.errors,[]);receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.failure={case:current,name:e?.name??'Error',code:e?.code??null};writeFileSync(join(out,'private-failure.txt'),e?.stack??String(e));process.exitCode=1;}
finally{receipt.inputsUnchanged=JSON.stringify(fingerprints())===JSON.stringify(receipt.inputs);if(!receipt.inputsUnchanged){receipt.status='FAIL';process.exitCode=1;}await browser?.close();const ports={ui:vite?.httpServer?.address()?.port,api:qa?.server?.address()?.port,pg:qa?.db?.port};await vite?.close();await qa?.stop();receipt.cleanup={};for(const [name,port] of Object.entries(ports))receipt.cleanup[name]=port?await closed(port):true;receipt.testedInputs={};for(const path of ['src/App.tsx','src/FrameworkPage.tsx','src/Overview.tsx','src/domain.ts','src/styles.css','src/useRecordEditor.ts','src/api.ts','scripts/verify-chapter-navigation-ui.mjs','scripts/native-postgres.mjs','scripts/qa-server.mjs','supabase/migrations/006_restart_updates.sql','supabase/migrations/007_shared_targets.sql'])receipt.testedInputs[path]=createHash('sha256').update(readFileSync(join(root,path))).digest('hex');writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,failure:receipt.failure,lastColor:receipt.lastColor,cleanup:receipt.cleanup,receipt:join(out,'receipt.json')}));}
