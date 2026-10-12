import assert from 'node:assert/strict';
import test from 'node:test';
import {createApiClient} from '../src/api.ts';

test('a pre-login SQL timeout is not labelled an unconfirmed seed import',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({code:'57014',message:'provider private marker',details:'private detail'},{status:500});};
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  await assert.rejects(api.status(),(error:unknown)=>{
   const e=error as Error&{code:string};assert.equal(e.code,'DB_57014');assert.match(e.message,/逾時/);assert.doesNotMatch(e.message,/匯入|provider|private/);return true;
  });assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
