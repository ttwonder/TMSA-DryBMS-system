// Additional 015 checks shared by the existing native runner; no hosted access.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApiClient} from '../src/api.ts';
export const REMARKS_CHECKS=[
 'compliance_private.allowed(jsonb,text)','compliance_private.dispatch(text,text,text,jsonb)','compliance_private.state(jsonb)','compliance_private.performance_dispatch(text,text,text,jsonb)',
 'compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','compliance_private.validate_record_before_shared_targets(text,jsonb,jsonb,text,jsonb)',
 'compliance_private.restart_updates(text,text,jsonb)','compliance_private.claim_shared_targets(text,text,jsonb)','compliance_private.save_shared_targets(text,text,jsonb)',
 'public.compliance_rpc(text,text,text,jsonb)','public.compliance_rpc(text,text,text,jsonb,boolean)','public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','public.compliance_rpc(text,text,text,jsonb,text)',
 'exactly_four_public_routes','expected_owners','private_functions_owner_only','private_schema_client_and_public_denied','private_tables_rls','private_tables_client_and_public_denied','public_routes_not_public','client_route_grants_preserved',
];
const sql=c=>readFileSync(join(c.root,'supabase/migrations/015_management_viewer_remarks.sql'),'utf8');
export async function remarksReadback(c,expected='PASS_MANAGEMENT_VIEWER_REMARKS_INSTALL_ONLY'){
 const before=await c.ledger(),r=await c.qa.db.setup.query(readFileSync(join(c.root,'supabase/management-viewer-remarks-readback.sql'),'utf8'));
 const data=r.flatMap(x=>x.rows??[]).find(x=>x.management_viewer_remarks_readback)?.management_viewer_remarks_readback;
 assert.equal(data?.status,expected);assert.equal(data.checkCount,24);assert.deepEqual(Object.keys(data.checks).sort(),[...REMARKS_CHECKS].sort());
 if(expected.startsWith('PASS'))assert(Object.values(data.checks).every(x=>x===true));else assert(Object.values(data.checks).some(x=>x===false));
 assert.deepEqual(await c.ledger(),before);return data;
}
async function refusal(c,message){const before=await c.ledger(),catalog=await c.catalogue();let error;try{await c.qa.db.setup.query(sql(c));}catch(e){error=e;}finally{await c.qa.db.setup.query('rollback');}assert.match(error?.message??'',message);assert.deepEqual(await c.ledger(),before);assert.deepEqual(await c.catalogue(),catalog);}
export async function beforeRemarksPredecessor(c){await c.run('015-missing-014-refused-zero-data-catalog-change',()=>refusal(c,/MANAGEMENT_VIEWER_REMARKS_UNKNOWN_PREDECESSOR/));}
export async function installRemarks(c){
 const {qa,run,ledger,catalogue,tableAcl,call,row,save,ok,receipt}=c;
 await run('015-readback-before-install-exact-failure',async()=>{receipt.remarksPreReadback=await remarksReadback(c,'FAIL_MANAGEMENT_VIEWER_REMARKS_INSTALL');});
 await run('015-unknown-source-and-ACL-predecessors-refused-zero-change',async()=>{
  const identity='compliance_private.state(jsonb)',before=await catalogue(),rows=await ledger();
  const original=(await qa.db.setup.query('select pg_get_functiondef($1::regprocedure) d',[identity])).rows[0].d;
  await qa.db.setup.query(original.replace('declare result','-- synthetic drift\ndeclare result'));
  try{await refusal(c,/MANAGEMENT_VIEWER_REMARKS_UNKNOWN_PREDECESSOR/);}finally{await qa.db.setup.query(original);}
  await qa.db.setup.query('grant execute on function compliance_private.state(jsonb) to public');
  try{await refusal(c,/MANAGEMENT_VIEWER_REMARKS_UNEXPECTED_ACL/);}finally{await qa.db.setup.query('revoke execute on function compliance_private.state(jsonb) from public');}
  assert.deepEqual(await ledger(),rows);assert.deepEqual(await catalogue(),before);
 });
 await run('015-unknown-extra-public-overload-refused-and-rolled-back',async()=>{
  const before=await catalogue(),rows=await ledger();let error;await qa.db.setup.query('begin');
  try{await qa.db.setup.query("create function public.compliance_rpc() returns jsonb language sql as $$select '{}'::jsonb$$");await qa.db.setup.query(sql(c));}catch(e){error=e;}finally{await qa.db.setup.query('rollback');}
  assert.match(error?.message??'',/MANAGEMENT_VIEWER_REMARKS_UNEXPECTED_RPC_OVERLOAD/);assert.deepEqual(await catalogue(),before);assert.deepEqual(await ledger(),rows);
 });
 // Install with nonempty manual notes; compare complete physical rows, not only counts.
 for(const id of ['assessment-item-a','assessment-item-dry'])ok(await save('operator','assessment',{...await row('assessment',id),remarks:'FORBIDDEN_MANUAL_MARKER\n  原文不變\n',remarksStatus:'fully_met',note:{en:'LEGAL_SOURCE_NOTE remarks improvement',zh:'原始備註／改善來源保留'}}));
 const reads={};for(const role of ['owner','admin','operator','vessel']){const full=ok(await call(role,'read')),sync=ok(await call(role,'sync',{versions:{}},'performance'));delete full.serverTime;delete sync.serverTime;reads[role]={full,sync};}
 await run('015-install-preserves-all-physical-rows-ACL-owner-config-four-RPCs',async()=>{
  const before=await catalogue(),rows=await ledger(),acl=await tableAcl();await qa.db.setup.query(sql(c));const after=await catalogue();
  assert.deepEqual(after.map(({source_md5,...a})=>a),before.map(({source_md5,...a})=>a));assert.deepEqual(await tableAcl(),acl);assert.deepEqual(await ledger(),rows);
  const publicRows=rs=>rs.filter(r=>/^(public\.)?compliance_rpc\(/.test(r.identity));assert.equal(publicRows(after).length,4);assert.deepEqual(publicRows(after),publicRows(before));
  receipt.remarksInstall={before,after,physicalRows:rows,tableAcl:acl};receipt.latestMigration=15;
 });
 await run('015-nonGM-full-and-cold-sync-byte-parity',async()=>{for(const role of Object.keys(reads)){const full=ok(await call(role,'read')),sync=ok(await call(role,'sync',{versions:{}},'performance'));delete full.serverTime;delete sync.serverTime;assert.deepEqual({full,sync},reads[role]);}});
 await run('015-repeat-refused-zero-data-catalog-change',()=>refusal(c,/MANAGEMENT_VIEWER_REMARKS_ALREADY_INSTALLED_VERIFY_READBACK/));
 await run('015-exact-independent-readback-24-checks',async()=>{receipt.remarksReadback=await remarksReadback(c);});
}
export const noManual=data=>{
 const assessments=[...(data.assessments??[]),...(data.records??[]).filter(r=>r.kind==='assessment').map(r=>r.body)];
 for(const a of assessments)for(const key of ['remarks','remarksStatus'])assert(!Object.hasOwn(a,key),`GM ${key} key leaked`);
 for(const marker of ['FORBIDDEN_MANUAL_MARKER','MANUAL_REMARKS','NEW_REMARK_AFTER_EXPORT'])assert(!JSON.stringify(data).includes(marker),`GM marker leaked: ${marker}`);
};
export async function verifyRemarks(c){
 const {qa,run,ledger,call,row,save,ok,denied,receipt}=c;
 for(const route of ['import','read','performance'])await run(`015-nonreading-overload-denial-${route}`,async()=>{
  const before=await ledger();denied(await call('viewer','export_authorize',{kind:'framework',format:'pdf',filters:{reportVariant:'remarks'}},route),route==='import'?'INVALID_IMPORT_ROUTE':route==='read'?'INVALID_READ_ROUTE':'FORBIDDEN');
  if(route==='import')denied(await call('viewer','read',{},route),'INVALID_IMPORT_ROUTE');
  if(route==='performance')denied(await call('viewer','read',{},route),'INVALID_PERFORMANCE_ROUTE');assert.deepEqual(await ledger(),before);
 });
 for(const route of ['ordinary','performance'])for(const format of ['xlsx','pdf'])await run(`015-GM-remarks-export-denied-zero-snapshot-${route}-${format}`,async()=>{
  const state=ok(await call('viewer',route==='ordinary'?'read':'sync',route==='ordinary'?{}:{versions:{}},route));const before=await ledger();
  denied(await call('viewer','export_authorize',{kind:'framework',format,frameworkId:'TMSA',ids:['item-a'],filters:{reportVariant:'remarks'},snapshotToken:state.snapshotToken,operationId:randomUUID()},route));assert.deepEqual(await ledger(),before);
 });
 const statuses=['fully_met','partial_improvable','partial_blocked','not_met_improvable','not_met_blocked'];
 for(const status of statuses)await run(`015-${status}-nonGM-save-full-delta-export-positive-GM-negative`,async()=>{
  const first=ok(await call('viewer','sync',{versions:{}},'performance'));
  for(const id of ['assessment-item-a','assessment-item-dry']){
   const a=await row('assessment',id),remarks=`FORBIDDEN_MANUAL_MARKER ${status}\n  保留空白\n尾行。\n`;
   ok(await save('operator','assessment',{...a,remarks,remarksStatus:status}));assert.equal((await row('assessment',id)).remarks,remarks);
  }
  const delta=ok(await call('viewer','sync',{versions:first.versions,metadataToken:first.metadataToken},'performance'));assert.equal(delta.records.length,2);noManual(delta);assert.notEqual(delta.snapshotToken,first.snapshotToken);
  for(const role of ['owner','admin','operator','vessel']){
   const full=ok(await call(role,'read'));for(const a of full.assessments.filter(a=>['item-a','item-dry'].includes(a.itemId))){assert.deepEqual(a,await row('assessment',a.id));assert.equal(a.remarksStatus,status);}
   const cold=ok(await call(role,'sync',{versions:{}},'performance'));for(const record of cold.records.filter(r=>r.kind==='assessment'))assert.deepEqual(record.body,await row('assessment',record.body.id));
   for(const route of ['ordinary','performance']){const state=route==='ordinary'?full:cold;const response=await call(role,'export_authorize',{kind:'framework',format:'xlsx',frameworkId:'TMSA',ids:['item-a'],filters:{reportVariant:'remarks'},snapshotToken:state.snapshotToken,operationId:randomUUID()},route);if(role==='vessel'){denied(response);continue;}const exported=ok(response);assert.equal(exported.assessments.find(a=>a.itemId==='item-a').remarksStatus,status);assert.equal(exported.assessments.find(a=>a.itemId==='item-a').remarks,(await row('assessment','assessment-item-a')).remarks);}
  }
  for(const route of ['ordinary','read']){const full=ok(await call('viewer','read',{},route));noManual(full);for(const a of full.assessments){const original=await row('assessment',a.id);delete original.remarks;delete original.remarksStatus;assert.deepEqual(a,original);}}
 });
 await run('015-native-Api-cold-warm-compact-check-changed-delta-export-freshness',async()=>{
  const api=createApiClient(qa.config);api.user=qa.users.viewer.user;api.sessionToken=qa.users.viewer.sessionToken;
  const first=await api.sync();noManual(first);assert.equal(await api.sync(),first);
  const cold=ok(await call('viewer','sync',{versions:{}},'performance')),check=ok(await call('viewer','sync_check',{syncMarker:cold.syncMarker},'performance'));
  assert.deepEqual(Object.keys(check).sort(),['historyMode','syncMarker','unchanged','viewScope']);assert.equal(check.unchanged,true);assert.equal(check.viewScope,'management_viewer');assert(Buffer.byteLength(JSON.stringify(check))<=2048);
  const a=await row('assessment','assessment-item-a');ok(await save('operator','assessment',{...a,remarks:a.remarks+'more'}));assert.equal(ok(await call('viewer','sync_check',{syncMarker:cold.syncMarker},'performance')).unchanged,false);
  const next=await api.sync();noManual(next);assert.equal(next.assessments.find(x=>x.id===a.id).version,a.version+1);
  const exported=await api.authorizeExport({kind:'framework',format:'pdf',frameworkId:'TMSA',ids:['item-a'],snapshotToken:next.snapshotToken});noManual(exported);const afterExport=api.cachedState();
  await qa.db.setup.query("update compliance_private.control set cycles=cycles||'[{\"hiddenOnly\":true}]'::jsonb where singleton");assert.equal(await api.sync(),afterExport);noManual(await api.authorizeExport({kind:'framework',format:'pdf',frameworkId:'TMSA',ids:['item-a'],snapshotToken:next.snapshotToken}));
  ok(await save('operator','assessment',{...await row('assessment',a.id),remarks:a.remarks+'changed again'}));await assert.rejects(api.authorizeExport({kind:'framework',format:'pdf',frameworkId:'TMSA',ids:['item-a'],snapshotToken:next.snapshotToken}),/SNAPSHOT_STALE/);
  receipt.syncSmoke={compactBytes:Buffer.byteLength(JSON.stringify(check)),compactKeys:Object.keys(check).sort(),coldWarmNativeApi:true,normalVersionsAndFreshness:true};
 });
}
