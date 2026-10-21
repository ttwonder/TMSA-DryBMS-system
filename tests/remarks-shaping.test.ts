import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import {buildRemarksPdf} from '../src/reports.ts';
import {remarksExportFixture} from './remarks-export-fixture.ts';
test('mixed-font remarks reuse identical default shaping across measurement and drawing per document',async()=>{
 const create=fontkit.create,counts=new Map<string,number>(),fonts:ReturnType<typeof create>[]=[];let fontNo=0;
 fontkit.create=(bytes:Uint8Array)=>{const font=create(bytes),layout=font.layout.bind(font),id=fontNo++;fonts.push(font);font.layout=(text,features)=>{const key=JSON.stringify([id,text,features]);counts.set(key,(counts.get(key)??0)+1);return layout(text,features);};return font;};
 try{
  const state=remarksExportFixture('ordinary'),before=JSON.stringify(state),options={fontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf')),fallbackFontBytes:['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(n=>new Uint8Array(readFileSync('public/fonts/'+n)))};
  const bytes=await buildRemarksPdf(state,'TMSA','zh',['chapter-TMSA'],options);assert.equal(JSON.stringify(state),before);assert(bytes.length>10000);
  const statistics={calls:[...counts.values()].reduce((n,c)=>n+c,0),unique:counts.size,maxIdentical:Math.max(...counts.values())};
  if(process.env.REMARKS_QA_OUTPUT){mkdirSync(process.env.REMARKS_QA_OUTPUT,{recursive:true});writeFileSync(process.env.REMARKS_QA_OUTPUT+'/shaping.json',JSON.stringify(statistics,null,2));}
  assert.equal(statistics.maxIdentical,1,'Repeated exact default font shaping should be shared by width and encoding, not recalculated');
  await buildRemarksPdf(state,'TMSA','zh',['chapter-TMSA'],options);assert.equal(fonts.length,6,'Each document embeds its own fonts, not a cross-snapshot cache');
  const font=fonts[0],count=(text:string,features?:object)=>counts.get(JSON.stringify([0,text,features]));
  font.layout('FEATURE_CHECK',{liga:false});font.layout('FEATURE_CHECK',{liga:false});assert.equal(count('FEATURE_CHECK',{liga:false}),2,'Non-default features bypass the default cache');
  const oversized='A'.repeat(4097);font.layout(oversized);font.layout(oversized);assert.equal(count(oversized),2,'Long layout objects are not retained');
  const beforeGlyphs=font.layout('EVICTION_0').glyphs.map(g=>g.id);for(let n=1;n<=2050;n++)font.layout('EVICTION_'+n);assert.deepEqual(font.layout('EVICTION_0').glyphs.map(g=>g.id),beforeGlyphs);assert.equal(count('EVICTION_0'),2,'Entry capacity evicts without approximating glyphs');
  const padded=(n:number)=>'CHAR_BUDGET_'+n+'x'.repeat(1000);font.layout(padded(0));for(let n=1;n<=140;n++)font.layout(padded(n));font.layout(padded(0));assert.equal(count(padded(0)),2,'Character budget bounds retained layout memory');
 }finally{fontkit.create=create;}
});
