import test from 'node:test';
import assert from 'node:assert/strict';
import {reportDescriptor} from '../src/reportNaming.ts';
import {reportingFixture} from './fpmc-reporting-fixture.ts';
import type {ExportRequest} from '../src/types.ts';
import {defaultImprovementSources} from '../src/improvementTracking.ts';
import {buildPrintReport} from '../src/useReportPrint.ts';

test('filename: improvements separate local surfaces, collapse inspection IDs, preserve full scope',async()=>{
 const s=reportingFixture(),request:Omit<ExportRequest,'snapshotToken'>={kind:'improvements',format:'pdf',ids:[s.improvements[0].id],filters:{departmentIds:['tech','marine','tech'],personIds:['inactive-person','qa-owner','inactive-person'],sources:['inspection:inspection-technical','inspection:second','non_external','external'],query:'only this',status:'open',chapterIds:['chapter-TMSA']}};
 s.inspections.push({...structuredClone(s.inspections[0]),id:'second',title:'Second original inspection'});
 const expected='工務+海務-停用歷史姓名+測試 Owner 外部檢查+內部管理需求';
 assert.equal(reportDescriptor(s,request,'zh').name,expected+'-明選改善項目 2026-03-03');
 // Presentation surface never enters the authorization request or canonical snapshot.
 const main=reportDescriptor(s,request,'zh','improvement-list');
 assert.equal(main.name,expected+'待改善項目 2026-03-03');
 assert.equal(main.scope,reportDescriptor(s,request,'zh').scope);
 assert.equal(main.scope,'明選1筆 · 章節=TMSA 1 章節 · 來源=2026-01-01 TMSA Readable inspection title+2026-01-01 TMSA Second original inspection+內部管理需求+外部檢查 · 部門=工務+海務+工務 · 人員=停用歷史姓名+測試 Owner+停用歷史姓名 · 搜尋=only this · 狀態=開啟');
 const html=await buildPrintReport(s,request,'zh','improvement-list');
 assert.equal(html.split('<title>')[1].split('</title>')[0],main.name);
 assert(html.includes('Second original inspection'));assert(html.includes('only this'));
 for(const lang of ['zh','en'] as const){const all=lang==='zh'?'全部':'All';
  for(const surface of ['report-center','improvement-list'] as const){const kind=lang==='zh'?(surface==='report-center'?'-明選改善項目':'待改善項目'):(surface==='report-center'?'-Selected improvements':'Improvement actions');
   assert.equal(reportDescriptor(s,{...request,filters:{}},lang,surface).name,`${all}-${all} ${all}${kind} 2026-03-03`);
  }
 }
 s.settings.improvementSources=defaultImprovementSources();s.settings.improvementSources.find(r=>r.id==='external')!.name={zh:'更名外檢',en:'Renamed inspection'};
 s.settings.improvementSources.push({id:'custom:archived',name:{zh:'停用自訂',en:'Archived custom'},active:false});
 const custom={...request,filters:{sources:['inspection:second','custom:archived','external','custom:archived']}};
 assert.equal(reportDescriptor(s,custom,'zh').name,'全部-全部 更名外檢+停用自訂-明選改善項目 2026-03-03');
 assert.equal(reportDescriptor(s,custom,'en').name,'All-All Renamed inspection+Archived custom-Selected improvements 2026-03-03');
});

test('filename: regular kinds, framework identity, canonical date, fallback and safe bounded prefix',()=>{
 const s=reportingFixture();s.serverTime='2026-10-24T23:59:59-10:00';
 for(const frameworkId of ['TMSA','DRYBMS'] as const)for(const [kind,zh,en] of [['framework','框架完整自評','Full framework assessment'],['overview','管控總覽','Management overview'],['inspection','凍結歷史檢查','Frozen inspection']] as const){
  s.inspections[0].frameworkId=frameworkId;
  const request:Omit<ExportRequest,'snapshotToken'>={kind,frameworkId:kind==='inspection'?undefined:frameworkId,ids:kind==='inspection'?[s.inspections[0].id]:['chapter-'+frameworkId],format:'pdf'};
  for(const [lang,label] of [['zh',zh],['en',en]] as const)assert.equal(reportDescriptor(s,request,lang).name,`${lang==='zh'?'全部':'All'} ${frameworkId}-${label} 2026-10-24`);
 }
 const request:Omit<ExportRequest,'snapshotToken'>={kind:'framework',frameworkId:'DRYBMS',ids:['chapter-DRYBMS'],format:'xlsx',filters:{departmentIds:['tech','marine','tech'],reportVariant:'remarks'}};
 assert.equal(reportDescriptor(s,request,'en').name,'Technical+Marine DRYBMS-Item remarks 2026-10-24');
 assert.equal(reportDescriptor(s,{kind:'inspection',ids:['missing'],format:'pdf'},'zh').name,'全部 不可用選項-凍結歷史檢查 2026-10-24');
 s.settings.departments[1].name={zh:'  < > : " / \\ | ? * \n .',en:'  '};
 const safe=reportDescriptor(s,request,'zh').name;assert(!/[<>:"/\\|?*\u0000-\u001f]/.test(safe));
 s.settings.departments[1].name={zh:'長'.repeat(500),en:'long'.repeat(500)};
 for(const kind of ['framework','improvements'] as const)for(const surface of ['report-center','improvement-list'] as const){const d=reportDescriptor(s,{...request,kind},'zh',surface);assert(d.name.length<=170);assert(d.name.endsWith((kind==='framework'?'條目備註':surface==='report-center'?'明選改善項目':'待改善項目')+' 2026-10-24'));assert(d.scope.includes('長'.repeat(500)));}
 s.settings.departments[1].name={zh:' ',en:' '};assert(reportDescriptor(s,request,'zh').name.startsWith('不可用選項+海務 '));
});

test('framework simple and complete keep Chinese departments in English filename and scope without changing other reports',async()=>{
 const s=reportingFixture();s.settings.departments[0].name={zh:'管理組',en:'Management'};
 const before=structuredClone(s);
 for(const reportVariant of [undefined,'complete']){
  const req:Omit<ExportRequest,'snapshotToken'>={kind:'framework',format:'pdf',frameworkId:'TMSA',ids:['chapter-TMSA'],filters:{departmentIds:['marine','tech'],...(reportVariant?{reportVariant}:{})}};
  const d=reportDescriptor(s,req,'en');assert(d.name.startsWith('管理組+工務 TMSA-'));assert(d.scope.includes('Departments=管理組+工務'));assert(!d.scope.includes('Management+Technical'));
  const html=await buildPrintReport(s,req,'en');assert(html.includes(d.name));assert(html.includes('Departments=管理組+工務'));
 }
 for(const kind of ['framework','improvements','overview'] as const){const d=reportDescriptor(s,{kind,format:'pdf',frameworkId:'TMSA',ids:['chapter-TMSA'],filters:{departmentIds:['marine'],reportVariant:'remarks'}},'en');assert(d.name.startsWith('Management'));assert(d.scope.includes('Departments=Management'));}
 assert.deepEqual(s,before);
});

test('filename: report center uses selected department, framework, UI kind and canonical date',()=>{
 const s=reportingFixture();s.settings.departments[0].name={zh:'管理組',en:'Management'};
 const request:Omit<ExportRequest,'snapshotToken'>={kind:'framework',format:'xlsx',frameworkId:'TMSA',ids:['chapter-TMSA'],filters:{departmentIds:['marine'],reportVariant:'remarks'}};
 const before=structuredClone({s,request});
 assert.equal(reportDescriptor(s,request,'zh').filename,'管理組 TMSA-條目備註 2026-03-03.xlsx');
 assert.equal(reportDescriptor(s,{...request,format:'pdf'},'zh').filename,'管理組 TMSA-條目備註 2026-03-03.pdf');
 assert.deepEqual({s,request},before);
});
