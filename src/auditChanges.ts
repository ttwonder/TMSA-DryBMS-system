import {richTextToPlainText} from './richText.ts';
import {improvementSourceLabel} from './improvementTracking.ts';
import {REMARKS_STATUSES} from './itemRemarks.ts';
import type { AuditLog, BrowseState, Language } from './types';

type Pair = readonly [string, string];
type EntryChange = 'added' | 'removed' | undefined;
type JsonObject = Record<string, unknown>;
export interface AuditChange { path: string; label: string; before: string; after: string; summary: string }
export interface AuditDescription { action: string; kind: string; changes: AuditChange[]; notice: string; mode: 'diff' | 'created' | 'after_only' | 'before_only' | 'unavailable' }
const actions: Record<string, Pair> = {
  create:['新增','Create'], update:['更新','Update'], close:['結案','Close'], reopen:['重新開啟','Reopen'], finalize:['發布檢查','Publish inspection'], archive:['停用','Deactivate'], activate:['再啟用','Reactivate'],
  bootstrap:['建立首位 Owner','Create first Owner'], target_save:['保存分章目標','Save chapter targets'], restart_updates:['初始化自評更新勾選','Reset update-completion flags'], requirement_reconfirmation:['標準變更後重置更新勾選','Reset completion after requirement change'],
  role_permissions:['修改角色權限','Change role permissions'], site_password:['更新進站密碼','Change site password'], transfer_owner:['轉移 Owner','Transfer ownership'], import_seed:['匯入初始資料','Import initial data'], import_office_directory:['匯入辦公室名冊','Import office directory'], export_authorize:['授權匯出','Authorize export'], export:['匯出','Export'],
};
const kinds: Record<string, Pair> = {framework:['體系設定','Framework'],chapter:['分章','Chapter'],item:['標準條目','Standard item'],assessment:['目前自評','Current assessment'],improvement:['待改善項目','Improvement'],inspection:['歷史檢查','Inspection'],person:['人員','Person'],dryScore:['DRYBMS 四級自評','DRYBMS maturity assessment'],settings:['系統設定','Settings'],export:['報表匯出','Report export'],import:['資料匯入','Data import'],workspace:['工作區','Workspace']};
const fields: Record<string, Pair> = {
  milestones:['具體階段目標','Specific milestones'],milestoneEvents:['階段變更歷史','Milestone change history'],goal:['階段目標','Milestone goal'],plannedDate:['預期完成日期','Planned completion date'],achievedDate:['實際達成日期','Actual achievement date'],milestoneId:['階段識別','Milestone identity'],reason:['理由','Reason'],cascade:['順延後續未達成階段','Shift subsequent unachieved milestones'],before:['變更前','Before'],after:['變更後','After'],
  reviewed:['已完成本次更新','Update complete'],response:['Y/N','Y/N'],conformity:['符合程度','Conformity'],executionStatus:['執行狀態','Implementation status'],percent:['完成百分比','Completion percentage'],status:['狀態','Status'],urgency:['急迫程度','Urgency'],
  selfAssessment:['自評','Self assessment'],evidence:['執行佐證','Evidence'],content:['內容','Content'],title:['標題','Title'],plan:['改善計劃','Action plan'],proposedDate:['提出日期','Proposed date'],targetDate:['目標日期','Target date'],departmentIds:['涉及部門','Departments'],departmentId:['部門','Department'],assigneeIds:['執行人','Assignees'],itemIds:['關聯 Item','Linked items'],chapterIds:['關聯章節','Linked chapters'],itemId:['Item','Item'],
  events:['進度紀錄','Progress history'],at:['時間','Time'],by:['記錄人','Recorded by'],closedAt:['結案時間','Closed at'],closedBy:['結案人','Closed by'],
  name:['名稱','Name'],username:['登入名稱','Username'],role:['角色','Role'],active:['啟用狀態','Active state'],departments:['部門名冊','Departments'],people:['人員筆數','People count'],rolePermissions:['角色權限','Role permissions'],siteGateConfigured:['進站密碼已設定','Site gate configured'],
  frameworkId:['體系','Framework'],chapterId:['分章','Chapter'],code:['代碼','Code'],level:['級別','Level'],order:['排序','Order'],kpi:['KPI','KPI'],guidance:['最佳實踐指引','Best-practice guidance'],description:['說明','Description'],aim:['目標','Aim'],priority:['重點','Priority'],scoring:['計分方式','Scoring method'],scoreTargets:['分章目標','Chapter targets'],includeTmsaChapter14:['納入 TMSA 第14章','Include TMSA chapter 14'],scopeLabel:['計分範圍','Scoring scope'],
  en:['英文','English'],zh:['繁中','Chinese'],note:['附註','Note'],remarks:['備註','Remarks'],remarksStatus:['備註狀態','Remarks status'],source:['來源','Source'],sources:['來源紀錄','Sources'],sourceVersion:['來源版本','Source version'],sourceGap:['來源缺口','Source gap'],sourceGapResolved:['缺口已補證','Source gap resolved'],sourceOriginals:['來源原文','Original sources'],analysisIndex:['分析索引','Analysis index'],aliases:['別名','Aliases'],crosswalk:['對照','Crosswalk'],
  inspectionId:['來源檢查','Source inspection'],findingId:['來源發現','Source finding'],sourceKey:['來源識別','Source key'],date:['檢查日期','Inspection date'],organization:['檢查機構','Organization'],type:['檢查類型','Inspection type'],results:['逐項評定','Item results'],findings:['檢查發現','Findings'],classification:['分類','Classification'],observation:['觀察','Observation'],recommendation:['建議','Recommendation'],warning:['提示','Warning'],snapshot:['凍結快照','Frozen snapshot'],framework:['體系','Framework'],chapters:['分章','Chapters'],items:['條目','Items'],scoringVersion:['計分版本','Scoring version'],dryLevels:['DRYBMS 四級百分比','DRYBMS maturity percentages'],levels:['四級百分比','Maturity percentages'],scoreNote:['計分說明','Scoring note'],supersedesId:['先前版本','Superseded record'],imported:['匯入','Imported'],importedYear:['匯入年度','Imported year'],initialDepartmentResponses:['初始部門回覆','Initial department responses'],
  format:['檔案格式','File format'],kind:['報表種類','Report kind'],selectedIds:['選取項目','Selected records'],filters:['篩選條件','Filters'],snapshotReceipt:['快照回執','Snapshot receipt'],sourceManifest:['來源清單','Source manifest'],importNote:['匯入說明','Import note'],file:['檔案','File'],sheet:['工作表','Sheet'],cell:['儲存格','Cell'],pages:['頁碼','Pages'],page:['頁碼','Page'],rawItem:['來源原編號','Source item'],
  owner:['Owner','Owner'],admin:['管理員','Administrator'],operator:['操作員','Operator'],vessel:['船端','Vessel'],
  editAssessments:['修改自評','Edit assessments'],createImprovements:['新增改善','Create improvements'],updateImprovements:['更新改善','Update improvements'],closeImprovements:['結案改善','Close improvements'],manageInspections:['管理檢查','Manage inspections'],exportReports:['匯出報告','Export reports'],enterManagement:['進入管理','Enter management'],manageUsers:['管理人員','Manage people'],manageFrameworks:['管理框架','Manage frameworks'],viewAuditLogs:['查看操作紀錄','View audit logs'],manageRolePermissions:['管理角色權限','Manage role permissions'],manageSystemSettings:['管理系統設定','Manage system settings'],
};
const enums: Record<string, Record<string, Pair>> = {
  remarksStatus:Object.fromEntries(REMARKS_STATUSES.map(s=>[s.value,[s.zh,s.en] as Pair])),
  response:{yes:['Yes','Yes'],no:['No','No']},conformity:{all:['全部符合','Fully met'],partial:['部分符合','Partially met'],none:['不符合','Not met']},
  executionStatus:{not_started:['未開始','Not started'],in_progress:['進行中','In progress'],completed:['已完成','Completed']},
  status:{open:['待處理','Open'],in_progress:['進行中','In progress'],closed:['已結案','Closed'],draft:['草稿','Draft'],final:['已發布','Published']},
  urgency:{urgent:['盡快','Urgent'],high:['高','High'],medium:['中','Medium'],low:['低','Low']},
  role:{owner:['Owner','Owner'],admin:['管理員','Administrator'],operator:['操作員','Operator'],vessel:['船端','Vessel']},
  classification:{finding:['缺失','Observation'],ofi:['建議改善','OFI'],positive:['正面觀察','Positive observation'],guidance:['指引','Guidance'],no_finding:['無缺失','No finding'],general:['一般觀察（非自動判No）','General observation (not automatically No)']},
  type:{formal:['正式','Formal'],informal:['非正式','Informal']},
};
const metadata = new Set(['id','version','createdAt','updatedAt','updatedBy']);
// Same key-level exclusion as the server audit sanitizer; never expose nested credentials.
const sensitive = (key:string) => /(password|credential|secret|token|hash)/i.test(key);
const isObject = (value:unknown):value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (map:Record<string,unknown>,key:string) => Object.hasOwn(map,key);
function equal(a:unknown,b:unknown):boolean {
  if (a===b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length===b.length && a.every((v,i)=>equal(v,b[i]));
  if (isObject(a) && isObject(b)) {const keys=Object.keys(a);return keys.length===Object.keys(b).length && keys.every(k=>own(b,k)&&equal(a[k],b[k]));}
  return false;
}

/** Read-only presentation of saved audit snapshots, never a reconstruction from current records. */
export function describeAudit(log:AuditLog,lang:Language,state?:BrowseState):AuditDescription {
  const t=(zh:string,en:string)=>lang==='zh'?zh:en;
  const translated=(map:Record<string,Pair>,key:string)=>own(map,key)?map[key][lang==='zh'?0:1]:key;
  const beforePresent=log.before!==undefined && log.before!==null,afterPresent=log.after!==undefined && log.after!==null;
  const created=!beforePresent && afterPresent && ['create','bootstrap','import_seed','export_authorize','export','import_office_directory'].includes(log.action);
  const mode:AuditDescription['mode']=beforePresent&&afterPresent?'diff':created?'created':afterPresent?'after_only':beforePresent?'before_only':'unavailable';
  const action=translated(actions,log.action),kind=translated(kinds,log.kind),changes:AuditChange[]=[];
  const reference=(id:string,field:string,side:unknown):string=>{
    let name:string|undefined;
    if (['departmentIds','departmentId'].includes(field)) {const n=state?.settings.departments.find(v=>v.id===id)?.name;name=n?.[lang]||n?.en||n?.zh;}
    if (['assigneeIds','by','closedBy'].includes(field)) name=state?.people.find(v=>v.id===id)?.name;
    if (['itemIds','itemId'].includes(field)) {const snapshot=isObject(side)&&isObject(side.snapshot)?side.snapshot:undefined;const frozen=Array.isArray(snapshot?.items)?snapshot.items.find(v=>isObject(v)&&v.id===id):undefined;name=isObject(frozen)&&typeof frozen.code==='string'?frozen.code:state?.items.find(v=>v.id===id)?.code;}
    if (field==='chapterId') name=state?.chapters.find(v=>v.id===id)?.code;
    if (field==='chapterIds') {const chapter=state?.chapters.find(v=>v.id===id);name=chapter?`${chapter.frameworkId} ${chapter.code}`:undefined;}
    return name&&name!==id?`${name} [${id}]`:id;
  };
  const format=(value:unknown,field:string,side:'before'|'after'):string=>{
    if (value===undefined) return side==='before'&&created?'—':t('未記錄／空值','Not recorded / null');
    if (value===null) return t('未填寫','Not entered');
    if (value==='') return t('（空白）','(empty)');
    if (typeof value==='boolean') return field==='reviewed'?(value?t('已勾選','Checked'):t('未勾選','Unchecked')):field==='active'?(value?t('啟用','Active'):t('停用','Inactive')):(value?t('是','Yes'):t('否','No'));
    if (typeof value==='number') return field==='percent'||field==='levels'?`${value}%`:String(value);
    if (typeof value==='string'&&field==='source') return improvementSourceLabel(value as Parameters<typeof improvementSourceLabel>[0],lang);
    if (typeof value==='string') return own(enums,field)&&own(enums[field],value)?translated(enums[field],value):reference(value,field,side==='before'?log.before:log.after);
    if (Array.isArray(value)) return value.length?value.map(v=>format(v,field,side)).join('\n'):t('（空清單）','(empty list)');
    if (isObject(value)) return Object.entries(value).filter(([k])=>!sensitive(k)&&!metadata.has(k)).map(([k,v])=>`${translated(fields,k)}: ${format(v,k,side)}`).join('\n')||t('（空內容）','(empty object)');
    return String(value);
  };
  const add=(a:unknown,b:unknown,path:string[],labels:string[],field:string,entry?:EntryChange)=>{
    const before=entry==='added'&&a===undefined?t('（原無此筆）','(no previous entry)'):format(a,field,'before'),after=entry==='removed'&&b===undefined?t('（此筆已移除）','(entry removed)'):format(b,field,'after'),label=labels.join(t('／',' / '));
    const plainBefore=richTextToPlainText(before),plainAfter=richTextToPlainText(after);
    const short=[plainBefore,plainAfter].every(v=>v.length<=52&&!/[\r\n]/.test(v));
    const detail=before!==after&&plainBefore===plainAfter?t('文字格式已修改','Text formatting changed'):short?`${plainBefore} → ${plainAfter}`:mode==='diff'?t('內容已修改','Content changed'):t('已保存內容（展開查看）','Saved content (expand to view)');
    changes.push({path:JSON.stringify(path),label,before,after,summary:`${label}${t('：',': ')}${detail}`});
  };
  const priority=['reviewed','response','conformity','executionStatus','percent','status','urgency','selfAssessment','evidence','content','title','plan','targetDate','departmentIds','assigneeIds','scoreTargets','events'];
  const walk=(a:unknown,b:unknown,path:string[],labels:string[],field='',entry?:EntryChange)=>{
    if (equal(a,b)) return;
    if ((isObject(a)||a===undefined) && (isObject(b)||b===undefined) && (isObject(a)||isObject(b))) {
      const aa=isObject(a)?a:{},bb=isObject(b)?b:{},keys=[...new Set([...Object.keys(aa),...Object.keys(bb)])].filter(k=>!metadata.has(k)&&!sensitive(k));
      keys.sort((x,y)=>{const ix=priority.indexOf(x),iy=priority.indexOf(y);return (ix<0?priority.length:ix)-(iy<0?priority.length:iy)||x.localeCompare(y);});
      if (!keys.length && path.length) {if (isObject(a)&&!Object.keys(a).length||isObject(b)&&!Object.keys(b).length) add(a,b,path,labels,field,entry);return;}
      for (const key of keys) walk(aa[key],bb[key],[...path,key],[...labels,translated(fields,key)],key,entry);
      return;
    }
    if ((Array.isArray(a)||a===undefined) && (Array.isArray(b)||b===undefined) && (Array.isArray(a)||Array.isArray(b))) {
      const aa=Array.isArray(a)?a:[],bb=Array.isArray(b)?b:[],all=[...aa,...bb];
      if (['itemIds','chapterIds','departmentIds','assigneeIds'].includes(field) && aa.every(v=>typeof v==='string') && bb.every(v=>typeof v==='string') && a!==undefined&&b!==undefined) {if(equal([...aa].sort(),[...bb].sort()))return;}
      // Stable record identity, not position: inserting/reordering findings must not fabricate changes.
      const idKey=all.length?['id','itemId','departmentId'].find(k=>all.every(v=>isObject(v)&&typeof v[k]==='string')&&[aa,bb].every(rows=>new Set(rows.map(v=>(v as JsonObject)[k])).size===rows.length)):undefined;
      if (idKey) {
        const left=new Map(aa.map(v=>[(v as JsonObject)[idKey] as string,v])),right=new Map(bb.map(v=>[(v as JsonObject)[idKey] as string,v]));
        for(const id of new Set([...left.keys(),...right.keys()])) {
          const knownLists=Array.isArray(a)&&Array.isArray(b),delta:EntryChange=knownLists&&!left.has(id)?'added':knownLists&&!right.has(id)?'removed':entry;
          const rows=right.has(id)?bb:aa,index=rows.findIndex(v=>(v as JsonObject)[idKey]===id)+1;
          const prefix=delta==='added'?t('新增','Added '):delta==='removed'?t('移除','Removed '):'';
          walk(left.get(id),right.get(id),[...path,`[${idKey}=${id}]`],[...labels,`${prefix}${t('第 ','entry ')}${index}${t(' 筆','')}`],'',delta);
        }
        return;
      }
      if (field==='levels'||(path.length===2&&path[0]==='dryLevels')) {for(let i=0;i<Math.max(aa.length,bb.length);i++)walk(aa[i],bb[i],[...path,String(i)],[...labels,['Basic','Intermediate','Advanced','Excellence'][i]||String(i+1)],'levels',entry);return;}
      if (all.some(isObject)) {for(let i=0;i<Math.max(aa.length,bb.length);i++)walk(aa[i],bb[i],[...path,String(i)],[...labels,`${t('第','Entry ')}${i+1}${t('筆','')}`],'',entry);return;}
    }
    add(a,b,path,labels.length?labels:[t('內容','Content')],field,entry);
  };
  if (mode!=='unavailable') walk(beforePresent?log.before:undefined,afterPresent?log.after:undefined,[],[]);
  let notice=mode==='unavailable'?t('此筆未保留修改前後內容，無法還原具體差異；以下保留原始摘要。','Before/after content was not retained; specific changes cannot be reconstructed. Original summary is retained below.'):
    mode==='after_only'?t('缺少修改前快照；只能顯示已保存的修改後內容。','Before snapshot is missing; only the recorded after content is available.'):
    mode==='before_only'?t('缺少修改後快照；只能顯示已保存的修改前內容。','After snapshot is missing; only the recorded before content is available.'):
    mode==='created'?t('新增／產生記錄；以下為當時保存的內容。','Record created/generated; content is from the saved snapshot.'):
    !changes.length?t('此筆快照沒有可顯示的業務欄位差異；版本、系統時間及敏感欄位不列入。','No displayable business-field differences in this snapshot; version, system timestamps and sensitive fields are excluded.'):'';
  if (log.action==='site_password') notice=t('已更新進站密碼；密碼內容不記錄或顯示。','Site password changed; password values are not recorded or displayed.');
  return {action,kind,changes,notice,mode};
}
