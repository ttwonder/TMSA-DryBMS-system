import {useRef} from 'react';
import type {Framework,PageProps} from './types';
import {currentIncludesTmsa14,hasPermission} from './domain';
import {useRecordEditor} from './useRecordEditor';
import {EditorNotice} from './ui';
export function Tmsa14Switch({t,included,disabled,onClick}:{t:PageProps['t'];included:boolean;disabled?:boolean;onClick:()=>void}){
 return <button type="button" className={`btn small tmsa14-switch ${included?'included':'excluded'}`} aria-label={t('納入TMSA14章','Include TMSA chapter 14')} aria-pressed={included} disabled={disabled} onClick={onClick}><span aria-hidden="true" className="scope-light"/>{t('納入TMSA14章','Include TMSA chapter 14')} · {included?t('已納入','Included'):t('未納入','Excluded')}</button>;
}
/** Immediate explicit command; the lamp always reflects a server-confirmed framework. */
export function GlobalTmsa14Scope({ctx,blocked}:{ctx:PageProps;blocked:boolean}){
 const editor=useRecordEditor<Framework>(ctx,'framework'),starting=useRef(false),{t}=ctx;
 const framework=ctx.state.frameworks.find(f=>f.id==='TMSA'),included=currentIncludesTmsa14(ctx.state),allowed=hasPermission(ctx.state.settings.rolePermissions,ctx.user,'manageFrameworks');
 const toggle=async()=>{
  if(starting.current||blocked||!allowed||!framework||editor.busy||editor.draft)return;
  starting.current=true;
  try{
   if(!await editor.open(framework))return;
   const base=editor.getBase();
   if(!base||base.version!==framework.version){ctx.notify(t('設定已由他人更新，請核對目前狀態後再切換。','The setting changed. Review its current state before toggling.'),'info');await editor.cancel();return;}
   const next={...base,includeTmsaChapter14:!included};editor.setDraft(next);await editor.save('update',{record:next});
  }finally{starting.current=false;}
 };
 return <div className="scoring-scope"><div className="page-actions"><Tmsa14Switch t={t} included={included} disabled={!allowed||blocked||editor.busy||!!editor.draft||!framework} onClick={()=>void toggle()}/><small>{editor.busy?t('保存核對中…','Confirming save…'):t('公司共用；只影響現況與目標，不變更歷史。','Company-wide; current scores and targets only, never existing history.')}</small></div><EditorNotice error={editor.error} lost={editor.lost}/>{editor.draft&&!editor.busy&&<div className="page-actions"><small>{t('待確認的設定保留中，燈號仍為已確認值。','Pending setting retained; the lamp still shows the confirmed value.')}</small><button className="btn warning small" disabled={!editor.canSave} onClick={()=>void editor.save()}>{editor.pendingUnknown?t('核對／重播原設定','Check / replay original setting'):t('重試保存設定','Retry setting save')}</button>{editor.lost&&!editor.pendingUnknown&&<button className="btn neutral small" onClick={()=>void editor.recover()}>{t('重新取得編輯鎖','Reacquire edit lock')}</button>}<button className="btn neutral small" disabled={editor.pendingUnknown} onClick={()=>void editor.cancel()}>{t('放棄設定草稿','Discard setting draft')}</button></div>}</div>;
}
