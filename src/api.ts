import type {ApiClient, AuditQuery, AuditLog, BaseEntity, ExportRequest, Lease, Person, PlatformState, RecordKind, RpcResult, SaveIntent, SeedBundle, SupabaseConfig, SystemSettings} from './types';

const SESSION_KEY='fpmc-compliance-session';
const CLIENT_KEY='fpmc-compliance-client-id';
const storage=():Storage|null=>{try{return typeof sessionStorage==='undefined'?null:sessionStorage;}catch{return null;}};
const id=()=>crypto.randomUUID();
export async function hashPassword(value:string):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
}
export class RpcError extends Error {
  readonly code:string; readonly holderName?:string;
  constructor(code:string,message?:string,holderName?:string){super(`${code}: ${message||'伺服器未確認操作。'}${holderName?`（${holderName}）`:''}`);this.name='RpcError';this.code=code;this.holderName=holderName;}
}

class SupabaseApi implements ApiClient {
  readonly clientId:string; readonly config:SupabaseConfig;
  user:Person|null=null;sessionToken='';private epoch=0;private settings:SystemSettings|null=null;private leaseContexts=new Map<string,{kind:RecordKind;id:string;intent:SaveIntent}>();
  constructor(config:SupabaseConfig){
    this.config={url:config.url.replace(/\/$/,''),anonKey:config.anonKey};
    const s=storage();this.clientId=s?.getItem(CLIENT_KEY)||id();s?.setItem(CLIENT_KEY,this.clientId);
    try{const saved=JSON.parse(s?.getItem(SESSION_KEY)||'null') as {user?:Person;sessionToken?:string}|null;
      if(saved?.user && typeof saved.sessionToken==='string'){this.user=saved.user;this.sessionToken=saved.sessionToken;}
    }catch{s?.removeItem(SESSION_KEY);}
  }
  private publishSession(){const s=storage();if(this.user&&this.sessionToken)s?.setItem(SESSION_KEY,JSON.stringify({user:this.user,sessionToken:this.sessionToken}));else s?.removeItem(SESSION_KEY);}
  private invalidate(){this.epoch++;this.user=null;this.sessionToken='';this.publishSession();}
  async rpc<T=unknown>(action:string,payload:unknown={}):Promise<T>{
    if(!this.config.url || !this.config.anonKey)throw new RpcError('CONFIG_REQUIRED','尚未配置此平台自己的 Supabase。');
    const body=JSON.stringify({p_action:action,p_session:this.sessionToken,p_client_id:this.clientId,p_payload:payload});
    const initiatedSession=this.sessionToken,initiatedEpoch=this.epoch;
    const replaySafe=['save','role_permissions'].includes(action)&&typeof payload==='object'&&payload!==null&&typeof (payload as {operationId?:unknown}).operationId==='string';
    for(let attempt=0;attempt<(replaySafe?2:1);attempt++){
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
      let result:RpcResult<T>;
      try{
        const response=await fetch(`${this.config.url}/rest/v1/rpc/compliance_rpc`,{method:'POST',headers:{'Content-Type':'application/json',apikey:this.config.anonKey,Authorization:`Bearer ${this.config.anonKey}`},body,signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw new RpcError(`HTTP_${response.status}`,'連線服務未確認操作，請保留草稿。');
        result=await response.json() as RpcResult<T>;
      }catch(error){
        if(error instanceof RpcError)throw error;
        if(attempt===0&&replaySafe&&this.sessionToken===initiatedSession&&this.epoch===initiatedEpoch)continue;
        // Never echo remote body, payload, token, credential, or raw transport error.
        throw new RpcError('NETWORK_UNKNOWN','無法確認伺服器結果。請保留草稿，使用原操作編號核對或重播。');
      }finally{clearTimeout(timer);}
      if(this.sessionToken!==initiatedSession||this.epoch!==initiatedEpoch)throw new RpcError('STALE_SESSION','此回覆屬於先前登入，未套用至目前身分。');
      if(!result || typeof result.ok!=='boolean')throw new RpcError('INVALID_RESPONSE','伺服器回覆格式不正確。');
      if(!result.ok){
        const code=result.code||'RPC_REJECTED';
        if(code==='SESSION_INVALID'&&this.sessionToken===initiatedSession)this.invalidate();
        throw new RpcError(code,result.message,result.holderName);
      }
      return result.data as T;
    }
    throw new RpcError('NETWORK_UNKNOWN');
  }
  status(){return this.rpc<{initialized:boolean;siteGateConfigured:boolean}>('bootstrap_status');}
  gate(passwordHash:string){return this.rpc<{gateToken:string}>('gate',{passwordHash});}
  // Gate-authorized sanitized Person roster; never stored credential hashes.
  roster(gateToken:string){return this.rpc<Person[]>('roster',{gateToken});}
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
    const canonical=await this.rpc<T>(action,{kind,record,expectedVersion,leaseToken:lease.token,intent,operationId});
    if(kind==='settings')this.settings=structuredClone(canonical as unknown as SystemSettings);
    return canonical;
  }
  queryAudit(query:AuditQuery){return this.rpc<{rows:AuditLog[];total:number}>('audit_query',query);}
  authorizeExport(request:ExportRequest){return this.rpc<PlatformState>('export_authorize',request);}
  importSeed(seed:SeedBundle){return this.rpc<{imported:number}>('import_seed',{seed,operationId:id()});}
}
export function createApiClient(config:SupabaseConfig):ApiClient{return new SupabaseApi(config);}
export const createApi=createApiClient;
