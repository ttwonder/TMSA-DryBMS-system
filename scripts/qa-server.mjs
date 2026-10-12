import http from 'node:http';
import pg from 'pg';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeDatabase,setupQaIdentities,syntheticSeed,rpc,root} from './native-postgres.mjs';

export async function startQaServer({seed=syntheticSeed(),port=0,evidenceDir=join(root,'qa-evidence'),afterCommit}={}) {
  mkdirSync(evidenceDir,{recursive:true});
  const db=await createNativeDatabase({evidenceDir});
  const handlesPath=join(evidenceDir,'session-handles.json');
  let pool,server,closing=false;
  const stop=async()=>{
    if(closing)return;closing=true;
    if(server?.listening)await new Promise((ok,fail)=>server.close(error=>error?fail(error):ok()));
    if(pool)await pool.end();await db.stop();
  };
  try {
    for(const file of ['002_import_timeout.sql','003_read_timeout.sql','004_office_directory.sql'])await db.setup.query(readFileSync(join(root,'supabase','migrations',file),'utf8'));
    const users=await setupQaIdentities(db,{seed,handlesPath});
    pool=new pg.Pool({...db.connection,max:12,idleTimeoutMillis:10000});
    server=http.createServer(async(req,res)=>{
      const origin=req.headers.origin;
      if(origin&&!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin)){res.writeHead(403);res.end();return;}
      if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      res.setHeader('Access-Control-Allow-Headers','content-type,apikey,authorization');res.setHeader('Access-Control-Allow-Methods','POST,GET,OPTIONS');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json;charset=utf-8'});res.end(JSON.stringify(value));};
      if(req.method==='GET'&&req.url==='/health'){json(200,{ok:!closing,engine:'native PostgreSQL',transport:'local Supabase RPC REST simulation',label:'真實UI＋測試資料；本機PostgreSQL非正式Supabase'});return;}
      if(req.method!=='POST'||req.url!=='/rest/v1/rpc/compliance_rpc'){json(404,{ok:false,code:'NOT_FOUND'});return;}
      let c;
      try {
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>42000000){json(413,{ok:false,code:'PAYLOAD_TOO_LARGE'});return;}chunks.push(chunk);}
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(!body||typeof body.p_action!=='string'||typeof body.p_session!=='string'||typeof body.p_client_id!=='string'||!body.p_payload||typeof body.p_payload!=='object'||Array.isArray(body.p_payload)){json(400,{ok:false,code:'INVALID_TRANSPORT'});return;}
        c=await pool.connect();const pid=(await c.query('select pg_backend_pid() as pid')).rows[0].pid;
        let result;
        if(Object.hasOwn(body,'p_read_mode')||Object.hasOwn(body,'p_import_mode')){
          const readRoute=Object.hasOwn(body,'p_read_mode');
          const args=[body.p_action,body.p_session,body.p_client_id,JSON.stringify(body.p_payload),body.p_import_mode];
          if(readRoute)args.push(body.p_read_mode);
          await c.query('begin');await c.query('set local role anon');
          try{result=(await c.query(readRoute?'select public.compliance_rpc($1,$2,$3,$4::jsonb,$5::boolean,$6::boolean) as result':'select public.compliance_rpc($1,$2,$3,$4::jsonb,$5::boolean) as result',args)).rows[0].result;await c.query('commit');}
          catch(error){await c.query('rollback');throw error;}
        }else result=await rpc(db,body.p_action,body.p_payload,body.p_session,body.p_client_id,c);
        // Optional in-process test hook is after real COMMIT, never a public SQL endpoint.
        if(afterCommit&&await afterCommit({action:body.p_action,result,backendPid:pid})) {res.destroy();return;}
        json(200,result);
      }catch(error){if(!res.headersSent)json(error instanceof SyntaxError?400:500,{ok:false,code:error instanceof SyntaxError?'INVALID_JSON':'QA_TRANSPORT_ERROR',message:'Local QA transport failed; no secrets are logged.'});}
      finally{c?.release();}
    });
    server.requestTimeout=25000;server.headersTimeout=10000;
    await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});
    const url=`http://127.0.0.1:${server.address().port}`;
    const config={url,anonKey:'local-qa-public'};
    writeFileSync(handlesPath,JSON.stringify({label:'真實UI＋測試資料；本機PostgreSQL非正式Supabase',config,users},null,2));
    return {url,config,handlesPath,users,db,server,stop};
  }catch(error){await stop();throw error;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);let seed=syntheticSeed();const seedAt=args.indexOf('--seed');
  if(seedAt>=0){if(!args[seedAt+1])throw new Error('--seed requires a private local file.');seed=JSON.parse(readFileSync(resolve(args[seedAt+1]),'utf8'));}
  const portAt=args.indexOf('--port');const port=portAt<0?0:Number(args[portAt+1]);if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid loopback port.');
  const qa=await startQaServer({seed,port});
  console.log('QA_READY',JSON.stringify({url:qa.url,handlesPath:qa.handlesPath,label:'真實UI＋測試資料；本機PostgreSQL非正式Supabase'}));
  const shutdown=async()=>{try{await qa.stop();process.exit(0);}catch{console.error('QA owned-cluster shutdown failed; files retained.');process.exit(1);}};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
