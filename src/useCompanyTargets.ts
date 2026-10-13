import {useEffect,useRef,useState} from 'react';
import type {Framework,FrameworkId,PageProps,Lease} from './types';
import {hashPassword,validateTargetAck,type SharedTargetAck,type SharedTargetRequest} from './api';
import {targetMean,type ChapterScore} from './domain';
type Draft={base:Framework;values:Record<string,string>};
const strings=(goals:Record<string,number|null>={})=>Object.fromEntries(Object.entries(goals).map(([id,n])=>[id,n===null?'':String(n)]));
const valid=(x:unknown):x is SharedTargetRequest=>{const r=x as SharedTargetRequest|null;return !!r&&['TMSA','DRYBMS'].includes(r.frameworkId)&&Number.isSafeInteger(r.expectedVersion)&&r.expectedVersion>0&&typeof r.leaseToken==='string'&&!!r.leaseToken&&typeof r.operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/.test(r.operationId)&&!!r.targets&&typeof r.targets==='object'&&!Array.isArray(r.targets)&&Object.values(r.targets).every(n=>n===null||typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=4&&(r.frameworkId!=='TMSA'||Number.isInteger(n)));};
const rejected=new Set(['FORBIDDEN','SESSION_INVALID','INVALID_FRAMEWORK','INVALID_OPERATION_ID','INVALID_PAYLOAD','INVALID_TARGETS','INVALID_TARGET_CHAPTER','INVALID_TARGET_SCORE','INVALID_VERSION','LEASE_HELD','LEASE_LOST','WRITE_BUSY','VERSION_CONFLICT']);
/** A framework-scoped company goal is independent of actual/frozen assessment facts. */
export function useCompanyTargets(ctx:PageProps,focus:FrameworkId,rows:Pick<ChapterScore,'chapterId'|'score'>[]){
 const [drafts,setDrafts]=useState<Partial<Record<FrameworkId,Draft>>>({}),[pending,setPending]=useState<SharedTargetRequest|null>(null),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState('');
 const current=useRef(ctx),generation=useRef(0),slot=useRef(''),pendingRef=useRef<SharedTargetRequest|null>(null),inFlight=useRef(false);current.current=ctx;
 const framework=ctx.state.frameworks.find(f=>f.id===focus),draft=drafts[focus];
 const targets=pending?.frameworkId===focus?strings(pending.targets):{...strings((draft?.base??framework)?.scoreTargets),...draft?.values};
 const canSave=ctx.user.active&&['owner','admin'].includes(ctx.user.role),dirty=Object.keys(drafts).length>0||!!pending,conflict=!!draft&&draft.base.version!==framework?.version;
 useEffect(()=>{
  const g=++generation.current;let live=true;setReady(false);slot.current='';pendingRef.current=null;setPending(null);setDrafts({});inFlight.current=false;setBusy(false);setError('');
  void hashPassword(ctx.api.sessionToken).then(tag=>{
   if(!live||g!==generation.current)return;
   const key=`fpmc-compliance-targets:${ctx.api.config.url}:${ctx.api.clientId}:${ctx.user.id}:${tag}`,raw=sessionStorage.getItem(key),saved:unknown=raw?JSON.parse(raw):null;
   if(saved!==null&&!valid(saved))throw Error('TARGET_PENDING_INVALID');
   slot.current=key;pendingRef.current=saved as SharedTargetRequest|null;setPending(saved as SharedTargetRequest|null);setReady(true);
  }).catch(()=>{if(live&&g===generation.current)setError(ctx.t('無法讀取原目標保存記錄；暫不送出新的保存。','Cannot read the original target-save journal; no new save will be sent.'));});
  return()=>{live=false;generation.current++;};
 },[ctx.api,ctx.user.id,ctx.api.sessionToken]);
 useEffect(()=>{const key='overview:company-targets';window.dispatchEvent(new CustomEvent('compliance-editor-status',{detail:{key,dirty,busy}}));return()=>{window.dispatchEvent(new CustomEvent('compliance-editor-status',{detail:{key,dirty:false,busy:false}}));};},[dirty,busy]);
 const edit=(chapterId:string,value:string)=>{if(busy||pending||!framework)return;setError('');setDrafts(old=>({...old,[focus]:{base:old[focus]?.base??structuredClone(framework),values:{...old[focus]?.values,[chapterId]:value}}}));};
 const reset=()=>{if(busy||pending||!framework)return;setError('');setDrafts(old=>({...old,[focus]:{base:old[focus]?.base??structuredClone(framework),values:{...old[focus]?.values,...Object.fromEntries(rows.map(r=>[r.chapterId,r.score===null?'':String(r.score)]))}}}));};
 const load=()=>{if(busy||pending)return;if(draft&&!confirm(ctx.t('放棄這個框架的試算草稿，載入目前公司目標？','Discard this framework’s simulation draft and load current company targets?')))return;setDrafts(old=>{const next={...old};delete next[focus];return next;});setError('');};
 const save=async(replay=false)=>{
  if(!canSave||!ready||inFlight.current||!slot.current||(!replay&&pendingRef.current)||replay&&!pendingRef.current)return;
  const submitted=ctx,g=generation.current,session=ctx.api.sessionToken,key=slot.current;
  const matches=()=>g===generation.current&&current.current.api===submitted.api&&submitted.api.sessionToken===session&&current.current.user.id===submitted.user.id;
  let request=pendingRef.current,lease:Lease|null=null,sent=false,confirmed=false;
  inFlight.current=true;setBusy(true);setError('');
  try{
   if(!request){
    const base=draft?.base??framework;if(!base)throw Error('FRAMEWORK_NOT_FOUND');
    const values={...base.scoreTargets};
    // Preserve goals outside current filters, including inactive chapters.
    for(const [chapterId,value] of Object.entries(draft?.values??{})){const row=rows.find(r=>r.chapterId===chapterId);if(value===''){if(row)values[chapterId]=row.score;continue;}const n=Number(value);if(!Number.isFinite(n)||n<0||n>4||focus==='TMSA'&&!Number.isInteger(n))throw Error(submitted.t('目標分數須為0–4，TMSA須為整數。','Targets must be 0–4; TMSA targets must be integers.'));values[chapterId]=n;}
    for(const row of rows){const input=targets[row.chapterId];if(input!==undefined&&input!==''){const value=targetMean([row],targets,focus);if(value===null)throw Error(submitted.t('請先修正無效的目標分數。','Correct invalid target scores before saving.'));values[row.chapterId]=value;}else values[row.chapterId]=row.score;}
    lease=await submitted.api.rpc<Lease>('target_claim',{frameworkId:focus});if(!matches())return;
    if(lease.baseVersion!==base.version)throw Object.assign(Error(submitted.t('框架或公司目標已被更新；草稿保留，請核對後載入公司目標。','Framework or company targets changed. Draft retained; review and load company targets.')),{code:'VERSION_CONFLICT'});
    request={frameworkId:focus,targets:values,expectedVersion:base.version,leaseToken:lease.token,operationId:crypto.randomUUID()};
    sessionStorage.setItem(key,JSON.stringify(request));pendingRef.current=request;setPending(request);
   }
   if(!matches())return;
   sent=true;const ack=validateTargetAck(await submitted.api.rpc<SharedTargetAck>('target_save',request),request);confirmed=true;
   if(!matches())return;
   submitted.acknowledge?.('framework',ack.record);pendingRef.current=null;setPending(null);setDrafts(old=>{const next={...old};delete next[ack.frameworkId];return next;});
   try{sessionStorage.removeItem(key);}catch{/* A confirmed ACK remains authoritative; receipt replay is safe. */}
   submitted.notify(`${ack.frameworkId} · ${submitted.t('公司目標已保存並由伺服器確認。','Company targets saved and acknowledged by the server.')}`,'success');
   try{await submitted.refresh();}catch{if(matches())submitted.notify(submitted.t('公司目標保存已確認；最新資料讀回待完成，請勿重複保存。','Company target save confirmed; latest readback pending. Do not save again.'),'info');}
  }catch(e){
   if(!matches())return;
   const code=e&&typeof e==='object'&&'code' in e?String(e.code):'',definite=rejected.has(code);
   if(definite&&request){try{sessionStorage.removeItem(key);}catch{/* Preserve evidence on storage failure. */}pendingRef.current=null;setPending(null);const base=current.current.state.frameworks.find(f=>f.id===request!.frameworkId);if(base)setDrafts(old=>({...old,[request!.frameworkId]:{base:{...structuredClone(base),version:request!.expectedVersion},values:strings(request!.targets)}}));}
   const message=e instanceof Error?e.message:String(e),text=pendingRef.current?`${message} ${submitted.t('原保存已保留；只可核對／重播原操作，不另建保存。','Original save retained. Check/replay it; do not create another save.')}`:message;
   setError(text);submitted.notify(text,'error');
  }finally{
   if(lease&&(!sent||confirmed||!pendingRef.current))void submitted.api.release(lease).catch(()=>{});
   else if(request&&(confirmed||!pendingRef.current))void submitted.api.rpc('release',{kind:'framework',id:request.frameworkId,leaseToken:request.leaseToken}).catch(()=>{});
   if(matches()){inFlight.current=false;setBusy(false);}
  }
 };
 return {targets,edit,reset,load,save,pending,busy,ready,error,dirty,conflict,canSave};
}
