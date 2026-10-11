import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, openSync, closeSync, realpathSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import {createServer} from 'node:net';
import pg from 'pg';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const opaque = () => randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
export const scratch = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'hermes', 'cache', 'scratch') : process.env.BH_AGENT_WORKSPACE;
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k)));
const binCandidates = () => [process.env.SHIP_QA_PG_BIN, process.env.COMPLIANCE_PG_BIN,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'hermes', 'cache', 'ship-pg-runtime-17.11-3', 'runtime', 'pgsql', 'bin'),
  scratch && join(scratch, 'compliance-pg-17.6', 'pgsql', 'bin')].filter(Boolean);
const freePort = () => new Promise((resolvePort, reject) => {
  const s = createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => {const p=s.address().port; s.close(() => resolvePort(p));});
});

// Always creates a new owned cluster; no DATABASE_URL or arbitrary attachment.
export async function createNativeDatabase({evidenceDir=join(root, 'qa-evidence'), install=true}={}) {
  if (!scratch) throw new Error('Hermes scratch directory is required.');
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const bin = binCandidates().find(p => existsSync(join(p, 'postgres'+suffix)) && existsSync(join(p, 'initdb'+suffix)));
  if (!bin) throw new Error('Native PostgreSQL is missing. Set COMPLIANCE_PG_BIN to a portable bin directory (see docs/BACKEND.md).');
  mkdirSync(scratch, {recursive:true}); mkdirSync(evidenceDir, {recursive:true});
  const dir = mkdtempSync(join(scratch, 'compliance-native-'));
  const dataDir = join(dir, 'data'); const nonce = opaque(); const port = await freePort();
  writeFileSync(join(dir, 'ownership.json'), JSON.stringify({nonce, dataDir, port, host:'127.0.0.1', purpose:'TMSA-DRYBMS isolated QA'}));
  const commandLog=join(dir, 'commands.log');
  const run=(name,args)=>{
    const fd=openSync(commandLog,'a'); let r;
    try {r=spawnSync(join(bin,name+suffix),args,{env:cleanEnv,stdio:['ignore',fd,fd],windowsHide:true,timeout:40000});}
    finally {closeSync(fd);}
    if(r.error || r.status!==0)throw new Error(`${name} failed; local command log: ${commandLog}`);
  };
  const connection = {host:'127.0.0.1', port, database:'postgres', user:'compliance_qa', password:'', ssl:false,
    application_name:'compliance-native-'+nonce.slice(0,8), connectionTimeoutMillis:10000, query_timeout:20000, statement_timeout:15000};
  const clients=new Set();
  const connect=async()=>{const c=new pg.Client(connection);await c.connect();clients.add(c);c.once('end',()=>clients.delete(c));return c;};
  let stopped=false;
  const stop=async()=>{
    if(stopped)return;stopped=true;
    await Promise.allSettled([...clients].map(c=>c.end()));
    const marker=JSON.parse(readFileSync(join(dir,'ownership.json'),'utf8'));
    if(marker.nonce!==nonce || marker.port!==port || marker.dataDir!==dataDir)throw new Error('Owned cluster marker mismatch; refusing shutdown.');
    if(existsSync(join(dataDir,'postmaster.pid')))run('pg_ctl',['-D',dataDir,'-m','fast','-w','-t','25','stop']);
    if(existsSync(join(dataDir,'postmaster.pid')))throw new Error('Owned PostgreSQL did not stop.');
    // User prohibits deletions: retain cluster/evidence, never rm or stop others.
  };
  try {
    run('initdb',['-D',dataDir,'-U','compliance_qa','--encoding=UTF8','--locale=C','--auth-host=trust','--auth-local=trust','--no-instructions']);
    run('pg_ctl',['-D',dataDir,'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -c log_min_error_statement=panic -c log_min_messages=panic -c log_statement=none`,'-w','-t','25','start']);
    const setup=await connect();
    const binding=(await setup.query("select current_setting('data_directory') as dir,host(inet_server_addr()) as host,inet_server_port() as port,version() as version,pg_backend_pid() as pid")).rows[0];
    if(realpathSync(binding.dir)!==realpathSync(dataDir)||binding.host!=='127.0.0.1'||binding.port!==port)throw new Error('Native database endpoint binding mismatch.');
    await setup.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;");
    const bootstrapCode=opaque();
    if (install) {
      const migration=readFileSync(join(root,'supabase','migrations','001_platform.sql'),'utf8');
      await setup.query(migration);
      await setup.query('select compliance_private.provision_bootstrap($1)',[sha256(bootstrapCode)]);
    }
    const descriptor={nonce,dataDir,port,host:'127.0.0.1',database:'postgres',user:'compliance_qa',serverVersion:binding.version};
    writeFileSync(join(evidenceDir,'native-runtime.json'),JSON.stringify(descriptor,null,2));
    return {dir,dataDir,port,nonce,connect,setup,stop,bootstrapCode,binding,connection};
  } catch(e){await stop();throw e;}
}

// Every call is a separate real PostgreSQL transaction under the anon role.
export async function rpc(db, action, payload={}, session='', clientId='qa-client', client=null) {
  const c=client??await db.connect();
  try {
    await c.query('begin'); await c.query('set local role anon');
    const r=await c.query('select public.compliance_rpc($1,$2,$3,$4::jsonb) as result',[action,session,clientId,JSON.stringify(payload)]);
    await c.query('commit'); return r.rows[0].result;
  } catch(e){await c.query('rollback').catch(()=>{});throw e;}
  finally {if(!client)await c.end();}
}
export async function checkedRpc(db,...args){const r=await rpc(db,...args);if(!r.ok)throw new Error(`RPC ${args[0]} rejected: ${r.code}`);return r.data;}

export function syntheticSeed(){
  const base=id=>({id,version:0,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',updatedBy:''});
  const bi=s=>({en:s,zh:'測試 '+s});
  const frameworks=['TMSA','DRYBMS'].map(id=>({...base(id),name:bi(id),description:bi('Synthetic fixture'),scoring:id==='TMSA'?'tmsa-stage':'drybms-guidance',active:true,sourceVersion:'synthetic-v1',scopeLabel:bi('Synthetic; not company data')}));
  const chapters=frameworks.map((f,i)=>({...base('chapter-'+f.id),frameworkId:f.id,code:'1',name:bi('Chapter'),order:i,active:true}));
  const items=['item-a','item-b','item-gap','item-dry'].map((id,i)=>({...base(id),frameworkId:i===3?'DRYBMS':'TMSA',chapterId:i===3?'chapter-DRYBMS':'chapter-TMSA',code:i===3?'D-1':`1.1.${i+1}`,level:1,order:i,active:true,kpi:bi(id),guidance:bi('Guidance'),departmentIds:['marine'],sources:[],...(i===2?{sourceGap:'Synthetic unresolved source fragment',sourceGapResolved:false}:{})}));
  const assessments=items.map(item=>({...base('assessment-'+item.id),itemId:item.id,response:'no',conformity:'partial',reviewed:false,selfAssessment:bi('Initial'),evidence:bi('None'),departmentIds:['marine'],assigneeIds:[],executionStatus:'not_started',sources:[]}));
  return {schemaVersion:1,frameworks,chapters,items,assessments,improvements:[],inspections:[],dryScores:[{...base('dry-score'),chapterId:'chapter-DRYBMS',levels:[null,null,null,null],note:''}],cycles:[],provenance:[{fixture:true}],sourceManifest:[],importNote:bi('Native PostgreSQL test fixture only')};
}

export async function setupQaIdentities(db,{seed=syntheticSeed(),handlesPath=join(root,'qa-evidence','session-handles.json')}={}){
  const ownerHash=sha256(opaque()), gateHash=sha256(opaque()), adminHash=sha256(opaque());
  mkdirSync(dirname(handlesPath),{recursive:true});
  writeFileSync(join(dirname(handlesPath),'qa-private-credentials.json'),JSON.stringify({ownerHash,gateHash,adminHash}),{mode:0o600});
  Object.defineProperty(db,'qaCredentials',{value:{ownerHash,gateHash,adminHash},configurable:true});
  const owner=await checkedRpc(db,'bootstrap',{initializationCode:db.bootstrapCode,owner:{id:'qa-owner',username:'qa-owner',name:'測試 Owner',departmentId:'marine'},passwordHash:ownerHash,sitePasswordHash:gateHash},'', 'qa-setup');
  const gate=await checkedRpc(db,'gate',{passwordHash:gateHash},'', 'qa-setup');
  const login=await checkedRpc(db,'login',{gateToken:gate.gateToken,personId:'qa-owner',passwordHash:ownerHash},'', 'qa-owner-client');
  if(seed)await checkedRpc(db,'import_seed',{seed,operationId:randomUUID()},login.sessionToken,'qa-owner-client');
  const users={owner:{user:login.user,sessionToken:login.sessionToken,clientId:'qa-owner-client'}};
  for(const [role,id] of [['admin','qa-admin'],['operator','qa-operator'],['operator','qa-peer'],['vessel','qa-vessel']]){
    const l=await checkedRpc(db,'claim',{kind:'person',id},login.sessionToken,'qa-owner-client');
    const record={id,version:0,createdAt:'',updatedAt:'',updatedBy:'',username:id,name:role==='operator'?(id==='qa-peer'?'測試同事':'測試操作員'):`測試 ${role}`,departmentId:'marine',role,active:true,hasPassword:role==='admin'};
    await checkedRpc(db,'save',{kind:'person',record,expectedVersion:0,leaseToken:l.token,intent:'create',operationId:randomUUID(),...(role==='admin'?{passwordHash:adminHash}:{})},login.sessionToken,'qa-owner-client');
    await checkedRpc(db,'release',{kind:'person',id,leaseToken:l.token},login.sessionToken,'qa-owner-client');
    const entry=await checkedRpc(db,'login',{gateToken:gate.gateToken,personId:id,passwordHash:role==='admin'?adminHash:''},'',id+'-client');
    users[id==='qa-peer'?'peer':role]={user:entry.user,sessionToken:entry.sessionToken,clientId:id+'-client'};
  }
  mkdirSync(dirname(handlesPath),{recursive:true});
  // Only opaque authorized handles, no passwords/hashes/bootstrap secret.
  writeFileSync(handlesPath,JSON.stringify({label:'真實UI＋測試資料；本機PostgreSQL非正式Supabase',url:`http://127.0.0.1:${db.port}`,users},null,2));
  return users;
}
