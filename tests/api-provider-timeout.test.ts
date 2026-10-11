import assert from 'node:assert/strict';
import test from 'node:test';
import {createApiClient} from '../src/api.ts';

test('provider SQLSTATE 57014 survives HTTP 500 without echoing provider private fields or replay',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({code:'57014',message:'canceling statement due to statement timeout',details:'private diagnostic marker',hint:'private hint marker'},{status:500});};
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  await assert.rejects(api.status(),(error:unknown)=>{
   const e=error as Error&{code:string};assert.equal(e.code,'DB_57014');assert.match(e.message,/逾時/);assert.doesNotMatch(e.message,/private|canceling statement/);return true;
  });assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
