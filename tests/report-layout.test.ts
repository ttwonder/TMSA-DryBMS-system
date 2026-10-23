import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {buildFrameworkPdf} from '../src/reports.ts';
import {tmpdir} from 'node:os';
import {layoutFixture} from './report-layout-fixture.ts';
test('long BPG uses narrative width rather than tall empty auxiliary columns',async()=>{
 const dir=resolve(process.env.REPORT_LAYOUT_QA_DIR??resolve(tmpdir(),'tmsa-report-layout'));await mkdir(dir,{recursive:true});
 const state=layoutFixture(),fontBytes=new Uint8Array(await readFile('public/fonts/NotoSansTC-Regular.ttf'));
 const pdf=await buildFrameworkPdf(state,'TMSA','zh',undefined,{fontBytes});const path=resolve(dir,'layout-long.pdf');await writeFile(path,pdf);
 await writeFile(resolve(dir,'layout-long-fields.json'),JSON.stringify({fields:[state.items[0].guidance.en,state.items[0].guidance.zh]}));
 const raw=execFileSync('uv',['run','--offline','--with','pymupdf==1.26.5','--with','fonttools==4.60.1','--with','openpyxl==3.1.5','python','scripts/verify-report-layout.py','--geometry',path],{encoding:'utf8'});
 const metrics=JSON.parse(raw);await writeFile(resolve(dir,'layout-geometry.json'),JSON.stringify(metrics,null,2));
 assert.ok(metrics.narrativeWidth>=800,`Long narrative allocated only ${metrics.narrativeWidth}pt; needs >=800pt at 12pt`);
 assert.ok(metrics.blankTallAreaFraction<=0.10,`Empty full-height columns waste ${metrics.blankTallAreaFraction} of row area`);
});
