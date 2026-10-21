import {PRODUCT_NAME_EN} from './branding.ts';
import {improvementSourceLabel} from './improvementTracking.ts';
import {compactBlankLines} from './standardText.ts';
import {filterImprovementList,type ImprovementListFilters} from './improvementList.ts';
import {hasItemRemarks,remarksStatusDefinition,remarksStatusLabel} from './itemRemarks.ts';
import {findingClassificationLabel,improvementFindingClassification} from './findingClassification.ts';
import type ExcelJS from 'exceljs';
import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
// Heavy libraries execute only when an export is requested.
const loadExcel = async () => (await import('exceljs')).default;
const loadZip = async () => (await import('jszip')).default;
let rgb:typeof import('pdf-lib')['rgb'];
import type { Assessment, BiText, Chapter, ExportRequest, FrameworkId, Improvement, Inspection, Language, PageProps, PlatformState, BrowseState, SourceLocator, StandardItem } from './types.ts';
import { assessmentFor, currentIncludesTmsa14, inspectionIncludesTmsa14, departmentsLabel, filteredImprovements, frameworkScore, hasPermission, inspectionScore, openIssuesFor, peopleLabel, type Filters } from './domain.ts';

export interface ReportFieldLine {fieldId:string;page:number;x:number;baseline:number;width:number;size:number}
export interface ReportBuildOptions { templateBytes?:Uint8Array; fontBytes?:Uint8Array; fallbackFontBytes?:Uint8Array[]; onFieldLine?:(line:ReportFieldLine)=>void; }
const assetUrl = (path:string) => `${(import.meta as ImportMeta & {env?:{BASE_URL?:string}}).env?.BASE_URL ?? '/'}${path}`;
async function assetBytes(path:string):Promise<Uint8Array> {
  const response=await fetch(assetUrl(path));
  if(!response.ok) throw new Error(`Report asset unavailable: ${path} (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}
const tr=(lang:Language,zh:string,en:string)=>lang==='zh'?zh:en;
export const bilingual=(value:BiText|undefined)=>value?compactBlankLines([value.en,value.zh].filter(x=>x!=='').join('\n')):'';
export function sourceLabel(source:SourceLocator):string {
  return [source.source,source.file,source.sheet,source.cell,source.pages?.length?`p.${source.pages.join(',')}`:'',source.rawItem?`Item ${source.rawItem}`:'',source.note].filter(Boolean).join(' | ');
}
const sourcesText=(sources:SourceLocator[])=>sources.map(sourceLabel).join('\n');
const unique=(ids:string[])=>[...new Set(ids)];
function selectedChapters(state:BrowseState,frameworkId:FrameworkId,ids?:string[]):Chapter[] {
  if(ids && (!ids.length || unique(ids).length!==ids.length)) throw new Error('Choose a nonempty, unique chapter selection / 請明選有效分章');
  const chapters=state.chapters.filter(c=>c.active&&c.frameworkId===frameworkId&&(!ids||ids.includes(c.id))).sort((a,b)=>a.order-b.order||a.code.localeCompare(b.code));
  if(!chapters.length||ids?.some(id=>!chapters.some(c=>c.id===id))) throw new Error('Selected chapter is unavailable / 選取分章已停用或不存在');
  if(!state.frameworks.some(f=>f.id===frameworkId&&f.active)) throw new Error('Framework unavailable / 框架不可用');
  return chapters;
}
/** Select only current, active items within the explicitly authorized chapter scope. */
export function selectedRemarkRows(state:BrowseState,frameworkId:FrameworkId,chapterIds?:string[]) {
  if(state.viewScope==='management_viewer')throw new Error('FORBIDDEN');
  return selectedChapters(state,frameworkId,chapterIds).flatMap(chapter=>state.items
    .filter(item=>item.active&&item.frameworkId===frameworkId&&item.chapterId===chapter.id)
    .sort((a,b)=>a.level-b.level||a.order-b.order||a.code.localeCompare(b.code))
    .flatMap(item=>{const assessment=assessmentFor(state,item.id);return assessment&&hasItemRemarks(assessment)?[{chapter,item,assessment}]:[];}));
}
const noRemarks=()=>new Error('No remarks in selected chapters / 所選章節沒有已填寫的備註');
export function selectedImprovementRows(state:BrowseState,ids:string[],filters?:ImprovementListFilters):Improvement[] {
  if(state.viewScope==='management_viewer')throw new Error('FORBIDDEN');
  if(!ids.length||unique(ids).length!==ids.length) throw new Error('Explicit nonempty improvement selection required / 請明選改善項目');
  const eligible=filters?filterImprovementList(state,filters):state.improvements;
  const rows=ids.map(id=>eligible.find(row=>row.id===id));
  if(rows.some(row=>!row)) throw new Error('Selected improvement no longer matches authorized scope / 改善已不符合授權或篩選');
  return rows as Improvement[];
}
export function assessmentNarrative(state:PlatformState,a:Assessment|undefined):BiText {
  if(!a)return {en:'Not assessed',zh:'未評定'};
  const texts:BiText[]=[];
  if(a.initialDepartmentResponses?.length) texts.push({en:`[Current assessment v${a.version}; ${a.updatedAt}]`,zh:`[目前自評 v${a.version}；${a.updatedAt}]`});
  texts.push(a.selfAssessment);
  texts.push({en:`Reviewed: ${a.reviewed?'Yes':'No'} | Conformity: ${a.conformity} | Execution: ${a.executionStatus}\nAssignees: ${peopleLabel(state,a.assigneeIds)}`,zh:`完成更新：${a.reviewed?'是':'否'} | 符合程度：${{all:'全部',partial:'部分',none:'無'}[a.conformity]} | 執行：${{not_started:'未開始',in_progress:'進行中',completed:'完成'}[a.executionStatus]}\n執行人：${peopleLabel(state,a.assigneeIds)}`});
  if(a.note)texts.push(a.note);
  if(a.sources.length) texts.push({en:`Current source: ${sourcesText(a.sources)}`,zh:`目前來源：${sourcesText(a.sources)}`});
  for(const initial of a.initialDepartmentResponses??[]) {
    texts.push({en:`[Initial departmental response: ${departmentsLabel(state,[initial.departmentId],'en')} | Y/N: ${initial.response??'Unknown'} | ${sourceLabel(initial.source)}]\n${initial.assessment.en}`,zh:`[初始部門回覆：${departmentsLabel(state,[initial.departmentId],'zh')} | Y/N：${initial.response??'未知'} | ${sourceLabel(initial.source)}]\n${initial.assessment.zh}`});
  }
  return {en:texts.map(x=>x.en).filter(Boolean).join('\n\n'),zh:texts.map(x=>x.zh).filter(Boolean).join('\n\n')};
}
function evidenceNarrative(a:Assessment|undefined):BiText {
  if(!a)return {en:'',zh:''};
  const texts=[a.evidence,...(a.initialDepartmentResponses??[]).map(r=>({en:`[Initial evidence | ${sourceLabel(r.source)}]\n${r.evidence.en}`,zh:`[初始證據 | ${sourceLabel(r.source)}]\n${r.evidence.zh}`}))];
  return {en:texts.map(x=>x.en).join('\n\n'),zh:texts.map(x=>x.zh).join('\n\n')};
}
function itemGuidance(item:StandardItem):BiText {
  const notes:BiText[]=[item.guidance];
  if(item.analysisIndex)notes.push({en:'Analysis index, NOT an official DRYBMS clause number. Suggested Objective Evidence remains advisory.',zh:'分析索引，非官方 DRYBMS 條款編號；Suggested Objective Evidence 為建議證據。'});
  if(item.sourceGap)notes.push({en:`Source gap (${item.sourceGapResolved?'resolved':'UNRESOLVED'}): ${item.sourceGap}`,zh:`來源缺口（${item.sourceGapResolved?'已補齊':'未補齊'}）：${item.sourceGap}`});
  for(const original of item.sourceOriginals??[])notes.push({en:`[Source original ${original.id} | ${original.kind} | p.${original.page}]\n${original.en}`,zh:`[來源原文 ${original.id} | ${original.kind} | p.${original.page}，上方英文原文非逐條中文譯文]`});
  if(item.crosswalk)notes.push({en:`[Analysis crosswalk]\nTMSA: ${item.crosswalk.tmsaItemCodes.join(', ')}\nMatch: ${item.crosswalk.match}\nDifference: ${item.crosswalk.difference}\nAttention: ${item.crosswalk.attention}`,zh:`[分析對照]\nTMSA：${item.crosswalk.tmsaItemCodes.join(', ')}\n匹配：${item.crosswalk.match}\n差異：${item.crosswalk.difference}\n注意：${item.crosswalk.attention}`});
  if(item.sources.length)notes.push({en:`Source: ${sourcesText(item.sources)}`,zh:`來源：${sourcesText(item.sources)}`});
  return {en:notes.map(x=>x.en).filter(Boolean).join('\n\n'),zh:notes.map(x=>x.zh).filter(Boolean).join('\n\n')};
}

// Font-aware browser measurement; conservative Unicode widths in headless QA.
let excelMeasureContext:CanvasRenderingContext2D|null|undefined;
function excelCharWidth(text:string,size:number,fontName:string):number {
  if(typeof document!=='undefined') {
    if(excelMeasureContext===undefined)excelMeasureContext=document.createElement('canvas').getContext('2d');
    if(excelMeasureContext){excelMeasureContext.font=`${size*96/72}px "${fontName}"`;return excelMeasureContext.measureText(text).width*72/96;}
  }
  return Array.from(text).reduce((sum,c)=>sum+(/[\u2E80-\uFFFF]/u.test(c)?size:size*0.68),0);
}
function splitMeasured(text:string,width:number,size:number,name:string,maxLines:number):string[] {
  if(!text)return [''];
  const chunks:string[]=[];let chunk='',line='',lines=1;
  for(const char of Array.from(text)) {
    if(chunk.length+char.length>30000){chunks.push(chunk);chunk='';line='';lines=1;}
    if(char==='\n') {
      if(lines>=maxLines){chunks.push(chunk+char);chunk='';line='';lines=1;continue;}
      chunk+=char;line='';lines++;continue;
    }
    if(line && excelCharWidth(line+char,size,name)>width) {
      if(lines>=maxLines){chunks.push(chunk);chunk='';lines=1;}else lines++;
      line='';
    }
    chunk+=char;line+=char;
  }
  if(chunk)chunks.push(chunk);
  return chunks.length?chunks:[''];
}
export function splitExcelBiText(value:BiText,width:number,size=11,name='Noto Sans TC',maxLines=16):{en:string;zh:string;text:string}[] {
  const en=splitMeasured(compactBlankLines(value.en),width,size,name,Math.max(1,Math.floor((maxLines-1)/2)));
    const zh=splitMeasured(compactBlankLines(value.zh),width,size,name,Math.max(1,Math.floor((maxLines-1)/2)));
  return Array.from({length:Math.max(en.length,zh.length)},(_,i)=>({en:en[i]??'',zh:zh[i]??'',text:[en[i]??'',zh[i]??''].filter(x=>x!=='').join('\n')}));
}
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const fallbackSide:Partial<ExcelJS.Border>={style:'thin',color:{argb:'FF8C99A6'}};
function tableBorder(cell:ExcelJS.Cell) {
  const previous=cell.border??{};
  cell.border={...previous,top:previous.top?.style?previous.top:fallbackSide,bottom:previous.bottom?.style?previous.bottom:fallbackSide,left:previous.left?.style?previous.left:fallbackSide,right:previous.right?.style?previous.right:fallbackSide};
}
export async function ensureNativeExcelCompatibility(bytes:Uint8Array):Promise<Uint8Array> {
  const JSZip=await loadZip();
  const zip=await JSZip.loadAsync(bytes);
  for(const [path,file] of Object.entries(zip.files)) {
    if(!/^xl\/worksheets\/sheet\d+\.xml$/.test(path))continue;
    let xml=await file.async('string');
    // ECMA sheetPr requires outlinePr before pageSetUpPr; ExcelJS 4.4 inverts them.
    xml=xml.replace(/(<sheetPr[^>]*>)([\s\S]*?)(<\/sheetPr>)/g,(_all,open:string,inside:string,close:string)=>{
      const tabs=inside.match(/<tabColor\b[^>]*\/>/g)??[];
      const outlines=inside.match(/<outlinePr\b[^>]*\/>/g)??[];
      const setup=inside.match(/<pageSetUpPr\b[^>]*\/>/g)??[];
      return open+tabs.join('')+outlines.join('')+setup.join('')+inside.replace(/<(?:tabColor|outlinePr|pageSetUpPr)\b[^>]*\/>/g,'')+close;
    });
    zip.file(path,xml);
  }
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
function newChapterSheet(book:ExcelJS.Workbook,name:string,styleSource?:ExcelJS.Worksheet):ExcelJS.Worksheet {
  const sheet=book.addWorksheet(name.slice(0,31).replace(/[\\/?*\[\]:]/g,'_'));
  for(let c=1;c<=7;c++) sheet.getColumn(c).width=styleSource?.getColumn(c).width??[10,32,55,6,62,42,12][c-1];
  for(let r=1;r<=7;r++) {
    sheet.getRow(r).height=styleSource?.getRow(r).height??(r===6?45:24);
    for(let c=1;c<=7;c++)sheet.getCell(r,c).style=clone(styleSource?.getCell(r===7?7:r,c).style??{});
  }
  sheet.mergeCells('A1:G1');
  sheet.pageSetup=clone(styleSource?.pageSetup??{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0});
  sheet.views=[{state:'frozen',ySplit:6,xSplit:1}];
  return sheet;
}
function responseText(a:Pick<Assessment,'response'>|undefined){return a?.response==='yes'?'Y':a?.response==='no'?'N':'?';}

/** Real OOXML; TMSA always starts from the sanitized 20-sheet source-style asset. */
export async function buildFrameworkExcel(state:PlatformState,frameworkId:FrameworkId,lang:Language,chapterIds?:string[],options:ReportBuildOptions={}):Promise<Uint8Array> {
  const chapters=selectedChapters(state,frameworkId,chapterIds);
  const [ExcelJS,JSZip]=await Promise.all([loadExcel(),loadZip()]);
  const template=new ExcelJS.Workbook();
  const templateBytes=options.templateBytes??await assetBytes('templates/tmsa-template.xlsx');
  const templateArchive=await JSZip.loadAsync(templateBytes);
  if(Object.keys(templateArchive.files).some(path=>/comments\d*\.xml$/i.test(path)))throw new Error('Template annotations/comments are forbidden / 空白樣板不得包含來源註解');
  await template.xlsx.load(templateBytes as unknown as ExcelJS.Buffer);
  if(template.worksheets.length!==20)throw new Error('TMSA style template must have 20 sheets');
  const book=frameworkId==='TMSA'?template:new ExcelJS.Workbook();
  const reference=template.worksheets[0];
  const selectedSheets=new Set<number>();
  const year=/^\d{4}/.exec(state.serverTime)?.[0]??'Current';
  for(const chapter of chapters) {
    const items=state.items.filter(i=>i.active&&i.frameworkId===frameworkId&&i.chapterId===chapter.id).sort((a,b)=>a.order-b.order||a.code.localeCompare(b.code));
    let sheet=frameworkId==='TMSA'?book.getWorksheet(`E${chapter.code}`):undefined;
    if(!sheet&&frameworkId==='TMSA')sheet=book.worksheets.find(s=>items.some(i=>i.sources.some(loc=>loc.sheet===s.name))&&!selectedSheets.has(s.id));
    if(!sheet)sheet=newChapterSheet(book,`${frameworkId==='TMSA'?'E':'D'}${chapter.code}`,reference);
    if(selectedSheets.has(sheet.id))throw new Error('Two chapters map to the same source sheet');
    selectedSheets.add(sheet.id);
    const originalItems=new Map<string,number>();
    sheet.eachRow(row=>{const value=row.getCell(1).text;if(/^\d+[A-Za-z]?\.\d+\.\d+$/.test(value))originalItems.set(value,row.number);});
    const firstRow=Math.min(...originalItems.values(),7),header=firstRow-1;
    const lastOriginal=Math.max(...originalItems.values(),firstRow-1);
    // Clear every template body value, including H historical values. Never export inherited content.
    for(let r=firstRow;r<=sheet.rowCount;r++)for(let c=1;c<=Math.max(9,sheet.columnCount);c++) {
      const cell=sheet.getCell(r,c);if(!cell.isMerged)cell.value=null;
    }
    const occupied=new Set<number>();let customRow=lastOriginal+1;
    const placements=items.map(item=>{
      let row=originalItems.get(item.code);
      if(!row)row=(item.aliases??[]).map(alias=>originalItems.get(alias)).find(Boolean);
      if(!row) {
        const loc=item.sources.find(s=>s.sheet===sheet!.name&&/^A\d+$/.test(s.cell??''));
        const number=Number(loc?.cell?.slice(1));if(number>=firstRow&&number<=lastOriginal)row=number;
      }
      if(!row||occupied.has(row))row=customRow++;
      occupied.add(row);return {item,row};
    }).sort((a,b)=>b.row-a.row);
    // Proportional narrative adjustment only. Item/status/PIC widths are source-exact.
    for(const [column,min] of [[2,32],[3,48],[5,54],[6,36]] as const)sheet.getColumn(column).width=Math.max(sheet.getColumn(column).width??min,min);
    const labels=lang==='zh'?['Item','Key Performance Indicator\n關鍵績效指標','Best Practice Guidance\n最佳實務指引','Y/N',`${year} Self Assessment\n目前自評`,'Evidence\n佐證','PIC\n部門']:['Item','Key Performance Indicator','Best Practice Guidance','Y/N',`${year} Self Assessment`,'Evidence','PIC'];
    labels.forEach((value,i)=>{sheet!.getCell(header,i+1).value=value;});
    sheet.getCell('A1').value=`${chapter.code} ${bilingual(chapter.name)}`;
    sheet.getCell('A1').alignment={...sheet.getCell('A1').alignment,wrapText:true,vertical:'middle'};
    sheet.getRow(1).height=Math.max(sheet.getRow(1).height??24,48);
    // Omit the requested scoring-introduction block; retain the template's normal row height and coordinates.
    sheet.getCell('E2').value=null;
    sheet.getCell('E2').alignment={wrapText:true,vertical:'top'};
    sheet.getRow(header).height=Math.max(sheet.getRow(header).height??24,52);
    for(const {item,row} of placements) {
      const a=assessmentFor(state,item.id),issues=state.viewScope==='management_viewer'?[]:openIssuesFor(state,item.id);
      const values:BiText[]=[{en:item.code,zh:''},item.kpi,itemGuidance(item),{en:responseText(a),zh:''},assessmentNarrative(state,a),evidenceNarrative(a),{en:departmentsLabel(state,a?.departmentIds??item.departmentIds,'en'),zh:departmentsLabel(state,a?.departmentIds??item.departmentIds,'zh')}];
      if(issues.length){values[4]={en:`${values[4].en}\n\n[Open improvements: ${issues.map(x=>x.id).join(', ')}]`,zh:`${values[4].zh}\n\n[未結案改善：${issues.map(x=>x.id).join(', ')}]`};}
      const styleRow=sheet.getRow(row),styles=Array.from({length:7},(_,i)=>clone(styleRow.getCell(i+1).style));
      const fontSize=Math.max(11,...styles.map(s=>s.font?.size??11));
      const maxLines=Math.max(4,Math.floor((300-12)/(fontSize*1.6)));
      const chunks=values.map((value,c)=>splitExcelBiText(value,Math.max(12,(sheet!.getColumn(c+1).width??10)*5.1-12),fontSize,styles[c].font?.name??'Noto Sans TC',maxLines));
      const count=Math.max(...chunks.map(x=>x.length));
      if(count>1)sheet.spliceRows(row+1,0,...Array.from({length:count-1},()=>[]));
      for(let segment=0;segment<count;segment++) {
        const target=sheet.getRow(row+segment);
        let maxHeight=0;
        for(let column=1;column<=7;column++) {
          const cell=target.getCell(column);cell.style=clone(styles[column-1]);
          cell.value=column===1?item.code:column===4?responseText(a):chunks[column-1][segment]?.text??'';
          cell.alignment={...cell.alignment,vertical:'top',wrapText:true,shrinkToFit:false};
          cell.font={...cell.font,size:fontSize};tableBorder(cell);
          const pixelWidth=Math.max(12,(sheet.getColumn(column).width??10)*5.1-12);
          const lineCount=splitMeasured(cell.text,pixelWidth,fontSize,cell.font.name??'Noto Sans TC',1).length;
          maxHeight=Math.max(maxHeight,lineCount*fontSize*1.6+12);
        }
        if(count>1) {
          const cell=target.getCell(7);cell.value=`${cell.text}\n${tr(lang,'續','Cont.')} ${segment+1}/${count}`;
          maxHeight+=fontSize*1.6;
        }
        // Source has one 409.6pt legacy floor (Excel's maximum is 409.5).
        // Clamp only that inherited floor, never the measured text requirement.
        const sourceFloor=segment===0?Math.min(styleRow.height??0,409.5):0;
        const measuredHeight=Math.max(32,maxHeight,sourceFloor);
        if(measuredHeight>409.5)throw new Error(`Excel continuation height exceeds limit: ${item.code}`);
        target.height=measuredHeight;
      }
    }
    const end=Math.max(firstRow,sheet.rowCount);
    for(let row=header;row<=end;row++)for(let col=1;col<=7;col++){const cell=sheet.getCell(row,col);tableBorder(cell);cell.alignment={...cell.alignment,wrapText:true,vertical:'top'};}
    for(let column=8;column<=sheet.columnCount;column++)sheet.getColumn(column).hidden=true;
    sheet.autoFilter={from:{row:header,column:1},to:{row:end,column:7}};
    sheet.views=[{state:'frozen',xSplit:1,ySplit:header}];
    sheet.pageSetup={...sheet.pageSetup,printArea:`A1:G${end}`,printTitlesRow:`1:${header}`,fitToPage:true,fitToWidth:1,fitToHeight:0};
    sheet.headerFooter={...sheet.headerFooter,oddFooter:'&L'+frameworkId+'&C&P / &N'};
  }
  for(const sheet of [...book.worksheets])if(!selectedSheets.has(sheet.id))book.removeWorksheet(sheet.id);
  book.creator=PRODUCT_NAME_EN;book.lastModifiedBy='Authorized report snapshot';book.company='';
  return ensureNativeExcelCompatibility(new Uint8Array(await book.xlsx.writeBuffer()));
}

// Operational registers use independent filterable columns, never merged data cells.
const reportDate=(value:string|null|undefined)=>value?.slice(0,10)??'';
const excelDate=(value:string|null|undefined):Date|null=>{const day=reportDate(value);return /^\d{4}-\d{2}-\d{2}$/.test(day)?new Date(day+'T00:00:00Z'):null;};
const improvementStatus=(status:Improvement['status'],lang:Language)=>tr(lang,{open:'開啟',in_progress:'進行中',closed:'結案'}[status],{open:'Open',in_progress:'In progress',closed:'Closed'}[status]);
const urgencyLabel=(row:Improvement,lang:Language)=>tr(lang,{urgent:'緊急',high:'高',medium:'中',low:'低'}[row.urgency],row.urgency);
function relatedCodes(state:PlatformState,row:Improvement){return row.itemIds.map(id=>{const item=state.items.find(i=>i.id===id);return item?`${item.frameworkId} ${item.code}`:'—';}).join('\n')||'—';}
function businessSource(state:PlatformState,row:Improvement,lang:Language){return [improvementSourceLabel(row.source,lang),row.source==='external'?state.inspections.find(i=>i.id===row.inspectionId)?.title:''].filter(Boolean).join('\n');}
function fullImprovementContent(row:Improvement){const body=compactBlankLines(bilingual(row.content)),title=compactBlankLines(row.title);return title===body||title===compactBlankLines(row.content.en)||title===compactBlankLines(row.content.zh)?body:compactBlankLines(title+'\n'+body);}
function operationalSheet(book:ExcelJS.Workbook,name:string,headers:string[],widths:number[],description:string){
 const sheet=book.addWorksheet(name),size=14,fontName='Microsoft JhengHei';
 widths.forEach((w,i)=>sheet.getColumn(i+1).width=w);
 sheet.getCell('A1').value=name;sheet.getCell('A1').font={name:fontName,size:18,bold:true};sheet.getRow(1).height=30;
 sheet.mergeCells(2,1,3,headers.length);sheet.getCell('A2').value=description;sheet.getCell('A2').font={name:fontName,size};sheet.getCell('A2').alignment={wrapText:true,vertical:'top'};sheet.getRow(2).height=28;sheet.getRow(3).height=28;
 sheet.getRow(4).values=headers;sheet.getRow(4).height=46;
 headers.forEach((_,i)=>{const cell=sheet.getCell(4,i+1);cell.font={name:fontName,size,bold:true,color:{argb:'FF193447'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE1EAF0'}};});
 return sheet;
}
// Improvement registers retain their numeric Part column. Six-column remarks
// instead carry an ordered [part/total] prefix inside a continued narrative.
// Every short metadata value repeats; unusually long metadata gets ordered parts too.
function operationalRows(sheet:ExcelJS.Worksheet,values:(string|Date|null|number)[],partColumn:number|null,narrativeColumns:number[],statusColumn?:number,status?:{background:string;color:string}){
 const size=14,fontName='Microsoft JhengHei';
 const chunks=values.map((v,i)=>typeof v==='string'?splitMeasured(compactBlankLines(v),(sheet.getColumn(i+1).width??20)*5.1-20,size,fontName,partColumn===null?(narrativeColumns.includes(i+1)?9:17):10):[v]);
 const count=Math.max(...chunks.map(c=>c.length));
 for(let part=0;part<count;part++){
  const cells=chunks.map((parts,i)=>parts.length===1?part&&narrativeColumns.includes(i+1)?'':parts[0]:parts[part]??'');
  if(partColumn!==null)cells[partColumn-1]=part+1;
  else if(count>1)for(const column of narrativeColumns)cells[column-1]=`[${String(part+1).padStart(String(count).length,'0')}/${count}]\n${cells[column-1]}`;
  const row=sheet.addRow(cells);let height=32;
  cells.forEach((v,i)=>{const c=row.getCell(i+1);c.font={name:fontName,size,color:{argb:'FF193447'}};c.alignment={wrapText:true,vertical:'top',shrinkToFit:false};tableBorder(c);if(v instanceof Date)c.numFmt='yyyy-mm-dd';height=Math.max(height,splitMeasured(typeof v==='string'?v:'X',(sheet.getColumn(i+1).width??20)*5.1-20,size,fontName,1).length*size*1.6+18);});
  if(height>409.5)throw new Error('Operational continuation exceeds Excel row height');// Excel Sort moves values, not physical row heights. A common safe height keeps
  // every ten-line continuation readable at any sorted position.
  row.height=Math.max(256,height);
  if(statusColumn&&status){const c=row.getCell(statusColumn);c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+status.background.slice(1)}};c.font={name:fontName,size,bold:true,color:{argb:'FF'+status.color.slice(1)}};}
 }
}
function finishOperationalSheet(sheet:ExcelJS.Worksheet){
 for(let c=1;c<=sheet.columnCount;c++){tableBorder(sheet.getCell(4,c));sheet.getCell(4,c).alignment={wrapText:true,vertical:'top'};}
 sheet.views=[{state:'frozen',ySplit:4}];sheet.autoFilter={from:{row:4,column:1},to:{row:Math.max(4,sheet.rowCount),column:sheet.columnCount}};
 sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'4:4',printArea:`A1:${sheet.getColumn(sheet.columnCount).letter}${sheet.rowCount}`};sheet.headerFooter={oddFooter:'&LFPMC&C&P / &N'};
}
export async function buildRemarksExcel(state:PlatformState,frameworkId:FrameworkId,lang:Language,chapterIds?:string[]):Promise<Uint8Array> {
 const rows=selectedRemarkRows(state,frameworkId,chapterIds);if(!rows.length)throw noRemarks();
 const Excel=await loadExcel(),book=new Excel.Workbook();book.creator=PRODUCT_NAME_EN;
 const sheet=operationalSheet(book,tr(lang,'條目備註','Item remarks'),lang==='zh'?['對應章節','Item','備註狀態','涉及部門','追蹤人員','完整備註']:['Chapter','Item','Remarks status','Departments','Follow-up people','Complete remarks'],[22,10,13,22,20,126],tr(lang,'同 Item 續列保留全文與責任分工；續文開頭 [序/總數] 為閱讀標籤。篩選後請整表依 Item、完整備註升冪排序；勿單獨排序一欄。狀態為獨立補充判斷。','Continuation rows retain complete remarks and assignments; [part/total] prefixes identify reading order. Sort the whole range by Item, then Complete remarks ascending; never sort one column alone. Status is an independent supplementary assessment.'));
 for(const {chapter,item,assessment:a} of rows)operationalRows(sheet,[`${chapter.code} · ${bilingual(chapter.name)}`,item.code,remarksStatusLabel(a.remarksStatus,lang),departmentsLabel(state,a.departmentIds??item.departmentIds,lang)||'—',peopleLabel(state,a.assigneeIds??[])||'—',a.remarks??''],null,[6],3,remarksStatusDefinition(a.remarksStatus));
 // Normal assignments repeat in full; exceptionally long labels continue in
 // the same labelled Item group instead of exceeding Excel's height ceiling.
 // Native Excel sorting does not carry heights, so all rows share the maximum.
 const height=Math.max(...sheet.getRows(5,sheet.rowCount-4)!.map(row=>row.height??256));for(let r=5;r<=sheet.rowCount;r++)sheet.getRow(r).height=height;
 finishOperationalSheet(sheet);return ensureNativeExcelCompatibility(new Uint8Array(await book.xlsx.writeBuffer()));
}
export async function buildImprovementsExcel(state:PlatformState,ids:string[],lang:Language):Promise<Uint8Array>{
 const rows=selectedImprovementRows(state,ids),Excel=await loadExcel(),book=new Excel.Workbook();book.creator=PRODUCT_NAME_EN;
 const description=tr(lang,'文件序號僅供本文件對應，非永久業務編號；同筆全文及計劃分段續列，短欄位重複。按文件序號、段次閱讀；全部進度見進度工作表，按文件序號、事件次序、段次閱讀。','Document numbers link this workbook only, not persistent business IDs. Complete content/plans use continuation rows with repeated short metadata. Read in document number/part order. All events are on Progress; read in document/event/part order.');
 const sheet=operationalSheet(book,tr(lang,'改善項目','Improvements'),lang==='zh'?['文件序號','標題','提出日期','來源','分類','關聯編號','涉及部門','執行人','急迫度','狀態','最新更新','目標日期','結案日期','完整內容','執行計劃','段次']:['Document no.','Title','Proposed date','Source','Classification','Related codes','Departments','Assignees','Urgency','Status','Updated','Target date','Closed date','Complete content','Plan','Part'],[12,45,18,48,28,30,40,44,14,20,18,18,18,100,85,9],description);
 const progress=operationalSheet(book,tr(lang,'全部進度','Progress'),lang==='zh'?['文件序號','標題','事件次序','更新日期','更新人','狀態','內容','段次']:['Document no.','Title','Event order','Update date','Updated by','Status','Content','Part'],[12,45,12,18,44,20,100,9],description);
 rows.forEach((row,i)=>{operationalRows(sheet,[i+1,row.title,excelDate(row.proposedDate),businessSource(state,row,lang),row.source==='external'?findingClassificationLabel(improvementFindingClassification(state,row),lang):'—',relatedCodes(state,row),departmentsLabel(state,row.departmentIds,lang)||'—',peopleLabel(state,row.assigneeIds)||'—',urgencyLabel(row,lang),improvementStatus(row.status,lang),excelDate(row.updatedAt),excelDate(row.targetDate),excelDate(row.closedAt),fullImprovementContent(row),row.plan,1],16,[14,15]);
  row.events.forEach((event,n)=>operationalRows(progress,[i+1,row.title,n+1,excelDate(event.at),peopleLabel(state,[event.by])||'—',improvementStatus(event.status,lang),event.content,1],8,[7]));
 });
 finishOperationalSheet(sheet);finishOperationalSheet(progress);return ensureNativeExcelCompatibility(new Uint8Array(await book.xlsx.writeBuffer()));
}

interface PdfRow {key:string;cells:string[];warning?:boolean}
interface PdfGroupRow {headers:string[];cells:string[];ratios?:number[];statusColumn?:number;status?:{background:string;color:string};entries?:{headers:string[];cells:string[];ratios:number[]}[]}
const PDF_BODY=15,PDF_AUX=14,PDF_LEADING=23,PDF_PAD=8;
const PAGE_WIDTH=1190.55,PAGE_HEIGHT=841.89,MARGIN=34,BOTTOM=64;
class TextPdf {
  readonly document:PDFDocument;readonly font:PDFFont;readonly title:string;readonly lang:Language;readonly stamp:string;
  private page!:PDFPage;private y=0;private readonly glyphs:Set<number>;
  private readonly fallbacks:{font:PDFFont;glyphs:Set<number>}[];
  private readonly fontForCodepoint=new Map<number,PDFFont>();
  // Exact shaping results, bounded per document; no additive glyph approximation.
  private readonly measurements=new Map<string,number>();
  private readonly glyphWidths=new Map<string,number>();
  private blockIndex=0;
  private readonly onFieldLine:ReportBuildOptions['onFieldLine'];
  private readonly operational:boolean;
  private constructor(document:PDFDocument,font:PDFFont,fallbacks:PDFFont[],title:string,lang:Language,stamp:string,onFieldLine:ReportBuildOptions['onFieldLine'],operational=false){this.operational=operational;this.document=document;this.font=font;this.title=title;this.lang=lang;this.stamp=stamp;this.glyphs=new Set(font.getCharacterSet());this.fallbacks=fallbacks.map(font=>({font,glyphs:new Set(font.getCharacterSet())}));this.onFieldLine=onFieldLine;this.newPage();}
  static async create(title:string,lang:Language,state:PlatformState,options:ReportBuildOptions,operational=false) {
    const [library,{default:fontkit}]=await Promise.all([import('pdf-lib'),import('@pdf-lib/fontkit')]);
    rgb=library.rgb;
    const document=await library.PDFDocument.create();
    document.registerFontkit({create(bytes){
      const font=fontkit.create(bytes),layout=font.layout.bind(font);
      // Width and PDF encoding both shape the same fallback runs. Reuse exact
      // default-feature runs only, scoped to this embedded font/document. These
      // pdf-lib consumers read glyphs; subset.includeGlyph does not mutate runs.
      const layouts=new Map<string,ReturnType<typeof layout>>();let cachedCharacters=0;
      font.layout=(text,features)=>{
        const cacheable=features===undefined&&text.length<=4096;
        const cached=cacheable?layouts.get(text):undefined;if(cached)return cached;
        const result=layout(text,features);
        // fontkit hides soft hyphen as a space/.notdef. This isolated source glyph
        // needs its own Unicode identity and the same real advance in measure/draw.
        if(text==='\u00ad'){
          const glyph=font.glyphForCodePoint(0x00ad);
          result.glyphs=[glyph];result.positions=[{xAdvance:glyph.advanceWidth,yAdvance:0,xOffset:0,yOffset:0}];
        }
        if(cacheable){
          while(layouts.size>=2048||cachedCharacters+text.length>131072){const oldest=layouts.keys().next().value!;cachedCharacters-=oldest.length;layouts.delete(oldest);}
          layouts.set(text,result);cachedCharacters+=text.length;
        }
        return result;
      };
      return font;
    }});
    const font=await document.embedFont(options.fontBytes??await assetBytes('fonts/NotoSansTC-Regular.ttf'),{subset:true});
    // Browser-only lazy assets; fontBytes-only Node callers never fetch relative URLs.
    const fallbackBytes=options.fallbackFontBytes??(typeof window!=='undefined'?await Promise.all(['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(name=>assetBytes('fonts/'+name))):[]);
    const fallbacks=await Promise.all(fallbackBytes.map(bytes=>document.embedFont(bytes,{subset:true})));
    document.setTitle(title);document.setAuthor(PRODUCT_NAME_EN);document.setSubject(`Authorized immutable snapshot; selectable text; snapshotToken=${state.snapshotToken}`);
    return new TextPdf(document,font,fallbacks,title,lang,state.serverTime,options.onFieldLine,operational);
  }
  private safe(text:string):string {
    const value=text.replace(new RegExp(String.fromCharCode(13)+'\\n?','g'),'\n').replace(/\t/g,'    ').replace(/[\u0095\u0099\u009C]/g,'•');
    for(const char of value)if(char!=='\n')this.actualFont(char.codePointAt(0)!);
    return value;
  }
  private actualFont(codepoint:number):PDFFont {
    const cached=this.fontForCodepoint.get(codepoint);if(cached)return cached;
    // TC aliases bullet and source hyphens to other codepoints; preserve their own cmap/glyph identities.
    const font=![0x2022,0x2011,0x00ad].includes(codepoint)&&this.glyphs.has(codepoint)?this.font:this.fallbacks.find(f=>f.glyphs.has(codepoint))?.font;
    if(!font)throw new Error(`Report font has no glyph for U+${codepoint.toString(16).toUpperCase()} / 字型不支援此字元，請注入 PDF fallbackFontBytes，已停止以免遺失內容`);
    this.fontForCodepoint.set(codepoint,font);return font;
  }
  private runs(text:string):{font:PDFFont;text:string}[] {
    const runs:{font:PDFFont;text:string}[]=[];
    for(const char of text){const font=this.actualFont(char.codePointAt(0)!),last=runs.at(-1);if(last?.font===font&&char!=='\u00ad'&&last.text!=='\u00ad')last.text+=char;else runs.push({font,text:char});}
    return runs;
  }
  private textWidth(text:string,size:number):number {
    const key=`${size}:${text}`,cached=this.measurements.get(key);
    if(cached!==undefined){this.measurements.delete(key);this.measurements.set(key,cached);return cached;}
    const width=this.runs(text).reduce((sum,run)=>sum+run.font.widthOfTextAtSize(run.text,size),0);
    if(this.measurements.size>=8192)this.measurements.delete(this.measurements.keys().next().value!);
    this.measurements.set(key,width);return width;
  }
  private wrap(text:string,width:number,size=PDF_BODY):string[] {
    const result:string[]=[];
    for(const paragraph of this.safe(compactBlankLines(text)).split('\n')) {
      const chars=Array.from(paragraph);
      for(const char of new Set(chars)){const key=`${size}:${char}`;let advance=this.glyphWidths.get(key);if(advance===undefined){advance=this.textWidth(char,size);this.glyphWidths.set(key,advance);}if(advance>width)throw new Error('PDF column cannot fit one glyph');}
      if(!chars.length){result.push('');continue;}
      let offset=0;
      while(offset<chars.length){
        const remaining=chars.length-offset,measure=(count:number)=>this.textWidth(chars.slice(offset,offset+count).join(''),size);
        let fit=1,upper=Math.min(2,remaining);
        // Exponential bracketing + exact shaped-prefix search, not summed advances.
        while(upper<remaining&&measure(upper)<=width){fit=upper;upper=Math.min(upper*2,remaining);}
        if(measure(upper)<=width)fit=upper;
        else{let lo=fit,hi=upper;while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(measure(mid)<=width)lo=mid;else hi=mid;}fit=lo;}
        let line=chars.slice(offset,offset+fit).join(''),take=fit;
        if(fit<remaining){const space=line.lastIndexOf(' ');if(space>line.length/3){line=line.slice(0,space+1);take=Array.from(line).length;}}
        result.push(line);offset+=take;
      }
    }
    return result;
  }
  private draw(text:string,x:number,y:number,size=PDF_BODY,color=rgb(.12,.17,.22)) {
    for(const run of this.runs(this.safe(text))){this.page.drawText(run.text,{x,y,font:run.font,size,color});x+=this.textWidth(run.text,size);}
  }
  private fieldLine(fieldId:string,text:string,x:number,y:number,width:number,size=PDF_BODY){
    this.draw(text,x,y,size);this.onFieldLine?.({fieldId,page:this.document.getPageCount()-1,x,baseline:PAGE_HEIGHT-y,width,size});
  }
  private newPage() {
    this.page=this.document.addPage([PAGE_WIDTH,PAGE_HEIGHT]);this.y=PAGE_HEIGHT-81;
    this.draw(this.operational?'FPMC':tr(this.lang,'FPMC 報告 · 授權快照','FPMC Report · Authorized snapshot'),MARGIN,PAGE_HEIGHT-37,PDF_AUX);
    this.page.drawLine({start:{x:MARGIN,y:PAGE_HEIGHT-49},end:{x:PAGE_WIDTH-MARGIN,y:PAGE_HEIGHT-49},thickness:1,color:rgb(.65,.71,.77)});
  }
  paragraph(text:string,size=PDF_BODY) {
    const fieldId=`p:${this.blockIndex++}`;
    for(const line of this.wrap(text,PAGE_WIDTH-MARGIN*2,size)) {
      if(this.y-PDF_LEADING<BOTTOM)this.newPage();
      this.fieldLine(fieldId,line,MARGIN,this.y-size,PAGE_WIDTH-MARGIN*2,size);this.y-=PDF_LEADING;
    }
    this.y-=8;
  }
  heading(text:string){if(this.y-70<BOTTOM)this.newPage();this.paragraph(text,17);}
  table(headers:string[],_ratios:number[],rows:PdfRow[],layout:'auto'|'overview'='auto') {
    const block=this.blockIndex++;
    // Content-sized bands retain field order without tall empty auxiliary columns.
    const width=PAGE_WIDTH-MARGIN*2;
    for(const [rowNumber,row] of rows.entries()) {
      let part=1;
      const label=(continued=false)=>{
        const text=`${row.key}${continued?' · '+tr(this.lang,'續頁','continued')+' '+part:''}`;
        this.page.drawRectangle({x:MARGIN,y:this.y-28,width,height:28,color:row.warning?rgb(1,.94,.78):rgb(.88,.92,.95),borderWidth:.7,borderColor:rgb(.48,.56,.63)});
        this.draw(text,MARGIN+PDF_PAD,this.y-PDF_AUX-5,PDF_AUX);this.y-=28;
      };
      if(this.y-100<BOTTOM)this.newPage();
      label();
      const nextPage=()=>{this.newPage();part++;label(true);};
      // Short auxiliary values share a compact metadata strip. Long prose stays wide.
      const compactColumns=layout==='overview'?[0,1,2,3]:headers.map((header,index)=>({header,index})).filter(({header,index})=>/^(Item|Y\/N|符合程度|Conformity|負責部門|PIC \/ Departments)/.test(header)&&this.wrap(row.cells[index],350,PDF_AUX).length<=3).map(x=>x.index);
      if(compactColumns.length){
        const ratios=layout==='overview'?[3,4.5,1.5,2]:compactColumns.map(()=>1),total=ratios.reduce((a,b)=>a+b,0);
        const columns=compactColumns.map((index,n)=>{const cellWidth=width*ratios[n]/total;const text=layout==='overview'&&index===1?row.cells[index].replace(/\n/g,' '):row.cells[index];return {index,width:cellWidth,lines:this.wrap(text,cellWidth-PDF_PAD*2,PDF_AUX)};});
        const height=26+Math.max(...columns.map(c=>c.lines.length))*PDF_LEADING+PDF_PAD*2;
        // Unusually long metadata is not squeezed into columns or truncated.
        if(height<=280){
          if(this.y-height<BOTTOM)nextPage();let x=MARGIN;
          for(const col of columns){this.page.drawRectangle({x,y:this.y-height,width:col.width,height,color:row.warning?rgb(1,.97,.89):rgb(.97,.98,.99),borderWidth:.55,borderColor:rgb(.68,.73,.77)});this.draw(headers[col.index].replace(/\n/g,' / '),x+PDF_PAD,this.y-PDF_AUX-4,PDF_AUX);col.lines.forEach((line,n)=>this.fieldLine(`t:${block}:${rowNumber}:${col.index}`,line,x+PDF_PAD,this.y-26-PDF_PAD-PDF_AUX-n*PDF_LEADING,col.width-PDF_PAD*2,PDF_AUX));x+=col.width;}
          this.y-=height;
        }else compactColumns.length=0;
      }
      for(let column=0;column<headers.length;column++) {
        if(compactColumns.includes(column))continue;
        const lines=this.wrap(row.cells[column],width-PDF_PAD*2);
        const short=(headers[column]==='Item'||/^(Y\/N|符合程度|Conformity)/.test(headers[column]))&&!row.cells[column].includes('\n')&&this.wrap(`${headers[column].replace(/\n/g,' / ')}: ${row.cells[column]}`,width-PDF_PAD*2,PDF_AUX).length===1&&row.cells[column].length<=80;
        if(short) {
          if(this.y-28<BOTTOM)nextPage();
          this.page.drawRectangle({x:MARGIN,y:this.y-28,width,height:28,color:row.warning?rgb(1,.97,.89):rgb(.97,.98,.99),borderWidth:.55,borderColor:rgb(.68,.73,.77)});
          this.draw(`${headers[column].replace(/\n/g,' / ')}: `,MARGIN+PDF_PAD,this.y-PDF_AUX-5,PDF_AUX);
          const labelWidth=this.textWidth(`${headers[column].replace(/\n/g,' / ')}: `,PDF_AUX);
          this.fieldLine(`t:${block}:${rowNumber}:${column}`,row.cells[column]||'—',MARGIN+PDF_PAD+labelWidth,this.y-PDF_AUX-5,width-PDF_PAD*2-labelWidth,PDF_AUX);this.y-=28;
          continue;
        }
        let offset=0;
        while(offset<lines.length) {
          if(this.y-(26+PDF_LEADING+PDF_PAD*2)<BOTTOM)nextPage();
          const heading=`${headers[column].replace(/\n/g,' / ')}${offset?' · '+tr(this.lang,'續文','continued'):''}`;
          this.draw(heading,MARGIN+PDF_PAD,this.y-PDF_AUX-4,PDF_AUX);this.y-=26;
          const available=Math.floor((this.y-BOTTOM-PDF_PAD*2)/PDF_LEADING);
          if(available<1)throw new Error('No PDF body space after field header');
          const take=Math.min(lines.length-offset,available),height=take*PDF_LEADING+PDF_PAD*2;
          this.page.drawRectangle({x:MARGIN,y:this.y-height,width,height,color:row.warning?rgb(1,.97,.89):rowNumber%2?rgb(.98,.99,1):rgb(1,1,1),borderWidth:.55,borderColor:rgb(.68,.73,.77)});
          lines.slice(offset,offset+take).forEach((line,index)=>this.fieldLine(`t:${block}:${rowNumber}:${column}`,line,MARGIN+PDF_PAD,this.y-PDF_PAD-PDF_BODY-index*PDF_LEADING,width-PDF_PAD*2));
          this.y-=height;offset+=take;
          if(offset<lines.length)nextPage();
        }
      }
      this.y-=8;
    }
    this.y-=8;
  }
  groupedTable(key:string,rows:PdfGroupRow[],prefix:string) {
    const block=this.blockIndex++,width=PAGE_WIDTH-MARGIN*2;
    const color=(hex:string)=>rgb(...(hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255) as [number,number,number]));
    const continuation=()=>{this.newPage();this.paragraph(`${key} · ${tr(this.lang,'續頁','continued')}`,PDF_AUX);};
    if(this.y-110<BOTTOM)this.newPage();
    for(const [rowIndex,logical] of rows.entries()){
      const entries=logical.entries??[logical];
      for(const [entryIndex,row] of entries.entries()){
        const ratios=row.ratios??row.cells.map(()=>1),total=ratios.reduce((a,b)=>a+b,0),widths=ratios.map(r=>width*r/total);
        const heads=row.headers.map((t,c)=>this.wrap(t,widths[c]-PDF_PAD*2,PDF_AUX));
        const headerHeight=Math.max(...heads.map(h=>h.length))*20+8;
        const lines=row.cells.map((t,c)=>this.wrap(t||'—',widths[c]-PDF_PAD*2));
        const count=Math.max(...lines.map(l=>l.length));let offset=0;
        while(offset<count){
          if(this.y-headerHeight-PDF_LEADING-PDF_PAD*2<BOTTOM)continuation();
          const available=Math.floor((this.y-BOTTOM-headerHeight-PDF_PAD*2)/PDF_LEADING);
          const take=Math.min(count-offset,available),height=headerHeight+take*PDF_LEADING+PDF_PAD*2;let x=MARGIN;
          for(let c=0;c<widths.length;c++){
            const style=c===logical.statusColumn?logical.status:undefined;
            this.page.drawRectangle({x,y:this.y-height,width:widths[c],height,color:style?color(style.background):rgb(1,1,1),borderWidth:.6,borderColor:rgb(.55,.63,.7)});
            heads[c].forEach((h,n)=>this.draw(h,x+PDF_PAD,this.y-PDF_AUX-4-n*20,PDF_AUX));
            lines[c].slice(offset,offset+take).forEach((line,n)=>{const baseline=this.y-headerHeight-PDF_PAD-PDF_BODY-n*PDF_LEADING;this.draw(line,x+PDF_PAD,baseline,PDF_BODY,style?color(style.color):rgb(.12,.17,.22));this.onFieldLine?.({fieldId:`${prefix}:${block}:${rowIndex}:${entryIndex}:${c}`,page:this.document.getPageCount()-1,x:x+PDF_PAD,baseline:PAGE_HEIGHT-baseline,width:widths[c]-PDF_PAD*2,size:PDF_BODY});});
            x+=widths[c];
          }
          this.y-=height;offset+=take;if(offset<count)continuation();
        }
      }
    }
    this.y-=14;
  }
  async finish():Promise<Uint8Array> {
    const pages=this.document.getPages();
    for(const [index,page] of pages.entries()) {
      page.drawLine({start:{x:MARGIN,y:48},end:{x:PAGE_WIDTH-MARGIN,y:48},thickness:.7,color:rgb(.65,.71,.77)});
      const label=`${this.operational?'':tr(this.lang,'快照','Snapshot')+': '+this.stamp+'     '}${tr(this.lang,'頁','Page')} ${index+1} / ${pages.length}`;
      page.drawText(this.safe(label),{x:MARGIN,y:25,font:this.font,size:PDF_AUX,color:rgb(.25,.32,.38)});
    }
    return this.document.save({useObjectStreams:true});
  }
}
function snapshotIntro(pdf:TextPdf,state:PlatformState,lang:Language,title:string) {
  pdf.heading(title);pdf.paragraph(`${tr(lang,'伺服器快照時間','Server snapshot time')}: ${state.serverTime}\n${tr(lang,'快照識別（完整值見PDF文件內容）','Snapshot token (full value in PDF properties)')}: ${state.snapshotToken.length>32?state.snapshotToken.slice(0,16)+'…'+state.snapshotToken.slice(-12):state.snapshotToken}`,PDF_AUX);
}
function itemPdfRows(state:PlatformState,items:StandardItem[],lang:Language):PdfRow[] {
  return items.map(item=>{
    const a=assessmentFor(state,item.id),open=state.viewScope==='management_viewer'?[]:openIssuesFor(state,item.id);
    const assessment=assessmentNarrative(state,a);
    return {key:item.code,warning:!!item.sourceGap&&!item.sourceGapResolved,cells:[item.code,bilingual(item.kpi),bilingual(itemGuidance(item)),responseText(a),`${bilingual(assessment)}${open.length?`\n★ ${tr(lang,'未結案改善','Open improvements')}:\n${open.map(x=>`${x.id} | ${x.title}`).join('\n')}`:''}`,bilingual(evidenceNarrative(a)),bilingual({en:departmentsLabel(state,a?.departmentIds??item.departmentIds,'en'),zh:departmentsLabel(state,a?.departmentIds??item.departmentIds,'zh')})]};
  });
}
const frameworkHeaders=(lang:Language,restricted=false)=>lang==='zh'?['Item','KPI\n關鍵績效指標','BPG\n最佳實務指引','Y/N',restricted?'目前自評':'目前自評 / 關聯改善','佐證','負責部門']:['Item','Key Performance Indicator','Best Practice Guidance','Y/N',restricted?'Current assessment':'Current assessment / Improvements','Evidence','PIC / Departments'];
const frameworkRatios=[7,20,24,5,25,14,9];
const tmsa14ReportScope=(included:boolean,count:number,lang:Language)=>tr(lang,`有效計分範圍：${count} 分章等權；第14章：${included?'納入':'不納入'}。原條文及逐項評定全部保留。`,`Scoring scope: ${count} equal-weight chapters; TMSA chapter 14: ${included?'included':'excluded'}. All definitions and item grades are retained.`);
export async function buildFrameworkPdf(state:PlatformState,frameworkId:FrameworkId,lang:Language,chapterIds?:string[],options:ReportBuildOptions={}):Promise<Uint8Array> {
  const chapters=selectedChapters(state,frameworkId,chapterIds),framework=state.frameworks.find(f=>f.id===frameworkId)!;
  const title=`${frameworkId} · ${tr(lang,'完整自評報告','Full self-assessment report')}`;
  const pdf=await TextPdf.create(title,lang,state,options);snapshotIntro(pdf,state,lang,title);
  pdf.paragraph(bilingual(framework.scopeLabel));pdf.paragraph(bilingual(framework.description));
  pdf.paragraph(state.viewScope==='management_viewer'?tr(lang,'英文上、繁中下。Y/N、完成更新、符合程度及執行狀態各自獨立。停用條目不列入目前報告。','English above Traditional Chinese. Y/N, review, conformity and execution are independent. Inactive items are excluded from current reports.'):tr(lang,'英文上、繁中下。Y/N、完成更新、符合程度、執行狀態、改善結案各自獨立。停用條目不列入目前報告。','English above Traditional Chinese. Y/N, review, conformity, execution and improvement closure are independent. Inactive items are excluded from current reports.'),PDF_AUX);
  const score=frameworkScore(state,frameworkId,chapters.map(c=>c.id));
  if(frameworkId==='TMSA')pdf.paragraph(tmsa14ReportScope(currentIncludesTmsa14(state),score.totalChapters,lang),PDF_AUX);
  pdf.paragraph(`${tr(lang,'所選分章等權平均','Equal-weight mean of selected complete chapters')}: ${score.score===null?tr(lang,'未完整評定','Not fully assessed'):score.score.toFixed(2)+' / 4'}${score.provisional?tr(lang,'（暫估 / 來源缺口）',' (provisional / source gap)'):''}`);
  for(const chapter of chapters) {
    const chapterScore=score.rows.find(row=>row.chapterId===chapter.id)!;
    pdf.heading(`${chapter.code} ${bilingual(chapter.name)}`);
    if(chapterScore.includedInTotal===false)pdf.paragraph(tr(lang,'此章保留顯示，不納入總分。','Chapter retained; excluded from total.'),PDF_AUX);
    if(chapter.aim)pdf.paragraph(bilingual(chapter.aim));
    pdf.paragraph(`${tr(lang,'本章分數','Chapter score')}: ${chapterScore.score===null?tr(lang,'未評','Not assessed'):chapterScore.score.toFixed(2)+' / 4'}${chapterScore.provisional?tr(lang,'（暫估）',' (provisional)'):''} | ${tr(lang,'完成更新','Reviewed')}: ${chapterScore.updated}/${chapterScore.total}`,PDF_AUX);
    const items=state.items.filter(i=>i.active&&i.frameworkId===frameworkId&&i.chapterId===chapter.id).sort((a,b)=>a.order-b.order);
    pdf.table(frameworkHeaders(lang,state.viewScope==='management_viewer'),frameworkRatios,itemPdfRows(state,items,lang));
  }
  return pdf.finish();
}
export async function buildRemarksPdf(state:PlatformState,frameworkId:FrameworkId,lang:Language,chapterIds?:string[],options:ReportBuildOptions={}):Promise<Uint8Array> {
 const rows=selectedRemarkRows(state,frameworkId,chapterIds);if(!rows.length)throw noRemarks();
 const title=`${frameworkId} · ${tr(lang,'條目備註','Item remarks')}`,pdf=await TextPdf.create(title,lang,state,options,true);pdf.heading(title);
 for(const {chapter,item,assessment:a} of rows)pdf.groupedTable(`${frameworkId} ${item.code}`,[
  {headers:lang==='zh'?['對應章節','Item','備註狀態']:['Chapter','Item','Remarks status'],cells:[`${chapter.code} · ${bilingual(chapter.name)}`,item.code,remarksStatusLabel(a.remarksStatus,lang)],ratios:[4,2,4],statusColumn:2,status:remarksStatusDefinition(a.remarksStatus)},
  {headers:lang==='zh'?['涉及部門','追蹤人員']:['Departments','Follow-up people'],cells:[departmentsLabel(state,a.departmentIds??item.departmentIds,lang)||'—',peopleLabel(state,a.assigneeIds??[])||'—']},
  {headers:[tr(lang,'完整備註','Complete remarks')],cells:[a.remarks??'']}
 ],'remarks');
 return pdf.finish();
}
export async function buildImprovementsPdf(state:PlatformState,ids:string[],lang:Language,title?:string,options:ReportBuildOptions={}):Promise<Uint8Array> {
 const rows=selectedImprovementRows(state,ids),reportTitle=title??tr(lang,'明選改善項目報告','Explicitly selected improvements'),pdf=await TextPdf.create(reportTitle,lang,state,options,true);pdf.heading(reportTitle);
 rows.forEach((row,index)=>pdf.groupedTable(`${tr(lang,'項目','Action')} ${index+1}`,[
  {headers:lang==='zh'?['急迫度','狀態','最新更新']:['Urgency','Status','Updated'],cells:[urgencyLabel(row,lang),improvementStatus(row.status,lang),reportDate(row.updatedAt)||'—']},
  {headers:lang==='zh'?['關聯編號','來源','分類','目標日期','結案時間']:['Related codes','Source','Classification','Target date','Closed date'],cells:[relatedCodes(state,row),businessSource(state,row,lang),row.source==='external'?findingClassificationLabel(improvementFindingClassification(state,row),lang):'—',reportDate(row.targetDate)||'—',reportDate(row.closedAt)||'—'],ratios:[2,3,1.8,1.6,1.6]},
  {headers:lang==='zh'?['涉及部門','執行人']:['Departments','Assignees'],cells:[departmentsLabel(state,row.departmentIds,lang)||'—',peopleLabel(state,row.assigneeIds)||'—']},
  {headers:[tr(lang,'完整內容','Complete content')],cells:[fullImprovementContent(row)]},
  {headers:[tr(lang,'執行計劃','Plan')],cells:[row.plan||'—']},
  row.events.length?{headers:[],cells:[],entries:row.events.map(event=>({headers:lang==='zh'?['全部進度 · 更新日期','更新人','狀態','內容']:['All progress · Date','Updated by','Status','Content'],cells:[reportDate(event.at)||'—',peopleLabel(state,[event.by])||'—',improvementStatus(event.status,lang),event.content||'—'],ratios:[1.7,2,1.5,6]}))}:{headers:[tr(lang,'全部進度','All progress')],cells:[tr(lang,'尚無進度事件','No progress events')]}
 ],'improvements'));
 return pdf.finish();
}

export function inspectionCoverage(inspection:Inspection) {
  const ids=new Set(inspection.snapshot.items.filter(i=>i.active).map(i=>i.id));
  const allIds=new Set(inspection.snapshot.items.map(i=>i.id));
  const valid=inspection.results.filter(r=>ids.has(r.itemId));
  if(new Set(inspection.results.map(r=>r.itemId)).size!==inspection.results.length)throw new Error('Duplicate frozen inspection results / 凍結結果有重複 Item');
  const assessed=valid.filter(r=>r.reviewed&&r.response!==null).length;
  return {total:ids.size,assessed,complete:ids.size>0&&assessed===ids.size,orphanResults:inspection.results.filter(r=>!allIds.has(r.itemId))};
}
export async function buildInspectionPdf(state:PlatformState,inspectionId:string,lang:Language,options:ReportBuildOptions={}):Promise<Uint8Array> {
  const inspection=state.inspections.find(i=>i.id===inspectionId);
  if(!inspection)throw new Error('Inspection is outside authorized snapshot / 檢查不在授權快照');
  const coverage=inspectionCoverage(inspection);
  const score=inspectionScore(inspection),reportTitle=`${tr(lang,'凍結檢查報告','Frozen inspection report')} · ${inspection.title}`;
  const pdf=await TextPdf.create(reportTitle,lang,state,options);snapshotIntro(pdf,state,lang,reportTitle);
  pdf.paragraph(`${inspection.id}\n${tr(lang,'機構 / 日期','Organization / date')}: ${inspection.organization} | ${inspection.date}\n${tr(lang,'類型 / 狀態','Type / status')}: ${tr(lang,inspection.type==='formal'?'正式':'非正式',inspection.type)} | ${tr(lang,inspection.status==='final'?'已發布':'草稿',inspection.status)}\n${tr(lang,'匯入 / 修訂自','Imported / supersedes')}: ${inspection.imported?'Y':'N'} / ${inspection.supersedesId??'—'}`);
  pdf.paragraph(bilingual(inspection.snapshot.framework.scopeLabel));
  pdf.paragraph(`${tr(lang,'凍結計分方法版本','Frozen scoring version')}: ${inspection.snapshot.scoringVersion}\n${tr(lang,'計分方法','Scoring method')}: ${inspection.snapshot.framework.scoring}\n${tr(lang,'逐項評定覆蓋率','Item assessment coverage')}: ${coverage.assessed}/${coverage.total}\n${tr(lang,'檢查得分','Inspection score')}: ${score.score===null?tr(lang,'未完整記分；未評定不視為 0 分','Not completely scored; unassessed is not zero'):score.score.toFixed(2)+' / 4'}${score.provisional?tr(lang,'（暫估 / 來源缺口）',' (provisional / source gap)'):''}`);
  if(inspection.frameworkId==='TMSA')pdf.paragraph(tmsa14ReportScope(inspectionIncludesTmsa14(inspection),score.totalChapters,lang),PDF_AUX);
  if(inspection.scoreNote)pdf.paragraph(bilingual(inspection.scoreNote));
  pdf.paragraph(tr(lang,'以下採檢查建立當時的完整凍結框架與條文版本；不以目前自評或目前停用狀態改寫。未提到的條文不推定 Yes；正面觀察及改善建議不自動判 No。','Uses the complete framework and definitions frozen when the inspection was created, regardless of current activity or self-assessments. Unmentioned items are not presumed Yes; positive observations and recommendations do not automatically mean No.'),PDF_AUX);
  const resultMap=new Map(inspection.results.map(r=>[r.itemId,r]));
  for(const chapter of [...inspection.snapshot.chapters].sort((a,b)=>a.order-b.order)) {
    pdf.heading(`${chapter.code} ${bilingual(chapter.name)}`);
    if(score.rows.find(r=>r.chapterId===chapter.id)?.includedInTotal===false)pdf.paragraph(tr(lang,'此章保留顯示，不納入總分。','Chapter retained; excluded from total.'),PDF_AUX);
    const items=inspection.snapshot.items.filter(i=>i.chapterId===chapter.id).sort((a,b)=>a.order-b.order);
    const headers=lang==='zh'?['Item / 版本','凍結 KPI','凍結 BPG / 來源','Y/N / 更新','檢查觀察','檢查建議','符合程度']:['Item / Version','Frozen KPI','Frozen BPG / Source','Y/N / Reviewed','Inspection observation','Inspection recommendation','Conformity'];
    pdf.table(headers,[8,20,26,9,20,20,9],items.map(item=>{
      const result=resultMap.get(item.id);
      return {key:item.code,warning:!!item.sourceGap&&!item.sourceGapResolved,cells:[`${item.code}\nv${item.version}`,bilingual(item.kpi),bilingual(itemGuidance(item)),`${responseText(result)}\n${tr(lang,'更新','Reviewed')}: ${result?.reviewed?'Y':'N'}`,result?bilingual(result.observation):tr(lang,'未評定 / 未涉及','Not assessed / not covered'),result?bilingual(result.recommendation):'—',result?tr(lang,{all:'全部',partial:'部分',none:'無'}[result.conformity],result.conformity):tr(lang,'未評','Unassessed')]};
    }));
  }
  // Orphan frozen items/results are disclosed rather than silently discarded.
  const ungrouped=inspection.snapshot.items.filter(item=>!inspection.snapshot.chapters.some(c=>c.id===item.chapterId));
  if(ungrouped.length){pdf.heading(tr(lang,'無對應凍結分章之條目','Items without a frozen chapter'));for(const item of ungrouped){const result=resultMap.get(item.id);pdf.paragraph(`${item.code} | ${item.id} | v${item.version}\n${bilingual(item.kpi)}\n${bilingual(itemGuidance(item))}\nY/N: ${responseText(result)} | ${tr(lang,'更新','Reviewed')}: ${result?.reviewed?'Y':'N'} | ${tr(lang,'符合程度','Conformity')}: ${result?.conformity??tr(lang,'未評','Unassessed')}\n${tr(lang,'完整觀察','Full observation')}:\n${result?bilingual(result.observation):tr(lang,'未評定 / 未涉及','Not assessed / not covered')}\n${tr(lang,'完整建議','Full recommendation')}:\n${result?bilingual(result.recommendation):'—'}`);}}
  if(coverage.orphanResults.length){pdf.heading(tr(lang,'無對應凍結條目之結果','Results without a frozen item'));for(const r of coverage.orphanResults)pdf.paragraph(`${r.itemId}\nY/N: ${responseText(r)} | ${tr(lang,'更新','Reviewed')}: ${r.reviewed?'Y':'N'} | ${tr(lang,'符合程度','Conformity')}: ${r.conformity}\n${bilingual(r.observation)}\n${bilingual(r.recommendation)}`);}
  pdf.heading(tr(lang,'完整檢查發現與建議','Complete findings and recommendations'));
  const findingHeaders=lang==='zh'?['發現編號 / 分類','關聯 Item','完整觀察','完整建議','來源 / 警示']:['Finding ID / Class','Related items','Full observation','Full recommendation','Sources / Warnings'];
  const classLabels={positive:'正面觀察',guidance:'指引',no_finding:'無缺失',general:'一般事項'};
  pdf.table(findingHeaders,[13,12,30,30,19],inspection.findings.map(f=>({key:f.id.slice(0,12),warning:!!f.warning,cells:[`${f.id}\n${f.classification==='finding'||f.classification==='ofi'?findingClassificationLabel(f.classification,lang):tr(lang,classLabels[f.classification],f.classification)}`,f.itemIds.map(id=>inspection.snapshot.items.find(i=>i.id===id)?.code??id).join('\n')||tr(lang,'一般事項 / 無條目連結','General / no item link'),bilingual(f.observation),bilingual(f.recommendation),[sourcesText(f.sources),f.warning].filter(Boolean).join('\n')]})));
  return pdf.finish();
}
export async function buildOverviewPdf(state:PlatformState,frameworkId:FrameworkId,lang:Language,chapterIds?:string[],options:ReportBuildOptions & {filters?:Filters}={}):Promise<Uint8Array> {
  const restricted=state.viewScope==='management_viewer';
  const chapters=selectedChapters(state,frameworkId,chapterIds),ids=chapters.map(c=>c.id),score=frameworkScore(state,frameworkId,ids);
  const reportTitle=`${frameworkId} · ${tr(lang,'現況總覽報告','Current overview')}`,pdf=await TextPdf.create(reportTitle,lang,state,options);snapshotIntro(pdf,state,lang,reportTitle);
  const framework=state.frameworks.find(f=>f.id===frameworkId)!;pdf.paragraph(bilingual(framework.scopeLabel));
  if(frameworkId==='TMSA')pdf.paragraph(tmsa14ReportScope(currentIncludesTmsa14(state),score.totalChapters,lang),PDF_AUX);
  const scoped=state.items.filter(i=>i.active&&i.frameworkId===frameworkId&&ids.includes(i.chapterId));
  const assessments=state.assessments.filter(a=>scoped.some(i=>i.id===a.itemId)),issues=filteredImprovements(state,{...options.filters,frameworkId}).filter(row=>row.itemIds.some(id=>scoped.some(i=>i.id===id))&&row.status!=='closed');
  const latestUpdate=assessments.map(a=>a.updatedAt).sort().at(-1)??'—';
  pdf.paragraph(`${tr(lang,'目前得分','Current score')}: ${score.score===null?tr(lang,'未完整評定','Not fully assessed'):score.score.toFixed(2)+' / 4'}${score.provisional?tr(lang,'（暫估 / 來源缺口）',' (provisional / source gap)'):''}\n${tr(lang,'完成更新','Reviewed')}: ${assessments.filter(a=>a.reviewed).length}/${scoped.length}${restricted?'':`\n${tr(lang,'未結案改善','Open improvements')}: ${issues.length}`}\n${tr(lang,'所選範圍最近自評更新','Latest current-assessment update in scope')}: ${latestUpdate}`);
  pdf.paragraph(restricted?tr(lang,'分數採每個所選分章的完整有效 Item 計算，部門、人員或日期條件不得篩掉 No 以提高分數。時間表示最近更新 / 匯入，非回溯證明。試算模型另行獨立，不混入目前分數。','Scores use every active item in each selected chapter; department, person or date filters must not remove No items to inflate a score. Time means latest update/import, not retrospective evidence. Simulation is a separate target model, not the current score.'):tr(lang,'分數採每個所選分章的完整有效 Item 計算，部門、人員或日期條件不得篩掉 No 以提高分數。時間表示最近更新 / 匯入，非回溯證明；章節改善分佈可重疊。試算模型另行獨立，不混入目前分數。','Scores use every active item in each selected chapter; department, person or date filters must not remove No items to inflate a score. Time means latest update/import, not retrospective evidence. Improvement distribution overlaps across chapters. Simulation is a separate target model, not the current score.'),PDF_AUX);
  if(options.filters)pdf.paragraph(`${restricted?tr(lang,'範圍篩選','Scope filters'):tr(lang,'改善篩選','Improvement filters')}:\n${Object.entries(options.filters).filter(([,value])=>value).map(([key,value])=>`${key}: ${key==='departmentId'?departmentsLabel(state,[String(value)],lang):key==='personId'?peopleLabel(state,[String(value)]):String(value)}`).join('\n')}`,PDF_AUX);
  pdf.heading(tr(lang,'分章分佈與分數','Chapter distribution and scores'));
  const headers=lang==='zh'?['分章','分數 / 計分方法','更新 / 完整分母','未結案改善（可重疊）','阻斷 / 來源缺口']:['Chapter','Score / Method','Reviewed / Full denominator','Open improvements (overlap)','Blockers / Source gaps'];
  pdf.table(restricted?headers.filter((_,index)=>index!==3):headers,restricted?[25,25,18,37]:[20,20,13,17,35],chapters.map(chapter=>{
    const row=score.rows.find(r=>r.chapterId===chapter.id)!,group=scoped.filter(i=>i.chapterId===chapter.id),open=issues.filter(issue=>issue.itemIds.some(id=>group.some(i=>i.id===id)));
    const levels=row.levels?`\nBasic / Intermediate / Advanced / Excellence: ${row.levels.map(v=>v===null?tr(lang,'未填','unset'):v+'%').join(' / ')}\n${tr(lang,'減權後','Adjusted')}: ${row.adjusted?.map(v=>v+'%').join(' / ')}`:'';
    return {key:chapter.code,warning:row.provisional,cells:[`${chapter.code} ${bilingual(chapter.name)}${chapter.priority?'\n'+tr(lang,'重點章節','Priority chapter'):''}`,`${row.score===null?tr(lang,'未評','Not assessed'):row.score.toFixed(2)+' / 4'}${row.provisional?'\n'+tr(lang,'暫估','Provisional'):''}\n${framework.scoring}${levels}${row.includedInTotal===false?'\n'+tr(lang,'不納入總分','Excluded from total'):''}`,`${row.updated} / ${row.total}`,...(restricted?[]:[`${open.length}\n${open.map(i=>i.id).join('\n')}`]),`${row.blockingItemCodes.join(', ')}\n${group.filter(i=>i.sourceGap&&!i.sourceGapResolved).map(i=>`${i.code}: ${i.sourceGap}`).join('\n')}`]};
  }),'overview');
  pdf.heading(tr(lang,'上次凍結檢查（獨立於目前自評）','Last frozen inspection (independent of current assessments)'));
  const last=state.inspections.filter(i=>i.frameworkId===frameworkId&&i.status==='final').sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt))[0];
  if(last){const coverage=inspectionCoverage(last),previous=inspectionScore(last);pdf.paragraph(`${last.title}\n${last.id} | ${last.date} | ${last.organization}\n${tr(lang,'凍結方法','Frozen method')}: ${last.snapshot.scoringVersion}\n${tr(lang,'評定覆蓋','Assessed coverage')}: ${coverage.assessed}/${coverage.total}\n${tr(lang,'此份納入範圍得分','Score for this inspection’s included scope')}: ${previous.score===null?tr(lang,'未完整記分（非 0 分）','Not completely scored (not zero)'):previous.score.toFixed(2)+' / 4'}`);if(last.frameworkId==='TMSA')pdf.paragraph(tmsa14ReportScope(inspectionIncludesTmsa14(last),previous.totalChapters,lang),PDF_AUX);}else pdf.paragraph(tr(lang,'尚無已發布的檢查記錄；不得製造上次得分。','No published inspection; no invented previous score.'));
  if(!restricted){
  pdf.heading(tr(lang,'未結案事項與執行計劃','Open issues and execution plans'));
  pdf.table(lang==='zh'?['編號 / 急迫 / 期限','事項 / 關聯','部門 / 執行人','完整計劃 / 最新進度']:['ID / Urgency / Target','Issue / Related items','Departments / Assignees','Full plan / Latest progress'],[16,32,19,38],issues.map(row=>({key:row.id.slice(0,12),cells:[`${row.id}\n${row.urgency} | ${row.targetDate||'—'}`,`${row.title}\n${bilingual(row.content)}\n${row.itemIds.map(id=>state.items.find(i=>i.id===id)?.code??id).join(', ')}`,`${departmentsLabel(state,row.departmentIds,lang)}\n${peopleLabel(state,row.assigneeIds)}`,`${row.plan}\n\n${row.events.at(-1)?.content??tr(lang,'尚無進度','No progress yet')}`]})));
  }
  return pdf.finish();
}
export function downloadReportBytes(bytes:Uint8Array,filename:string,mime:string):void {
  if(typeof document==='undefined')throw new Error('Downloads require a browser; use the pure builder in Node');
  const blob=new Blob([new Uint8Array(bytes).buffer],{type:mime});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;anchor.style.display='none';document.body.appendChild(anchor);
  try{anchor.click();}finally{anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);}
}
const reportFilename=(state:PlatformState,name:string,extension:string)=>`${name}-${state.serverTime.slice(0,10)||'snapshot'}.${extension}`;
export async function downloadFrameworkExcel(state:PlatformState,frameworkId:FrameworkId,lang:Language,chapterIds?:string[]):Promise<void>{downloadReportBytes(await buildFrameworkExcel(state,frameworkId,lang,chapterIds),reportFilename(state,frameworkId+'-assessment','xlsx'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}
export async function downloadFrameworkPdf(state:PlatformState,frameworkId:FrameworkId,lang:Language,chapterIds?:string[]):Promise<void>{downloadReportBytes(await buildFrameworkPdf(state,frameworkId,lang,chapterIds),reportFilename(state,frameworkId+'-assessment','pdf'),'application/pdf');}
export async function downloadImprovementsPdf(state:PlatformState,ids:string[],lang:Language,title?:string):Promise<void>{downloadReportBytes(await buildImprovementsPdf(state,ids,lang,title),reportFilename(state,'improvements','pdf'),'application/pdf');}
export async function downloadInspectionPdf(state:PlatformState,inspectionId:string,lang:Language):Promise<void>{downloadReportBytes(await buildInspectionPdf(state,inspectionId,lang),reportFilename(state,'inspection','pdf'),'application/pdf');}
export async function downloadOverviewPdf(state:PlatformState,frameworkId:FrameworkId,lang:Language,chapterIds?:string[]):Promise<void>{downloadReportBytes(await buildOverviewPdf(state,frameworkId,lang,chapterIds),reportFilename(state,frameworkId+'-overview','pdf'),'application/pdf');}

/** Convenience gate only: the RPC remains the security authority. */
export async function authorizeReportSnapshot(ctx:PageProps,request:Omit<ExportRequest,'snapshotToken'>):Promise<PlatformState> {
  if(!hasPermission(ctx.state.settings.rolePermissions,ctx.user,'exportReports'))throw new Error(ctx.t('沒有報告輸出權限','Report export is not permitted'));
  if(request.kind==='improvements')selectedImprovementRows(ctx.state,request.ids,request.filters as ImprovementListFilters|undefined);
  else if(request.kind==='inspection'){if(request.ids.length!==1||!ctx.state.inspections.some(i=>i.id===request.ids[0]))throw new Error(ctx.t('請選取有效檢查','Choose a valid inspection'));}
  else {if(!request.frameworkId)throw new Error('Framework ID required');selectedChapters(ctx.state,request.frameworkId,request.ids);}
  if(request.format==='xlsx'&&request.kind!=='framework'&&request.kind!=='improvements')throw new Error('XLSX supports framework and improvement reports only');
  const canonical=await ctx.api.authorizeExport({...request,snapshotToken:ctx.state.snapshotToken});
  if(!canonical?.snapshotToken||!canonical.serverTime)throw new Error(ctx.t('伺服器未提供有效報告快照','Server did not return a valid report snapshot'));
  if(request.kind==='improvements')selectedImprovementRows(canonical,request.ids,request.filters as ImprovementListFilters|undefined);
  else if(request.kind==='inspection'){if(!canonical.inspections.some(i=>i.id===request.ids[0]))throw new Error('Inspection absent from authorized snapshot');}
  else selectedChapters(canonical,request.frameworkId!,request.ids);
  return canonical;
}
