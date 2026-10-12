import assert from 'node:assert/strict';
import test from 'node:test';
import * as apiModule from '../src/api.ts';
import type {ApiClient,SeedBundle} from '../src/types.ts';

const seed:SeedBundle={schemaVersion:1,frameworks:[],chapters:[],items:[],assessments:[],improvements:[],inspections:[],dryScores:[],cycles:[],provenance:[],sourceManifest:[],importNote:{en:'Controlled client-flow seam; not server import acceptance',zh:'客戶端流程受控測試；不是正式匯入驗收'}};
type Flow=(api:ApiClient,seed:SeedBundle,refresh:()=>Promise<void>)=>Promise<{status:string;imported:number;error?:unknown}>;

test('a committed import plus a failed authoritative refresh is not another import failure',async()=>{
 const run=(apiModule as unknown as {runSeedImport?:Flow}).runSeedImport;
 assert.equal(typeof run,'function','The import flow must separate committed write acknowledgement from refresh');if(!run)return;
 const original=globalThis.fetch;let imports=0,refreshes=0;
 globalThis.fetch=async(_input,init)=>{assert.equal(JSON.parse(String(init?.body)).p_action,'import_seed');imports++;return Response.json({ok:true,data:{imported:0}});};
 try{
  const api=apiModule.createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});const error=new apiModule.RpcError('DB_57014','最新資料讀取逾時');
  const result=await run(api,seed,async()=>{refreshes++;throw error;});
  assert.equal(result.status,'committed_readback_pending');assert.equal(result.imported,0);assert.equal(result.error,error);assert.equal(imports,1);assert.equal(refreshes,1);
 }finally{globalThis.fetch=original;}
});
