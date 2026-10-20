import type {BaseEntity,PlatformState,BrowseState,LiveView,Inspection,ReadonlyInspectionSummary,RecordKind} from './types';

export const collectionFor:Record<RecordKind,keyof PlatformState>={framework:'frameworks',chapter:'chapters',item:'items',assessment:'assessments',improvement:'improvements',inspection:'inspections',person:'people',dryScore:'dryScores',settings:'settings'};
const pick=<T extends object,K extends keyof T>(value:T,keys:readonly K[]):Pick<T,K>=>Object.fromEntries(keys.filter(k=>k in value).map(k=>[k,value[k]])) as Pick<T,K>;
/** Freeze only the exact inputs of the unchanged shared TS scoring algorithm. */
export function inspectionSummary(i:Inspection):ReadonlyInspectionSummary{
 return {...pick(i,['id','version','createdAt','updatedAt','updatedBy','frameworkId','title','organization','date','type','status','supersedesId','imported']),detail:'summary',findingClassifications:Object.fromEntries(i.findings.map(f=>[f.id,f.classification])),scoring:{frameworkId:i.frameworkId,...('includeTmsaChapter14' in i?{includeTmsaChapter14:i.includeTmsaChapter14}:{}),snapshot:{chapters:i.snapshot.chapters.map(c=>pick(c,['id','frameworkId','active','order'])),items:i.snapshot.items.map(x=>pick(x,['id','chapterId','code','level','active','sourceGap','sourceGapResolved']))},results:i.results.map(r=>pick(r,['itemId','response','conformity','reviewed'])),...('dryLevels' in i?{dryLevels:i.dryLevels}:{})},counts:{chapters:i.snapshot.chapters.length,items:i.snapshot.items.length,results:i.results.length,findings:i.findings.length}};
}
export function withHydratedInspection(state:BrowseState,full:Inspection):BrowseState {return 'historyMode' in state?{...state,inspections:state.inspections.map(i=>i.id===full.id&&i.version===full.version?full:i)}:{...state,inspections:state.inspections.map(i=>i.id===full.id&&i.version===full.version?full:i)};}
/** Only confirmed server bodies enter this merge. Metadata is never inferred. */
export function mergeAcknowledgement<T extends BrowseState>(state:T,kind:RecordKind,record:BaseEntity):T{
 const key=collectionFor[kind];
 if(key==='settings')return record.version>=state.settings.version?{...state,settings:record as PlatformState['settings'],snapshotToken:''}:state;
 const rows=state[key as Exclude<keyof PlatformState,'cycles'|'provenance'>] as BaseEntity[];const old=rows.find(x=>x.id===record.id);
 if(old&&old.version>record.version)return state;
 const body=kind==='inspection'&&'historyMode' in state&&'snapshot' in record?inspectionSummary(record as Inspection):record;
 const next=old?rows.map(x=>x.id===record.id?body:x):[...rows,body].sort((a,b)=>a.id.localeCompare(b.id));
 return {...state,[key]:next,snapshotToken:''};
}
export interface SyncEnvelope {viewScope?:'management_viewer';user:PlatformState['people'][number];versions:Record<string,number>;records:{kind:RecordKind;body:BaseEntity}[];metadataToken?:string;cycles?:unknown[];provenance?:unknown[];historyMode?:'readonly-summary-v1';controlSummary?:LiveView['controlSummary'];auditLogs:PlatformState['auditLogs'];serverTime:string;snapshotToken:string;baseline:boolean}
/** A complete version vector covers summaries too; a summary is never a full body. */
export function mergeSync(state:BrowseState|null,envelope:SyncEnvelope):BrowseState{
 if(!state&&!envelope.baseline)throw Error('SYNC_BASELINE_REQUIRED');
 const thin=envelope.historyMode==='readonly-summary-v1';
 const restricted=envelope.viewScope==='management_viewer';
 if(restricted!==(envelope.user.role==='management_viewer')||state&&state.viewScope!==envelope.viewScope)throw Error('SYNC_SCOPE_MISMATCH');
 if(restricted&&(envelope.records.some(r=>r.kind==='improvement')||Object.keys(envelope.versions).some(k=>k.startsWith('improvement:'))||envelope.auditLogs.length||envelope.cycles?.length||envelope.provenance?.length||thin&&(!envelope.controlSummary||Object.keys(envelope.controlSummary).length)))throw Error('SYNC_SCOPE_INVALID');
 if(thin&&!restricted&&(!envelope.controlSummary||!Number.isInteger(envelope.controlSummary.cycles)||!Number.isInteger(envelope.controlSummary.provenance)))throw Error('SYNC_BASELINE_INCOMPLETE');
 if(!state&&!thin&&(!Array.isArray(envelope.cycles)||!Array.isArray(envelope.provenance)))throw Error('SYNC_BASELINE_INCOMPLETE');
 if(state&&('historyMode' in state)!==thin)throw Error('SYNC_COVERAGE_MISMATCH');
 const empty={frameworks:[],chapters:[],items:[],assessments:[],improvements:[],inspections:[],people:[],dryScores:[],settings:null,auditLogs:[],serverTime:'',snapshotToken:''};
 let next=state??({...empty,...(thin?{historyMode:envelope.historyMode,controlSummary:envelope.controlSummary}:{cycles:[],provenance:[]})} as unknown as BrowseState);
 for(const row of envelope.records){
  if(thin&&row.kind==='inspection'&&(!('detail' in row.body)||row.body.detail!=='summary'||!('scoring' in row.body)||'snapshot' in row.body))throw Error('SYNC_HISTORY_COVERAGE_INVALID');
  if(!next.settings&&row.kind==='settings')next={...next,settings:row.body as PlatformState['settings']};
  else next=mergeAcknowledgement(next,row.kind,row.body);
 }
 if(!next.settings||!next.people.some(p=>p.id===envelope.user.id&&p.active))throw Error('SYNC_BASELINE_INCOMPLETE');
 const cachedKeys=new Set<string>();
 for(const [kind,key] of Object.entries(collectionFor)){
  const rows=key==='settings'?[next.settings]:next[key as Exclude<keyof PlatformState,'cycles'|'provenance'>] as BaseEntity[];
  for(const row of rows){const id=`${kind}:${row.id}`;if(cachedKeys.has(id)||envelope.versions[id]!==row.version)throw Error('SYNC_VECTOR_MISMATCH');cachedKeys.add(id);}
 }
 if(Object.keys(envelope.versions).some(id=>!cachedKeys.has(id)))throw Error('SYNC_VECTOR_MISMATCH');
 return {...next,...(restricted?{viewScope:'management_viewer' as const}:{}),...('historyMode' in next?{controlSummary:envelope.controlSummary!}:{cycles:envelope.cycles??next.cycles,provenance:envelope.provenance??next.provenance}),auditLogs:envelope.auditLogs,serverTime:envelope.serverTime,snapshotToken:envelope.snapshotToken};
}
