// Shared TextPdf finite differential: full fields, exact geometry and fallback.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as reports from '../src/reports.ts';
import {reportingFixture} from '../tests/fpmc-reporting-fixture.ts';
const phase=process.argv[2];assert(['baseline','candidate'].includes(phase));const out=resolve('qa-evidence/remarks-export-followup/shared-'+phase+'-'+new Date().toISOString().replaceAll(':','-'));mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),state=reportingFixture(true);state.items[0].guidance.en+='\nGLYPH_BEGIN A\u0095B\u0099C\u009cD • ◄ ► ➔ ➢ ➜ CO₂ → non‑breaking soft\u00adhyphen GLYPH_END';
const canonical=join(out,'fixture.json');writeFileSync(canonical,JSON.stringify(state,null,2));const result={phase,fixtureSha256:hash(readFileSync(canonical)),productSha256:hash(readFileSync('src/reports.ts')),downloads:[],cases:[]};
const options={fontBytes:new Uint8Array(readFileSync('public/fonts/NotoSansTC-Regular.ttf')),fallbackFontBytes:['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(n=>new Uint8Array(readFileSync('public/fonts/'+n)))};
for(const kind of ['remarks','framework','improvements','inspection']){
 const request={kind:kind==='remarks'?'framework':kind,format:'pdf',ids:kind==='improvements'?state.improvements.slice(0,2).map(i=>i.id):kind==='inspection'?[state.inspections[0].id]:['chapter-TMSA'],filters:kind==='remarks'?{reportVariant:'remarks'}:{}};
 const lines=[],opts={...options,onFieldLine:l=>lines.push(l)},before=JSON.stringify(state),bytes=kind==='remarks'?await reports.buildRemarksPdf(state,'TMSA','zh',request.ids,opts):kind==='framework'?await reports.buildFrameworkPdf(state,'TMSA','zh',request.ids,opts):kind==='improvements'?await reports.buildImprovementsPdf(state,request.ids,'zh',undefined,opts):await reports.buildInspectionPdf(state,request.ids[0],'zh',opts);assert.equal(JSON.stringify(state),before);
 const path=join(out,kind+'.pdf');writeFileSync(path,bytes);writeFileSync(join(out,kind+'-field-lines.json'),JSON.stringify(lines));
 const selected=structuredClone(state);if(kind==='remarks'||kind==='framework'){selected.items=selected.items.filter(i=>i.frameworkId==='TMSA');selected.assessments=selected.assessments.filter(a=>selected.items.some(i=>i.id===a.itemId));}if(kind==='improvements')selected.improvements=selected.improvements.filter(i=>request.ids.includes(i.id));
 const snapshot=join(out,kind+'-canonical.json');writeFileSync(snapshot,JSON.stringify(selected,null,2));result.downloads.push({id:'shared-'+kind,path,canonical:snapshot,request,sha256:hash(bytes),canonicalSha256:hash(readFileSync(snapshot))});result.cases.push({id:'shared-'+kind,status:'PASS',fieldLines:lines.length});
}
result.status='PASS';writeFileSync(join(out,'receipt.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,cases:result.cases,receipt:join(out,'receipt.json')}));
