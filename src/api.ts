import type {ApiClient, Assessment, Framework, FrameworkId, AuditQuery, AuditLog, BaseEntity, ExportRequest, Lease, Person, RosterPerson, PlatformState, BrowseState, Inspection, ReadonlyInspectionSummary, RecordKind, RpcResult, SaveIntent, SeedBundle, SupabaseConfig, SystemSettings} from './types';
import {collectionFor,mergeAcknowledgement,mergeSync,inspectionSummary,type SyncEnvelope} from './syncState.ts';

const SESSION_KEY='fpmc-compliance-session';
const CLIENT_KEY='fpmc-compliance-client-id';
const storage=():Storage|null=>{try{return typeof sessionStorage==='undefined'?null:sessionStorage;}catch{return null;}};
const id=()=>crypto.randomUUID();
export async function hashPassword(value:string):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
}
export type ExportFailureClassification='abort'|'SyntaxError'|'network'|'unknown';
export interface ExportFailureDiagnostic {action:'export_authorize';phase:'fetch'|'body-read-or-parse';elapsedMs:number;httpStatus:number|null;classification:ExportFailureClassification}
const exportFailureClassification=(error:unknown,signal:AbortSignal):ExportFailureClassification=>signal.aborted||error instanceof Error&&error.name==='AbortError'?'abort':error instanceof SyntaxError?'SyntaxError':error instanceof TypeError?'network':'unknown';
export class RpcError extends Error {
  declare readonly diagnostic?:ExportFailureDiagnostic;
  readonly code:string; readonly holderName?:string;
  constructor(code:string,message?:string,holderName?:string){super(`${code}: ${message||'伺服器未確認操作。'}${holderName?`（${holderName}）`:''}`);this.name='RpcError';this.code=code;this.holderName=holderName;}
}

class SupabaseApi implements ApiClient {
  readonly clientId:string; readonly config:SupabaseConfig;
  user:Person|null=null;sessionToken='';private epoch=0;private settings:SystemSettings|null=null;private leaseContexts=new Map<string,{kind:RecordKind;id:string;intent:SaveIntent}>();
  private cache:BrowseState|null=null;private cacheContext='';private metadataToken='';private ackSerial=0;private syncFlight:{context:string;promise:Promise<BrowseState>}|null=null;
  private detailFlights=new Map<string,Promise<Inspection>>();
  private context(){return `${this.epoch}:${this.sessionToken}:${this.user?.id??''}:${this.config.url}:${this.config.anonKey}`;}
  cachedState(){return this.cacheContext===this.context()&&this.cache?structuredClone(this.cache):null;}
  constructor(config:SupabaseConfig){
    this.config={url:config.url.replace(/\/$/,''),anonKey:config.anonKey};
    const s=storage();this.clientId=s?.getItem(CLIENT_KEY)||id();s?.setItem(CLIENT_KEY,this.clientId);
    try{const saved=JSON.parse(s?.getItem(SESSION_KEY)||'null') as {user?:Person;sessionToken?:string}|null;
      if(saved?.user && typeof saved.sessionToken==='string'){this.user=saved.user;this.sessionToken=saved.sessionToken;}
    }catch{s?.removeItem(SESSION_KEY);}
  }
  private publishSession(){const s=storage();if(this.user&&this.sessionToken)s?.setItem(SESSION_KEY,JSON.stringify({user:this.user,sessionToken:this.sessionToken}));else s?.removeItem(SESSION_KEY);}
  private invalidate(){this.epoch++;this.user=null;this.sessionToken='';this.cache=null;this.cacheContext='';this.publishSession();}
  async rpc<T=unknown>(action:string,payload:unknown={},performanceRoute=false):Promise<T>{
    if(!this.config.url || !this.config.anonKey)throw new RpcError('CONFIG_REQUIRED','尚未配置此平台自己的 Supabase。');
    const body=JSON.stringify({p_action:action,p_session:this.sessionToken,p_client_id:this.clientId,p_payload:payload,...(performanceRoute||action==='restart_updates'||action==='target_claim'||action==='target_save'?{p_sync_mode:'performance-v1'}:action==='import_seed'?{p_import_mode:true}:action==='read'?{p_import_mode:false,p_read_mode:true}:{})});
    const initiatedSession=this.sessionToken,initiatedEpoch=this.epoch;
    const replaySafe=['save','role_permissions'].includes(action)&&typeof payload==='object'&&payload!==null&&typeof (payload as {operationId?:unknown}).operationId==='string';
    // Initial source upload can exceed the ordinary request window before SQL starts.
    // The full snapshot also needs a bounded transfer/parse window after SQL.
    // Neither exception changes ordinary writer deadlines or replay policy.
    const requestDeadlineMs=action==='import_seed'?180000:action==='read'||action==='sync'?60000:20000;
    for(let attempt=0;attempt<(replaySafe?2:1);attempt++){
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),requestDeadlineMs);
      let result:RpcResult<T>;
      const startedAt=performance.now();let phase:ExportFailureDiagnostic['phase']='fetch',httpStatus:number|null=null,bodyFailureClassification:ExportFailureClassification|undefined;
      const withDiagnostic=(error:RpcError,classification:ExportFailureClassification)=>{if(action==='export_authorize'&&!error.diagnostic)Object.defineProperty(error,'diagnostic',{enumerable:true,value:{action:'export_authorize',phase,elapsedMs:Math.max(0,Math.round(performance.now()-startedAt)),httpStatus,classification} satisfies ExportFailureDiagnostic});return error;};
      try{
        const response=await fetch(`${this.config.url}/rest/v1/rpc/compliance_rpc`,{method:'POST',headers:{'Content-Type':'application/json',apikey:this.config.anonKey,Authorization:`Bearer ${this.config.anonKey}`},body,signal:controller.signal,cache:'no-store'});
        httpStatus=response.status;phase='body-read-or-parse';
        if(!response.ok){
          const provider=await response.json().catch(error=>{bodyFailureClassification=exportFailureClassification(error,controller.signal);return null;}) as {code?:unknown}|null;
          if(provider?.code==='57014')throw new RpcError('DB_57014',action==='import_seed'?'資料庫執行逾時；未確認匯入完成。請保留資料並先核對雲端狀態，不要直接重試。':action==='read'?'最新資料讀取逾時；尚未確認完整讀回。這不代表先前寫入失敗，請勿因此重複保存。':action==='bootstrap_status'?'連線檢查逾時；目前尚未通過核對。這不代表 Owner 不存在。':'資料庫執行逾時；本次操作結果尚未確認。請保留草稿並先核對雲端狀態。');
          throw new RpcError(`HTTP_${response.status}`,'連線服務未確認操作，請保留草稿。');
        }
        result=await response.json() as RpcResult<T>;
      }catch(error){
        if(error instanceof RpcError)throw withDiagnostic(error,bodyFailureClassification??'unknown');
        if(attempt===0&&replaySafe&&this.sessionToken===initiatedSession&&this.epoch===initiatedEpoch)continue;
        // Never echo remote body, payload, token, credential, or raw transport error.
        throw withDiagnostic(new RpcError('NETWORK_UNKNOWN',action==='export_authorize'?'匯出授權結果尚未確認，下載尚未建立。請保留目前選取與畫面，先核對連線及伺服器狀態，勿反覆匯出。':'無法確認伺服器結果。請保留草稿，使用原操作編號核對或重播。'),exportFailureClassification(error,controller.signal));
      }finally{clearTimeout(timer);}
      if(this.sessionToken!==initiatedSession||this.epoch!==initiatedEpoch)throw new RpcError('STALE_SESSION','此回覆屬於先前登入，未套用至目前身分。');
      if(!result || typeof result.ok!=='boolean')throw new RpcError('INVALID_RESPONSE','伺服器回覆格式不正確。');
      if(!result.ok){
        const code=result.code||'RPC_REJECTED';
        if(code==='SESSION_INVALID'&&this.sessionToken===initiatedSession)this.invalidate();
        throw withDiagnostic(new RpcError(code,result.message,result.holderName),'unknown');
      }
      if(action==='restart_updates'){
        const ack=validateRestartAck(result.data,payload as {frameworkId:FrameworkId;operationId:string});
        if(this.cache&&this.cacheContext===this.context()){
          const frames=new Map(this.cache.items.map(item=>[item.id,item.frameworkId]));
          if(ack.records.some(record=>frames.get(record.itemId)!==ack.frameworkId))throw new RpcError('INVALID_RESPONSE','重新開始回覆含非所選框架資料；請保留原操作。');
          this.ackSerial++;
          for(const record of ack.records)this.cache=mergeAcknowledgement(this.cache,'assessment',record);
        }
      }
      if(action==='target_save'){
        const ack=validateTargetAck(result.data,payload as SharedTargetRequest);
        this.ackSerial++;
        if(this.cache&&this.cacheContext===this.context())this.cache=mergeAcknowledgement(this.cache,'framework',ack.record);
      }
      return result.data as T;
    }
    throw new RpcError('NETWORK_UNKNOWN');
  }
  status(){return this.rpc<{initialized:boolean;siteGateConfigured:boolean}>('bootstrap_status');}
  gate(passwordHash:string){return this.rpc<{gateToken:string}>('gate',{passwordHash});}
  // Gate-authorized sanitized Person roster; never stored credential hashes.
  roster(gateToken:string){return this.rpc<RosterPerson[]>('roster',{gateToken});}
  async login(gateToken:string,personId:string,passwordHash:string){
    this.epoch++;
    const result=await this.rpc<{user:Person;sessionToken:string}>('login',{gateToken,personId,passwordHash});
    this.user=result.user;this.sessionToken=result.sessionToken;this.publishSession();return result;
  }
  async logout(){const token=this.sessionToken,epoch=++this.epoch;try{if(token)await this.rpc('logout');}finally{if(this.sessionToken===token&&this.epoch===epoch)this.invalidate();}}
  async read(){
    const session=this.sessionToken,epoch=this.epoch;
    const state=await this.rpc<PlatformState>('read');
    // Stored identity/role is only a display hint. Resolve actual opaque-session actor.
    const user=await this.rpc<Person>('current_user');
    if(this.sessionToken!==session||this.epoch!==epoch)throw new RpcError('STALE_SESSION','登入已切換，舊資料回覆未套用。');
    this.user=user;this.settings=structuredClone(state.settings);this.publishSession();return state;
  }
  sync():Promise<BrowseState>{
    const context=this.context();
    if(this.syncFlight?.context===context)return this.syncFlight.promise;
    const promise=(async()=>{
      for(let attempt=0;attempt<4;attempt++){
        const serial=this.ackSerial,base=this.cacheContext===context?this.cache:null,versions:Record<string,number>={};
        if(base)for(const [kind,key] of Object.entries(collectionFor)){const rows=key==='settings'?[base.settings]:base[key as Exclude<keyof PlatformState,'cycles'|'provenance'>] as BaseEntity[];for(const row of rows)versions[`${kind}:${row.id}`]=row.version;}
        const envelope=await this.rpc<SyncEnvelope>('sync',{versions,metadataToken:base?this.metadataToken:''},true);
        if(context!==this.context())throw new RpcError('STALE_SESSION');
        // A read admitted before a local committed ACK cannot certify that ACK's token.
        if(serial!==this.ackSerial)continue;
        if(base&&!('historyMode' in base)&&envelope.metadataToken&&envelope.metadataToken!==this.metadataToken&&(!Array.isArray(envelope.cycles)||!Array.isArray(envelope.provenance)))throw new RpcError('SYNC_METADATA_INCOMPLETE');
        const next=mergeSync(base,envelope);this.cache=next;this.cacheContext=context;this.metadataToken=envelope.metadataToken??'';this.user=envelope.user;this.settings=structuredClone(next.settings);this.publishSession();return structuredClone(next);
      }
      throw new RpcError('SYNC_BUSY','保存已確認；同步尚未取得穩定版本。');
    })();
    const flight={context,promise};this.syncFlight=flight;
    void promise.finally(()=>{if(this.syncFlight===flight)this.syncFlight=null;}).catch(()=>{});
    return promise;
  }
  hydrateInspection(summary:ReadonlyInspectionSummary|Inspection):Promise<Inspection>{
    const context=this.context(),metadata=this.metadataToken,key=`${context}:${metadata}:${summary.id}:${summary.version}`;
    const existing=this.detailFlights.get(key);if(existing)return existing;
    const promise=(async()=>{
      const result=await this.rpc<{inspection:Inspection;metadataToken:string}>('inspection_detail',{id:summary.id,version:summary.version},true);
      if(context!==this.context()||metadata!==this.metadataToken)throw new RpcError('STALE_DETAIL');
      const current=this.cachedState()?.inspections.find(i=>i.id===summary.id);
      if(current&&current.version!==summary.version)throw new RpcError('STALE_DETAIL');
      const i=result.inspection;
      if(result.metadataToken!==metadata&&metadata||!i||i.id!==summary.id||i.version!==summary.version||!i.snapshot?.framework||!Array.isArray(i.snapshot.items)||!Array.isArray(i.snapshot.chapters)||!Array.isArray(i.results)||!Array.isArray(i.findings))throw new RpcError('DETAIL_COVERAGE_INVALID');
      if('detail' in summary){
        const projected=inspectionSummary(i);
        const canonical=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
        if(canonical(projected)!==canonical(summary))throw new RpcError('DETAIL_SUMMARY_MISMATCH');
      }
      return structuredClone(i);
    })();
    this.detailFlights.set(key,promise);void promise.finally(()=>{if(this.detailFlights.get(key)===promise)this.detailFlights.delete(key);}).catch(()=>{});return promise;
  }
  async claim(kind:RecordKind,id:string,intent:SaveIntent='update'){const lease=await this.rpc<Lease>('claim',{kind,id,intent});this.leaseContexts.set(lease.token,{kind,id,intent});return lease;}
  private leasePayload(lease:Lease){const context=this.leaseContexts.get(lease.token);if(context)return {...context,leaseToken:lease.token};const at=lease.resourceKey.indexOf(':');if(at<1)throw new RpcError('INVALID_RESOURCE');return {kind:lease.resourceKey.slice(0,at),id:lease.resourceKey.slice(at+1),leaseToken:lease.token};}
  renew(lease:Lease){return this.rpc<Lease>('renew',this.leasePayload(lease));}
  async release(lease:Lease){await this.rpc('release',this.leasePayload(lease));}
  async save<T extends BaseEntity>(kind:RecordKind,record:T,expectedVersion:number,lease:Lease,intent:SaveIntent='update',operationId=id()):Promise<T>{
    const resourceKey=kind==='assessment'?`item:${(record as T & {itemId:string}).itemId}`:`${kind}:${record.id}`;
    if(lease.resourceKey!==resourceKey)throw new RpcError('LEASE_RESOURCE_MISMATCH','編輯鎖不是此記錄的鎖。');
    // Immutable serialized envelope survives one safe lost-ACK transport replay.
    let action='save';
    if(kind==='settings'){
      if(!this.settings)this.settings=(await this.rpc<PlatformState>('read')).settings;
      const submitted=record as unknown as SystemSettings;
      if(JSON.stringify(submitted.rolePermissions)!==JSON.stringify(this.settings.rolePermissions))action='role_permissions';
    }
    const acknowledged=await this.rpc<{record:T;related:{kind:RecordKind;body:BaseEntity}[]}|T>(action,{kind,record,expectedVersion,leaseToken:lease.token,intent,operationId},true);
    const canonical=('record' in acknowledged?acknowledged.record:acknowledged) as T;
    const related='record' in acknowledged?acknowledged.related:[];
    this.ackSerial++;
    if(this.cache&&this.cacheContext===this.context()){this.cache=mergeAcknowledgement(this.cache,kind,canonical);for(const row of related)this.cache=mergeAcknowledgement(this.cache,row.kind,row.body);}
    if(kind==='settings')this.settings=structuredClone(canonical as unknown as SystemSettings);
    return canonical;
  }
  queryAudit(query:AuditQuery){return this.rpc<{rows:AuditLog[];total:number}>('audit_query',query);}
  authorizeExport(request:ExportRequest){return this.rpc<PlatformState>('export_authorize',request,request.snapshotToken.startsWith('performance-v1:'));}
  importSeed(seed:SeedBundle){return this.rpc<{imported:number}>('import_seed',{seed,operationId:id()});}
}
export interface SharedTargetRequest {frameworkId:FrameworkId;targets:Record<string,number|null>;expectedVersion:number;leaseToken:string;operationId:string}
export interface SharedTargetAck {frameworkId:FrameworkId;operationId:string;record:Framework}
export function validateTargetAck(value:unknown,request:SharedTargetRequest):SharedTargetAck{
 const ack=value as SharedTargetAck|null,goals=ack?.record?.scoreTargets;
 if(!ack||ack.frameworkId!==request.frameworkId||ack.operationId!==request.operationId||ack.record?.id!==request.frameworkId||ack.record.version!==request.expectedVersion+1||!goals||typeof goals!=='object'||Array.isArray(goals)||Object.keys(goals).length!==Object.keys(request.targets).length||Object.entries(request.targets).some(([key,score])=>!Object.hasOwn(goals,key)||goals[key]!==score))throw new RpcError('INVALID_RESPONSE','公司目標保存結果尚未核對；請保留草稿與原操作。');
 return ack;
}
export interface FrameworkRestartAck {frameworkId:FrameworkId;operationId:string;changedCount:number;records:Assessment[]}
export function validateRestartAck(value:unknown,request:{frameworkId:FrameworkId;operationId:string}):FrameworkRestartAck{
 const ack=value as FrameworkRestartAck|null;
 if(!ack||ack.frameworkId!==request.frameworkId||ack.operationId!==request.operationId||!Number.isSafeInteger(ack.changedCount)||ack.changedCount<0||!Array.isArray(ack.records)||ack.records.length!==ack.changedCount||ack.records.some(r=>!r||typeof r.id!=='string'||!r.id||typeof r.itemId!=='string'||!r.itemId||!Number.isSafeInteger(r.version)||r.version<1||r.reviewed!==false)||new Set(ack.records.map(r=>r.id)).size!==ack.changedCount||new Set(ack.records.map(r=>r.itemId)).size!==ack.changedCount)throw new RpcError('INVALID_RESPONSE','重新開始結果尚未核對；請保留原操作，不要建立另一個批次。');
 return ack;
}
export type SeedImportOutcome = {status:'confirmed';imported:number}|{status:'committed_readback_pending';imported:number;error:unknown};
// A successful write ACK and the subsequent read are separate boundaries.
// Never replay an initial import merely because authoritative refresh failed.
export async function runSeedImport(api:ApiClient,seed:SeedBundle,refresh:()=>Promise<void>):Promise<SeedImportOutcome>{
  const acknowledged=await api.importSeed(seed);
  try{await refresh();return {status:'confirmed',imported:acknowledged.imported};}
  catch(error){return {status:'committed_readback_pending',imported:acknowledged.imported,error};}
}
export function createApiClient(config:SupabaseConfig):ApiClient{return new SupabaseApi(config);}
export const createApi=createApiClient;
