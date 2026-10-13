import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PDFFont} from 'pdf-lib';
import {layoutFixture} from './report-layout-fixture.ts';
import {buildFrameworkPdf} from '../src/reports.ts';

test('repeated full-width source text reuses exact font measurements within each PDF',async()=>{
 const state=layoutFixture(),fontBytes=new Uint8Array(await readFile('public/fonts/NotoSansTC-Regular.ttf'));
 const original=PDFFont.prototype.widthOfTextAtSize,counts=new Map<string,number>();
 PDFFont.prototype.widthOfTextAtSize=function(text:string,size:number){const key=JSON.stringify([size,text]);counts.set(key,(counts.get(key)??0)+1);return original.call(this,text,size);};
 try{
  const bytes=await buildFrameworkPdf(state,'TMSA','zh',undefined,{fontBytes});
  const repeated=Math.max(...counts.values());
  if(process.env.REPORT_MEASURE_DIR){await mkdir(process.env.REPORT_MEASURE_DIR,{recursive:true});await writeFile(resolve(process.env.REPORT_MEASURE_DIR,'measurement-receipt.json'),JSON.stringify({calls:[...counts.values()].reduce((a,b)=>a+b,0),uniqueMeasurements:counts.size,maxIdenticalMeasurements:repeated},null,2));await writeFile(resolve(process.env.REPORT_MEASURE_DIR,'measurement.pdf'),bytes);}
  assert.ok(repeated<=2,`Identical exact font measurement repeated ${repeated} times for long source; bound redundant shaping work`);
 }finally{PDFFont.prototype.widthOfTextAtSize=original;}
});
