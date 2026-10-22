/** Safe string-backed rich text. All offsets are visible UTF-16 offsets, never HTML. */
export type RichColor = 'black' | 'red' | 'blue' | 'green';
export const RICH_COLORS: Readonly<Record<RichColor, string>> = Object.freeze({black:'#000000',red:'#c62828',blue:'#1565c0',green:'#237a35'});
export interface RichRun {text:string;bold?:boolean;color?:RichColor}
export interface RichSpan {start:number;end:number;bold?:boolean;color?:RichColor}
/** An item includes its literal prefix, excludes the separator newline, and may contain soft newlines. */
export interface RichList {start:number;end:number;kind:'ordered'|'bullet';ordinal?:number}
export interface RichDocument {text:string;spans:RichSpan[];lists:RichList[]}

// A suffix contains no user text or executable attributes: only version, lengths and numeric tuples.
const OPEN='\u001eRT1:', CLOSE='\u001f';
const COLORS:RichColor[]=['black','red','blue','green'];
const MAX_TEXT=1_000_000, MAX_RANGES=20_000, MAX_META=1_500_000;
const invisible=/[\s\u200b-\u200d\u2060\ufeff]/gu;
const integer=(x:unknown):x is number=>Number.isSafeInteger(x);
const record=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x);
const keys=(x:Record<string,unknown>,allowed:string[])=>Object.keys(x).every(k=>allowed.includes(k));
const boundary=(s:string,n:number)=>!(n>0&&n<s.length&&/[\uD800-\uDBFF]/u.test(s[n-1])&&/[\uDC00-\uDFFF]/u.test(s[n]));
const range=(text:string,start:unknown,end:unknown):boolean=>integer(start)&&integer(end)&&start>=0&&end>start&&end<=text.length&&boundary(text,start)&&boundary(text,end);

function validDocument(doc:unknown):doc is RichDocument {
 if(!record(doc)||!keys(doc,['text','spans','lists'])||typeof doc.text!=='string'||doc.text.length>MAX_TEXT||!Array.isArray(doc.spans)||!Array.isArray(doc.lists)||doc.spans.length>MAX_RANGES||doc.lists.length>MAX_RANGES)return false;
 const text=doc.text; let last=0;
 for(const span of doc.spans){
  if(!record(span)||!keys(span,['start','end','bold','color'])||!range(text,span.start,span.end)||Number(span.start)<last||('bold' in span&&span.bold!==true)||('color' in span&&!COLORS.includes(span.color as RichColor))||(!span.bold&&!span.color))return false;
  last=Number(span.end);
 }
 last=0;
 for(const list of doc.lists){
  if(!record(list)||!keys(list,['start','end','kind','ordinal'])||!range(text,list.start,list.end)||Number(list.start)<last)return false;
  const start=Number(list.start),end=Number(list.end);
  if((start!==0&&text[start-1]!=='\n')||(end!==text.length&&text[end]!=='\n'))return false;
  if(list.kind==='ordered'){
   if(!integer(list.ordinal)||list.ordinal<1||list.ordinal>999999||!text.slice(start,end).startsWith(`${list.ordinal}. `))return false;
  }else if(list.kind!=='bullet'||'ordinal' in list||!text.slice(start,end).startsWith('• '))return false;
  last=end;
 }
 return true;
}
function fromMetadata(meta:unknown,text:string):RichDocument|null {
 if(!record(meta)||Object.keys(meta).sort().join(',')!=='l,n,s'||!integer(meta.n)||meta.n<1||meta.n>MAX_TEXT||meta.n>text.length||!Array.isArray(meta.s)||!Array.isArray(meta.l)||meta.s.length>MAX_RANGES||meta.l.length>MAX_RANGES)return null;
 const fragment=text.slice(text.length-meta.n),spans:RichSpan[]=[],lists:RichList[]=[];
 for(const s of meta.s){
  if(!Array.isArray(s)||s.length!==4||!s.every(integer)||![0,1].includes(s[2])||s[3]<-1||s[3]>3)return null;
  spans.push({start:s[0],end:s[1],...(s[2]===1?{bold:true}:{}),...(s[3]>=0?{color:COLORS[s[3]]}:{})});
 }
 for(const l of meta.l){
  if(!Array.isArray(l)||l.length!==4||!l.every(integer)||![0,1].includes(l[2])||(l[2]===0&&l[3]!==0))return null;
  lists.push({start:l[0],end:l[1],kind:l[2]===1?'ordered':'bullet',...(l[2]===1?{ordinal:l[3]}:{})});
 }
 const doc={text:fragment,spans,lists};
 return validDocument(doc)&&(spans.length>0||lists.length>0)?doc:null;
}

/** Plain prefix + RS RT1:{n,s,l} US. s=[start,end,bold0or1,palette(-1..3)]; l=[start,end,ordered0or1,ordinal]. */
export function encodeRichText(doc:RichDocument):string {
 if(!validDocument(doc))throw new TypeError('Invalid rich-text document');
 const {text,spans,lists}=doc;
 if(!text||(!spans.length&&!lists.length))return text;
 let content=text;
 for(const list of [...lists].reverse())content=content.slice(0,list.start)+content.slice(list.start+(list.kind==='bullet'?2:`${list.ordinal}. `.length));
 if(!content.replace(invisible,''))return '';
 return text+OPEN+JSON.stringify({n:text.length,s:spans.map(s=>[s.start,s.end,s.bold?1:0,s.color?COLORS.indexOf(s.color):-1]),l:lists.map(l=>[l.start,l.end,l.kind==='ordered'?1:0,l.ordinal??0])})+CLOSE;
}

/** Decode every independently annotated fragment in a composed string. Invalid annotations remain literal. */
export function decodeRichText(value:string|undefined|null):RichDocument {
 const raw=value??'',doc:RichDocument={text:'',spans:[],lists:[]};
 let cursor=0,scan=0;
 while(scan<raw.length){
  const start=raw.indexOf(OPEN,scan);if(start<0)break;
  const end=raw.indexOf(CLOSE,start+OPEN.length);
  if(end<0)break;
  scan=end+CLOSE.length;
  if(end-start>MAX_META)continue;
  const before=raw.slice(cursor,start);let parsed:RichDocument|null=null;
  try{parsed=fromMetadata(JSON.parse(raw.slice(start+OPEN.length,end)),before);}catch{/* Literal malformed source is never executed or deleted. */}
  if(!parsed)continue;
  const offset=doc.text.length+before.length-parsed.text.length;
  doc.text+=before;
  doc.spans.push(...parsed.spans.map(s=>({...s,start:s.start+offset,end:s.end+offset})));
  doc.lists.push(...parsed.lists.map(l=>({...l,start:l.start+offset,end:l.end+offset})));
  cursor=end+CLOSE.length;
 }
 doc.text+=raw.slice(cursor);
 // Composition can place a complete list fragment inside a label/sentence. Keep the
 // real marker text and inline styles, but do not invent a block boundary there.
 doc.lists=doc.lists.filter(l=>(l.start===0||doc.text[l.start-1]==='\n')&&(l.end===doc.text.length||doc.text[l.end]==='\n'));
 return doc;
}
export function richTextToPlainText(value:string|undefined|null):string {return decodeRichText(value).text;}
export function isRichText(value:string):boolean {const d=decodeRichText(value);return !!(d.spans.length||d.lists.length);}
export function isRichTextEmpty(value:string|undefined|null):boolean {
 const d=decodeRichText(value);let text=d.text;
 for(const l of [...d.lists].reverse())text=text.slice(0,l.start)+text.slice(l.start+(l.kind==='bullet'?2:`${l.ordinal}. `.length));
 return !text.replace(invisible,'');
}
export function documentRuns(doc:RichDocument):RichRun[] {
 const result:RichRun[]=[];let offset=0;
 const add=(text:string,style:Omit<RichRun,'text'>={})=>{
  if(!text)return;
  const last=result.at(-1);
  if(last&&last.bold===style.bold&&last.color===style.color)last.text+=text;else result.push({text,...style});
 };
 for(const s of doc.spans){add(doc.text.slice(offset,s.start));add(doc.text.slice(s.start,s.end),{...(s.bold?{bold:true}:{}),...(s.color?{color:s.color}:{})});offset=s.end;}
 add(doc.text.slice(offset));return result;
}
export function richTextRuns(value:string):RichRun[] {return documentRuns(decodeRichText(value));}

function clippedDocument(doc:RichDocument,start:number,end:number):RichDocument {
 return {text:doc.text.slice(start,end),spans:doc.spans.filter(s=>s.end>start&&s.start<end).map(s=>({...s,start:Math.max(start,s.start)-start,end:Math.min(end,s.end)-start})),lists:doc.lists.filter(l=>l.start>=start&&l.end<=end).map(l=>({...l,start:l.start-start,end:l.end-start}))};
}
export function sliceRichText(value:string,start:number,end?:number):string {
 const doc=decodeRichText(value),len=doc.text.length;
 let a=Math.min(len,Math.max(0,Math.trunc(start)||0)),b=Math.min(len,Math.max(a,end===undefined?len:Math.trunc(end)||0));
 if(!boundary(doc.text,a))a--;if(!boundary(doc.text,b))b++;
 return encodeRichText(clippedDocument(doc,a,b));
}
function remapDocument(doc:RichDocument,text:string,map:number[],keepLists:boolean):RichDocument {
 const spans:RichSpan[]=[];let cursor=0;
 for(let i=0;i<map.length;i++){
  while(cursor<doc.spans.length&&doc.spans[cursor].end<=map[i])cursor++;
  const s=doc.spans[cursor];
  if(!s||s.start>map[i])continue;
  const last=spans.at(-1);
  if(last&&last.end===i&&last.bold===s.bold&&last.color===s.color)last.end=i+1;
  else spans.push({start:i,end:i+1,...(s.bold?{bold:true}:{}),...(s.color?{color:s.color}:{})});
 }
 const inverse=new Map(map.map((old,i)=>[old,i])),lists:RichList[]=[];
 if(keepLists)for(const list of doc.lists){
  const start=inverse.get(list.start),tail=inverse.get(list.end-1);
  if(start!==undefined&&tail!==undefined)lists.push({...list,start,end:tail+1});
 }
 return {text,spans,lists};
}
export function compactRichText(value:string):string {
 const doc=decodeRichText(value);let text='';const map:number[]=[];
 for(const match of doc.text.matchAll(/[^\r\n]+|(?<=^|\n|\r)(?=\r|\n|$)/gu)){
  const line=match[0];if(!/\S/u.test(line))continue;
  if(text){text+='\n';map.push(Math.max(0,match.index-1));}
  text+=line;for(let i=0;i<line.length;i++)map.push(match.index+i);
 }
 return encodeRichText(remapDocument(doc,text,map,true));
}
/** Display-only whitespace reflow, for the existing sentence formatter. Non-whitespace is never edited. */
export function reflowRichText(value:string,formatted:string):string {
 const doc=decodeRichText(value);if(doc.text.replace(/\s/gu,'')!==formatted.replace(/\s/gu,''))throw new TypeError('Reflow may change only whitespace');
 const map:number[]=[];let source=0;
 for(let i=0;i<formatted.length;i++){
  if(/\s/u.test(formatted[i])){map.push(Math.min(source,Math.max(0,doc.text.length-1)));if(/\s/u.test(doc.text[source]??''))source++;}
  else{while(source<doc.text.length&&/\s/u.test(doc.text[source]))source++;map.push(source++);}
 }
 return encodeRichText(remapDocument(doc,formatted,map,false));
}
const escapeHtml=(text:string)=>text.replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function inlineHtml(doc:RichDocument,start:number,end:number):string {
 const value=documentRuns(clippedDocument(doc,start,end)).map(run=>{
  let html=escapeHtml(run.text).replace(/\r\n?|\n/gu,'<br>');
  if(run.bold)html=`<b>${html}</b>`;
  if(run.color)html=`<span style="color:${RICH_COLORS[run.color]}">${html}</span>`;
  return html;
 }).join('');
 return value+(end>start&&/[\r\n]/u.test(doc.text[end-1])?'<br>':'');
}
/** Reconstruct trusted markup exclusively from validated text, palette spans and explicit list metadata. */
export function richTextToEditorHtml(value:string,singleLine=false):string {
 const doc=decodeRichText(value);if(!doc.text)return '';
 if(singleLine)return inlineHtml(doc,0,doc.text.length).replace(/<br>/gu,' ');
 const blocks:string[]=[];let pos=0,listIndex=0;
 while(pos<doc.text.length){
  const list=doc.lists[listIndex];
  if(list&&list.start===pos){
   const kind=list.kind,first=list.ordinal;let previous=0,body='';
   while(listIndex<doc.lists.length){
    const item=doc.lists[listIndex];
    if(item.start!==pos||item.kind!==kind||(kind==='ordered'&&body&&item.ordinal!==previous+1))break;
    const prefix=kind==='bullet'?2:`${item.ordinal}. `.length;
    body+=`<li>${inlineHtml(doc,item.start+prefix,item.end)||'<br>'}</li>`;
    previous=item.ordinal??0;pos=item.end+(doc.text[item.end]==='\n'?1:0);listIndex++;
   }
   blocks.push(kind==='ordered'?`<ol start="${first}">${body}</ol>`:`<ul>${body}</ul>`);
  }else{
   const newline=doc.text.indexOf('\n',pos),end=newline<0?doc.text.length:newline;
   const contentEnd=newline>=0&&end>pos&&doc.text[end-1]==='\r'?end-1:end;
   blocks.push(`<div>${inlineHtml(doc,pos,contentEnd)||'<br>'}</div>`);pos=end+1;
  }
 }
 if(doc.text.endsWith('\n'))blocks.push('<div><br></div>');
 return blocks.join('');
}

function palette(value:string):RichColor|undefined {
 const normalized=value.toLowerCase().replace(/\s/gu,'');
 const aliases:Record<string,RichColor>={black:'black',red:'red',blue:'blue',green:'green','#000':'black','rgb(0,0,0)':'black','rgb(198,40,40)':'red','rgb(21,101,192)':'blue','rgb(35,122,53)':'green'};
 return COLORS.find(c=>RICH_COLORS[c]===normalized)??aliases[normalized];
}
/** Read only supported semantics from a live editing DOM; never accepts persisted HTML. */
export function editorElementToDocument(root:HTMLElement,singleLine=false):RichDocument {
 type Style=Omit<RichRun,'text'>;
 const empty=():RichDocument=>({text:'',spans:[],lists:[]});
 const append=(target:RichDocument,part:RichDocument)=>{
  const offset=target.text.length;target.text+=part.text;
  target.spans.push(...part.spans.map(s=>({...s,start:s.start+offset,end:s.end+offset})));
  target.lists.push(...part.lists.map(l=>({...l,start:l.start+offset,end:l.end+offset})));
 };
 const textPart=(text:string,style:Style):RichDocument=>({text,spans:text&&(style.bold||style.color)?[{start:0,end:text.length,...style}]:[],lists:[]});
 const read=(node:Node,inherited:Style):RichDocument=>{
  if(node.nodeType===3)return textPart((node.textContent??'').replace(/\u00a0/gu,' '),inherited);
  if(node.nodeType!==1)return empty();
  const el=node as HTMLElement,tag=el.tagName;
  if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','IMG','VIDEO','AUDIO'].includes(tag))return empty();
  const style={...inherited};
  if(tag==='B'||tag==='STRONG')style.bold=true;
  if(el.style.fontWeight){if(el.style.fontWeight==='bold'||Number(el.style.fontWeight)>=600)style.bold=true;else delete style.bold;}
  const color=palette(el.style.color||el.getAttribute('color')||'');if(color)style.color=color;
  if(tag==='OL'||tag==='UL'){
   const out=empty();let ordinal=Math.max(1,Math.min(999999,Number.parseInt(el.getAttribute('start')||'1',10)||1));
   for(const item of Array.from(el.children)){
    if(item.tagName!=='LI')continue;
    if(out.lists.length)out.text+='\n';
    const start=out.text.length,prefix=tag==='OL'?`${ordinal}. `:'• ';
    append(out,textPart(prefix,style));const content=children(item as HTMLElement,style);content.lists=[];append(out,content);
    out.lists.push({start,end:out.text.length,kind:tag==='OL'?'ordered':'bullet',...(tag==='OL'?{ordinal}: {})});ordinal++;
   }
   return out;
  }
  return children(el,style);
 };
 const children=(parent:HTMLElement,style:Style):RichDocument=>{
  const out=empty();let hasPart=false,previousBlock=false;
  const nodes=Array.from(parent.childNodes);
  for(let i=0;i<nodes.length;i++){
   const node=nodes[i],tag=node.nodeType===1?(node as HTMLElement).tagName:'';
   if(tag==='BR'){
    // Chromium keeps a terminal BR as its empty-line/caret placeholder.
    if(i<nodes.length-1)append(out,textPart('\n',style));
    hasPart=true;previousBlock=false;continue;
   }
   const block=['DIV','P','OL','UL','LI','BLOCKQUOTE','H1','H2','H3','PRE'].includes(tag);
   if(hasPart&&(block||previousBlock)&&(previousBlock||!out.text.endsWith('\n')))out.text+='\n';
   append(out,read(node,style));hasPart=true;previousBlock=block;
  }
  return out;
 };
 const doc=children(root,{});
 // Native commands may create adjacent equivalent wrappers. Canonical spans keep the suffix small.
 const spans:RichSpan[]=[];
 for(const span of doc.spans){const last=spans.at(-1);if(last&&last.end===span.start&&last.bold===span.bold&&last.color===span.color)last.end=span.end;else spans.push(span);}
 doc.spans=spans;
 if(singleLine){doc.text=doc.text.replace(/[\r\n]/gu,' ');doc.lists=[];}
 return doc;
}
