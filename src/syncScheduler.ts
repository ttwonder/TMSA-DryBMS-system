interface Clock {now:()=>number;setInterval:(fn:()=>void,ms:number)=>number;clearInterval:(id:number)=>unknown;setTimeout:(fn:()=>void,ms:number)=>number;clearTimeout:(id:number)=>unknown}
interface Options {read:()=>Promise<void>;onError:(error:unknown)=>void;win:Pick<Window,'addEventListener'|'removeEventListener'>;doc:Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>;nav:Pick<Navigator,'onLine'>;clock?:Clock}
/** Read-only scheduling; editor leases and save/replay are deliberately separate. */
export function startSyncScheduler({read,onError,win,doc,nav,clock={now:()=>performance.now(),setInterval:(fn,ms)=>window.setInterval(fn,ms),clearInterval:id=>window.clearInterval(id),setTimeout:(fn,ms)=>window.setTimeout(fn,ms),clearTimeout:id=>window.clearTimeout(id)}}:Options):()=>void {
 let disposed=false,running=false,queued=false,pending:number|undefined,lastWake=-Infinity;
 const eligible=()=>!disposed&&!doc.hidden&&nav.onLine!==false;
 const run=async()=>{
  if(!eligible()||running)return;
  running=true;
  try{await read();}catch(error){if(!disposed)onError(error);}
  finally{running=false;if(queued&&!disposed){queued=false;pending=clock.setTimeout(()=>{pending=undefined;void run();},250);}}
 };
 const wake=()=>{
  if(!eligible()||clock.now()-lastWake<250)return;
  lastWake=clock.now();
  if(running){queued=true;return;}
  if(pending===undefined)void run();
 };
 const timer=clock.setInterval(()=>{if(!running&&pending===undefined)void run();},10000);
 win.addEventListener('focus',wake);win.addEventListener('online',wake);doc.addEventListener('visibilitychange',wake);
 return ()=>{disposed=true;queued=false;clock.clearInterval(timer);if(pending!==undefined)clock.clearTimeout(pending);win.removeEventListener('focus',wake);win.removeEventListener('online',wake);doc.removeEventListener('visibilitychange',wake);};
}
