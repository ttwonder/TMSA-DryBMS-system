// Synthetic fixtures / owned native PostgreSQL / real anon RPC transactions.
// Never hosted, never browser QA, never reads user credentials. Retain evidence.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {startQaServer} from './qa-server.mjs';
import {root,syntheticSeed,rpc,opaque,sha256} from './native-postgres.mjs';
import {beforeRemarksPredecessor,installRemarks,verifyRemarks,noManual,remarksReadback} from './management-viewer-remarks-checks.mjs';
const baseline=process.argv.includes('--baseline');
const remarksRed=process.argv.includes('--remarks-red');
const latest=process.argv.includes('--latest');
const remarksHidden=latest||remarksRed;
const out=join(root,'qa-evidence/gm-remarks',`${remarksRed?'remarks-red':baseline?'baseline':'green'}-${new Date().toISOString().replaceAll(':','-')}`);mkdirSync(out,{recursive:true});
const migrations=readdirSync(join(root,'supabase/migrations')).filter(f=>/^(00[1-9]|01[0-5])_.*\.sql$/.test(f)&&(latest||remarksRed&&!f.startsWith('015_')||Number(f.slice(0,3))<=13)).sort();
const inputs=['scripts/management-viewer-remarks-checks.mjs',...(latest?['supabase/management-viewer-remarks-readback.sql']:[]),'scripts/verify-management-viewer.mjs','scripts/native-postgres.mjs','scripts/qa-server.mjs',...migrations.map(f=>'supabase/migrations/'+f),...(existsSync(join(root,'supabase/management-viewer-readback.sql'))?['supabase/management-viewer-readback.sql']:[])];
const inputHashes=()=>Object.fromEntries(inputs.map(p=>[p,sha256(readFileSync(join(root,p)))]));
const receipt={layer:'合成資料＋原生PostgreSQL；無瀏覽器／非正式環境',head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),inputHashes:inputHashes(),cases:[]};
let qa,current='setup';
const record=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
const run=async(id,fn)=>{current=id;try{await fn();receipt.cases.push({id,status:'PASS'});}catch(e){receipt.cases.push({id,status:'FAIL',message:e.message});throw e;}finally{record();}};
const ok=r=>{assert.equal(r.ok,true,r.code);return r.data;};
const denied=(r,code='FORBIDDEN')=>{assert.equal(r.ok,false,'request unexpectedly succeeded');assert.equal(r.code,code);};
const bi=s=>({en:s,zh:'測試 '+s});
const hidden=['HIDDEN_LIVE_ACTION','action-hidden-tmsa','action-hidden-dry','action-hidden-loose','HIDDEN_CONTROL_CYCLE','HIDDEN_CONTROL_PROVENANCE'];
const stripped=v=>{const x=structuredClone(v);delete x.serverTime;return x;};
const publicOnly=data=>{
 if(remarksHidden)noManual(data);
 const text=JSON.stringify(data);for(const marker of hidden)assert(!text.includes(marker),`hidden marker leaked: ${marker}`);
 assert.equal(data.viewScope,'management_viewer','server must author viewScope');
 for(const key of ['improvements','auditLogs','cycles','provenance'])assert.deepEqual(data[key],[],`${key} must keep empty state shape`);
 if(data.versions)assert(!Object.keys(data.versions).some(k=>k.startsWith('improvement:')),'improvement version/ID leaked');
 if(data.records)assert(!data.records.some(r=>r.kind==='improvement'),'improvement delta leaked');
 if('controlSummary' in data)assert.deepEqual(data.controlSummary,{},'restricted control counts must not be exposed');
};
try{
 const seed=syntheticSeed(); // Preserve the original RED fixture; GREEN adds nonempty privacy controls.
 if(!baseline){
  seed.cycles=[{id:'HIDDEN_CONTROL_CYCLE',raw:'HIDDEN_LIVE_ACTION'}];seed.provenance=[{raw:'HIDDEN_CONTROL_PROVENANCE'}];
  seed.inspections=['TMSA','DRYBMS'].map(frameworkId=>({id:'history-'+frameworkId,version:0,frameworkId,title:'Frozen '+frameworkId,organization:'Synthetic QA',date:'2026-01-01',type:'formal',status:'final',imported:true,
   snapshot:{framework:structuredClone(seed.frameworks.find(f=>f.id===frameworkId)),chapters:structuredClone(seed.chapters.filter(c=>c.frameworkId===frameworkId)),items:structuredClone(seed.items.filter(i=>i.frameworkId===frameworkId)),scoringVersion:frameworkId==='TMSA'?'company-20-equal-stage-v1':'drybms-guidance-v1.1-p7'},
   results:seed.items.filter(i=>i.frameworkId===frameworkId).map(i=>({itemId:i.id,response:null,conformity:'none',reviewed:false,observation:bi('FROZEN_ORIGINAL_OBSERVATION'),recommendation:bi('FROZEN_ORIGINAL_RECOMMENDATION')})),
   findings:[{id:'source-finding',itemIds:[frameworkId==='TMSA'?'item-a':'item-dry'],classification:'finding',observation:bi('FROZEN_ORIGINAL_FINDING'),recommendation:bi('FROZEN_ORIGINAL_ADVICE'),sources:[{source:'FROZEN_RAW_SOURCE',rawItem:'Original immutable finding'}]}],...(frameworkId==='DRYBMS'?{dryLevels:{'chapter-DRYBMS':[25,null,50,0]}}:{})}));
  seed.improvements=seed.inspections.map(i=>({id:i.frameworkId==='TMSA'?'action-hidden-tmsa':'action-hidden-dry',version:0,title:'HIDDEN_LIVE_ACTION',content:bi('HIDDEN_LIVE_ACTION'),itemIds:[...i.findings[0].itemIds],departmentIds:['marine'],assigneeIds:[],source:'external',inspectionId:i.id,findingId:'source-finding',sourceKey:i.id+':source-finding',urgency:'high',status:'open',percent:0,targetDate:'',plan:'HIDDEN_LIVE_ACTION',events:[],closedAt:null,closedBy:null,sources:[]}));
  seed.improvements.push({...structuredClone(seed.improvements[0]),id:'action-hidden-loose',source:'non_external',inspectionId:'',findingId:'',sourceKey:'',itemIds:[]});
 }
 qa=await startQaServer({seed,evidenceDir:out});
 for(const f of migrations.filter(f=>/^(00[6-9]|01[012])_/.test(f)))await qa.db.setup.query(readFileSync(join(root,'supabase/migrations',f),'utf8'));
 const catalogue=async()=> (await qa.db.setup.query(`select p.oid::regprocedure::text identity,md5(replace(p.prosrc,E'\\r\\n',E'\\n')) source_md5,p.proowner owner,p.proacl acl,p.proconfig config,p.prosecdef security_definer,p.proargnames arguments from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='compliance_private' or n.nspname='public' and p.proname='compliance_rpc' order by 1`)).rows;
 const tableAcl=async()=>(await qa.db.setup.query("select c.relname,c.relowner,c.relacl,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='compliance_private' and c.relkind='r' order by 1")).rows;
 const tables=(await tableAcl()).map(r=>r.relname);
 // Digest complete physical rows: no session handles or credential values in receipts.
 const ledger=async()=>{const result={};for(const name of tables)result[name]=(await qa.db.setup.query(`select count(*)::int count,md5(coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('_xmin',t.xmin::text,'_ctid',t.ctid::text) order by to_jsonb(t)::text)::text,'[]')) digest from compliance_private.${name} t`)).rows[0];return result;};
 const row=async(kind,id)=>(await qa.db.setup.query('select body from compliance_private.records where kind=$1 and id=$2',[kind,id])).rows[0]?.body;
 const call=async(role,action,payload={},route='ordinary')=>{
  const u=typeof role==='string'?qa.users[role]:role;
  if(route==='ordinary')return rpc(qa.db,action,payload,u?.sessionToken||'',u?.clientId||'qa-anonymous');
  const c=await qa.db.connect();try{await c.query('begin');await c.query('set local role anon');
   const extra=route==='performance'?'$5::text':route==='read'?'$5::boolean,$6::boolean':'$5::boolean';
   const args=[action,u?.sessionToken||'',u?.clientId||'qa-anonymous',JSON.stringify(payload),...(route==='performance'?['performance-v1']:route==='read'?[false,true]:[true])];
   const result=(await c.query(`select public.compliance_rpc($1,$2,$3,$4::jsonb,${extra}) result`,args)).rows[0].result;await c.query('commit');return result;
  }catch(e){await c.query('rollback');throw e;}finally{await c.end();}
 };
 const save=async(role,kind,body,intent='update',extra={})=>{
  const lease=ok(await call(role,'claim',{kind,id:body.id,intent}));
  try{return await call(role,'save',{kind,record:body,intent,expectedVersion:body.version||0,leaseToken:lease.token,operationId:randomUUID(),...extra});}
  finally{ok(await call(role,'release',{kind,id:body.id,leaseToken:lease.token}));}
 };
 const remarksContext={qa,run,ledger,catalogue,tableAcl,call,row,save,ok,denied,receipt,root};
 receipt.predecessor=await catalogue();record();
 if(!baseline){
  await run('013-readback-fails-before-install-and-unknown-predecessor-refused',async()=>{
   const before=await ledger(),catalog=await catalogue();const result=await qa.db.setup.query(readFileSync(join(root,'supabase/management-viewer-readback.sql'),'utf8'));assert.equal(result.flatMap(r=>r.rows||[]).find(r=>r.management_viewer_readback).management_viewer_readback.status,'FAIL_MANAGEMENT_VIEWER_INSTALL');
   const original=(await qa.db.setup.query("select pg_get_functiondef('compliance_private.allowed(jsonb,text)'::regprocedure) definition")).rows[0].definition;
   const drift=original.replace("if role_name='owner' then return true;end if;","if role_name='owner' then return true;end if; -- synthetic predecessor drift");assert.notEqual(drift,original);
   await qa.db.setup.query(drift);let error;try{await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/013_management_viewer.sql'),'utf8'));}catch(e){error=e;}finally{await qa.db.setup.query('rollback');await qa.db.setup.query(original);}
   assert.equal(error?.message,'MANAGEMENT_VIEWER_UNKNOWN_PREDECESSOR: compliance_private.allowed(jsonb,text)');assert.deepEqual(await ledger(),before);assert.deepEqual(await catalogue(),catalog);
  });
  const priorReads={};for(const role of ['owner','admin','operator','vessel'])priorReads[role]={full:stripped(ok(await call(role,'read'))),sync:stripped(ok(await call(role,'sync',{versions:{}},'performance')))};
  await run('013-install-preserves-all-rows-catalog-owners-acls-and-four-routes',async()=>{
   const before=await ledger(),acl=await tableAcl();await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/013_management_viewer.sql'),'utf8'));
   assert.deepEqual(await ledger(),before);assert.deepEqual(await tableAcl(),acl);receipt.installed=await catalogue();
   const attributes=rows=>rows.map(({source_md5,...rest})=>rest);assert.deepEqual(attributes(receipt.installed),attributes(receipt.predecessor));
   const publicBefore=receipt.predecessor.filter(p=>p.identity.startsWith('compliance_rpc(')||p.identity.startsWith('public.compliance_rpc('));assert.equal(publicBefore.length,4);assert.deepEqual(receipt.installed.filter(p=>publicBefore.some(b=>b.identity===p.identity)),publicBefore);receipt.installPreservation=before;
  });
  await run('existing-role-full-and-performance-read-parity',async()=>{for(const role of Object.keys(priorReads)){assert.deepEqual(stripped(ok(await call(role,'read'))),priorReads[role].full);assert.deepEqual(stripped(ok(await call(role,'sync',{versions:{}},'performance'))),priorReads[role].sync);assert(!('viewScope' in priorReads[role].full));assert(!('viewScope' in priorReads[role].sync));}});
 }
 if(latest&&!baseline)await beforeRemarksPredecessor(remarksContext);
 if((latest||remarksRed)&&!baseline){await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/014_sync_efficiency.sql'),'utf8'));receipt.latestMigration=14;}
 if(latest&&!baseline)await installRemarks(remarksContext);
 const credentialHash=sha256(opaque()),id='qa-management-viewer';
 // Original native RED: admin's real lease/CAS save rejected INVALID_PERSON through 012.
 await run('admin-creates-dedicated-readonly-account-with-existing-person-save',async()=>{
  const lease=await call('admin','claim',{kind:'person',id,intent:'create'});assert.equal(lease.ok,true,lease.code);
  try{const saved=await call('admin','save',{kind:'person',record:{id,version:0,username:'General Manager',name:'General Manager',departmentId:qa.users.admin.user.departmentId,role:'management_viewer',active:true,hasPassword:true,credentialHash},expectedVersion:0,leaseToken:lease.data.token,intent:'create',operationId:randomUUID()});assert.equal(saved.ok,true,saved.code);assert.equal(saved.data.role,'management_viewer');assert.equal(saved.data.hasPassword,true);assert(!JSON.stringify(saved.data).includes(credentialHash));assert.equal((await row('person',id)).role,'management_viewer');}finally{await call('admin','release',{kind:'person',id,leaseToken:lease.data.token});}
 });
 const gate=ok(await rpc(qa.db,'gate',{passwordHash:qa.db.qaCredentials.gateHash}));
 const login=async(personId,passwordHash=credentialHash)=>rpc(qa.db,'login',{gateToken:gate.gateToken,personId,passwordHash},'','qa-viewer-client');
 await run('viewer-password-correct-wrong-missing-and-roster',async()=>{
  denied(await login(id,sha256(opaque())),'LOGIN_DENIED');denied(await login(id,''),'LOGIN_DENIED');
  const auth=ok(await login(id));assert.equal(auth.user.role,'management_viewer');qa.users.viewer={user:auth.user,sessionToken:auth.sessionToken,clientId:'qa-viewer-client'};
  const roster=ok(await rpc(qa.db,'roster',{gateToken:gate.gateToken}));assert(roster.some(p=>p.id===id&&p.hasPassword));assert(!JSON.stringify(roster).includes(credentialHash));
 });
 if(remarksHidden)await run('GM-R1-full-read-does-not-return-manual-fields',async()=>{
  const a=await row('assessment','assessment-item-a');ok(await save('operator','assessment',{...a,remarks:'FORBIDDEN_MANUAL_MARKER\n  原文不變',remarksStatus:'fully_met'}));
  const data=ok(await call('viewer','read'));const returned=data.assessments.find(x=>x.id===a.id);assert(!Object.hasOwn(returned,'remarks'),'GM full read returned assessment.remarks');assert(!Object.hasOwn(returned,'remarksStatus'),'GM full read returned assessment.remarksStatus');
 });
 await run('viewer-login-rejects-missing-stored-individual-password',async()=>{
  const before=await ledger();await qa.db.setup.query('begin');try{
   await qa.db.setup.query('update compliance_private.credentials set password_hash=null where person_id=$1',[id]);await qa.db.setup.query('set local role anon');
   const response=(await qa.db.setup.query("select public.compliance_rpc('login','','qa-viewer-missing-password',$1::jsonb) result",[JSON.stringify({gateToken:gate.gateToken,personId:id,passwordHash:''})])).rows[0].result;denied(response,'LOGIN_DENIED');
  }finally{await qa.db.setup.query('rollback');}assert.deepEqual(await ledger(),before);
 });
 await run('owner-creates-viewer-with-original-lease-cas-and-exact-replay',async()=>{
  const key='qa-owner-created-viewer';const created=ok(await save('owner','person',{id:key,version:0,username:key,name:'Synthetic owner-created viewer',departmentId:'management',role:'management_viewer',active:true},'create',{passwordHash:sha256(opaque())}));assert.equal(created.hasPassword,true);
  const lease=ok(await call('owner','claim',{kind:'person',id:key}));try{
   const before=await ledger(),request={kind:'person',record:{...created,name:'Synthetic viewer update'},intent:'update',expectedVersion:created.version,leaseToken:lease.token,operationId:randomUUID()};
   denied(await call('owner','save',{...request,leaseToken:opaque()}),'LEASE_LOST');denied(await call('owner','save',{...request,record:{...request.record,version:0},expectedVersion:0}),'VERSION_CONFLICT');assert.deepEqual(await ledger(),before);
   const saved=ok(await call('owner','save',request)),after=await ledger();assert.equal(saved.version,created.version+1);assert.deepEqual(ok(await call('owner','save',request)),saved);assert.deepEqual(await ledger(),after);assert.deepEqual(await row('person',key),saved);
  }finally{ok(await call('owner','release',{kind:'person',id:key,leaseToken:lease.token}));}
  assert.equal((await qa.db.setup.query("select count(*)::int n from compliance_private.records where kind='person' and body->>'role'='owner'")).rows[0].n,1);
 });
 for(const route of ['ordinary','read'])await run(`viewer-full-read-redaction-${route}`,async()=>{const before=await ledger(),data=ok(await call('viewer','read',{},route));publicOnly(data);for(const i of seed.inspections)assert.deepEqual(data.inspections.find(x=>x.id===i.id),await row('inspection',i.id));assert.deepEqual(await ledger(),before);});
 await run('viewer-sync-initial-vector-and-delta-redaction',async()=>{
  const first=ok(await call('viewer','sync',{versions:{}},'performance'));publicOnly(first);assert.equal(first.baseline,true);
  const permitted=(await qa.db.setup.query("select kind||':'||id key,version from compliance_private.records where kind<>'improvement' order by 1")).rows;
  assert.deepEqual(first.versions,Object.fromEntries(permitted.map(r=>[r.key,r.version])));assert.equal(first.records.length,permitted.length);
  const unchanged=ok(await call('viewer','sync',{versions:first.versions,metadataToken:first.metadataToken},'performance'));publicOnly(unchanged);assert.deepEqual(unchanged.records,[]);assert.equal(unchanged.snapshotToken,first.snapshotToken);
  ok(await save('operator','improvement',{...await row('improvement','action-hidden-tmsa'),plan:'HIDDEN_LIVE_ACTION changed'}));
  const hiddenOnly=ok(await call('viewer','sync',{versions:first.versions},'performance'));publicOnly(hiddenOnly);assert.deepEqual(hiddenOnly.versions,first.versions);assert.deepEqual(hiddenOnly.records,[]);assert.equal(hiddenOnly.snapshotToken,first.snapshotToken);
  const assessment=await row('assessment','assessment-item-a');ok(await save('operator','assessment',{...assessment,selfAssessment:bi('CURRENT_SELF_ASSESSMENT'),remarks:'MANUAL_REMARKS\n retained',remarksStatus:'partial_improvable'}));
  const delta=ok(await call('viewer','sync',{versions:first.versions},'performance'));publicOnly(delta);assert.equal(delta.records.length,1);assert.equal(delta.records[0].kind,'assessment');if(!remarksHidden)assert.equal(delta.records[0].body.remarks,'MANUAL_REMARKS\n retained');assert.notEqual(delta.snapshotToken,first.snapshotToken);
  const forged=ok(await call('viewer','sync',{versions:{...delta.versions,'improvement:action-hidden-tmsa':0}},'performance'));publicOnly(forged);assert.deepEqual(forged.records,[]);assert.deepEqual(forged.versions,delta.versions);
 });
 for(const framework of ['TMSA','DRYBMS'])await run(`viewer-inspection-detail-exact-${framework}`,async()=>{const original=await row('inspection','history-'+framework);const d=ok(await call('viewer','inspection_detail',{id:original.id,version:original.version},'performance'));assert.deepEqual(d.inspection,original);assert(JSON.stringify(d).includes('FROZEN_RAW_SOURCE'));assert(!JSON.stringify(d).includes('HIDDEN_LIVE_ACTION'));denied(await call('viewer','inspection_detail',{id:original.id,version:original.version-1},'performance'),'STALE_DETAIL');});
 await run('fixed-capabilities-ignore-saved-matrix-and-inactive-account',async()=>{
  const actor=ok(await call('viewer','current_user')),settings=await row('settings','settings'),caps=Object.keys(settings.rolePermissions.owner);
  for(const cap of [...caps,'unknown'])assert.equal((await qa.db.setup.query('select compliance_private.allowed($1::jsonb,$2) allowed',[JSON.stringify(actor),cap])).rows[0].allowed,['exportReports','enterManagement'].includes(cap),cap);
  assert.deepEqual(Object.keys(settings.rolePermissions).sort(),['admin','operator','owner','vessel']);
  await qa.db.setup.query('begin');try{await qa.db.setup.query("update compliance_private.records set body=jsonb_set(body,'{rolePermissions,management_viewer}', $1::jsonb) where kind='settings'",[JSON.stringify(Object.fromEntries(caps.map(c=>[c,true])))]);for(const cap of caps)assert.equal((await qa.db.setup.query('select compliance_private.allowed($1::jsonb,$2) v',[JSON.stringify(actor),cap])).rows[0].v,['exportReports','enterManagement'].includes(cap));assert.equal((await qa.db.setup.query("select compliance_private.allowed($1::jsonb,'exportReports') v",[JSON.stringify({...actor,active:false})])).rows[0].v,false);}finally{await qa.db.setup.query('rollback');}
 });
 await run('viewer-person-password-required-create-update-clear-and-owner-protection',async()=>{
  const before=await ledger();const newPerson={id:'viewer-no-password',version:0,username:'viewer-no-password',name:'Synthetic viewer',departmentId:'management',role:'management_viewer',active:true,hasPassword:true};
  denied(await save('admin','person',newPerson,'create'),'PASSWORD_REQUIRED');assert.deepEqual(await ledger(),before);
  denied(await save('admin','person',await row('person',id),'update',{passwordHash:''}),'PASSWORD_REQUIRED');assert.deepEqual(await ledger(),before);
  denied(await save('admin','person',{...await row('person','qa-operator'),role:'management_viewer'}),'PASSWORD_REQUIRED');assert.deepEqual(await ledger(),before);
  denied(await call('admin','claim',{kind:'person',id:'qa-owner'}),'OWNER_PROTECTED');denied(await save('owner','person',{...newPerson,id:'second-owner',username:'second-owner',role:'owner'},'create',{passwordHash:sha256(opaque())}),'OWNER_PROTECTED');
  ok(await save('admin','person',{...await row('person',id),departmentId:'management'}));assert.equal((await row('person',id)).departmentId,'management');
 });
 const exportPlans=[{name:'tmsa-xlsx',kind:'framework',format:'xlsx',ids:['chapter-TMSA'],frameworkId:'TMSA'},{name:'dry-pdf',kind:'framework',format:'pdf',ids:['item-dry'],frameworkId:'DRYBMS'},{name:'remarks-xlsx',kind:'framework',format:'xlsx',ids:['item-a'],frameworkId:'TMSA',filters:{reportVariant:'remarks'}},{name:'remarks-pdf',kind:'framework',format:'pdf',ids:['item-a'],frameworkId:'TMSA',filters:{reportVariant:'remarks'}},{name:'overview',kind:'overview',format:'pdf',ids:['TMSA'],frameworkId:'TMSA'},{name:'inspection',kind:'inspection',format:'pdf',ids:['history-TMSA'],frameworkId:'TMSA'}];
 for(const route of ['ordinary','performance'])for(const plan of exportPlans.filter(p=>!remarksHidden||!p.name.startsWith('remarks')))await run(`viewer-selected-export-${route}-${plan.name}`,async()=>{
  const {name,...payload}=plan;const state=ok(await call('viewer',route==='performance'?'sync':'read',route==='performance'?{versions:{}}:{},route));const operationId=randomUUID();
  const data=ok(await call('viewer','export_authorize',{...payload,filters:payload.filters||{},snapshotToken:state.snapshotToken,operationId},route));publicOnly(data);assert.equal(data.snapshotToken,state.snapshotToken);
  const stored=(await qa.db.setup.query("select snapshot,request from compliance_private.exports where actor_id=$1 and request->>'operationId'=$2",[id,operationId])).rows;assert.equal(stored.length,1);assert.deepEqual(stored[0].snapshot,data);assert.deepEqual(stored[0].request.ids,plan.ids);
  if(plan.name.startsWith('remarks'))assert.equal(data.assessments.find(a=>a.itemId==='item-a').remarks,'MANUAL_REMARKS\n retained');if(plan.kind==='inspection')assert.deepEqual(data.inspections.find(i=>i.id==='history-TMSA'),await row('inspection','history-TMSA'));
  if(route==='performance'){assert(data.items.every(i=>i.frameworkId===plan.frameworkId));if(plan.name.startsWith('remarks'))assert.deepEqual(data.items.map(i=>i.id),['item-a']);}
 });
 for(const route of ['ordinary','performance'])await run(`viewer-improvement-export-direct-denied-${route}`,async()=>{const before=await ledger();denied(await call('viewer','export_authorize',{kind:'improvements',format:'pdf',ids:['action-hidden-tmsa'],snapshotToken:'not-a-snapshot',filters:{},operationId:randomUUID()},route));assert.deepEqual(await ledger(),before);});
 await run('viewer-export-snapshot-freshness-and-immutable-receipt',async()=>{
  const s=ok(await call('viewer','sync',{versions:{}},'performance'));const payload={kind:'framework',format:'pdf',ids:['item-a'],frameworkId:'TMSA',filters:{},snapshotToken:s.snapshotToken,operationId:randomUUID()};const data=ok(await call('viewer','export_authorize',payload,'performance'));
  const beforeSnapshot=(await qa.db.setup.query("select snapshot from compliance_private.exports where request->>'operationId'=$1",[payload.operationId])).rows[0].snapshot;
  ok(await save('operator','assessment',{...await row('assessment','assessment-item-a'),remarks:'NEW_REMARK_AFTER_EXPORT'}));const before=await ledger();denied(await call('viewer','export_authorize',{...payload,operationId:randomUUID()},'performance'),'SNAPSHOT_STALE');assert.deepEqual(await ledger(),before);
  assert.deepEqual((await qa.db.setup.query("select snapshot from compliance_private.exports where request->>'operationId'=$1",[payload.operationId])).rows[0].snapshot,beforeSnapshot);if(!remarksHidden)assert.equal(data.assessments[0].remarks,'MANUAL_REMARKS\n retained');else noManual(data);
 });
 for(const kind of ['framework','chapter','item','assessment','improvement','inspection','person','dryScore','settings'])await run(`viewer-denied-${kind}-lease-and-save-zero-write`,async()=>{
  const body=(await qa.db.setup.query('select body from compliance_private.records where kind=$1 order by id limit 1',[kind])).rows[0].body,before=await ledger();for(const action of ['claim','renew','release'])denied(await call('viewer',action,{kind,id:body.id,intent:'update',leaseToken:opaque()}));
  const payload={kind,record:body,expectedVersion:body.version,leaseToken:opaque(),intent:'update',operationId:randomUUID()};denied(await call('viewer','save',payload));denied(await call('viewer','save',payload,'performance'));assert.deepEqual(await ledger(),before);
 });
 for(const [action,payload,route] of [
  ['role_permissions',{kind:'settings',record:await row('settings','settings'),intent:'update',expectedVersion:1,leaseToken:opaque(),operationId:randomUUID()},'ordinary'],['role_permissions',{kind:'settings',record:await row('settings','settings'),intent:'update',expectedVersion:1,leaseToken:opaque(),operationId:randomUUID()},'performance'],
  ['target_claim',{frameworkId:'TMSA'},'performance'],['target_save',{frameworkId:'TMSA',targets:{'chapter-TMSA':4},expectedVersion:1,leaseToken:opaque(),operationId:randomUUID()},'performance'],['restart_updates',{frameworkId:'TMSA',operationId:randomUUID()},'performance'],['audit_query',{limit:50},'ordinary'],['site_password',{currentPasswordHash:sha256(opaque()),passwordHash:sha256(opaque())},'ordinary'],['transfer_owner',{targetId:'qa-admin',currentPasswordHash:sha256(opaque())},'ordinary'],['import_seed',{seed,operationId:randomUUID()},'ordinary'],['import_seed',{seed,operationId:randomUUID()},'import'],['operation_status',{operationId:randomUUID()},'ordinary']
 ])await run(`viewer-denied-${route}-${action}-zero-write`,async()=>{const before=await ledger();denied(await call('viewer',action,payload,route));assert.deepEqual(await ledger(),before);});
 for(const role of ['owner','admin','operator'])await run(`existing-${role}-positive-write-read-export-controls`,async()=>{
  const a=await row('assessment','assessment-item-b');ok(await save(role,'assessment',{...a,evidence:bi('Positive '+role),reviewed:true}));const full=ok(await call(role,'read'));assert(!('viewScope' in full));assert(full.improvements.length>0);assert(full.provenance.length>0);if(role!=='operator')assert(full.auditLogs.length>0);
  const sync=ok(await call(role,'sync',{versions:{}},'performance'));assert(!('viewScope' in sync));assert(Object.keys(sync.versions).some(k=>k.startsWith('improvement:')));const data=ok(await call(role,'export_authorize',{kind:'improvements',format:'pdf',ids:['action-hidden-tmsa'],filters:{},snapshotToken:sync.snapshotToken,operationId:randomUUID()},'performance'));assert.equal(data.improvements.length,1);assert(!('viewScope' in data));
 });
 await run('existing-admin-optional-password-owner-matrix-target-and-restart-controls',async()=>{
  const person={id:'optional-admin',version:0,username:'optional-admin',name:'Synthetic optional admin',departmentId:'marine',role:'admin',active:true,hasPassword:false};ok(await save('admin','person',person,'create'));ok(await login(person.id,''));
  const settings=await row('settings','settings'),lease=ok(await call('owner','claim',{kind:'settings',id:'settings'}));try{ok(await call('owner','role_permissions',{kind:'settings',record:settings,intent:'update',expectedVersion:settings.version,leaseToken:lease.token,operationId:randomUUID()}));}finally{ok(await call('owner','release',{kind:'settings',id:'settings',leaseToken:lease.token}));}
  const target=ok(await call('admin','target_claim',{frameworkId:'TMSA'},'performance'));try{ok(await call('admin','target_save',{frameworkId:'TMSA',targets:{'chapter-TMSA':2},expectedVersion:(await row('framework','TMSA')).version,leaseToken:target.token,operationId:randomUUID()},'performance'));}finally{ok(await call('admin','release',{kind:'framework',id:'TMSA',leaseToken:target.token}));}
  const restart=ok(await call('admin','restart_updates',{frameworkId:'TMSA',operationId:randomUUID()},'performance'));assert(restart.changedCount>0);assert.equal((await row('assessment','assessment-item-b')).reviewed,false);
 });
 if(latest&&!baseline)await verifyRemarks(remarksContext);
 await run('viewer-role-change-and-disable-invalidate-all-old-read-sessions',async()=>{
  ok(await save('admin','person',{...await row('person',id),role:'operator'}));denied(await call('viewer','read'),'SESSION_INVALID');denied(await call('viewer','sync',{versions:{}},'performance'),'SESSION_INVALID');const changed=ok(await login(id));assert.equal(changed.user.role,'operator');const opActor={sessionToken:changed.sessionToken,clientId:'qa-viewer-client'};assert(!('viewScope' in ok(await call(opActor,'read'))));
  ok(await save('owner','person',{...await row('person',id),role:'management_viewer'}));denied(await call(opActor,'read'),'SESSION_INVALID');const restored=ok(await login(id));qa.users.viewer={user:restored.user,sessionToken:restored.sessionToken,clientId:'qa-viewer-client'};publicOnly(ok(await call('viewer','read')));
  ok(await save('admin','person',{...await row('person',id),active:false},'archive'));denied(await call('viewer','read'),'SESSION_INVALID');denied(await call('viewer','sync',{versions:{}},'performance'),'SESSION_INVALID');denied(await login(id),'LOGIN_DENIED');ok(await save('admin','person',{...await row('person',id),active:true},'activate'));const fresh=ok(await login(id));qa.users.viewer={user:fresh.user,sessionToken:fresh.sessionToken,clientId:'qa-viewer-client'};publicOnly(ok(await call('viewer','read')));
 });
 await run('viewer-logout-works-and-invalidates-session',async()=>{ok(await call('viewer','logout'));denied(await call('viewer','current_user'),'SESSION_INVALID');denied(await call('viewer','read'),'SESSION_INVALID');});
 await run('013-independent-readonly-catalog-and-acl-readback',async()=>{const before=await ledger();if(latest){receipt.readback=await remarksReadback(remarksContext);}else{const key='management_viewer_readback';const results=await qa.db.setup.query(readFileSync(join(root,'supabase/management-viewer-readback.sql'),'utf8'));receipt.readback=results.flatMap(r=>r.rows||[]).find(r=>r[key])?.[key];assert.equal(receipt.readback?.status,'PASS_MANAGEMENT_VIEWER_INSTALL_ONLY');}assert.deepEqual(await ledger(),before);});
 await run('013-repeat-refused-without-data-or-catalog-change',async()=>{const before=await ledger(),catalog=await catalogue();let error;try{await qa.db.setup.query(readFileSync(join(root,'supabase/migrations/013_management_viewer.sql'),'utf8'));}catch(e){error=e;}finally{await qa.db.setup.query('rollback');}assert.equal(error?.message,'MANAGEMENT_VIEWER_ALREADY_INSTALLED_VERIFY_READBACK');assert.deepEqual(await ledger(),before);assert.deepEqual(await catalogue(),catalog);});
 receipt.finalLedger=await ledger();receipt.result='PASS';
}catch(e){receipt.result='FAIL';receipt.failure={case:current,message:e.message,code:e.code};process.exitCode=1;}
finally{
 try{await qa?.stop();receipt.cleanup={ownedServerStopped:!qa?.server.listening,ownedPostgresStopped:!qa||!existsSync(join(qa.db.dataDir,'postmaster.pid'))};}catch(e){receipt.result='FAIL';receipt.cleanup={error:e.message};process.exitCode=1;}
 receipt.endingInputHashes=inputHashes();receipt.inputsUnchanged=JSON.stringify(receipt.inputHashes)===JSON.stringify(receipt.endingInputHashes);if(!receipt.inputsUnchanged){receipt.result='FAIL';process.exitCode=1;}
 receipt.passed=receipt.cases.filter(c=>c.status==='PASS').length;receipt.failed=receipt.cases.filter(c=>c.status==='FAIL').length;receipt.uniqueCases=new Set(receipt.cases.map(c=>c.id)).size;record();console.log(JSON.stringify({result:receipt.result,passed:receipt.passed,failed:receipt.failed,failure:receipt.failure?.case,receipt:join(out,'receipt.json')}));
}
