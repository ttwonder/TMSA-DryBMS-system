import assert from 'node:assert/strict';
import test from 'node:test';
import {startSyncScheduler} from '../src/syncScheduler.ts';
const tick=()=>new Promise<void>(r=>setImmediate(r));
function harness(){
 let time=0,id=0;const jobs=new Map<number,{at:number;fn:()=>void;every?:number}>();const win=new EventTarget(),doc=Object.assign(new EventTarget(),{hidden:false});const nav={onLine:true};
 const timer=(fn:()=>void,ms:number,every?:number)=>{jobs.set(++id,{at:time+ms,fn,every});return id;};
 const clock={now:()=>time,setInterval:(fn:()=>void,ms:number)=>timer(fn,ms,ms),clearInterval:(i:number)=>jobs.delete(i),setTimeout:(fn:()=>void,ms:number)=>timer(fn,ms),clearTimeout:(i:number)=>jobs.delete(i)};
 const advance=async(ms:number)=>{const end=time+ms;while(true){const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;if(next[1].every)next[1].at+=next[1].every;else jobs.delete(next[0]);next[1].fn();await tick();}time=end;};
 return {win,doc,nav,clock,advance,jobs};
}
test('10 second foreground tick, hidden skip, visible/focus/online immediate coalescing',async()=>{
 const h=harness();let calls=0;const stop=startSyncScheduler({...h,read:async()=>{calls++;},onError:()=>{throw Error('unexpected');}});
 await h.advance(9999);assert.equal(calls,0);await h.advance(1);assert.equal(calls,1);h.doc.hidden=true;await h.advance(10000);assert.equal(calls,1);h.doc.hidden=false;h.doc.dispatchEvent(new Event('visibilitychange'));h.win.dispatchEvent(new Event('focus'));h.win.dispatchEvent(new Event('online'));await tick();assert.equal(calls,2);stop();assert.equal(h.jobs.size,0);
});
test('single flight, at most one queued catchup, no error retry loop',async()=>{
 const h=harness();let calls=0,errors=0,release!:()=>void;const hold=new Promise<void>(r=>release=r);const stop=startSyncScheduler({...h,read:async()=>{calls++;if(calls===1)await hold;else throw Error('network');},onError:()=>{errors++;}});
 h.win.dispatchEvent(new Event('focus'));await h.advance(500);for(let i=0;i<9;i++)h.win.dispatchEvent(new Event('online'));assert.equal(calls,1);release();await tick();await h.advance(250);assert.equal(calls,2);assert.equal(errors,1);await h.advance(1000);assert.equal(calls,2);stop();
});
test('offline wake does not read or claim success; disposal fences late errors',async()=>{
 const h=harness();let calls=0,errors=0,reject!:(e:Error)=>void;const hold=new Promise<void>((_,r)=>reject=r);const stop=startSyncScheduler({...h,read:async()=>{calls++;await hold;},onError:()=>{errors++;}});
 h.nav.onLine=false;h.win.dispatchEvent(new Event('online'));await h.advance(10000);assert.equal(calls,0);h.nav.onLine=true;h.win.dispatchEvent(new Event('online'));assert.equal(calls,1);stop();reject(Error('late'));await tick();assert.equal(errors,0);assert.equal(h.jobs.size,0);
});
