import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createServer as netServer} from 'node:net';
import http from 'node:http';
import {createHmac,randomUUID} from 'node:crypto';
import {createNativeDatabase,setupQaIdentities,root,sha256,opaque} from './native-postgres.mjs';
import {createApiClient} from '../src/api.ts';

// True local PostgreSQL + official PostgREST. No production connection or private
// outbound request. The stricter 100ms role limit is controlled QA, not a claim
// about the provider's currently effective timeout.
const evidence=join(root,'qa-evidence','import-sql-timeout-repair');mkdirSync(evidence,{recursive:true});
const binary=process.env.COMPLIANCE_POSTGREST_BIN;
// Official Windows PostgREST loads libpq from the already verified portable PG
// runtime. This PATH is child-local; it does not change the system environment.
const pgBin=process.env.COMPLIANCE_PG_BIN||join(process.env.LOCALAPPDATA||'', 'hermes','cache','ship-pg-runtime-17.11-3','runtime','pgsql','bin');
const restEnv={...Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PGRST_|^PG/.test(k))),PATH:pgBin+';'+process.env.PATH};
if(!binary||!existsSync(binary))throw new Error('Set COMPLIANCE_POSTGREST_BIN to the verified official portable executable.');
const full=process.argv.includes('--private-seed');
const cases=[];const receipt={layer:'local native PostgreSQL + real PostgREST; NOT hosted acceptance',fullPrivateSeed:full,cases,productionRequests:0};
let db,rest,proxy,restPort,proxyPort,restFd;
const free=()=>new Promise((ok,fail)=>{const s=netServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
async function scenario(id,fn){const at=performance.now();try{await fn();cases.push({id,status:'PASS',elapsedMs:Math.round(performance.now()-at)});console.log('PASS',id);}catch(e){cases.push({id,status:'FAIL',code:e.code||'ASSERTION',elapsedMs:Math.round(performance.now()-at)});throw e;}}
try{
 db=await createNativeDatabase({evidenceDir:evidence});
 const users=await setupQaIdentities(db,{seed:null,handlesPath:join(evidence,'owned-handles.json')});
 const seed=full?JSON.parse(readFileSync(join(root,'private-seed','platform-seed.json'),'utf8')):(await import('./native-postgres.mjs')).syntheticSeed();
 const businessKinds={framework:'frameworks',chapter:'chapters',item:'items',assessment:'assessments',improvement:'improvements',inspection:'inspections',dryScore:'dryScores'};
 const expected=Object.fromEntries(Object.entries(businessKinds).map(([k,c])=>[k,seed[c].length]));const expectedTotal=Object.values(expected).reduce((a,b)=>a+b,0);
 receipt.expectedCounts=expected;receipt.expectedTotal=expectedTotal;receipt.seedSha256=sha256(JSON.stringify(seed));
 const ledger=async()=>{
  const records=(await db.setup.query("select kind,id,version,md5(body::text) hash,ctid::text,xmin::text from compliance_private.records order by kind,id")).rows;
  const control=(await db.setup.query('select initialized,imported,md5(cycles::text) cycles,md5(provenance::text) provenance,md5(source_manifest::text) manifest,ctid::text,xmin::text from compliance_private.control')).rows;
  const audit=(await db.setup.query('select id,ctid::text,xmin::text from compliance_private.audit order by id')).rows;
  return {records,control,audit};
 };
 const initial=await ledger();
 const beforeOld=(await db.setup.query("select oid,proowner,proacl::text,proconfig,md5(prosrc) hash from pg_proc where oid='public.compliance_rpc(text,text,text,jsonb)'::regprocedure")).rows[0];
 const migration=join(root,'supabase','migrations','002_import_timeout.sql');
 await db.setup.query("create role tmsa_rest_auth login noinherit; grant anon to tmsa_rest_auth; alter role anon set statement_timeout='100ms'");
 restPort=await free();const jwtSecret=opaque();
 const config=join(db.dir,'postgrest.conf');
 writeFileSync(config,`db-uri = "postgresql://tmsa_rest_auth@127.0.0.1:${db.port}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\ndb-pool = 2\nserver-host = "127.0.0.1"\nserver-port = ${restPort}\njwt-secret = "${jwtSecret}"\nlog-level = "crit"\n`);
 restFd=openSync(join(db.dir,'postgrest.log'),'a');rest=spawn(binary,[config],{stdio:['ignore',restFd,restFd],windowsHide:true,env:restEnv});
 const restUrl=`http://127.0.0.1:${restPort}`;
 const direct=async body=>{const r=await fetch(restUrl+'/rpc/compliance_rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};};
 const ordinary={p_action:'bootstrap_status',p_session:'',p_client_id:'native-rest',p_payload:{}};
 let ready=false;for(let i=0;i<80;i++){if(rest.exitCode!==null)throw new Error('OWNED_POSTGREST_EXITED');try{const r=await direct(ordinary);if(r.status===200&&r.body.ok){ready=true;break;}}catch{}await pause(100);}assert(ready,'Owned PostgREST readiness');
 receipt.runtimeVersion=spawnSync(binary,['--version'],{encoding:'utf8',timeout:10000,env:restEnv}).stdout.trim();
 await scenario('ordinary-RPC-healthy-under-controlled-100ms-role-budget',async()=>{const r=await direct(ordinary);assert.equal(r.status,200);assert.equal(r.body.ok,true);});
 const request={p_action:'import_seed',p_session:users.owner.sessionToken,p_client_id:users.owner.clientId,p_payload:{seed,operationId:randomUUID()}};
 await scenario('old-four-argument-real-import-SQLSTATE-57014-and-total-rollback',async()=>{
  // Large private source proves the actual original path; small fixture uses a
  // local insertion delay to deterministically cross the same SQL budget.
  if(!full)await db.setup.query("create function compliance_private.qa_import_delay() returns trigger language plpgsql as $$begin perform pg_sleep(0.15);return new;end$$;create trigger qa_import_delay before insert on compliance_private.records for each row execute function compliance_private.qa_import_delay()");
  try{const r=await direct(request);assert.equal(r.status,500);assert.equal(r.body.code,'57014');assert.deepEqual(await ledger(),initial);}finally{if(!full)await db.setup.query('drop trigger qa_import_delay on compliance_private.records;drop function compliance_private.qa_import_delay()');}
 });
 if(existsSync(migration)){
  const bytes=readFileSync(migration),sql=bytes.toString('utf8');receipt.migrationSha256=sha256(bytes);
  await scenario('installer-rejects-unknown-predecessor-with-zero-business-writes',async()=>{
   const original=(await db.setup.query("select pg_get_functiondef('public.compliance_rpc(text,text,text,jsonb)'::regprocedure) as definition")).rows[0].definition;
   await db.setup.query(original.replace('declare result jsonb;','-- owned QA predecessor mutation\ndeclare result jsonb;'));
   try{await assert.rejects(db.setup.query(sql),e=>e.code==='P0001'&&e.message==='IMPORT_REPAIR_UNKNOWN_PREDECESSOR');}finally{await db.setup.query('rollback');await db.setup.query(original);}
   assert.deepEqual(await ledger(),initial);assert.equal((await db.setup.query("select to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean)') is null as absent")).rows[0].absent,true);
  });
  await scenario('installer-late-failure-rolls-back-all-new-DDL',async()=>{
   await assert.rejects(db.setup.query(sql.replace(/commit;\s*$/,'select 1/0;\ncommit;')),e=>e.code==='22012');await db.setup.query('rollback');
   assert.equal((await db.setup.query("select to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean)') is null as absent")).rows[0].absent,true);assert.deepEqual(await ledger(),initial);
  });
  await db.setup.query(sql);
 }
 // Missing overload is a behavioral RED (PostgREST cannot resolve this exact
 // five-argument call), not an attempt to fabricate a SQL timeout fix.
 await scenario('bounded-import-overload-is-callable-after-schema-reload',async()=>{
  let r;for(let i=0;i<40;i++){r=await direct({...ordinary,p_import_mode:false});if(r.status!==404)break;await pause(100);}
  assert.equal(r.status,200);assert.equal(r.body.code,'INVALID_IMPORT_ROUTE');
 });
 await scenario('migration-preserves-old-function-business-rows-and-role-budget',async()=>{
  assert.deepEqual((await db.setup.query("select oid,proowner,proacl::text,proconfig,md5(prosrc) hash from pg_proc where oid='public.compliance_rpc(text,text,text,jsonb)'::regprocedure")).rows[0],beforeOld);assert.deepEqual(await ledger(),initial);
  assert((await db.setup.query("select rolconfig from pg_roles where rolname='anon'")).rows[0].rolconfig.includes('statement_timeout=100ms'));
  const p=(await db.setup.query("select prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') as can_execute from pg_proc where oid='public.compliance_rpc(text,text,text,jsonb,boolean)'::regprocedure")).rows[0];assert(p.prosecdef&&p.can_execute);assert(p.proconfig.includes('statement_timeout=60s'));assert(p.proconfig.includes('search_path=""'));
 });
 await scenario('exact-read-only-installation-check-passes-with-pre-import-counts',async()=>{
  const path=join(root,'supabase','import-timeout-readback.sql');const bytes=readFileSync(path);receipt.readbackSha256=sha256(bytes);
  const results=await db.setup.query(bytes.toString('utf8'));const r=results.find(x=>x.rows?.[0]?.import_repair_readback)?.rows[0].import_repair_readback;
  assert(r);assert.equal(r.status,'PASS_IMPORT_ROUTE_INSTALL_ONLY');assert.equal(Object.keys(r.checks).length,r.checkCount);assert(Object.values(r.checks).every(x=>x===true));assert.equal(r.imported,false);assert.deepEqual(await ledger(),initial);receipt.installationCheckCount=r.checkCount;
 });
 await scenario('import-route-rejects-wrong-action-false-mode-and-no-session',async()=>{
  for(const body of [{...ordinary,p_import_mode:true},{...request,p_import_mode:false},{...request,p_import_mode:true,p_session:''}]){const r=await direct(body);assert.equal(r.status,200);assert.equal(r.body.ok,false);assert.equal(r.body.code,body.p_action!=='import_seed'||body.p_import_mode===false?'INVALID_IMPORT_ROUTE':'SESSION_INVALID');}assert.deepEqual(await ledger(),initial);
 });
 await scenario('valid-admin-operator-and-vessel-sessions-cannot-import',async()=>{
  for(const role of ['admin','operator','vessel']){const r=await direct({...request,p_import_mode:true,p_session:users[role].sessionToken,p_client_id:users[role].clientId});assert.equal(r.status,200);assert.equal(r.body.code,'FORBIDDEN');}assert.deepEqual(await ledger(),initial);
 });
 await scenario('invalid-late-reference-rolls-back-entire-new-import',async()=>{
  const bad=structuredClone(seed);bad.assessments.at(-1).assigneeIds=['qa-missing-assignee'];
  const r=await direct({...request,p_import_mode:true,p_payload:{seed:bad,operationId:randomUUID()}});assert.equal(r.status,200);assert.equal(r.body.code,'INVALID_REFERENCE');assert.deepEqual(await ledger(),initial);
 });
 // A routing-only proxy adapts Supabase's URL prefix; SQL execution and timeout
 // handling remain the official PostgREST, not the existing QA REST simulation.
 proxy=http.createServer(async(req,res)=>{try{const chunks=[];for await(const b of req)chunks.push(b);const r=await fetch(restUrl+req.url.replace(/^\/rest\/v1/,''),{method:req.method,headers:{'Content-Type':'application/json',Authorization:req.headers.authorization},body:Buffer.concat(chunks),signal:AbortSignal.timeout(15000)});res.writeHead(r.status,{'Content-Type':'application/json'});res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(502);res.end('{}');}});
 await new Promise((ok,fail)=>{proxy.once('error',fail);proxy.listen(0,'127.0.0.1',ok);});proxyPort=proxy.address().port;
 const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({role:'anon',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');const jwt=header+'.'+payload+'.'+createHmac('sha256',jwtSecret).update(header+'.'+payload).digest('base64url');
 const api=createApiClient({url:`http://127.0.0.1:${proxyPort}`,anonKey:jwt});api.sessionToken=users.owner.sessionToken;
 await scenario('actual-ApiClient-real-PostgREST-complete-seed-commits-once',async()=>{assert.deepEqual(await api.importSeed(seed),{imported:expectedTotal});});
 await scenario('independent-exact-counts-full-source-fields-and-frozen-snapshots-readback',async()=>{
  const rows=(await db.setup.query("select kind,id,version,body from compliance_private.records where kind not in ('person','settings') order by kind,id")).rows;assert.equal(rows.length,expectedTotal);
  const counts=Object.fromEntries(Object.keys(expected).map(k=>[k,rows.filter(r=>r.kind===k).length]));assert.deepEqual(counts,expected);
  for(const [kind,collection] of Object.entries(businessKinds))for(const original of seed[collection]){const stored=rows.find(r=>r.kind===kind&&r.id===original.id);assert(stored);assert.equal(stored.version,1);for(const [k,v] of Object.entries(original)){if(['version','createdAt','updatedAt','updatedBy','hasPassword'].includes(k))continue;if(kind==='improvement'&&k==='sourceKey')continue;assert.deepEqual(stored.body[k],v,`${kind} ${k} source preservation`);}}
  assert.equal((await db.setup.query('select imported from compliance_private.control')).rows[0].imported,true);assert.equal((await db.setup.query("select count(*) as n from compliance_private.audit where action='import_seed'")).rows[0].n,'1');receipt.actualCounts=counts;
 });
 await scenario('fresh-workspace-guard-rejects-second-import-no-additional-writes',async()=>{const before=await ledger();await assert.rejects(api.importSeed(seed),e=>e.code==='WORKSPACE_NOT_FRESH');assert.deepEqual(await ledger(),before);assert.equal((await direct(ordinary)).status,200);});
 await scenario('anonymous-private-table-and-helper-access-remain-denied',async()=>{const c=await db.connect();try{await c.query('begin');await c.query('set local role anon');await assert.rejects(c.query('select * from compliance_private.records'),e=>e.code==='42501');await c.query('rollback');await c.query('begin');await c.query('set local role anon');await assert.rejects(c.query('select compliance_private.token()'),e=>e.code==='42501');await c.query('rollback');}finally{await c.end();}});
 receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.failureCode=e.code||e.name;console.error('Import SQL regression failed:',receipt.failureCode);process.exitCode=1;}
finally{
 if(proxy?.listening)await new Promise(ok=>proxy.close(ok));
 if(rest&&rest.exitCode===null){rest.kill();await Promise.race([new Promise(ok=>rest.once('exit',ok)),pause(4000)]);if(rest.exitCode===null&&rest.signalCode===null)spawnSync('taskkill',['/PID',String(rest.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000});}
 if(restFd!==undefined)closeSync(restFd);if(db)await db.stop();
 receipt.ownedDatabaseStopped=!!db&&!existsSync(join(db.dataDir,'postmaster.pid'));receipt.ownedPostgrestStopped=!!rest&&(rest.exitCode!==null||rest.signalCode!==null);
 writeFileSync(join(evidence,full?'full-source-receipt.json':'synthetic-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,passed:cases.filter(c=>c.status==='PASS').length,total:cases.length,expectedTotal:receipt.expectedTotal,ownedDatabaseStopped:receipt.ownedDatabaseStopped,ownedPostgrestStopped:receipt.ownedPostgrestStopped,productionRequests:0}));
}
