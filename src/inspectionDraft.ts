import type {Inspection,SaveIntent,PageProps} from './types';

export interface InspectionDraftBackup {
  base:Inspection;
  draft:Inspection;
  pending?:{op:string;intent:SaveIntent;body:Inspection;expectedVersion:number};
}
// Only a one-way owner/config/session namespace is persisted. Never lease/session
// tokens or credentials. sessionStorage is tab-local and survives a page reload.
export async function inspectionDraftKey(ctx:Pick<PageProps,'api'|'user'>):Promise<string> {
  const value=JSON.stringify([ctx.api.config.url,ctx.api.config.anonKey,ctx.api.clientId,ctx.api.sessionToken,ctx.user.id]);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return 'fpmc-inspection-draft-v1:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
export function readInspectionDraft(key:string):InspectionDraftBackup|null {
  const raw=sessionStorage.getItem(key);if(!raw)return null;
  const value=JSON.parse(raw) as InspectionDraftBackup;
  if(!value?.draft?.snapshot||!value?.base?.snapshot||value.draft.id!==value.base.id||value.draft.version!==value.base.version||!Array.isArray(value.draft.results))throw Error('INVALID_LOCAL_INSPECTION_DRAFT');
  return value;
}
export function writeInspectionDraft(key:string,value:InspectionDraftBackup):void {
  // This envelope is explicitly allowlisted; the editor's lease is never serialized.
  const raw=JSON.stringify({base:value.base,draft:value.draft,...(value.pending?{pending:{op:value.pending.op,intent:value.pending.intent,body:value.pending.body,expectedVersion:value.pending.expectedVersion}}:{})});
  sessionStorage.setItem(key,raw);
  if(sessionStorage.getItem(key)!==raw)throw Error('LOCAL_DRAFT_NOT_CONFIRMED');
}
