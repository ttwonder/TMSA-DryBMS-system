import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2), option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(option('--root',join(here,'..'))), evidence=resolve(option('--evidence-dir',join(here,'office-evidence')));
// Keep every newly created cluster/log under the caller's owned evidence tree.
const originalLocal=process.env.LOCALAPPDATA;
process.env.COMPLIANCE_PG_BIN=option('--pg-bin',process.env.COMPLIANCE_PG_BIN||join(originalLocal,'hermes/cache/ship-pg-runtime-17.11-3/runtime/pgsql/bin'));
process.env.LOCALAPPDATA=join(evidence,'owned-runtime');
const {createNativeDatabase,rpc,checkedRpc,sha256,opaque,syntheticSeed}=await import(pathToFileURL(join(root,'scripts/native-postgres.mjs')).href);
mkdirSync(evidence,{recursive:true});
const cases=[];let db,owner,gate,credentials,passed=false,cleanup='not started';
async function test(id,fn){const start=performance.now();try{await fn();cases.push({id,status:'PASS',milliseconds:Math.round(performance.now()-start)});console.log('PASS',id);}catch(e){cases.push({id,status:'FAIL',code:e.code||'ASSERTION',milliseconds:Math.round(performance.now()-start)});throw e;}}
const call=(action,payload={})=>checkedRpc(db,action,payload,owner.sessionToken,'office-owner-client');
const raw=(action,payload={})=>rpc(db,action,payload,owner.sessionToken,'office-owner-client');
async function createPerson(record,passwordHash){const l=await call('claim',{kind:'person',id:record.id});try{return await raw('save',{kind:'person',record,expectedVersion:record.version,leaseToken:l.token,intent:record.version?'update':'create',operationId:randomUUID(),...(passwordHash===undefined?{}:{passwordHash})});}finally{await call('release',{kind:'person',id:record.id,leaseToken:l.token});}}
const person=(id,role='admin')=>({id,version:0,createdAt:'',updatedAt:'',updatedBy:'',username:id,name:'Synthetic '+id,departmentId:'marine',role,active:true,hasPassword:true});
async function snapshot(){return (await db.setup.query(`select jsonb_build_object('records',(select coalesce(jsonb_agg(to_jsonb(r) order by kind,id),'[]') from compliance_private.records r),'control',(select to_jsonb(c) from compliance_private.control c),'credentials',(select coalesce(jsonb_agg(to_jsonb(c) order by person_id),'[]') from compliance_private.credentials c),'sessions',(select coalesce(jsonb_agg(to_jsonb(s) order by token_hash),'[]') from compliance_private.sessions s),'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from compliance_private.audit a)) as s`)).rows[0].s;}
try{
 db=await createNativeDatabase({evidenceDir:evidence});
 await db.setup.query('create role authenticated nologin');
 for(const name of ['002_import_timeout.sql','003_read_timeout.sql'])await db.setup.query(readFileSync(join(root,'supabase/migrations',name),'utf8'));
 credentials={owner:sha256(opaque()),gate:sha256(opaque())};
 await checkedRpc(db,'bootstrap',{initializationCode:db.bootstrapCode,owner:{id:'office-owner',username:'existing-owner',name:'Synthetic existing Owner',departmentId:'marine'},passwordHash:credentials.owner,sitePasswordHash:credentials.gate},'','office-bootstrap');
 gate=await checkedRpc(db,'gate',{passwordHash:credentials.gate});
 owner=await checkedRpc(db,'login',{gateToken:gate.gateToken,personId:'office-owner',passwordHash:credentials.owner});
 await call('import_seed',{seed:syntheticSeed()});
 await test('RED-old-native-passwordless-admin-save-PASSWORD_REQUIRED',async()=>{const before=await snapshot();const r=await createPerson(person('red-save-admin'));assert.equal(r.code,'PASSWORD_REQUIRED');assert.deepEqual(await snapshot(),before);});
 await test('RED-old-native-passwordless-admin-login-LOGIN_DENIED',async()=>{const c=await db.connect();try{await c.query('begin');await c.query("insert into compliance_private.credentials(person_id) values('red-login-admin')");await c.query(`insert into compliance_private.records values('person','red-login-admin',1,compliance_private.base($1::jsonb,1,'office-owner')||'{"hasPassword":false}'::jsonb)`,[JSON.stringify(person('red-login-admin'))]);await c.query('set local role anon');const r=(await c.query('select public.compliance_rpc($1,$2,$3,$4::jsonb) as r',['login','','red-login',JSON.stringify({gateToken:gate.gateToken,personId:'red-login-admin'})])).rows[0].r;assert.equal(r.code,'LOGIN_DENIED');}finally{await c.query('rollback');await c.end();}});
 const hashes=(await db.setup.query(`select n.nspname||'.'||p.proname as name,md5(replace(prosrc,E'\\r\\n',E'\\n')) as md5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='compliance_private' and p.proname in ('validate_record','dispatch')`)).rows;
 writeFileSync(join(evidence,'predecessor-hashes.json'),JSON.stringify(hashes,null,2));

 if(!args.includes('--red-only')){
 const migrationPath=resolve(option('--migration',join(root,'supabase/migrations/004_office_directory.sql')));
 const migration=readFileSync(migrationPath,'utf8');
 const functions=async()=>(await db.setup.query(`select p.oid,n.nspname,p.proname,p.pronargs,p.proowner,p.proacl,p.proconfig,p.prosecdef,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('compliance_private','public') and (n.nspname='compliance_private' or p.proname='compliance_rpc') order by p.oid`)).rows;
 const beforeFunctions=await functions(), beforeUpgrade=await snapshot();
 await test('RED-old-native-roster-missing-department-projection',async()=>{const roster=await checkedRpc(db,'roster',{gateToken:gate.gateToken});assert(!Object.hasOwn(roster[0],'departmentName'));});
 await test('GREEN-004-minimal-OID-ACL-config-body-preserving-upgrade',async()=>{
  await db.setup.query(migration);assert.deepEqual(await snapshot(),beforeUpgrade);
  const after=await functions();for(const old of beforeFunctions){const current=after.find(p=>p.oid===old.oid);assert(current);const expected=structuredClone(old);
   if(old.proname==='validate_record')expected.prosrc=old.prosrc.replace("b->>'role' in ('owner','admin') and b->'hasPassword'","b->>'role' ='owner' and b->'hasPassword'");
   if(old.proname==='dispatch')expected.prosrc=old.prosrc.replace("actor_v->>'role' in ('owner','admin') and creds.password_hash is null","actor_v->>'role' ='owner' and creds.password_hash is null").replace("select coalesce(jsonb_agg(body order by body->>'departmentId',body->>'name'),'[]') into data from compliance_private.records where kind='person' and body->'active'='true';return data;","select coalesce(jsonb_agg(r.body||jsonb_build_object('departmentName',d.value->'name') order by r.body->>'departmentId',r.body->>'name'),'[]') into data from compliance_private.records r left join lateral (select value from compliance_private.records s cross join lateral jsonb_array_elements(s.body->'departments') e(value) where s.kind='settings' and s.id='settings' and value->>'id'=r.body->>'departmentId') d on true where r.kind='person' and r.body->'active'='true';return data;");
   assert.deepEqual(current,expected);
  }
  assert.equal(after.filter(p=>p.nspname==='public'&&p.proname==='compliance_rpc').length,3);
 });
 await test('GREEN-004-exact-reexecution-idempotent',async()=>{const f=await functions(),s=await snapshot();await db.setup.query(migration);assert.deepEqual(await functions(),f);assert.deepEqual(await snapshot(),s);});
 await test('unknown-function-version-fails-closed-without-writes',async()=>{const s=await snapshot(),f=await functions();await db.setup.query('begin');try{const def=(await db.setup.query("select pg_get_functiondef('compliance_private.dispatch(text,text,text,jsonb)'::regprocedure) as d")).rows[0].d;await db.setup.query(def.replace("'LOGIN_DENIED'","'UNRECOGNIZED_LOGIN_VERSION'"));await assert.rejects(db.setup.query(migration),e=>e.code==='P0001'&&e.message==='OFFICE_MIGRATION_UNKNOWN_VERSION');}finally{await db.setup.query('rollback');}assert.deepEqual(await snapshot(),s);assert.deepEqual(await functions(),f);});
 const departments=['海技組',...Array.from({length:10},(_,i)=>'Synthetic department '+String(i+1).padStart(2,'0'))];
 const bundle={schemaVersion:1,capturedAt:'2026-10-12T00:00:00Z',source:{repository:'Synthetic office source fixture',gitRevision:'c1f7b022eaf4e7b5bb158d5ce2e46774db8307c0',projectRef:'cyzpcvvhmoiihsqvjspp',workspaceKey:'ship-dynamics-main',storageMode:'records-v1',revision:7},departments,people:Array.from({length:108},(_,i)=>({sourceId:'p'+String(i).padStart(3,'0'),name:'Synthetic office person '+i,username:'source-office-'+i,department:departments[i%departments.length],active:i!==107,role:i===0?'owner':i<4?'admin':'operator'})),targetProjectRef:'fvdzmktjmoeysdfjeuuq',ownerSourceId:'p000',credentialPolicy:'drop-non-owner'};
 const importDirectory=(b=bundle,c=db.setup)=>c.query('select compliance_private.import_office_directory($1::jsonb) as receipt',[JSON.stringify(b)]).then(r=>r.rows[0].receipt);
 const reject=async(b,code)=>{const before=await snapshot();await assert.rejects(importDirectory(b),e=>e.code==='P0001'&&(!code||e.message===code));assert.deepEqual(await snapshot(),before);};
 for(const [label,mutate,code] of [
  ['duplicate-casefold-username',b=>b.people[2].username=b.people[1].username.toUpperCase(),'OFFICE_DUPLICATE_PERSON'],
  ['duplicate-source-id',b=>b.people[2].sourceId=b.people[1].sourceId,'OFFICE_DUPLICATE_PERSON'],
  ['duplicate-department',b=>b.departments.push(b.departments[0]),'OFFICE_DUPLICATE_DEPARTMENT'],
  ['unknown-department',b=>b.people[50].department='missing','OFFICE_INVALID_PERSON'],
  ['empty-name',b=>b.people[50].name='','OFFICE_INVALID_PERSON'],
  ['name-whitespace',b=>b.people[50].name=' padded ','OFFICE_INVALID_PERSON'],
  ['username-whitespace',b=>b.people[50].username=' padded ','OFFICE_INVALID_PERSON'],
  ['vessel-role',b=>b.people[50].role='vessel','OFFICE_INVALID_PERSON'],
  ['second-owner',b=>b.people[50].role='owner','OFFICE_INVALID_OWNER'],
  ['inactive-source-owner',b=>b.people[0].active=false,'OFFICE_INVALID_OWNER'],
  ['wrong-owner-source',b=>b.ownerSourceId='p001','OFFICE_INVALID_OWNER'],
  ['secret-root',b=>b.credentials={synthetic:true},'INVALID_PAYLOAD'],
  ['secret-person',b=>b.people[50].credentialHash='synthetic-not-a-secret','INVALID_PAYLOAD'],
  ['secret-source-nested',b=>b.source.secret={password:'synthetic'},'INVALID_PAYLOAD'],
  ['secret-department-nested',b=>b.departments[1]={name:'Synthetic',token:'synthetic'},'OFFICE_INVALID_DEPARTMENT'],
  ['unexpected-person-field',b=>b.people[50].extra=true,'INVALID_PAYLOAD'],
  ['wrong-source-identity',b=>b.source.projectRef='wrong','OFFICE_INVALID_SOURCE'],
  ['wrong-target',b=>b.targetProjectRef='wrong','OFFICE_INVALID_BUNDLE'],
  ['wrong-policy',b=>b.credentialPolicy='retain','OFFICE_INVALID_BUNDLE'],
  ['fractional-revision',b=>b.source.revision=1.5,'OFFICE_INVALID_SOURCE'],
  ['person-count-over-500',b=>b.people=Array.from({length:501},(_,i)=>({...b.people[0],sourceId:'p'+i,username:'u'+i,role:i?'operator':'owner'})),'OFFICE_INVALID_BUNDLE'],
  ['department-count-over-100',b=>b.departments=Array.from({length:101},(_,i)=>'Dept '+i),'OFFICE_INVALID_BUNDLE'],
  ['preserved-owner-username-collision',b=>b.people[50].username='EXISTING-OWNER','OFFICE_DUPLICATE_PERSON']
 ])await test('atomic-rejection-'+label,async()=>{const b=structuredClone(bundle);mutate(b);await reject(b,code);});
 async function temporary(label,prepare,expected){await test(label,async()=>{const before=await snapshot();await db.setup.query('begin');try{await prepare();await assert.rejects(importDirectory(),e=>e.code==='P0001'&&e.message===expected);}finally{await db.setup.query('rollback');}assert.deepEqual(await snapshot(),before);});}
 await temporary('pre-existing-nonOwner-aborts-all',async()=>{await db.setup.query("insert into compliance_private.credentials(person_id) values('preexisting-person')");await db.setup.query("insert into compliance_private.records values('person','preexisting-person',1,compliance_private.base($1::jsonb,1,'office-owner')||'{\"hasPassword\":false}'::jsonb)",[JSON.stringify(person('preexisting-person','operator'))]);},'OFFICE_TARGET_NOT_FRESH');
 await temporary('inactive-exact-department-aborts-all',()=>db.setup.query(`update compliance_private.records set body=jsonb_set(body,'{departments,1,active}','false') where kind='settings'`),'OFFICE_INACTIVE_DEPARTMENT');
 await temporary('ambiguous-exact-department-aborts-all',()=>db.setup.query(`update compliance_private.records set body=jsonb_set(body,'{departments}',body->'departments'||jsonb_build_array(jsonb_build_object('id','duplicate-zh','name',jsonb_build_object('en','Synthetic duplicate','zh','海技組'),'active',true))) where kind='settings'`),'OFFICE_AMBIGUOUS_DEPARTMENT');
 await temporary('missing-owner-password-aborts-all',()=>db.setup.query("update compliance_private.credentials set password_hash=null where person_id='office-owner'"),'OFFICE_TARGET_NOT_FRESH');
 await temporary('unimported-control-aborts-all',()=>db.setup.query('update compliance_private.control set imported=false'),'OFFICE_TARGET_NOT_FRESH');
 await test('late-credential-collision-rolls-back-partial-settings-owner-people-audit',async()=>{const before=await snapshot();await db.setup.query('begin');try{await db.setup.query("insert into compliance_private.credentials(person_id) values('sd-office-person-p107')");const fixture=await snapshot();await db.setup.query('savepoint import_attempt');await assert.rejects(importDirectory(),e=>e.code==='P0001'&&e.message==='OFFICE_IMPORT_REJECTED');await db.setup.query('rollback to savepoint import_attempt');assert.deepEqual(await snapshot(),fixture);assert.equal((await db.setup.query('select count(*) n from compliance_private.office_directory_imports')).rows[0].n,'0');}finally{await db.setup.query('rollback');}assert.deepEqual(await snapshot(),before);});
 for(const [kind,id] of [['person','office-owner'],['settings','settings'],['person','sd-office-person-future']])await test('live-'+kind+'-lease-'+id+'-rejects-directory',async()=>{const l=await call('claim',{kind,id});try{await reject(bundle,'OFFICE_DIRECTORY_BUSY');}finally{await call('release',{kind,id,leaseToken:l.token});}});
 await test('public-anon-authenticated-helper-table-and-new-route-denied',async()=>{
  for(const role of ['anon','authenticated'])for(const query of ['select compliance_private.import_office_directory($1::jsonb)','select * from compliance_private.office_directory_imports']){const c=await db.connect();try{await c.query('begin');await c.query('set local role '+role);await assert.rejects(c.query(query,query.includes('$1')?[JSON.stringify(bundle)]:[]),e=>e.code==='42501');}finally{await c.query('rollback');await c.end();}}
  assert.equal((await raw('import_office_directory',{bundle})).code,'UNKNOWN_ACTION');
  const grants=(await db.setup.query(`select has_function_privilege('public','compliance_private.import_office_directory(jsonb)','execute') as public_execute`)).rows[0];assert.equal(grants.public_execute,false);
  assert.equal((await db.setup.query("select relrowsecurity from pg_class where oid='compliance_private.office_directory_imports'::regclass")).rows[0].relrowsecurity,true);
 });
 let receipt;
 await test('GREEN-synthetic-108-11-office-import-owner-preserved-business-unchanged',async()=>{
  const lease=await call('claim',{kind:'item',id:'item-a'});try{
   const before=await snapshot();receipt=await importDirectory();const after=await snapshot();assert.equal(receipt.sourcePersonCount,108);assert.equal(receipt.sourceDepartmentCount,11);assert.equal(receipt.people.length,108);assert.equal(receipt.departments.length,11);
   assert.deepEqual(after.control,before.control);assert.deepEqual(after.sessions,before.sessions);
   assert.deepEqual(after.records.filter(r=>!['person','settings'].includes(r.kind)),before.records.filter(r=>!['person','settings'].includes(r.kind)));
   assert.deepEqual(after.credentials.find(c=>c.person_id==='office-owner'),before.credentials[0]);
   const oldOwner=before.records.find(r=>r.kind==='person').body,newOwner=after.records.find(r=>r.id==='office-owner').body;
   for(const field of ['id','username','role','active','createdAt'])assert.deepEqual(newOwner[field],oldOwner[field]);assert.equal(newOwner.name,bundle.people[0].name);assert.equal(newOwner.departmentId,'marine');
   const settings=after.records.find(r=>r.kind==='settings').body,oldSettings=before.records.find(r=>r.kind==='settings').body;
   assert.deepEqual(settings.departments.slice(0,oldSettings.departments.length),oldSettings.departments);assert.deepEqual(settings.rolePermissions,oldSettings.rolePermissions);assert.equal(settings.siteGateConfigured,oldSettings.siteGateConfigured);
   assert.equal(settings.departments.length,16);
   for(const source of bundle.people){const targetId=receipt.people.find(p=>p.sourceId===source.sourceId).targetId,p=after.records.find(r=>r.kind==='person'&&r.id===targetId).body;assert.equal(p.name,source.name);assert.equal(p.role,source.role);assert.equal(p.active,source.active);assert.equal(p.username,source.role==='owner'?'existing-owner':source.username);assert.equal(p.departmentId,receipt.departments.find(d=>d.sourceName===source.department).targetId);assert.equal(p.hasPassword,source.role==='owner');assert(!Object.hasOwn(p,'passwordHash'));assert(!Object.hasOwn(p,'departmentName'));const c=after.credentials.find(c=>c.person_id===targetId);if(source.role!=='owner')assert.equal(c.password_hash,null);}
   assert.equal(after.records.filter(r=>r.kind==='person'&&r.body.role==='owner').length,1);assert.equal(after.records.filter(r=>r.kind==='person'&&r.body.role==='admin').length,3);assert.equal(after.records.filter(r=>r.kind==='person'&&r.body.role==='operator').length,104);
   assert.equal(after.audit.length,before.audit.length+3);
   assert.equal((await call('current_user')).id,'office-owner');
  }finally{await call('release',{kind:'item',id:'item-a',leaseToken:lease.token});}
 });
 await test('GREEN-gate-roster-ephemeral-sanitized-department-names',async()=>{assert.equal((await rpc(db,'roster',{gateToken:'invalid'})).code,'GATE_INVALID');const roster=await checkedRpc(db,'roster',{gateToken:gate.gateToken});assert.equal(roster.length,107);const s=(await call('read')).settings;for(const p of roster){assert.deepEqual(p.departmentName,s.departments.find(d=>d.id===p.departmentId).name);assert(!Object.hasOwn(p,'rolePermissions'));}assert((await call('read')).people.every(p=>!Object.hasOwn(p,'departmentName')));});
 await test('GREEN-imported-passwordless-admin-operator-login-gate-required',async()=>{for(const id of ['sd-office-person-p001','sd-office-person-p004']){assert.equal((await rpc(db,'login',{gateToken:'invalid',personId:id})).code,'GATE_INVALID');const login=await checkedRpc(db,'login',{gateToken:gate.gateToken,personId:id});assert.equal(login.user.hasPassword,false);assert(!Object.hasOwn(login.user,'departmentName'));assert.equal((await checkedRpc(db,'current_user',{},login.sessionToken)).id,id);}assert.equal((await rpc(db,'login',{gateToken:gate.gateToken,personId:'sd-office-person-p107'})).code,'LOGIN_DENIED');});
 await test('exact-replay-no-write-after-later-admin-edit-and-mutated-source-conflict',async()=>{let p=(await call('read')).people.find(p=>p.id==='sd-office-person-p004');p.name='Synthetic later edit';assert.equal((await createPerson(p)).ok,true);const before=await snapshot();assert.deepEqual(await importDirectory(),receipt);assert.deepEqual(await snapshot(),before);const changed=structuredClone(bundle);changed.capturedAt='2026-10-13T00:00:00Z';await reject(changed,'OFFICE_IMPORT_CONFLICT');});
 await test('GREEN-manual-passwordless-admin-save-server-derived-hasPassword-login',async()=>{const r=await createPerson(person('manual-no-password-admin'));assert.equal(r.ok,true);assert.equal(r.data.hasPassword,false);const l=await checkedRpc(db,'login',{gateToken:gate.gateToken,personId:r.data.id});assert.equal(l.user.role,'admin');assert.equal(l.user.hasPassword,false);});
 await test('existing-admin-hash-always-enforced-server-derived-hasPassword',async()=>{const hash=sha256(opaque());const r=await createPerson(person('manual-hashed-admin'),hash);assert.equal(r.data.hasPassword,true);assert.equal((await rpc(db,'login',{gateToken:gate.gateToken,personId:r.data.id})).code,'LOGIN_DENIED');assert.equal((await rpc(db,'login',{gateToken:gate.gateToken,personId:r.data.id,passwordHash:sha256(opaque())})).code,'LOGIN_DENIED');assert.equal((await checkedRpc(db,'login',{gateToken:gate.gateToken,personId:r.data.id,passwordHash:hash})).user.hasPassword,true);const p={...r.data,hasPassword:false};const updated=await createPerson(p);assert.equal(updated.data.hasPassword,true);});
 await test('Owner-secondOwner-clear-password-admin-touch-transfer-action-fences',async()=>{
  assert.equal((await createPerson(person('illegal-owner','owner'))).code,'OWNER_PROTECTED');
  const state=await call('read'),p=state.people.find(p=>p.id==='office-owner');assert.equal((await createPerson({...p,role:'operator'})).code,'OWNER_PROTECTED');assert.equal((await createPerson(p,'')).code,'PASSWORD_REQUIRED');
  const admin=await checkedRpc(db,'login',{gateToken:gate.gateToken,personId:'sd-office-person-p001'});
  assert.equal((await rpc(db,'claim',{kind:'person',id:'office-owner'},admin.sessionToken,'admin-client')).code,'OWNER_PROTECTED');
  assert.equal((await rpc(db,'site_password',{},admin.sessionToken,'admin-client')).code,'FORBIDDEN');
  assert.equal((await raw('transfer_owner',{targetId:'sd-office-person-p001',credentialHash:credentials.owner})).code,'TARGET_PASSWORD_REQUIRED');
  assert.equal((await raw('transfer_owner',{targetId:'sd-office-person-p001',credentialHash:sha256(opaque())})).code,'CREDENTIAL_RECHECK_FAILED');
 });
 await test('session-CAS-operation-lease-fences-preserved',async()=>{const p=(await call('read')).people.find(p=>p.id==='sd-office-person-p005');const l=await call('claim',{kind:'person',id:p.id});try{const payload={kind:'person',record:p,expectedVersion:p.version-1,leaseToken:l.token,intent:'update',operationId:randomUUID()};assert.equal((await raw('save',payload)).code,'VERSION_CONFLICT');assert.equal((await raw('save',{...payload,expectedVersion:p.version,leaseToken:'wrong'})).code,'LEASE_LOST');}finally{await call('release',{kind:'person',id:p.id,leaseToken:l.token});}const login=await checkedRpc(db,'login',{gateToken:gate.gateToken,personId:p.id});p.active=false;assert.equal((await createPerson(p)).ok,true);assert.equal((await rpc(db,'read',{},login.sessionToken)).code,'SESSION_INVALID');});
 writeFileSync(join(evidence,'artifact-hashes.json'),JSON.stringify({migration:sha256(migration),script:sha256(readFileSync(fileURLToPath(import.meta.url))),baseline001:sha256(readFileSync(join(root,'supabase/migrations/001_platform.sql')))},null,2));
 }

 passed=true;
}catch(e){console.error('OFFICE_VERIFY_FAIL',e.code||'ASSERTION');process.exitCode=1;}
finally{if(db){try{await db.stop();cleanup='owned PostgreSQL stopped; cluster/evidence retained';}catch{cleanup='owned shutdown failed';passed=false;process.exitCode=1;}}writeFileSync(join(evidence,'office-tests.json'),JSON.stringify({label:'native PostgreSQL / real anon RPC / synthetic office directory; NOT hosted Supabase',passed,total:cases.length,cases,cleanup},null,2));}
