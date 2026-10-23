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
const css=`@page{size:A3 landscape;margin:12mm}*{box-sizing:border-box}html{color:#202c38;background:white;font-family:Arial,"Microsoft JhengHei","PingFang TC","Noto Sans CJK TC",sans-serif;font-size:15pt;line-height:1.5}body{margin:0}h1,h2{font-size:17pt;margin:12pt 0 8pt;break-after:avoid}p{margin:0 0 8pt}.paragraph{margin-bottom:8pt}.line{white-space:pre-wrap;overflow-wrap:anywhere;min-height:1.5em;orphans:2;widows:2}.list-line{padding-left:1.5em;text-indent:-1.5em}table{border-collapse:collapse;table-layout:fixed;width:100%;margin:0 0 10pt;break-inside:auto}thead{display:table-header-group}tr,td,tbody{break-inside:auto}th,td{border:0.6pt solid #8195a6;padding:5pt 7pt;vertical-align:top;overflow-wrap:anywhere}th{font-size:14pt;text-align:left;background:#e3ebf2;font-weight:600}td{font-size:15pt}.record-key{font-size:14pt;background:#dce7ef}.warning th{background:#fff0c7}.aux{font-size:14pt}.screen-note{font-size:14pt;padding:8pt;background:#eef3f8;margin-bottom:12pt}button{font:inherit}@media screen{body{max-width:1120pt;margin:16pt auto;padding:0 12pt}}@media print{.screen-note{display:none}html,body{max-width:none;padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
export class HtmlReport implements ReportWriter<string> {
 private blocks:string[]=[];
 private title:string;
 private lang:Language;
 constructor(title:string,lang:Language){this.title=title;this.lang=lang;}
 static async create(title:string,lang:Language,_state:PlatformState,_options:ReportBuildOptions,_operational=false){return new HtmlReport(title,lang);}
 heading(text:string){this.blocks.push(`<h2>${reportRichHtml(text)}</h2>`);}
 paragraph(text:string,size=15){this.blocks.push(`<div class="paragraph${size<15?' aux':''}">${reportRichHtml(text)}</div>`);}
 private band(key:string,headers:string[],cells:string[],ratios?:number[],statusColumn?:number,status?:{background:string;color:string},warning=false){
  const weights=ratios??cells.map(()=>1),total=weights.reduce((a,b)=>a+b,0);
  const color=(value:string)=>/^#[0-9a-f]{6}$/i.test(value)?value:'#202c38';
  this.blocks.push(`<table${warning?' class="warning"':''}><colgroup>${cells.map((_,i)=>`<col style="width:${100*(weights[i]??1)/total}%">`).join('')}</colgroup><thead><tr><th class="record-key" colspan="${cells.length}">${reportRichHtml(key)}</th></tr><tr>${headers.map(h=>`<th>${reportRichHtml(h)}</th>`).join('')}</tr></thead><tbody><tr>${cells.map((c,i)=>`<td${i===statusColumn&&status?` style="background:${color(status.background)};color:${color(status.color)}"`:''}>${reportRichHtml(c||'—')}</td>`).join('')}</tr></tbody></table>`);
 }
 table(headers:string[],_ratios:number[],rows:PdfRow[],_layout:'auto'|'overview'='auto'){
  for(const row of rows)for(let i=0;i<headers.length;i++)this.band(row.key,[headers[i]],[row.cells[i]],undefined,undefined,undefined,row.warning);
 }
 groupedTable(key:string,rows:PdfGroupRow[],_prefix:string){
  for(const row of rows)for(const entry of row.entries??[row])this.band(key,entry.headers,entry.cells,entry.ratios,row.statusColumn,row.status);
 }
 async finish(){return `<!doctype html><html lang="${this.lang==='zh'?'zh-Hant':'en'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeReportHtml(richTextToPlainText(this.title))}</title><style>${css}</style></head><body><aside class="screen-note">${this.lang==='zh'?'授權報告快照。使用瀏覽器列印／另存為 PDF；關閉預覽不代表已保存。可按 Ctrl+P 再次列印。':'Authorized report snapshot. Print / Save as PDF in the browser; closing preview does not confirm saving. Use Ctrl+P to print again.'}</aside><main>${this.blocks.join('')}</main></body></html>`;}
}
