import assert from 'node:assert/strict';
import test from 'node:test';
import {createApiClient} from '../src/api.ts';
import type {Lease,SaveIntent} from '../src/types.ts';

test('record lease claim and renewal retain close/reopen intent without requesting update authority',async()=>{
 const original=globalThis.fetch;const observed:{action:string;intent?:string;kind?:string;id?:string}[]=[];
 globalThis.fetch=async(_url,init)=>{
  const {p_action:action,p_payload:payload}=JSON.parse(String(init?.body));
  observed.push({action,...payload});
  if(!['close','reopen'].includes(payload.intent))return Response.json({ok:false,code:'FORBIDDEN'});
  const lease:Lease={resourceKey:'improvement:qa-close-only',token:'synthetic-'+payload.intent,expiresAt:'2030-01-01T00:00:00Z',holderName:'Synthetic',holderId:'qa-user',baseVersion:1};
  return Response.json({ok:true,data:lease});
 };
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  for(const intent of ['close','reopen'] as SaveIntent[]){
   // Runtime RED uses the actual client; typecheck also enforces this public API after GREEN.
   const lease=await api.claim('improvement','qa-close-only',intent);
   await api.renew(lease);
   assert.deepEqual(observed.slice(-2).map(x=>({action:x.action,intent:x.intent,kind:x.kind,id:x.id})),[
    {action:'claim',intent,kind:'improvement',id:'qa-close-only'},
    {action:'renew',intent,kind:'improvement',id:'qa-close-only'}]);
  }
  await assert.rejects(()=>api.claim('improvement','qa-close-only'),/FORBIDDEN/);
 }finally{globalThis.fetch=original;}
});

test('ordinary lease clients keep update as their default intent',async()=>{
 const original=globalThis.fetch;const payloads:unknown[]=[];
 globalThis.fetch=async(_url,init)=>{
  const {p_payload:payload}=JSON.parse(String(init?.body));payloads.push(payload);
  return Response.json({ok:true,data:{resourceKey:'item:qa-item',token:'synthetic-update',expiresAt:'2030-01-01T00:00:00Z',holderName:'Synthetic',holderId:'qa-user',baseVersion:1}});
 };
 try{
  const api=createApiClient({url:'http://127.0.0.1:1',anonKey:'synthetic-public'});
  const lease=await api.claim('item','qa-item');await api.renew(lease);
  assert.deepEqual(payloads,[{kind:'item',id:'qa-item',intent:'update'},{kind:'item',id:'qa-item',intent:'update',leaseToken:'synthetic-update'}]);
 }finally{globalThis.fetch=original;}
});
