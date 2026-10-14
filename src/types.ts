export type Language = 'zh' | 'en';
export type FrameworkId = 'TMSA' | 'DRYBMS';
export type Role = 'owner' | 'admin' | 'operator' | 'vessel';
export type Page = 'overview' | 'TMSA' | 'DRYBMS' | 'improvements' | 'inspections' | 'reports' | 'management';
export interface BiText { en:string; zh:string }
export interface BaseEntity { id:string; version:number; createdAt:string; updatedAt:string; updatedBy:string }
export interface SourceLocator { source:string; file?:string; sheet?:string; cell?:string; pages?:number[]; rawItem?:string; note?:string }
export interface Framework extends BaseEntity { name:BiText; description:BiText; scoring:'tmsa-stage'|'drybms-guidance'; active:boolean; sourceVersion:string; scopeLabel:BiText; scoreTargets?:Record<string,number|null>; includeTmsaChapter14?:boolean }
export interface Chapter extends BaseEntity { frameworkId:FrameworkId; code:string; name:BiText; aim?:BiText; order:number; active:boolean; priority?:boolean }
export interface StandardItem extends BaseEntity { frameworkId:FrameworkId; chapterId:string; code:string; level:number; order:number; active:boolean; kpi:BiText; guidance:BiText; departmentIds:string[]; sources:SourceLocator[]; sourceGap?:string; sourceGapResolved?:boolean; analysisIndex?:boolean; sourceOriginals?:{id:string;kind:string;en:string;page:number}[]; crosswalk?:{tmsaItemCodes:string[];match:string;difference:string;attention:string}; aliases?:string[] }
export interface DepartmentResponse { departmentId:string; response:'yes'|'no'|null; assessment:BiText; evidence:BiText; source:SourceLocator }
export interface Assessment extends BaseEntity { itemId:string; response:'yes'|'no'|null; conformity:'all'|'partial'|'none'; reviewed:boolean; selfAssessment:BiText; evidence:BiText; departmentIds:string[]; assigneeIds:string[]; executionStatus:'not_started'|'in_progress'|'completed'; importedYear?:number; initialDepartmentResponses?:DepartmentResponse[]; sources:SourceLocator[]; note?:BiText }
export interface ProgressEvent { id:string; at:string; by:string; content:string; status:'open'|'in_progress'|'closed'; percent:number }
export interface Improvement extends BaseEntity { title:string; content:BiText; itemIds:string[]; departmentIds:string[]; assigneeIds:string[]; source:'external'|'non_external'; inspectionId?:string; findingId?:string; sourceKey?:string; urgency:'urgent'|'high'|'medium'|'low'; status:'open'|'in_progress'|'closed'; percent:number; targetDate:string; plan:string; events:ProgressEvent[]; closedAt:string|null; closedBy:string|null; sources:SourceLocator[] }
export interface InspectionResult { itemId:string; response:'yes'|'no'|null; conformity:'all'|'partial'|'none'; reviewed:boolean; observation:BiText; recommendation:BiText }
export interface Finding { id:string; itemIds:string[]; classification:'finding'|'ofi'|'positive'|'guidance'|'no_finding'|'general'; observation:BiText; recommendation:BiText; sources:SourceLocator[]; warning?:string }
export interface Inspection extends BaseEntity { frameworkId:FrameworkId; title:string; organization:string; date:string; type:'formal'|'informal'; status:'draft'|'final'; snapshot:{framework:Framework;chapters:Chapter[];items:StandardItem[];scoringVersion:string}; results:InspectionResult[]; findings:Finding[]; dryLevels?:Record<string,[number|null,number|null,number|null,number|null]>; supersedesId?:string; imported:boolean; scoreNote?:BiText; includeTmsaChapter14?:boolean }
export interface Person extends BaseEntity { username:string; name:string; departmentId:string; role:Role; active:boolean; hasPassword:boolean }
/** Gate-authorized display enrichment; never persisted as a person record. */
export interface RosterPerson extends Person { departmentName?:BiText }
export interface Department { id:string; name:BiText; active:boolean }
export type Capability = 'editAssessments'|'createImprovements'|'updateImprovements'|'closeImprovements'|'manageInspections'|'exportReports'|'enterManagement'|'manageUsers'|'manageFrameworks'|'viewAuditLogs'|'manageRolePermissions'|'manageSystemSettings';
export type RolePermissions = Record<Role,Record<Capability,boolean>>;
export interface SystemSettings extends BaseEntity { departments:Department[]; rolePermissions:RolePermissions; siteGateConfigured:boolean }
export interface DryScore extends BaseEntity { chapterId:string; levels:[number|null,number|null,number|null,number|null]; note:string }
export interface AuditLog { id:string; at:string; actorId:string; actorName:string; action:string; kind:string; entityId:string; itemCodes:string[]; summary:string; before?:unknown; after?:unknown; operationId:string }
export interface PlatformState { frameworks:Framework[]; chapters:Chapter[]; items:StandardItem[]; assessments:Assessment[]; improvements:Improvement[]; inspections:Inspection[]; people:Person[]; settings:SystemSettings; dryScores:DryScore[]; auditLogs:AuditLog[]; cycles:unknown[]; provenance:unknown[]; serverTime:string; snapshotToken:string }
/** Exact frozen fields consumed by the shared scoring core; never a full snapshot. */
export type ScoreItem = Pick<StandardItem,'id'|'chapterId'|'code'|'level'|'active'|'sourceGap'|'sourceGapResolved'>;
export type ScoreChapter = Pick<Chapter,'id'|'frameworkId'|'active'|'order'>;
export interface FrozenInspectionScoring {frameworkId:FrameworkId;snapshot:{chapters:ScoreChapter[];items:ScoreItem[]};results:Pick<InspectionResult,'itemId'|'response'|'conformity'|'reviewed'>[];dryLevels?:Inspection['dryLevels'];includeTmsaChapter14?:boolean}
export interface ReadonlyInspectionSummary extends Pick<Inspection,'id'|'version'|'createdAt'|'updatedAt'|'updatedBy'|'frameworkId'|'title'|'organization'|'date'|'type'|'status'|'supersedesId'|'imported'> {readonly detail:'summary';readonly findingClassifications?:Record<string,Finding['classification']>;readonly scoring:FrozenInspectionScoring;readonly counts:{chapters:number;items:number;results:number;findings:number}}
/** Live data has explicit summary coverage, not empty pretend-complete metadata. */
export interface LiveView extends Omit<PlatformState,'inspections'|'cycles'|'provenance'> {inspections:(ReadonlyInspectionSummary|Inspection)[];controlSummary:{cycles:number;provenance:number};historyMode:'readonly-summary-v1'}
export type FullHydratedInspection = Inspection;
export type BrowseState = PlatformState|LiveView;
export interface SeedBundle { schemaVersion:1; frameworks:Framework[];chapters:Chapter[];items:StandardItem[];assessments:Assessment[];improvements:Improvement[];inspections:Inspection[];dryScores:DryScore[];cycles:unknown[];provenance:unknown[];sourceManifest:unknown[];importNote:BiText }
export type RecordKind = 'framework'|'chapter'|'item'|'assessment'|'improvement'|'inspection'|'person'|'dryScore'|'settings';
export type SaveIntent = 'create'|'update'|'close'|'reopen'|'finalize'|'archive'|'activate';
export interface Lease { resourceKey:string; token:string; expiresAt:string; holderName:string; holderId:string; baseVersion:number }
export interface SupabaseConfig { url:string; anonKey:string }
export interface RpcResult<T=unknown> { ok:boolean; data?:T; code?:string; message?:string; holderName?:string }
export interface AuditQuery { text?:string; kind?:string; itemCode?:string; actorId?:string; from?:string; to?:string; offset?:number; limit?:number }
export interface ExportRequest { format:'xlsx'|'pdf'; kind:'framework'|'improvements'|'inspection'|'overview'; ids:string[]; frameworkId?:FrameworkId; filters?:unknown; snapshotToken:string }
export interface ApiClient {
 readonly clientId:string; readonly config:SupabaseConfig; user:Person|null; sessionToken:string;
 rpc<T=unknown>(action:string,payload?:unknown):Promise<T>;
 status():Promise<{initialized:boolean;siteGateConfigured:boolean}>;
 gate(passwordHash:string):Promise<{gateToken:string}>;
 roster(gateToken:string):Promise<RosterPerson[]>;
 login(gateToken:string,personId:string,passwordHash:string):Promise<{user:Person;sessionToken:string}>;
 logout():Promise<void>; read():Promise<PlatformState>;
 /** Opt-in complete authoritative cache; legacy read retains its original route. */
 sync?():Promise<BrowseState>; cachedState?():BrowseState|null;
 hydrateInspection?(summary:ReadonlyInspectionSummary|Inspection):Promise<FullHydratedInspection>;
 claim(kind:RecordKind,id:string,intent?:SaveIntent):Promise<Lease>; renew(lease:Lease):Promise<Lease>; release(lease:Lease):Promise<void>;
 save<T extends BaseEntity>(kind:RecordKind,record:T,expectedVersion:number,lease:Lease,intent?:SaveIntent,operationId?:string):Promise<T>;
 queryAudit(query:AuditQuery):Promise<{rows:AuditLog[];total:number}>;
 authorizeExport(request:ExportRequest):Promise<PlatformState>;
 importSeed(seed:SeedBundle):Promise<{imported:number}>;
}
export interface PageProps { state:BrowseState; user:Person; api:ApiClient; lang:Language; t:(zh:string,en:string)=>string; refresh:()=>Promise<void>; acknowledge?:(kind:RecordKind,record:BaseEntity)=>void; notify:(message:string,kind?:'success'|'error'|'info')=>void; navigate:(page:Page,itemId?:string)=>void }
