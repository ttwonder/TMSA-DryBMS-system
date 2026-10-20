// Actual immutable GM ApiClient versus candidate, identical synthetic fixture.
// Fresh owned PG for each arm. Actual loopback HTTP socket bytes; no gzip estimate.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import {root,syntheticSeed,sha256} from './native-postgres.mjs';
import {startQaServer} from './qa-server.mjs';
import {createApiClient} from '../src/api.ts';
const base='a07f6e8eecfa3d29245ad59fd8a46c7110c25d4d';
const out=join(root,'qa-evidence/sync-efficiency','transport-'+new Date().toISOString().replaceAll(':','-'));mkdirSync(join(out,'baseline'),{recursive:true});
const receipt={layer:'Actual original ApiClient + synthetic data + independent owned PG; HTTP/1.1 localhost, not Supabase billing',baseHEAD:base,arms:{},inputHashes:{},baselineHashes:{},cases:[],productionRequests:0};
for(const file of ['api.ts','syncState.ts']){const bytes=execFileSync('git',['show',base+':src/'+file],{cwd:root});writeFileSync(join(out,'baseline',file),bytes);receipt.baselineHashes['src/'+file]=sha256(bytes);}
const oldCreate=(await import(pathToFileURL(join(out,'baseline/api.ts')).href)).createApiClient;
for(const p of ['package.json',...['src','scripts','supabase/migrations'].flatMap(d=>readdirSync(join(root,d)).filter(f=>/\.(tsx?|mjs|sql|css)$/.test(f)).map(f=>d+'/'+f))])receipt.inputHashes[p]=sha256(readFileSync(join(root,p)));
const seed=syntheticSeed();for(let i=0;i<696;i++){const id=`synth-${i}`;seed.items.push({...structuredClone(seed.items[0]),id,code:`S-${i}`,order:i+5});seed.assessments.push({...structuredClone(seed.assessments[0]),id:'assessment-'+id,itemId:id});}
receipt.fixtureSha256=sha256(JSON.stringify(seed));
const closed=p=>new Promise(resolve=>{const s=net.connect(p,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',()=>resolve(true));});
const oldFetch=globalThis.fetch;let qa;
try{
 for(const [arm,create,latest] of [['A',oldCreate,13],['B',createApiClient,14]]){
  const evidenceDir=join(out,arm);mkdirSync(evidenceDir,{recursive:true});qa=await startQaServer({seed:structuredClone(seed),evidenceDir,latestMigration:latest});
  const samples=[],result={role:'owner',migration:latest,phases:{},cleanup:null};receipt.arms[arm]=result;
  globalThis.fetch=async(url,init)=>{
   assert.equal(new URL(url).origin,qa.url,'Only this owned loopback adapter is allowed');
   const body=String(init.body),action=JSON.parse(body).p_action,start=performance.now();
   return new Promise((resolve,reject)=>{const req=http.request(url,{method:init.method,headers:{...init.headers,'Content-Length':Buffer.byteLength(body)},agent:false,signal:init.signal},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks);samples.push({action,requestJsonBytes:Buffer.byteLength(body),responseJsonBytes:text.length,requestWireBytes:req.socket.bytesWritten,responseWireBytes:req.socket.bytesRead,elapsedMs:Math.round((performance.now()-start)*100)/100});resolve(new Response(text,{status:res.statusCode,headers:{'Content-Type':'application/json'}}));});});req.on('error',reject);req.end(body);});
  };
  const measure=async(name,fn)=>{const index=samples.length,start=performance.now();const value=await fn();const requests=samples.slice(index);result.phases[name]={requestCount:requests.length,elapsedMs:Math.round((performance.now()-start)*100)/100,...Object.fromEntries(['requestJsonBytes','responseJsonBytes','requestWireBytes','responseWireBytes'].map(k=>[k,requests.reduce((n,r)=>n+r[k],0)])),requests};return value;};
  const api=create(qa.config);api.user=qa.users.owner.user;api.sessionToken=qa.users.owner.sessionToken;
  const first=await measure('cold',()=>api.sync());assert.equal(first.items.length,700);
  let warm;for(let i=1;i<=5;i++)warm=await measure('warm'+i,()=>api.sync());if(arm==='B')assert.equal(warm,first);
  await qa.db.setup.query("update compliance_private.records set version=version+1,body=jsonb_set(jsonb_set(body,'{version}',to_jsonb(version+1)),'{selfAssessment,en}',to_jsonb('Matched changed record'::text)) where kind='assessment' and id='assessment-item-b'");
  const changed=await measure('changed',()=>api.sync());assert.equal(changed.assessments.find(x=>x.itemId==='item-b').selfAssessment.en,'Matched changed record');
  const item=changed.items.find(x=>x.id==='item-a'),lock=await api.claim('item',item.id);const ack=await measure('save-primary-and-related',()=>api.save('item',{...item,kpi:{...item.kpi,en:'Matched saved definition'}},item.version,lock));assert.equal(ack.version,item.version+1);assert.equal(api.cachedState().items.find(x=>x.id===item.id).version,ack.version);assert.equal(api.cachedState().assessments.find(x=>x.itemId===item.id).version,changed.assessments.find(x=>x.itemId===item.id).version+1);await api.release(lock);
  const fresh=await api.sync();const exported=await measure('export',()=>api.authorizeExport({kind:'framework',format:'pdf',frameworkId:'TMSA',ids:['item-a'],snapshotToken:fresh.snapshotToken}));assert.equal(exported.items.length,1);
  assert.equal(result.phases.changed.requestCount,arm==='A'?1:2);assert.equal(result.phases['save-primary-and-related'].requestCount,1);
  receipt.cases.push({id:arm+'-actual-api-cold-five-warm-changed-save-export',status:'PASS'});
  const ports={api:qa.server.address().port,pg:qa.db.port};await qa.stop();result.cleanup={ports,stopped:await Promise.all(Object.values(ports).map(closed))};qa=null;globalThis.fetch=oldFetch;
 }
 receipt.status='PASS';
}catch(e){receipt.status='FAIL';receipt.error={name:e.name,code:e.code,message:e.message};process.exitCode=1;}
finally{globalThis.fetch=oldFetch;await qa?.stop();writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:receipt.status,cases:receipt.cases.length,error:receipt.error,receipt:join(out,'receipt.json')}));}
