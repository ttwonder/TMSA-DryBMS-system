import {useEffect,useRef} from 'react';
import type {ExportRequest,PageProps,PlatformState,Language} from './types.ts';
import type {Filters} from './domain.ts';
import {hasPermission} from './domain.ts';
import {authorizeReportSnapshot,selectedRemarkRows,renderFrameworkReport,renderRemarksReport,renderImprovementsReport,renderInspectionReport,renderOverviewReport} from './reports.ts';
import {HtmlReport} from './reportHtml.ts';
export type PrintRequest=Omit<ExportRequest,'snapshotToken'>;
export const printProvided=(ctx:Pick<PageProps,'t'>)=>ctx.t('已提供授權列印快照；請在瀏覽器選擇列印或另存為 PDF。是否保存由您決定。','Authorized snapshot provided for printing; choose Print or Save as PDF in the browser. Saving is your choice.');
export async function buildPrintReport(state:PlatformState,request:PrintRequest,lang:Language):Promise<string>{
 const deps=(request.filters as {departmentIds?:string[]}|undefined)?.departmentIds;
 if(request.kind==='framework')return ((request.filters as {reportVariant?:string}|undefined)?.reportVariant==='remarks'?renderRemarksReport:renderFrameworkReport)(HtmlReport.create,state,request.frameworkId!,lang,request.ids,{departmentIds:deps});
 if(request.kind==='improvements')return renderImprovementsReport(HtmlReport.create,state,request.ids,lang);
 if(request.kind==='inspection')return renderInspectionReport(HtmlReport.create,state,request.ids[0],lang);
 return renderOverviewReport(HtmlReport.create,state,request.frameworkId!,lang,request.ids,{filters:request.filters as Filters});
}
/** Reserve synchronously in the click stack; never put data in an unvalidated window. */
export function reservePrintWindow(isCurrent:()=>boolean,lang:Language){
 const popup=window.open('about:blank','_blank');
 if(!popup)throw new Error(lang==='zh'?'列印視窗被瀏覽器阻擋；請允許彈出視窗後重試。':'Print window blocked. Allow pop-ups and retry.');
 popup.document.title=lang==='zh'?'準備授權報告…':'Preparing authorized report…';
 popup.document.body.textContent=lang==='zh'?'正在準備；可關閉此視窗取消。':'Preparing; close this window to cancel.';
 const cancel=()=>{if(!popup.closed)popup.close();};
 const check=()=>{if(!isCurrent())throw new Error('EXPORT_SESSION_CHANGED');if(popup.closed)throw new Error(lang==='zh'?'已取消列印。':'Printing cancelled.');};
 return {cancel,closed:()=>popup.closed,async show(html:string){try{check();// html is produced solely by HtmlReport: escaped text, fixed tags, validated palette and restrictive CSP.
 check();popup.document.open();popup.document.write(html);popup.document.close();await popup.document.fonts.ready;check();popup.focus();popup.print();}catch(error){cancel();throw error;}}};
}
/** Only the export seam owns these windows. Unmount / identity / permission loss closes them. */
export function useReportPrint(ctx:PageProps,scopeKey=''){
 const latest=useRef(ctx);latest.current=ctx;
 const epoch=useRef({api:ctx.api,session:ctx.api.sessionToken,id:ctx.user.id,scopeKey,n:0});
 const windows=useRef<ReturnType<typeof reservePrintWindow>[]>([]);
 const close=()=>{windows.current.forEach(w=>w.cancel());windows.current=[];};
 const old=epoch.current;
 if(old.api!==ctx.api||old.session!==ctx.api.sessionToken||old.id!==ctx.user.id||old.scopeKey!==scopeKey){epoch.current={api:ctx.api,session:ctx.api.sessionToken,id:ctx.user.id,scopeKey,n:old.n+1};close();}
 useEffect(()=>{if(!ctx.user.active||!hasPermission(ctx.state.settings.rolePermissions,ctx.user,'exportReports'))close();},[ctx.user,ctx.state.settings.rolePermissions]);
 useEffect(()=>()=>{epoch.current.n++;close();},[]);
 return async(request:PrintRequest)=>{
  const initiating={...epoch.current},origin=latest.current;
  const unchanged=()=>{const now=latest.current;return epoch.current.n===initiating.n&&now.api===initiating.api&&now.user.id===initiating.id&&now.api.sessionToken===initiating.session&&now.user.active&&hasPermission(now.state.settings.rolePermissions,now.user,'exportReports');};
  if(!unchanged())throw new Error('EXPORT_SESSION_CHANGED');
  const ticket=reservePrintWindow(unchanged,origin.lang);windows.current=windows.current.filter(w=>!w.closed());windows.current.push(ticket);
  try{
   if((request.filters as {reportVariant?:string}|undefined)?.reportVariant==='remarks'&&!selectedRemarkRows(origin.state,request.frameworkId!,request.ids,(request.filters as {departmentIds?:string[]}|undefined)?.departmentIds).length)throw new Error(origin.t('所選章節沒有已填寫的備註。','No remarks in selected chapters.'));
   const canonical=await authorizeReportSnapshot(origin,request);
   if(!unchanged())throw new Error('EXPORT_SESSION_CHANGED');
   const html=await buildPrintReport(canonical,request,origin.lang);
   if(!unchanged())throw new Error('EXPORT_SESSION_CHANGED');
   await ticket.show(html);
  }catch(error){ticket.cancel();throw error;}
 };
}
