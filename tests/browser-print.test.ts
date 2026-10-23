import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrintReport,reservePrintWindow} from '../src/useReportPrint.ts';
import {reportRichHtml} from '../src/reportHtml.ts';
import {encodeRichText} from '../src/richText.ts';
import {reportingFixture} from './fpmc-reporting-fixture.ts';
import type {PrintRequest} from '../src/useReportPrint.ts';
const request=(kind:PrintRequest['kind'],ids:string[],filters:unknown={}):PrintRequest=>({kind,ids,format:'pdf',frameworkId:'TMSA',filters});
test('safe rich print markup retains text, bold, palette, lists and Unicode without executing source',()=>{
 const text='• Bold 中文 → CO₂\n<script>alert(1)</script> & "x"';
 const html=reportRichHtml(encodeRichText({text,spans:[{start:2,end:6,bold:true,color:'red'}],lists:[{start:0,end:text.indexOf('\n'),kind:'bullet'}]}));
 assert.match(html,/<strong>Bold<\/strong>/);assert.match(html,/#c62828/);assert.match(html,/list-line/);assert.match(html,/中文 → CO₂/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script|onclick|href=/);
});
for(const kind of ['framework','remarks','improvements','inspection','overview'] as const)test(`shared ${kind} projection builds complete HTML without fetch`,async()=>{
 const state=reportingFixture(true),before=JSON.stringify(state),fetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No network');};
 try{
  const r=kind==='improvements'?request(kind,[state.improvements[0].id]):kind==='inspection'?request(kind,[state.inspections[0].id]):request(kind==='remarks'?'framework':kind,['chapter-TMSA'],kind==='remarks'?{reportVariant:'remarks'}:{});
  const html=await buildPrintReport(state,r,'zh');
  const markers={framework:['KPI_0','GUIDANCE_2','ASSESSMENT_2','EVIDENCE_2'],remarks:['REMARKS_1.1.1_84','停用歷史姓名'],improvements:['CONTENT_0_89','PLAN_0_34','EVENT_2_27','EVENT_4_1'],inspection:['OBSERVATION_2','RECOMMENDATION_2','FINDING_2','ADVICE_2'],overview:['0.00 / 4','PLAN_2_1']};
  for(const marker of markers[kind])assert(html.includes(marker),marker);
  assert.match(html,/font-src 'none'/);assert.match(html,/font-size:12pt/);assert.doesNotMatch(html,/font-size:(14|15)pt/);assert.match(html,/table-header-group/);assert.doesNotMatch(html,/@font-face|https?:\/\/|break-inside:avoid/);assert.equal(calls,0);assert.equal(JSON.stringify(state),before);
 }finally{globalThis.fetch=fetch;}
});
for(const lang of ['zh','en'] as const)for(const kind of ['framework','inspection','overview'] as const)test(`${kind} ${lang} print retains the complete snapshot identifier without nonexistent PDF properties`,async()=>{
 const state=reportingFixture();state.snapshotToken='performance-v1:'+ '0123456789abcdef'.repeat(4);
 const ids=kind==='inspection'?[state.inspections[0].id]:['chapter-TMSA'];
 const html=await buildPrintReport(state,request(kind,ids),lang);
 assert(html.includes(state.snapshotToken),'complete canonical snapshot identifier must be readable in the report');
 assert.doesNotMatch(html,/完整值見PDF文件內容|full value in PDF properties/);
});
test('print selection preserves empty saved assignments and refuses empty remarks / active collection',async()=>{
 const s=reportingFixture();s.assessments[0].departmentIds=[];
 await assert.rejects(()=>buildPrintReport(s,request('framework',['chapter-TMSA'],{departmentIds:['marine']}),'en'),/No items match/);
 const all=await buildPrintReport(s,request('framework',['chapter-TMSA'],{departmentIds:[]}),'en');assert.match(all,/KPI_2/);
 s.assessments[0].remarks=' ';await assert.rejects(()=>buildPrintReport(s,request('framework',['chapter-TMSA'],{reportVariant:'remarks'}),'en'),/No remarks/);
 s.items=[];await assert.rejects(()=>buildPrintReport(s,request('framework',['chapter-TMSA']),'en'),/No items match/);
});
test('reserved popup is synchronous; identity loss, close and popup denial never print data',async()=>{
 const original=globalThis.window;let opened=0,printed=0,writes=0,valid=true;
 const popup={closed:false,close(){this.closed=true;},focus(){},print(){printed++;},document:{title:'',body:{textContent:''},open(){},write(){writes++;},close(){},fonts:{ready:Promise.resolve()}}};
 Object.assign(globalThis,{window:{open(){opened++;return popup;}}});
 try{
  const ticket=reservePrintWindow(()=>valid,'en');assert.equal(opened,1);assert.equal(writes,0);valid=false;await assert.rejects(()=>ticket.show('<main>secret</main>'),/SESSION_CHANGED/);assert.equal(writes,0);assert.equal(printed,0);assert(popup.closed);
  popup.closed=false;valid=true;const cancelled=reservePrintWindow(()=>valid,'en');popup.close();await assert.rejects(()=>cancelled.show('secret'),/cancelled/);assert.equal(writes,0);
  Object.assign(globalThis,{window:{open:()=>null}});assert.throws(()=>reservePrintWindow(()=>true,'en'),/blocked/);
  popup.closed=false;Object.assign(globalThis,{window:{open:()=>popup}});await reservePrintWindow(()=>true,'en').show('<main>safe</main>');assert.equal(printed,1);
 }finally{Object.assign(globalThis,{window:original});}
});
