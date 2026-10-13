import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as reports from '../src/reports.ts';
import {DEFAULT_PERMISSIONS,departmentsLabel,assessmentFor,openIssuesFor} from '../src/domain.ts';
const dir=resolve(process.env.REPORT_ACTUAL_DIR??resolve(tmpdir(),'tmsa-report-actual'));await mkdir(dir,{recursive:true});
// Resume only the already prepared private fixture; never read canonical data.
const fixturePath=resolve(process.env.REPORT_FIXTURE_PATH??resolve(dir,'private-sanitized-state.json'));
const state=JSON.parse(await readFile(fixturePath,'utf8'));const unchangedSource=JSON.stringify(state);
const deptIds=[...new Set(state.items.flatMap(i=>i.departmentIds).concat(state.assessments.flatMap(a=>a.departmentIds??[]),state.improvements.flatMap(i=>i.departmentIds)))];
const personIds=[...new Set(state.assessments.flatMap(a=>a.assigneeIds).concat(state.improvements.flatMap(i=>i.assigneeIds),state.improvements.flatMap(i=>i.events.map(e=>e.by))))];
const base=id=>({id,version:1,createdAt:'2026-10-11T01:00:00Z',updatedAt:'2026-10-11T02:00:00Z',updatedBy:'qa-person'});

const fontBytes=new Uint8Array(await readFile('public/fonts/NotoSansTC-Regular.ttf'));const templateBytes=new Uint8Array(await readFile('public/templates/tmsa-template.xlsx'));const fallbackFontBytes=await Promise.all(['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(async f=>new Uint8Array(await readFile('public/fonts/'+f))));
let fieldLines=[];const options={fontBytes,templateBytes,fallbackFontBytes,onFieldLine:line=>fieldLines.push(line)};
// Private local fixture: actual source bodies + synthetic people metadata, never dist/public.

// Expose existing internal source formatters in a generated, private QA-only module.
let code=await readFile('src/reports.ts','utf8');const productSha256=createHash('sha256').update(code).digest('hex');code+='\nexport { itemPdfRows, itemGuidance, evidenceNarrative, TextPdf };\n';
const modulePath=resolve('src',`reports-layout-oracle-${process.pid}.ts`); // owned generated oracle, not a merge file
// Keep oracle outside src; relative imports are rewritten only in this private generated copy.
code=code.replace(/from '\.\/types.ts'/g,`from '${pathToFileURL(resolve('src/types.ts')).href}'`).replace(/from '\.\/domain.ts'/g,`from '${pathToFileURL(resolve('src/domain.ts')).href}'`);
const oracleDir=resolve(process.env.REPORT_ORACLE_DIR??'scripts/.report-qa');await mkdir(oracleDir,{recursive:true});
const owned=resolve(oracleDir,`reports-oracle-${process.pid}.ts`);
// This directory gets package-resolution via an owned node_modules directory of individual junctions.
await writeFile(owned,code);const oracle=await import('file:///'+owned.replace(/\\/g,'/'));
const manifestPath=resolve(dir,process.env.REPORT_RECEIPT_NAME??'generation-receipt.json');
let manifest;try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch{try{manifest=JSON.parse(await readFile(resolve(dir,'generation-receipt.json'),'utf8'));}catch{manifest={outputs:[]};}}
if(manifest.sourceSha256&&manifest.sourceSha256!==state.snapshotToken)throw new Error('Fixture source hash changed');
Object.assign(manifest,{label:'Local real source snapshot copy + synthetic people metadata; NOT Supabase or mounted-download acceptance',sourceSha256:state.snapshotToken,productSha256,fixtureSha256:createHash('sha256').update(await readFile(fixturePath)).digest('hex')});
manifest.errors??=[];
async function save(name,bytes){const p=resolve(dir,name);await writeFile(p,bytes);manifest.outputs.push({name,path:p,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});await writeFile(manifestPath,JSON.stringify(manifest,null,2));}
let captured=[];
const table=oracle.TextPdf.prototype.table;
oracle.TextPdf.prototype.table=function(headers,ratios,rows,...rest){captured.push({kind:'table',block:this.blockIndex,headers,rows});return table.call(this,headers,ratios,rows,...rest);};
const paragraph=oracle.TextPdf.prototype.paragraph;
oracle.TextPdf.prototype.paragraph=function(text,size=15){captured.push({kind:'paragraph',block:this.blockIndex,text,size});return paragraph.call(this,text,size);};
async function task(name,build){
 if(process.env.REPORT_TASK&&!process.env.REPORT_TASK.split(',').includes(name))return;
 const previous=manifest.outputs.find(o=>o.name===name);
 if(previous){const bytes=await readFile(previous.path);if(createHash('sha256').update(bytes).digest('hex')!==previous.sha256)throw new Error('Completed artifact hash changed');console.log(JSON.stringify({name,status:'preserved',bytes:bytes.length}));return;}
 console.log(JSON.stringify({name,status:'start',pid:process.pid,productSha256}));captured=[];fieldLines=[];const start=performance.now();
 try{const bytes=await build();if(JSON.stringify(state)!==unchangedSource)throw new Error('Builder mutated authorized source snapshot');if(name.endsWith('.pdf')){await writeFile(resolve(dir,name.replace(/\.pdf$/, '-private-fields.json')),JSON.stringify(captured));await writeFile(resolve(dir,name.replace(/\.pdf$/, '-field-geometry.json')),JSON.stringify(fieldLines));}await save(name,bytes);console.log(JSON.stringify({name,status:'complete',bytes:bytes.length,ms:performance.now()-start}));}
 catch(e){manifest.errors.push({name,error:String(e),productSha256});await writeFile(manifestPath,JSON.stringify(manifest,null,2));console.log(JSON.stringify({name,status:'failed',error:String(e)}));}
}
for(const id of ['TMSA','DRYBMS']){
 const chapters=state.chapters.filter(c=>c.active&&c.frameworkId===id).sort((a,b)=>a.order-b.order||a.code.localeCompare(b.code));const items=chapters.flatMap(c=>state.items.filter(i=>i.active&&i.frameworkId===id&&i.chapterId===c.id).sort((a,b)=>a.order-b.order));
 await task(`${id}-full.xlsx`,()=>reports.buildFrameworkExcel(state,id,'zh',undefined,options));
 const pdfRows=oracle.itemPdfRows(state,items,'zh');const excelFields=items.map(item=>{const a=assessmentFor(state,item.id),open=openIssuesFor(state,item.id),n=reports.assessmentNarrative(state,a);if(open.length){n.en+='\n\n[Open improvements: '+open.map(r=>r.id).join(', ')+']';n.zh+='\n\n[未結案改善：'+open.map(r=>r.id).join(', ')+']';}return {id:item.id,code:item.code,fields:[null,item.kpi,oracle.itemGuidance(item),null,n,oracle.evidenceNarrative(a),{en:departmentsLabel(state,a?.departmentIds??item.departmentIds,'en'),zh:departmentsLabel(state,a?.departmentIds??item.departmentIds,'zh')}]};});
 await writeFile(resolve(dir,`${id}-private-expectations.json`),JSON.stringify({frameworkId:id,ids:items.map(i=>i.id),codes:items.map(i=>i.code),pdfRows,excelFields}));

 console.log(JSON.stringify({framework:id,items:items.length,uniqueIds:new Set(items.map(i=>i.id)).size,chapters:chapters.length}));
}
for(const id of ['TMSA','DRYBMS'])await task(`${id}-full.pdf`,()=>oracle.buildFrameworkPdf(state,id,'zh',undefined,options));
const issueIds=state.improvements.map(i=>i.id);await task('improvements-full.pdf',()=>oracle.buildImprovementsPdf(state,issueIds,'zh',undefined,options));
for(const [index,inspection] of state.inspections.entries())await task(`history-${index+1}.pdf`,()=>oracle.buildInspectionPdf(state,inspection.id,'zh',options));
await task('overview-TMSA.pdf',()=>oracle.buildOverviewPdf(state,'TMSA','zh',undefined,options));await task('overview-DRYBMS.pdf',()=>oracle.buildOverviewPdf(state,'DRYBMS','zh',undefined,options));
console.log(JSON.stringify({outputs:manifest.outputs.length,manifest:resolve(dir,'generation-receipt.json')}));
