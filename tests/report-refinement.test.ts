import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {filterImprovementList} from '../src/improvementList.ts';
import type {ImprovementListFilters} from '../src/improvementList.ts';
import type {PlatformState} from '../src/types.ts';
const {layoutFixture}=createRequire(import.meta.url)('../scripts/layout-fixture.mjs');

test('refinement: multiselections OR within source/chapter/department/person and AND between dimensions',()=>{
 const s=layoutFixture() as PlatformState,base=s.improvements[0];
 s.improvements=[
  {...base,id:'a',source:'management_review',itemIds:[],chapterIds:[s.chapters[0].id],departmentIds:['d1'],assigneeIds:['p1']},
  {...base,id:'b',source:'management_directive',itemIds:[],chapterIds:[s.chapters[1].id],departmentIds:['d2'],assigneeIds:['p2']},
  {...base,id:'c',source:'non_external',itemIds:[],chapterIds:[s.chapters[0].id],departmentIds:['d1'],assigneeIds:['p1']},
  {...base,id:'d',source:'management_review',itemIds:[],chapterIds:[s.chapters[0].id],departmentIds:['other'],assigneeIds:['p1']},
 ];
 const filters={sources:['management_review','management_directive'],chapterIds:s.chapters.slice(0,2).map(c=>c.id),departmentIds:['d1','d2'],personIds:['p1','p2']} as ImprovementListFilters;
 assert.deepEqual(filterImprovementList(s,filters).map(r=>r.id).sort(),['a','b']);
 assert.deepEqual(filterImprovementList(s,{...filters,personIds:['missing']} as ImprovementListFilters),[]);
 assert.equal(filterImprovementList(s,{sources:[],chapterIds:[],departmentIds:[],personIds:[]} as ImprovementListFilters).length,4);
 assert.deepEqual(filterImprovementList(s,{source:'management_directive'}).map(r=>r.id),['b']);
});


import {buildPrintReport} from '../src/useReportPrint.ts';
test('refinement: mounted print name uses canonical date and complete display-label filters',async()=>{
 const s=reportingFixture();const html=await buildPrintReport(s,{kind:'improvements',format:'pdf',ids:[s.improvements[0].id],filters:{sources:['management_review','management_directive'],departmentIds:s.settings.departments.map(d=>d.id)}},'en');
 const title=html.split('<title>')[1].split('</title>')[0];assert(title.includes(s.serverTime.slice(0,10)));assert(title.includes('Management review'));assert(html.includes('Management directive'));assert(!title.includes('snapshot'));
});

import ExcelJS from 'exceljs';
import {buildRemarksExcel,buildImprovementsExcel,selectedImprovementRows,downloadFrameworkExcel} from '../src/reports.ts';
import {readFileSync} from 'node:fs';
import {reportDescriptor} from '../src/reportNaming.ts';
import {HtmlReport} from '../src/reportHtml.ts';
import {reportingFixture} from './fpmc-reporting-fixture.ts';
test('refinement: HTML short fields share a row and non-title text is 12pt',async()=>{
 const r=new HtmlReport('Test','en');r.table(['A','B'],[1,3],[{key:'id',cells:['short','narrative']}]);
 const html=await r.finish();assert.equal((html.match(/<table/g)||[]).length,1);assert(html.includes('width:25%'));assert(html.includes('font-size:12pt'));assert(!/font-size:(14|15)pt/.test(html));
});
test('refinement: Excel 12pt, one ordinary row, no note band and individually sized rows',async()=>{
 const s=reportingFixture();s.chapters[0].name={en:'QA',zh:'測試'};const a=s.assessments[0];a.remarks='short';delete a.remarksStatus;
 const other={...structuredClone(a),id:'other-a',itemId:'other-i',remarks:Array.from({length:12},(_,i)=>'line '+i).join('\n')};s.items.push({...s.items[0],id:'other-i',code:'same-code'});s.assessments.push(other);
 const b=new ExcelJS.Workbook();await b.xlsx.load(await buildRemarksExcel(s,'TMSA','en',['chapter-TMSA']) as unknown as ExcelJS.Buffer);const sh=b.worksheets[0];
 assert.equal(sh.getRow(2).hidden,true);assert.equal(sh.getRow(3).hidden,true);assert.equal(sh.rowCount,6);assert(sh.getRow(5).height!<sh.getRow(6).height!);assert(sh.getRow(5).height!<100);assert.equal(sh.getCell('F5').font.size,12);assert(!sh.getCell('A2').text.includes('Continuation rows'));
});
test('refinement closure: a long comparison field spans the page instead of stretching unrelated short columns',async()=>{
 const s=reportingFixture();s.items[0].guidance={en:Array.from({length:80},(_,i)=>'DENSE_'+i+' Complete guidance text.').join(' '),zh:'完整指引末端'};
 const html=await buildPrintReport(s,{kind:'framework',format:'pdf',frameworkId:'TMSA',ids:['chapter-TMSA']},'en');
 assert.match(html,/<td colspan="100"[^>]*><div class="field-label">[\s\S]*?Best Practice Guidance[\s\S]*?DENSE_0/);
 assert(html.includes('DENSE_79 Complete guidance text.'));assert(html.includes('完整指引末端'));
});
test('refinement closure: fixed short lines keep a compact comparison row when widening cannot save height',async()=>{
 const r=new HtmlReport('Short comparison','en');r.table(['Item','Description'],[1,3],[{key:'ID',cells:['ID',Array.from({length:8},(_,i)=>'line '+i).join('\n')]}]);const html=await r.finish();assert(!html.includes('colspan="100"'));
});
test('refinement R1: long canonical scope expands the merged header without moving filter coordinates',async()=>{
 const s=reportingFixture(),first=s.chapters.find(c=>c.id==='chapter-TMSA')!;const chapters=Array.from({length:20},(_,i)=>({...first,id:i?`scope-chapter-${i}`:first.id,code:String(i+1),name:{zh:`SCOPE_${i}_START `+'完整範圍'.repeat(10)+` SCOPE_${i}_END`,en:`Scope ${i}`}}));s.chapters=[...s.chapters.filter(c=>c.frameworkId!=='TMSA'),...chapters];
 const request={kind:'framework',format:'xlsx',frameworkId:'TMSA',ids:chapters.map(c=>c.id),filters:{reportVariant:'remarks'}} as const,descriptor=reportDescriptor(s,request,'zh');assert.equal(descriptor.filename,'全部 TMSA-條目備註 2026-03-03.xlsx');assert(descriptor.scope.includes('SCOPE_19_END'));
 for(const scope of [descriptor.scope,'短範圍']){
  const b=new ExcelJS.Workbook();await b.xlsx.load(await buildRemarksExcel(s,'TMSA','zh',[first.id],{reportScope:scope}) as unknown as ExcelJS.Buffer);const sh=b.worksheets[0];assert.equal(sh.getCell('A2').text,scope);assert.equal(sh.getCell('A2').font.size,12);assert.equal(sh.autoFilter,`A4:F${sh.rowCount}`);assert('ySplit' in sh.views[0]&&sh.views[0].ySplit===4);
  const total=(sh.getRow(2).height??0)+(sh.getRow(3).height??0);assert(scope===descriptor.scope?total>44:total<=22,`scope height ${total}`);assert(total<=819);
 }
});
test('refinement closure: worksheet footer text explicitly stays 12pt',async()=>{
 const s=reportingFixture();for(const bytes of [await buildRemarksExcel(s,'TMSA','en',['chapter-TMSA']),await buildImprovementsExcel(s,s.improvements.map(r=>r.id),'en')]){
  const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  for(const sheet of book.worksheets){assert.match(sheet.headerFooter.oddFooter??'',/&L&12/);assert.match(sheet.headerFooter.oddFooter??'',/&C&12/);}
 }
});
test('refinement closure: FrameworkPage Excel filename shortening keeps the full canonical scope inside the workbook',async()=>{
 const s=reportingFixture();s.chapters[0].name={en:'LONG_CHAPTER '.repeat(30)+'SCOPE_END',zh:'完整章節'};
 const saved={document:globalThis.document,fetch:globalThis.fetch,create:URL.createObjectURL,revoke:URL.revokeObjectURL,setTimeout:globalThis.setTimeout};let artifact:Blob|undefined,filename='';
 const anchor={href:'',download:'',style:{},click(){filename=this.download;},remove(){}};
 Object.assign(globalThis,{document:{createElement:(tag:string)=>tag==='canvas'?{getContext:()=>null}:anchor,body:{appendChild(){}}},fetch:async()=>new Response(readFileSync('public/templates/tmsa-template.xlsx')),setTimeout:(fn:()=>void)=>{fn();return 0;}});URL.createObjectURL=(blob:Blob)=>{artifact=blob;return 'blob:fixture';};URL.revokeObjectURL=()=>{};
 try{await downloadFrameworkExcel(s,'TMSA','en',['chapter-TMSA']);assert(artifact);const book=new ExcelJS.Workbook();await book.xlsx.load(await artifact.arrayBuffer());assert.equal(filename,'All TMSA-Full framework assessment 2026-03-03.xlsx');assert.equal(filename,reportDescriptor(s,{kind:'framework',format:'xlsx',frameworkId:'TMSA',ids:['chapter-TMSA']},'en').filename);assert(book.worksheets[0].getCell('A1').text.includes('Chapters=TMSA 1 '+s.chapters[0].name.en),'the exact long scope must be readable, not only the chapter title');}
 finally{Object.assign(globalThis,{document:saved.document,fetch:saved.fetch,setTimeout:saved.setTimeout});URL.createObjectURL=saved.create;URL.revokeObjectURL=saved.revoke;}
});
test('refinement: shared report ordering urgency, target, independent proposal, missing last, stable ID tie',async()=>{
 const s=reportingFixture(),base=s.improvements[0];s.improvements=[
 {...base,id:'z',urgency:'low',targetDate:'2020-01-01'},
 {...base,id:'d',urgency:'urgent',targetDate:'',proposedDate:'2020-01-01'},
 {...base,id:'c',urgency:'urgent',targetDate:'2026-02-01',proposedDate:''},
 {...base,id:'b',urgency:'urgent',targetDate:'2026-02-01',proposedDate:'2026-01-01'},
 {...base,id:'a',urgency:'urgent',targetDate:'2026-02-01',proposedDate:'2026-01-01'}];
 const ids=s.improvements.map(r=>r.id);assert.deepEqual(selectedImprovementRows(s,ids).map(r=>r.id),['a','b','c','d','z']);
 const b=new ExcelJS.Workbook();await b.xlsx.load(await buildImprovementsExcel(s,ids,'en') as unknown as ExcelJS.Buffer);assert.equal(b.worksheets[0].getCell('I5').text,'urgent');
 s.improvements=s.improvements.map(row=>({...row,title:row.id+'_ORDER',itemIds:[s.items.find(item=>item.frameworkId==='TMSA')!.id]}));
 const overview=await buildPrintReport(s,{kind:'overview',format:'pdf',frameworkId:'TMSA',ids:['chapter-TMSA']},'en');
 const issues=overview.split('Open issues and execution plans')[1];assert(issues);assert.deepEqual(Array.from(issues.matchAll(/([a-z])_ORDER/g),m=>m[1]),['a','b','c','d','z']);
});
