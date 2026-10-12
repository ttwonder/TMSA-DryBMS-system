/** Display-only reflow: never edit source text or persistence values. */
const listStart = /^(?:[•●▪◦‣⁃*\-–—](?:\s+|$)|\(?\d+(?:\.\d+)*[.)]\s+|[a-zA-Z][.)]\s+|[ivxlcdmIVXLCDM]+[.)]\s+|\([a-zA-Z\d]+\)\s+)/u;
const cjkEdge = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}，。、；：！？「」『』（）【】《》]/u;
const abbreviation = /^(?:Mr|Mrs|Ms|Dr|Prof|Capt|St|vs|etc|No|Nos|Fig|Sec|Art|Dept|Co|Ltd|Inc|approx|cf|pp|Vol|al|e\.g|i\.e)\.$/i;

function joinWrap(left:string,right:string):string {
 const a=left.at(-1)??'',b=right[0]??'';
 const gap=cjkEdge.test(a)||cjkEdge.test(b)||(/[-‐‑]/u.test(a)&&/\p{L}/u.test(b))?'':' ';
 return left+gap+right;
}

function sentenceLines(text:string):string {
 return text.replace(/([.!?。！？][)"'’”」』）]*)(\s+|(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]))(?=\S)/gu,(match,ending:string,_gap:string,offset:number)=>{
  const next=text[offset+match.length]??'';
  if(ending[0]==='.') {
   if(!/[A-Z\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(next))return match;
   const prefix=text.slice(0,offset+1);
   const token=(prefix.match(/[^\s]+$/u)?.[0]??'').replace(/^[('"“‘]+/u,'');
   if(abbreviation.test(token)||/^(?:[A-Z]\.)+$/u.test(token))return match;
   // A leading list ordinal is not a sentence-ending period.
   if(/^(?:\d+(?:\.\d+)*|[a-zA-Z]|[ivxlcdmIVXLCDM]+)\.$/u.test(prefix.trim()))return match;
  }
  return ending+'\n';
 });
}

/** Keep authored line boundaries; remove only empty display lines. */
export function compactBlankLines(text:string):string {
 return text.split(/\r\n?|\n/u).filter(line=>/\S/u.test(line)).join('\n');
}

export function formatStandardText(text:string):string {
 const lines=text.split(/\r\n?|\n/u).map(line=>line.trim().replace(/[^\S\r\n]+/gu,' ')).filter(Boolean);
 const blocks:string[]=[];
 let current='';
 for(const line of lines) {
  if(current&&(listStart.test(line)||/[:：]$/u.test(current))) {blocks.push(current);current='';}
  current=current?joinWrap(current,line):line;
 }
 if(current)blocks.push(current);
 return blocks.map(sentenceLines).join('\n');
}
