// Complete manual installer transport matrix on owned native PostgreSQL only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {startQaServer} from './qa-server.mjs';
import {root,sha256} from './native-postgres.mjs';

const out=join(root,'qa-evidence/person-department-heads',`line-endings-${new Date().toISOString().replaceAll(':','-')}`);
mkdirSync(out,{recursive:true});
const paths=['supabase/migrations/018_person_department_heads.sql','supabase/fpmc-reporting-readback.sql','supabase/person-department-heads-readback.sql','scripts/native-postgres.mjs','scripts/qa-server.mjs','scripts/verify-person-department-heads-line-endings.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,sha256(readFileSync(join(root,p)))]));
const receipt={layer:'owned native PostgreSQL; synthetic data; no provider/clipboard/browser access',inputs:hashes(),cases:[]};
const persist=()=>writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));
const sql=p=>readFileSync(join(root,p),'utf8');
const lf=s=>s.replaceAll('\r\n','\n');
const encode=(s,eol)=>eol==='CRLF'?lf(s).replaceAll('\n','\r\n'):lf(s);
const migration=sql(paths[0]);
const rules='compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)';
const dispatch='compliance_private.dispatch(text,text,text,jsonb)';
const changed=[dispatch,rules].sort();
const expectedKeys=source=>{
 const signatures=[...source.split('), routes as (')[0].matchAll(/\('([^']+)'\s*,/g)].map(m=>m[1]);
 const named=[...source.matchAll(/union all select '([^']+)'/g)].map(m=>m[1]);
 const keys=[...signatures,...named].sort();assert.equal(new Set(keys).size,24);assert.equal(keys.length,24);return keys;
};
const keys={pre:expectedKeys(sql(paths[1])),post:expectedKeys(sql(paths[2]))};
const closed=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
let qa;
try{
 qa=await startQaServer({evidenceDir:out,latestMigration:17});
 const q=(text,args)=>qa.db.setup.query(text,args);
 const catalog=async()=>(await q(`select p.oid::regprocedure::text signature,p.oid,md5(prosrc) raw_hash,md5(replace(prosrc,E'\\r\\n',E'\\n')) normalized_hash,proowner,proacl,proconfig,prosecdef,proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='compliance_private' or n.nspname='public' and proname='compliance_rpc' order by 1`)).rows;
 const attrs=rows=>rows.map(({raw_hash,normalized_hash,...r})=>r);
 const normalized=rows=>rows.map(({raw_hash,...r})=>r);
 const tables=(await q("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='compliance_private' and c.relkind='r' order by 1")).rows.map(r=>r.relname);
 const ledger=async()=>{const rows={};for(const table of tables)rows[table]=(await q(`select count(*)::int count,md5(coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('_xmin',t.xmin::text,'_ctid',t.ctid::text) order by to_jsonb(t)::text)::text,'[]')) digest from compliance_private.${table} t`)).rows[0];return rows;};
 const readback=async(which,eol)=>{
  const result=await q(encode(sql(paths[which==='pre'?1:2]),eol));
  const row=result.flatMap(r=>r.rows??[]).find(r=>Object.keys(r).some(k=>k.endsWith('_readback')));
  const check=Object.values(row??{})[0];assert(check);
  assert.equal(check.status,which==='pre'?'PASS_FPMC_REPORTING_INSTALL_ONLY':'PASS_PERSON_DEPARTMENT_HEADS_INSTALL_ONLY');
  assert.deepEqual(Object.keys(check.checks).sort(),keys[which]);assert.equal(check.checkCount,keys[which].length);
  assert(Object.values(check.checks).every(v=>v===true));return check;
 };
 const definitions={};for(const signature of changed)definitions[signature]=(await q('select pg_get_functiondef($1::regprocedure) d',[signature])).rows[0].d;
 const baseCatalog=await catalog(),baseLedger=await ledger();
 writeFileSync(join(out,'before.json'),JSON.stringify({catalog:baseCatalog,ledger:baseLedger},null,2));
 let installedNormalized;
 for(const storedEol of ['LF','CRLF'])for(const submittedEol of ['LF','CRLF']){
  // Restore only two known functions in this owned synthetic fixture; never production.
  for(const signature of changed)await q(encode(definitions[signature],storedEol));
  const before=await catalog(),beforeLedger=await ledger();assert.deepEqual(normalized(before),normalized(baseCatalog));assert.deepEqual(beforeLedger,baseLedger);
  const transport=encode(migration,submittedEol),id=`PDH-EOL-${storedEol}-predecessor-${submittedEol}-submission`;
  const entry={id,storedEol,submittedEol,submissionSHA256:sha256(transport)};
  try{
   entry.predecessor=await readback('pre',submittedEol);
   await q(transport);
   const after=await catalog();assert.deepEqual(attrs(after),attrs(before));assert.deepEqual(await ledger(),baseLedger);
   assert.deepEqual(after.filter((r,i)=>r.normalized_hash!==before[i].normalized_hash).map(r=>r.signature).sort(),changed);
   entry.readback=await readback('post',submittedEol);
   if(installedNormalized)assert.deepEqual(normalized(after),installedNormalized);else installedNormalized=normalized(after);
   entry.installedHashes=after.filter(r=>changed.includes(r.signature)).map(({signature,normalized_hash})=>({signature,normalized_hash}));
   entry.sameInstalledDefinitions=true;entry.attributesAndAllTuplesUnchanged=true;entry.status='PASS';
  }catch(error){
   await q('rollback');const after=await catalog();
   entry.status='FAIL';entry.failure={code:error.code,message:error.message,where:error.where};
   entry.rollbackCatalogUnchanged=JSON.stringify(after)===JSON.stringify(before);
   entry.rollbackAllTuplesUnchanged=JSON.stringify(await ledger())===JSON.stringify(beforeLedger);
  }
  receipt.cases.push(entry);persist();
 }
 assert.equal(receipt.cases.length,4);assert.equal(new Set(receipt.cases.map(c=>c.id)).size,4);
 receipt.status=receipt.cases.every(c=>c.status==='PASS')?'PASS':'FAIL';
 if(receipt.status!=='PASS')process.exitCode=1;
}catch(error){receipt.status='FAIL';receipt.failure={message:error.message,code:error.code,stack:error.stack};process.exitCode=1;}
finally{
 const ports=[qa?.db.port,qa?.server.address()?.port].filter(Boolean);await qa?.stop();
 receipt.cleanup={ports,portsStopped:await Promise.all(ports.map(closed)),filesRetained:true};
 receipt.endingInputs=hashes();receipt.inputsUnchanged=JSON.stringify(receipt.inputs)===JSON.stringify(receipt.endingInputs);
 receipt.runnerPath=fileURLToPath(import.meta.url);
 if(!receipt.inputsUnchanged||receipt.cleanup.portsStopped.some(v=>!v)){receipt.status='FAIL';process.exitCode=1;}
 persist();console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.map(({id,status,failure,rollbackCatalogUnchanged,rollbackAllTuplesUnchanged})=>({id,status,failure,rollbackCatalogUnchanged,rollbackAllTuplesUnchanged})),cleanup:receipt.cleanup,inputsUnchanged:receipt.inputsUnchanged,receipt:join(out,'receipt.json')}));
}
