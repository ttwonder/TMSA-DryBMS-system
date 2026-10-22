// Pure production builders, synthetic data only; not mounted UI/download QA.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as reports from '../src/reports.ts';
import {reportingFixture} from '../tests/fpmc-reporting-fixture.ts';
import {encodeRichText,richTextRuns,richTextToPlainText,compactRichText,RICH_COLORS} from '../src/richText.ts';
const phase=process.argv[2]??'candidate';
assert(['baseline','candidate','rich'].includes(phase));
const out=resolve('qa-evidence/rich-text-reports',phase+'-'+new Date().toISOString().replaceAll(':','-'));
mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const state=reportingFixture(false);
if(phase==='rich'){
 const colors=Object.keys(RICH_COLORS);
 const styled=(label,count=4,inline=false)=>{
  const lines=Array.from({length:count},(_,i)=>inline?`${label}_${colors[i%4]} 中文`:`${i%2?'• ':`${i+1}. `}${label}_${i}_${colors[i%4]} 中文 AVATAR office ffi CO₂ non‑breaking soft\u00adhyphen ${count>8?'complete long bilingual narrative 保留完整中英雙語內容 '.repeat(7):''}END_${label}_${i}`);
  if(!inline&&count>8)lines[1]+='\nSOFT_CONTINUE_'+label+' 保持同一列表內換行的懸掛縮排';
  const text=lines.join(inline?' / ':'\n\n');let start=0;
  const spans=lines.map((line,i)=>{const span={start,end:start+line.length,color:colors[i%4],...(i%2?{bold:true}:{})};start+=line.length+(inline?3:2);return span;});
  const lists=inline?[]:spans.map((span,i)=>({start:span.start,end:span.end,kind:i%2?'bullet':'ordered',...(i%2?{}:{ordinal:i+1})}));
  return encodeRichText({text,spans,lists});
 };
 const bi=(label,count=4)=>({en:styled(label+'_EN',count),zh:styled(label+'_ZH',count)});
 for(const f of state.frameworks){f.description=bi(f.id+'_DESCRIPTION');f.scopeLabel=bi(f.id+'_SCOPE');}
 for(const c of state.chapters){c.name={en:styled(c.id+'_NAME_EN',4,true),zh:styled(c.id+'_NAME_ZH',4,true)};c.aim=bi(c.id+'_AIM');}
 for(const item of state.items){item.kpi=bi(item.id+'_KPI');item.guidance=bi(item.id+'_GUIDANCE');item.sources=[{source:'Synthetic',note:styled(item.id+'_SOURCE_NOTE')}];}
 for(const a of state.assessments){a.selfAssessment=bi(a.id+'_ASSESSMENT',a.itemId==='item-a'?36:4);a.evidence=bi(a.id+'_EVIDENCE');a.note=bi(a.id+'_NOTE');a.remarks=styled(a.id+'_REMARKS',a.itemId==='item-a'?52:4);}
 for(const [i,row] of state.improvements.entries()){
  row.title=styled('ACTION_'+i+'_TITLE',4,true);row.content=bi('ACTION_'+i+'_CONTENT',i===0?36:4);row.plan=styled('ACTION_'+i+'_PLAN',i===0?20:4);
  if(i===0)row.itemIds=['item-a'];
  row.events.forEach((event,n)=>event.content=styled('EVENT_'+n,n===2?20:4));
 }
 const inspection=state.inspections[0];inspection.title=styled('INSPECTION_TITLE',4,true);
 inspection.results.forEach((r,n)=>{r.observation=bi('RESULT_'+n+'_OBSERVATION');r.recommendation=bi('RESULT_'+n+'_RECOMMENDATION');});
 inspection.findings.forEach((f,n)=>{f.observation=bi('FINDING_'+n+'_OBSERVATION');f.recommendation=bi('FINDING_'+n+'_RECOMMENDATION');f.sources=[{source:'Synthetic',note:styled('FINDING_SOURCE_NOTE')}];});
}
const options={templateBytes:new Uint8Array(readFileSync('public/templates/tmsa-template.xlsx')),fontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf')),fallbackFontBytes:['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(n=>new Uint8Array(readFileSync('public/fonts/'+n)))};
if(phase==='rich'){options.boldFontBytes=new Uint8Array(readFileSync('public/fonts/NotoSansTC-Bold.ttf'));options.boldFallbackFontBytes=[new Uint8Array(readFileSync('public/fonts/ReportSupplement-Bold.ttf'))];}
const cases=[];
for(const id of ['TMSA','DRYBMS'])for(const kind of ['framework','remarks','overview'])for(const format of kind==='overview'?['pdf']:['pdf','xlsx'])cases.push({id:kind+'-'+id+'.'+format,kind,framework:id,format});
cases.push({id:'improvements.pdf',kind:'improvements',format:'pdf'},{id:'improvements.xlsx',kind:'improvements',format:'xlsx'},{id:'inspection.pdf',kind:'inspection',format:'pdf'});
const receipt={phase,out,sourceSha256:hash(readFileSync('src/reports.ts')),artifacts:[],seam:'pure production builders; not UI downloads'};
const biValues=v=>v?[v.en,v.zh]:[];
function expectedFields(spec){
 const chapters=state.chapters.filter(c=>c.frameworkId===spec.framework),items=state.items.filter(i=>i.frameworkId===spec.framework),assessments=state.assessments.filter(a=>items.some(i=>i.id===a.itemId));
 let values=[];
 if(spec.kind==='framework'){
  const f=state.frameworks.find(f=>f.id===spec.framework);
  if(spec.format==='pdf')values.push(...biValues(f.scopeLabel),...biValues(f.description),...chapters.flatMap(c=>biValues(c.aim)));
  values.push(...chapters.flatMap(c=>biValues(c.name)),...items.flatMap(i=>[...biValues(i.kpi),...biValues(i.guidance),...i.sources.map(s=>s.note)]),...assessments.flatMap(a=>[...biValues(a.selfAssessment),...biValues(a.evidence),...biValues(a.note)]));
 }else if(spec.kind==='remarks')values.push(...chapters.flatMap(c=>biValues(c.name)),...assessments.map(a=>a.remarks));
 else if(spec.kind==='improvements')values.push(...state.improvements.flatMap(r=>[r.title,...biValues(r.content),r.plan,...r.events.map(e=>e.content),...(r.source==='external'?[state.inspections.find(i=>i.id===r.inspectionId)?.title]:[])]));
 else if(spec.kind==='inspection'){
  const i=state.inspections[0];values.push(i.title,...biValues(i.snapshot.framework.scopeLabel),...i.snapshot.chapters.flatMap(c=>biValues(c.name)),...i.snapshot.items.flatMap(item=>[...biValues(item.kpi),...biValues(item.guidance),...item.sources.map(s=>s.note)]),...i.results.flatMap(r=>[...biValues(r.observation),...biValues(r.recommendation)]),...i.findings.flatMap(f=>[...biValues(f.observation),...biValues(f.recommendation),...f.sources.map(s=>s.note)]));
 }else{
  values.push(...biValues(state.frameworks.find(f=>f.id===spec.framework).scopeLabel),...chapters.flatMap(c=>biValues(c.name)));
  const last=state.inspections.find(i=>i.frameworkId===spec.framework);if(last)values.push(last.title);
  values.push(...state.improvements.filter(r=>r.itemIds.some(id=>items.some(i=>i.id===id))&&r.status!=='closed').flatMap(r=>[r.title,...biValues(r.content),r.plan,r.events.at(-1)?.content]));
 }
 return [...new Set(values.filter(Boolean))].map(value=>({text:richTextToPlainText(compactRichText(value)),runs:richTextRuns(compactRichText(value))}));
}
async function frameworkPlan(bytes,spec){
 const {default:Excel}=await import('exceljs'),book=new Excel.Workbook();await book.xlsx.load(bytes);const plan=[];
 const chars=value=>richTextRuns(value).flatMap(run=>Array.from(run.text).map(ch=>[ch,!!run.bold,run.color??'']));
 for(const item of state.items.filter(i=>i.frameworkId===spec.framework)){
  const chapter=state.chapters.find(c=>c.id===item.chapterId),sheet=book.getWorksheet((spec.framework==='TMSA'?'E':'D')+chapter.code),rows=[];
  sheet.eachRow(row=>{if(row.number>=7&&row.getCell(1).text===item.code)rows.push(row);});assert(rows.length);
  plan.push({sheet:sheet.name,cell:'A1',runs:richTextRuns(`${chapter.code} ${reports.bilingual(chapter.name)}`)});
  const a=state.assessments.find(a=>a.itemId===item.id),source=item.sources.map(reports.sourceLabel).join('\n');
  const guidance={en:item.guidance.en+'\n\nSource: '+source,zh:item.guidance.zh+'\n\n來源：'+source};
  const narrative=reports.assessmentNarrative(state,a),issues=state.improvements.filter(r=>r.itemIds.includes(item.id)&&r.status!=='closed');
  if(issues.length){narrative.en+=`\n\n[Open improvements: ${issues.map(r=>r.id).join(', ')}]`;narrative.zh+=`\n\n[未結案改善：${issues.map(r=>r.id).join(', ')}]`;}
  for(const [column,value] of [[2,item.kpi],[3,guidance],[5,narrative],[6,a.evidence]]){
   const cell=rows[0].getCell(column),size=cell.font.size,maxLines=Math.max(4,Math.floor((300-12)/(size*1.6))),parts=reports.splitExcelBiText(value,Math.max(12,sheet.getColumn(column).width*5.1-12),size,cell.font.name,maxLines);
   for(const lang of ['en','zh'])assert.deepEqual(parts.flatMap(part=>chars(part[lang])),chars(compactRichText(value[lang])),'Source-language style stream must reconstruct exactly');
   assert(parts.length<=rows.length);
   rows.forEach((row,index)=>plan.push({sheet:sheet.name,cell:row.getCell(column).address,runs:richTextRuns(parts[index]?.text??'')}));
  }
 }
 return plan;
}
writeFileSync(join(out,'fixture.json'),JSON.stringify(state,null,2));
if(phase==='baseline')writeFileSync(join(out,'reports-baseline.txt'),readFileSync('src/reports.ts'));
try{
 for(const spec of cases){
  const before=JSON.stringify(state),lines=[],opts={...options,onFieldLine:line=>lines.push(line)},start=performance.now();let bytes;
  if(spec.kind==='framework')bytes=spec.format==='pdf'?await reports.buildFrameworkPdf(state,spec.framework,'zh',undefined,opts):await reports.buildFrameworkExcel(state,spec.framework,'zh',undefined,opts);
  else if(spec.kind==='remarks')bytes=spec.format==='pdf'?await reports.buildRemarksPdf(state,spec.framework,'zh',undefined,opts):await reports.buildRemarksExcel(state,spec.framework,'zh');
  else if(spec.kind==='overview')bytes=await reports.buildOverviewPdf(state,spec.framework,'zh',undefined,opts);
  else if(spec.kind==='inspection')bytes=await reports.buildInspectionPdf(state,state.inspections[0].id,'zh',opts);
  else bytes=spec.format==='pdf'?await reports.buildImprovementsPdf(state,state.improvements.map(r=>r.id),'zh',undefined,opts):await reports.buildImprovementsExcel(state,state.improvements.map(r=>r.id),'zh');
  assert.equal(JSON.stringify(state),before,'builders must not mutate source');
  const path=join(out,spec.id);writeFileSync(path,bytes);
  if(lines.length)writeFileSync(path+'.lines.json',JSON.stringify(lines));
  if(phase==='rich')writeFileSync(path+'.expected.json',JSON.stringify(expectedFields(spec),null,2));
  if(phase==='rich'&&spec.kind==='framework'&&spec.format==='xlsx')writeFileSync(path+'.plan.json',JSON.stringify(await frameworkPlan(bytes,spec),null,2));
  receipt.artifacts.push({...spec,path,sha256:hash(bytes),bytes:bytes.length,ms:Math.round(performance.now()-start),fieldLines:lines.length,...(phase==='rich'?{expected:path+'.expected.json'}:{})});
  console.log(JSON.stringify(receipt.artifacts.at(-1)));
  writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
 }
 assert.equal(receipt.artifacts.length,13);receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.failure=String(error);throw error;}
finally{writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,receipt:join(out,'receipt.json'),count:receipt.artifacts.length}));}
