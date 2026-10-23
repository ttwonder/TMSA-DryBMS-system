import {compactRichText,decodeRichText,richTextRuns,richTextToPlainText,sliceRichText,RICH_COLORS} from './richText.ts';
import type {Language,PlatformState} from './types.ts';
import type {PdfRow,PdfGroupRow,ReportBuildOptions,ReportWriter} from './reports.ts';

export const escapeReportHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const safeText=(value:string)=>escapeReportHtml(value.replace(/[\u0095\u0099\u009c]/g,'•').replace(/\t/g,'    '));
/** Reconstruct fixed markup from validated text runs; source is never HTML or a URL. */
export function reportRichHtml(value:string):string {
 const compact=compactRichText(value),doc=decodeRichText(compact);let start=0;
 return doc.text.split('\n').map(line=>{
  const list=doc.lists.find(l=>l.start<=start&&l.end>start);
  const runs=richTextRuns(sliceRichText(compact,start,start+line.length));start+=line.length+1;
  return `<div class="line${list?' list-line':''}">${runs.map(run=>{let s=safeText(run.text);if(run.bold)s=`<strong>${s}</strong>`;return run.color?`<span style="color:${RICH_COLORS[run.color]}">${s}</span>`:s;}).join('')||'<br>'}</div>`;
 }).join('');
}
const css=`@page{size:A3 landscape;margin:10mm}*{box-sizing:border-box}html{color:#202c38;background:white;font-family:Arial,"Microsoft JhengHei","PingFang TC","Noto Sans CJK TC",sans-serif;font-size:12pt;line-height:1.25}body{margin:0}h1,h2{font-size:17pt;margin:7pt 0 4pt;break-after:avoid}p{margin:0 0 4pt}.paragraph{margin-bottom:4pt}.line{white-space:pre-wrap;overflow-wrap:anywhere;min-height:1.25em;orphans:2;widows:2}.list-line{padding-left:1.5em;text-indent:-1.5em}table{border-collapse:collapse;table-layout:fixed;width:100%;margin:0 0 5pt;break-inside:auto}thead{display:table-header-group}tr,td,tbody{break-inside:auto}th,td{border:0.6pt solid #8195a6;padding:3pt 4pt;vertical-align:top;overflow-wrap:anywhere;font-size:12pt}th{text-align:left;background:#e3ebf2;font-weight:600}.record-key{background:#dce7ef}.field-label{font-weight:600;background:#f1f5f8}.warning th{background:#fff0c7}.aux{font-size:12pt}.screen-note{font-size:12pt;padding:6pt;background:#eef3f8;margin-bottom:8pt}button{font:inherit}@media screen{body{max-width:1120pt;margin:12pt auto;padding:0 10pt}}@media print{.screen-note{display:none}html,body{max-width:none;padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
export class HtmlReport implements ReportWriter<string> {
 private blocks:string[]=[];
 private title:string;
 private lang:Language;
 constructor(title:string,lang:Language){this.title=title;this.lang=lang;}
 setSuggestedName(name:string){this.title=name;}
 static async create(title:string,lang:Language,_state:PlatformState,_options:ReportBuildOptions,_operational=false){return new HtmlReport(title,lang);}
 heading(text:string){this.blocks.push(`<h2>${reportRichHtml(text)}</h2>`);}
 paragraph(text:string,size=12){this.blocks.push(`<div class="paragraph${size<15?' aux':''}">${reportRichHtml(text)}</div>`);}
 private band(key:string,headers:string[],cells:string[],ratios?:number[],statusColumn?:number,status?:{background:string;color:string},warning=false){
  const weights=ratios??cells.map(()=>1),total=weights.reduce((a,b)=>a+b,0);
  const color=(value:string)=>/^#[0-9a-f]{6}$/i.test(value)?value:'#202c38';
  this.blocks.push(`<table${warning?' class="warning"':''}><colgroup>${cells.map((_,i)=>`<col style="width:${100*(weights[i]??1)/total}%">`).join('')}</colgroup><thead><tr><th class="record-key" colspan="${cells.length}">${reportRichHtml(key)}</th></tr><tr>${headers.map(h=>`<th>${reportRichHtml(h)}</th>`).join('')}</tr></thead><tbody><tr>${cells.map((c,i)=>`<td${i===statusColumn&&status?` style="background:${color(status.background)};color:${color(status.color)}"`:''}>${reportRichHtml(c||'—')}</td>`).join('')}</tr></tbody></table>`);
 }
 /** Separate disproportionately tall fields; keep short metadata in one row. */
 private compactRows(row:PdfGroupRow):PdfGroupRow[]{
  if(row.cells.length<2)return [row];
  const weights=row.ratios??row.cells.map(()=>1),total=weights.reduce((a,b)=>a+b,0);
  const countLines=(cell:string,width:number)=>richTextToPlainText(cell).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(Array.from(line).reduce((sum,c)=>sum+(/[\u2e80-\uffff]/u.test(c)?12:6),0)/Math.max(20,width))),0);
  const lines=row.cells.map((cell,i)=>countLines(cell,1120*weights[i]/total-8));
  const tall=lines.map((n,i)=>n>6?i:-1).filter(i=>i>=0);if(!tall.length)return [row];
  const short=row.cells.map((_,i)=>i).filter(i=>!tall.includes(i));
  const originalCost=Math.max(...lines)+Math.max(...row.headers.map((h,i)=>countLines(h,1120*weights[i]/total-8)))+1;
  const flowCost=(short.length?Math.max(...short.map(i=>lines[i]))+Math.max(...short.map(i=>countLines(row.headers[i]??'',1120*weights[i]/total-8)))+1:0)+tall.reduce((n,i)=>n+countLines(row.cells[i],1112)+countLines(row.headers[i]??'',1112)+1,0);
  if(flowCost>=originalCost)return [row];
  const select=(indexes:number[]):PdfGroupRow=>({headers:indexes.map(i=>row.headers[i]),cells:indexes.map(i=>row.cells[i]),ratios:indexes.map(i=>weights[i]),...(row.statusColumn!==undefined&&indexes.includes(row.statusColumn)?{statusColumn:indexes.indexOf(row.statusColumn),status:row.status}:{})});
  return [...(short.length?[select(short)]:[]),...tall.map(i=>select([i]))];
 }
 table(headers:string[],ratios:number[],rows:PdfRow[],_layout:'auto'|'overview'='auto'){
  for(const row of rows){const bands=this.compactRows({headers,cells:row.cells,ratios});if(bands.length===1)this.band(row.key,headers,row.cells,ratios,undefined,undefined,row.warning);else this.groupedTable(row.key,bands,'',row.warning);}
 }
 groupedTable(key:string,rows:PdfGroupRow[],_prefix:string,warning=false){
  const body=rows.flatMap(row=>(row.entries??[row]).flatMap(entry=>this.compactRows({...entry,statusColumn:row.statusColumn,status:row.status})).map(entry=>{
   const weights=entry.ratios??entry.cells.map(()=>1),total=weights.reduce((a,b)=>a+b,0);let used=0;
   return `<tr>${entry.cells.map((cell,i)=>{const span=i===entry.cells.length-1?100-used:Math.max(1,Math.round(100*weights[i]/total));used+=span;const status=i===entry.statusColumn?entry.status:undefined;return `<td colspan="${span}"${status?` style="background:${/^#[0-9a-f]{6}$/i.test(status.background)?status.background:'#ffffff'};color:${/^#[0-9a-f]{6}$/i.test(status.color)?status.color:'#202c38'}"`:''}><div class="field-label">${reportRichHtml(entry.headers[i]??'')}</div>${reportRichHtml(cell||'—')}</td>`;}).join('')}</tr>`;
  })).join('');
  this.blocks.push(`<table class="grouped${warning?' warning':''}"><colgroup>${'<col style="width:1%">'.repeat(100)}</colgroup><thead><tr><th class="record-key" colspan="100">${reportRichHtml(key)}</th></tr></thead><tbody>${body}</tbody></table>`);
 }
 async finish(){return `<!doctype html><html lang="${this.lang==='zh'?'zh-Hant':'en'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeReportHtml(richTextToPlainText(this.title))}</title><style>${css}</style></head><body><aside class="screen-note">${this.lang==='zh'?'授權報告快照。使用瀏覽器列印／另存為 PDF；關閉預覽不代表已保存。可按 Ctrl+P 再次列印。':'Authorized report snapshot. Print / Save as PDF in the browser; closing preview does not confirm saving. Use Ctrl+P to print again.'}</aside><main>${this.blocks.join('')}</main></body></html>`;}
}
