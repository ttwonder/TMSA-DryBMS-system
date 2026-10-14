import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import {scoringFixture} from '../tests/tmsa14-fixture.ts';
import {DEFAULT_PERMISSIONS} from '../src/domain.ts';
import {buildFrameworkPdf,buildInspectionPdf,buildOverviewPdf,buildFrameworkExcel} from '../src/reports.ts';
import {root} from './native-postgres.mjs';
const red=process.argv.includes('--red'),out=join(root,'qa-evidence/tmsa14',`reports-${red?'red':'green'}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const {state,inspection}=scoringFixture();Object.assign(state,{people:[],improvements:[],cycles:[],provenance:[],auditLogs:[],serverTime:'2026-01-01T00:00:00Z',snapshotToken:'QA_SYNTHETIC',settings:{id:'settings',version:1,departments:[],rolePermissions:DEFAULT_PERMISSIONS,siteGateConfigured:true}});state.inspections=[inspection];
const options={fontBytes:new Uint8Array(readFileSync(join(root,'public/fonts/NotoSansTC-Regular.ttf'))),templateBytes:new Uint8Array(readFileSync(join(root,'public/templates/tmsa-template.xlsx'))),fallbackFontBytes:['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(f=>new Uint8Array(readFileSync(join(root,'public/fonts',f))))};
const receipt={layer:'Actual PDF/XLSX builders + selectable-text extraction; synthetic data, not hosted export',artifacts:[],cases:[]};
const pdf=async(name,build)=>{const before=JSON.stringify(state),bytes=await build(),file=join(out,name);assert.equal(JSON.stringify(state),before);writeFileSync(file,bytes);const p=spawnSync('uv',['run','--no-project','--python','3.12','--with','pymupdf','python','-c','import pymupdf,sys,json; d=pymupdf.open(sys.argv[1]); print(json.dumps({"pages":len(d),"text":"\\n".join(p.get_text() for p in d)},ensure_ascii=True))',file],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);const data=JSON.parse(p.stdout.split(/\r?\n/).find(line=>line.startsWith('{"pages":'))??p.stdout);receipt.artifacts.push({name,path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),pages:data.pages});writeFileSync(file+'.txt',data.text);return data.text.replace(/\s/g,'');};
try{
 inspection.includeTmsaChapter14=false;for(const r of inspection.results.filter(r=>r.itemId.startsWith('TMSA:14'))){r.response=null;r.reviewed=false;}
 let text=await pdf('history-excluded-ungraded14.pdf',()=>buildInspectionPdf(state,inspection.id,'en',options));
 assert(text.includes('Inspectionscore:4.00/4'),'Excluded ungraded chapter 14 must not suppress a valid history score');
 receipt.cases.push('excluded-ungraded-history-score');
 if(!red){
  assert(text.includes('TMSAchapter14:excluded'));assert(text.includes('Chapter14'));assert(text.includes('Keep'));
  for(const included of [false,true]){
   state.frameworks[0].includeTmsaChapter14=included;
   text=await pdf(`current-${included}.pdf`,()=>buildFrameworkPdf(state,'TMSA','en',undefined,options));assert(text.includes(`:${included?'2.00':'4.00'}/4`));assert(text.includes(`TMSAchapter14:${included?'included':'excluded'}`));assert(text.includes('Chapter14'));
   text=await pdf(`overview-${included}.pdf`,()=>buildOverviewPdf(state,'TMSA','en',undefined,options));assert(text.includes(`Currentscore:${included?'2.00':'4.00'}/4`));assert(text.includes('Scoreforthisinspection’sincludedscope:4.00/4'));
   const bytes=await buildFrameworkExcel(state,'TMSA','en',undefined,options),file=join(out,`current-${included}.xlsx`);writeFileSync(file,bytes);const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);const all=JSON.stringify(book.worksheets.map(s=>({name:s.name,values:s.getSheetValues(),merges:s.model.merges,columns:s.columns.map(c=>c.width)})));assert(all.includes('14.1.1'));assert(all.includes('Requirement'));assert(!all.includes('Scoring introduction'));if(!included)receipt.excelBaseline=all;else assert.equal(all,receipt.excelBaseline,'Scope changes neither raw Excel content nor its layout');receipt.artifacts.push({name:`current-${included}.xlsx`,path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
   receipt.cases.push(`current-${included}-pdf-overview-excel-preservation`);
  }
  inspection.includeTmsaChapter14=true;text=await pdf('history-included-ungraded14.pdf',()=>buildInspectionPdf(state,inspection.id,'en',options));assert(text.includes('Notcompletelyscored;unassessedisnotzero'));assert(text.includes('TMSAchapter14:included'));receipt.cases.push('history-own-policy-not-global');
  inspection.includeTmsaChapter14=false;text=await pdf('history-zh.pdf',()=>buildInspectionPdf(state,inspection.id,'zh',options));assert(text.includes('檢查得分:4.00/4'));assert(text.includes('第14章：不納入'));receipt.cases.push('traditional-chinese-output');
 }
 receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.failure=e.stack;process.exitCode=1;}
finally{delete receipt.excelBaseline;receipt.testedInputs={};for(const f of ['src/domain.ts','src/reports.ts','src/types.ts','scripts/verify-tmsa14-reports.mjs','tests/tmsa14-fixture.ts'])receipt.testedInputs[f]=createHash('sha256').update(readFileSync(join(root,f))).digest('hex');writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases,artifacts:receipt.artifacts.length,failure:receipt.failure,receipt:join(out,'receipt.json')}));}
