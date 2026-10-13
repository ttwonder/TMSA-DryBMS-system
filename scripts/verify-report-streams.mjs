// Read saved workbooks only. Private field values never go to stdout.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import ExcelJS from 'exceljs';
import {splitExcelBiText} from '../src/reports.ts';
const dir=resolve(process.env.REPORT_ACTUAL_DIR??'../actual-artifacts');
for(const framework of ['TMSA','DRYBMS']){
 const input=JSON.parse(await readFile(resolve(dir,`${framework}-private-expectations.json`),'utf8'));
 const browserPlans=process.env.REPORT_BROWSER_PLANS?JSON.parse(await readFile(resolve(dir,`${framework}-private-browser-plans.json`),'utf8')):null;
 const book=new ExcelJS.Workbook();await book.xlsx.load(await readFile(resolve(dir,`${framework}-full.xlsx`)));
 const byCode=new Map();for(const sheet of book.worksheets)sheet.eachRow(row=>{if(row.number>=7&&row.getCell(1).text){const code=row.getCell(1).text;const rows=byCode.get(code)??[];rows.push({sheet,row});byCode.set(code,rows);}});
 if(byCode.size!==input.codes.length||input.codes.some(code=>!byCode.has(code)))throw new Error(`${framework}: saved Item universe mismatch`);
 const segments=[],fullFields=[];let continuationRows=0;
 for(const item of input.excelFields){const rows=byCode.get(item.code);continuationRows+=rows.length-1;const first=rows[0];
  for(let col=0;col<7;col++){const value=item.fields[col];if(!value)continue;
   const cell=first.row.getCell(col+1),size=cell.font.size,name=cell.font.name??'Noto Sans TC',width=Math.max(12,(first.sheet.getColumn(col+1).width??10)*5.1-12),maxLines=Math.max(4,Math.floor((300-12)/(size*1.6)));
   const planned=browserPlans?browserPlans[`${item.code}:${col}`]:splitExcelBiText(value,width,size,name,maxLines);
   const enSegments=[],zhSegments=[];
   for(let index=0;index<rows.length;index++){
    const fragment=planned[index]??{en:'',zh:'',text:''};const actual=rows[index].row.getCell(col+1).text;
    const suffix=col===6&&rows.length>1?`\n續 ${index+1}/${rows.length}`:'';
    if(actual!==fragment.text+suffix)throw new Error(`${framework}: ordered saved fragment mismatch (Item ordinal ${input.codes.indexOf(item.code)}, column ${col+1}, segment ${index+1})`);
    segments.push({sheet:rows[index].sheet.name,cell:rows[index].row.getCell(col+1).address,text:actual});enSegments.push(fragment.en);zhSegments.push(fragment.zh);
   }
   if(enSegments.join('')!==value.en||zhSegments.join('')!==value.zh)throw new Error(`${framework}: complete source-language stream mismatch`);
   fullFields.push({itemOrdinal:input.codes.indexOf(item.code),column:col+1,en:value.en,zh:value.zh,enSegments,zhSegments});
  }
 }
 const output={sheets:book.worksheets.map(s=>s.name),itemCodes:input.codes,uniqueItems:input.codes.length,segments,fullFields};
 await writeFile(resolve(dir,`${framework}-private-xlsx-streams.json`),JSON.stringify(output));
 console.log(JSON.stringify({framework,sheets:book.worksheets.length,items:input.codes.length,continuationRows,orderedCellSegments:segments.length,completeLanguageFields:fullFields.length*2,status:'PASS'}));
}
