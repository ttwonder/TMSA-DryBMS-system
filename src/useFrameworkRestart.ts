import {useEffect,useRef,useState} from 'react';
import type {FrameworkId,PageProps} from './types';
import {hashPassword,validateRestartAck,type FrameworkRestartAck} from './api';
type Pending={frameworkId:FrameworkId;operationId:string};
const validPending=(value:unknown):value is Pending=>!!value&&typeof value==='object'&&['TMSA','DRYBMS'].includes((value as Pending).frameworkId)&&typeof (value as Pending).operationId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/.test((value as Pending).operationId);
const rejected=new Set(['FORBIDDEN','INVALID_FRAMEWORK','INVALID_OPERATION_ID','INVALID_PAYLOAD','LEASE_HELD','WRITE_BUSY','VERSION_CONFLICT']);
/** Only stores the exact pending intent locally; business results remain server authority. */
export function useFrameworkRestart(ctx:PageProps){
 const [dialogOpen,setDialogOpen]=useState(false),[pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState('');
 const current=useRef(ctx),generation=useRef(0),key=useRef(''),pendingRef=useRef<Pending|null>(null),inFlight=useRef(false);current.current=ctx;
 useEffect(()=>{
  const g=++generation.current;let live=true;setReady(false);key.current='';pendingRef.current=null;setPending(null);inFlight.current=false;setBusy(false);
  void hashPassword(ctx.api.sessionToken).then(tag=>{
   if(!live||g!==generation.current)return;
   const slot=`fpmc-compliance-restart:${ctx.api.config.url}:${ctx.api.clientId}:${ctx.user.id}:${tag}`;
   const raw=sessionStorage.getItem(slot),saved:unknown=raw?JSON.parse(raw):null;
   if(saved!==null&&!validPending(saved))throw Error('RESTART_PENDING_INVALID');
   key.current=slot;pendingRef.current=saved as Pending|null;setPending(saved as Pending|null);setReady(true);
  }).catch(()=>{if(live&&g===generation.current)setError(ctx.t('無法讀取原操作記錄；不執行新的重新開始批次。','Cannot read the original operation; no new restart batch will be sent.'));});
  return()=>{live=false;generation.current++;};
 },[ctx.api,ctx.user.id,ctx.api.sessionToken]);
 useEffect(()=>{const k='management:framework-restart';window.dispatchEvent(new CustomEvent('compliance-editor-status',{detail:{key:k,dirty:false,busy}}));return()=>{window.dispatchEvent(new CustomEvent('compliance-editor-status',{detail:{key:k,dirty:false,busy:false}}));};},[busy]);
 const open=()=>{if(!ready||inFlight.current||!ctx.user.active||!['owner','admin'].includes(ctx.user.role))return;if(!pendingRef.current)setError('');setDialogOpen(true);};
 const close=()=>{if(!inFlight.current)setDialogOpen(false);};
 const submit=async(frameworkId?:FrameworkId)=>{
  if(!ready||inFlight.current||!key.current||!ctx.user.active||!['owner','admin'].includes(ctx.user.role))return;
  const submitted=ctx,session=ctx.api.sessionToken,g=generation.current,slot=key.current;
  const matches=()=>g===generation.current&&current.current.api===submitted.api&&submitted.api.sessionToken===session&&current.current.user.id===submitted.user.id;
  const request=pendingRef.current??(frameworkId?{frameworkId,operationId:crypto.randomUUID()}:null);if(!request)return;
  inFlight.current=true;setBusy(true);setError('');
  try{
   // Persist before dispatch. Storage failure is a zero-network, zero-write failure.
   sessionStorage.setItem(slot,JSON.stringify(request));pendingRef.current=request;setPending(request);
   if(!matches())return;
   const ack=validateRestartAck(await submitted.api.rpc<FrameworkRestartAck>('restart_updates',request),request);
   if(!matches())return;
   for(const record of ack.records)submitted.acknowledge?.('assessment',record);
   pendingRef.current=null;setPending(null);setDialogOpen(false);
   // Local journal cleanup cannot turn a confirmed server ACK into an unknown write.
   try{sessionStorage.removeItem(slot);}catch{/* Retained original receipt remains safely replayable. */}
   try{
    await submitted.refresh();if(!matches())return;
    submitted.notify(`${ack.frameworkId} · ${submitted.t('已清除完成更新勾選並讀回確認，條目數','Update-completion flags reset and read back, items')}: ${ack.changedCount}`,'success');
   }catch{
    if(matches())submitted.notify(`${ack.frameworkId} · ${submitted.t('伺服器已確認重新開始；最新資料尚未讀回，請勿另建批次重做。','Restart acknowledged; latest readback is pending. Do not create another batch.')}`,'info');
   }
  }catch(e){
   if(!matches())return;
   const code=e&&typeof e==='object'&&'code' in e?String(e.code):'';
   if(rejected.has(code)){sessionStorage.removeItem(slot);pendingRef.current=null;setPending(null);}
   const message=e instanceof Error?e.message:submitted.t('重新開始結果未確認。','Restart result is unconfirmed.');
   const text=pendingRef.current?`${message} ${submitted.t('保留原操作；只可核對／重播同一操作，不要選另一框架重做。','Original operation retained. Check/replay that operation; do not restart another framework.')}`:message;
   setError(text);submitted.notify(text,'error');
  }finally{if(matches()){inFlight.current=false;setBusy(false);}}
 };
 return {dialogOpen,pending,busy,ready,error,open,close,submit};
}
