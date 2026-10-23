import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {reportingFixture} from './fpmc-reporting-fixture.ts';
import {buildRemarksExcel,buildRemarksPdf,buildImprovementsPdf,splitExcelBiText,buildImprovementsExcel} from '../src/reports.ts';
import {encodeRichText,RICH_COLORS,richTextRuns,compactRichText} from '../src/richText.ts';
import {remarksStatusDefinition} from '../src/itemRemarks.ts';

test('saved remarks workbook preserves four colors, bold and literal list text without annotations',async()=>{
 const state=reportingFixture(),text='1. Black 黑\n• Red 紅\n2. Blue 藍\n• Green 綠';
 let start=0;
 const spans=text.split('\n').map((line,i)=>{const span={start,end:start+line.length,bold:true as const,color:(['black','red','blue','green'] as const)[i]};start+=line.length+1;return span;});
 state.assessments[0].remarks=encodeRichText({text,spans,lists:[]});
 const before=JSON.stringify(state),bytes=await buildRemarksExcel(state,'TMSA','en');
 const saved=new ExcelJS.Workbook();await saved.xlsx.load(bytes as unknown as ExcelJS.Buffer);
 const cell=saved.worksheets[0].getCell('F5');assert.equal(cell.text,text,'Visible cells must never expose the persisted annotation');
 assert.equal(cell.type,ExcelJS.ValueType.RichText);
 const runs=(cell.value as ExcelJS.CellRichTextValue).richText;
 for(const [i,line] of text.split('\n').entries()){
  const run=runs.find(r=>r.text.includes(line));assert.ok(run,`Run missing ${line}`);
  assert.equal(run.font?.bold,true);assert.equal(run.font?.color?.argb,'FF'+Object.values(RICH_COLORS)[i].slice(1).toUpperCase());assert.equal(run.font?.size,12);
 }
 assert.equal(saved.worksheets[0].getCell('C5').font.color?.argb,'FF'+remarksStatusDefinition(state.assessments[0].remarksStatus)!.color.slice(1),'Business status color remains independent');
 assert.equal(JSON.stringify(state),before);
});

test('real PDF draws encoded CJK bold/fallback runs and keeps document title plain',async()=>{
 const state=reportingFixture(),text='1. Black 黑\n• Red 紅 CO₂ non‑breaking soft\u00adhyphen\n2. Blue 藍\n• Green 綠';let offset=0;
 const spans=text.split('\n').map((line,i)=>{const start=offset;offset+=line.length+1;return {start,end:start+line.length,bold:true as const,color:(['black','red','blue','green'] as const)[i]};});
 const value=encodeRichText({text,spans,lists:[]});state.improvements[0].content={en:value,zh:''};
 const fontBytes=new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf'));
 const fallbackFontBytes=['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(n=>new Uint8Array(readFileSync('public/fonts/'+n)));
 const options={fontBytes,fallbackFontBytes,boldFontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Bold.ttf')),boldFallbackFontBytes:[new Uint8Array(readFileSync('public/fonts/ReportSupplement-Bold.ttf'))]};
 const pdf=await PDFDocument.load(await buildImprovementsPdf(state,[state.improvements[0].id],'en',value,options));
 assert.equal(pdf.getTitle(),text);
 assert.ok(pdf.context.enumerateIndirectObjects().some(([,obj])=>obj.toString().includes('NotoSansTC-Bold')),'A genuine Bold font must be embedded');
});

test('PDF list soft line break keeps hanging indent, next item and ordinary paragraph reset it',async()=>{
 const state=reportingFixture(),text='1. first item\nsoft break in same item\n2. second item\noutside paragraph';
 const second=text.indexOf('2. '),outside=text.indexOf('outside');
 state.assessments[0].remarks=encodeRichText({text,spans:[],lists:[{start:0,end:second-1,kind:'ordered',ordinal:1},{start:second,end:outside-1,kind:'ordered',ordinal:2}]});
 const lines:import('../src/reports.ts').ReportFieldLine[]=[];
 await buildRemarksPdf(state,'TMSA','en',undefined,{fontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf')),onFieldLine:line=>lines.push(line)});
 const body=lines.filter(line=>/^remarks:\d+:2:0:0$/.test(line.fieldId));assert.equal(body.length,4);
 assert.ok(body[1].x>body[0].x,'Shift+Enter content must stay under list body, not marker');
 assert.equal(body[2].x,body[0].x);assert.equal(body[3].x,body[0].x);
});

test('improvement PDF deduplicates a title only when its formatting also matches',async t=>{
 const text='Check pumps',zh='檢查泵浦';
 const styled=(text:string,color:'red'|'blue',bold=false)=>encodeRichText({text,spans:[{start:0,end:text.length,color,...(bold?{bold:true}: {})}],lists:[]});
 const red=styled(text,'red',true),blue=styled(text,'blue'),redZh=styled(zh,'red',true);
 const cases=[
  {id:'styled-title-plain-body',title:red,content:{en:text,zh:''},expected:[red,text]},
  {id:'plain-title-styled-body',title:text,content:{en:blue,zh:''},expected:[text,blue]},
  {id:'different-styles',title:red,content:{en:blue,zh:''},expected:[red,blue]},
  {id:'same-rich-deduplicated',title:red,content:{en:red,zh:''},expected:[red]},
  {id:'same-plain-deduplicated',title:text,content:{en:text,zh:''},expected:[text]},
  {id:'bilingual-zh-title-style',title:redZh,content:{en:text,zh},expected:[redZh,text,zh]}
 ];
 const options={fontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf')),boldFontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Bold.ttf'))};
 for(const sample of cases)await t.test(sample.id,async()=>{
  const state=reportingFixture(false),row=state.improvements[0];row.title=sample.title;row.content=sample.content;row.plan='';row.events=[];
  const before=JSON.stringify(state),lines:import('../src/reports.ts').ReportFieldLine[]=[];
  const bytes=await buildImprovementsPdf(state,[row.id],'en',undefined,{...options,onFieldLine:line=>lines.push(line)});
  const content=lines.filter(line=>/^improvements:\d+:3:0:0$/.test(line.fieldId));
  if(process.env.RICH_TEXT_DUPLICATE_OUT){const out=process.env.RICH_TEXT_DUPLICATE_OUT;mkdirSync(out,{recursive:true});writeFileSync(join(out,sample.id+'.pdf'),bytes);writeFileSync(join(out,sample.id+'.json'),JSON.stringify({expected:sample.expected.map(richTextRuns),lines:content}));}
  assert.equal(content.length,sample.expected.length,'Equal text with different formatting must retain both field values');
  assert.equal(JSON.stringify(state),before);
 });
});

test('long bilingual continuation preserves every style offset and saved improvement progress',async()=>{
 const styled=(text:string)=>encodeRichText({text,spans:[{start:0,end:11,bold:true,color:'red'},{start:11,end:text.length-7,color:'blue'},{start:text.length-7,end:text.length,bold:true,color:'green'}],lists:[]});
 const value={en:styled('BEGIN field '+('office AVATAR complete phrase. '.repeat(1200))+' EN_END'),zh:styled('中文起首完整內容開始 '+('完整中文不得遺失，含數字123。'.repeat(900))+' 中文結尾完畢')};
 const chars=(value:string)=>richTextRuns(value).flatMap(run=>Array.from(run.text).map(text=>({text,bold:!!run.bold,color:run.color??null})));
 const parts=splitExcelBiText(value,260,14,'Microsoft JhengHei',10);assert.ok(parts.length>10);
 for(const lang of ['en','zh'] as const)assert.deepEqual(parts.flatMap(part=>chars(part[lang])),chars(compactRichText(value[lang])));
 const state=reportingFixture(),row=state.improvements[0];row.content=value;row.plan=value.zh;row.events[0].content=value.en;
 const saved=new ExcelJS.Workbook();await saved.xlsx.load(await buildImprovementsExcel(state,[row.id],'en') as unknown as ExcelJS.Buffer);
 const sheet=saved.getWorksheet('Progress')!,cells:ExcelJS.Cell[]=[];sheet.eachRow(r=>{if(r.number>=5&&r.getCell(3).value===1)cells.push(r.getCell(7));});
 const actual=cells.flatMap(cell=>(cell.value as ExcelJS.CellRichTextValue).richText.flatMap(run=>Array.from(run.text).map(text=>({text,bold:!!run.font?.bold,color:run.font?.color?.argb}))));
 const expected=richTextRuns(value.en).flatMap(run=>Array.from(run.text).map(text=>({text,bold:!!run.bold,color:'FF'+RICH_COLORS[run.color!].slice(1).toUpperCase()})));
 assert.deepEqual(actual,expected);assert.equal(cells.map(c=>c.text).join(''),value.en.slice(0,value.en.indexOf('\u001e')));
});
