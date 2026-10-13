import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {buildFrameworkPdf} from '../src/reports.ts';
import {DEFAULT_PERMISSIONS} from '../src/domain.ts';
import type {PlatformState} from '../src/types.ts';
const base=(id:string)=>({id,version:1,createdAt:'2026-10-11T01:00:00Z',updatedAt:'2026-10-11T02:00:00Z',updatedBy:'qa-person'});
function fixture(text:string):PlatformState{return {frameworks:[{...base('TMSA'),name:{en:'QA',zh:'測試'},description:{en:'PDF-only display regression',zh:'僅PDF顯示回歸'},scoring:'tmsa-stage',active:true,sourceVersion:'QA',scopeLabel:{en:'Company scope',zh:'公司範圍'}}],chapters:[{...base('qa-ch'),frameworkId:'TMSA',code:'1',name:{en:'Control display',zh:'控制碼顯示'},order:1,active:true}],items:[{...base('qa-item'),frameworkId:'TMSA',chapterId:'qa-ch',code:'1.1.1',level:1,order:1,active:true,kpi:{en:'KPI',zh:'指標'},guidance:{en:text,zh:'繁中原文不改'},departmentIds:[],sources:[]}],assessments:[],improvements:[],inspections:[],people:[],settings:{...base('settings'),departments:[],rolePermissions:DEFAULT_PERMISSIONS,siteGateConfigured:false},dryScores:[],auditLogs:[],cycles:[],provenance:[],serverTime:'2026-10-11T03:00:00Z',snapshotToken:'0123456789abcdef'.repeat(8)};}
const fontBytes=new Uint8Array(await readFile('public/fonts/NotoSansTC-Regular.ttf'));
const fallbackFontBytes=await Promise.all(['ReportSupplement-Regular.ttf','ReportSymbols-Regular.ttf'].map(async f=>new Uint8Array(await readFile('public/fonts/'+f))));
test('original PDF builder displays exactly the three approved control codes as bullets without mutating source',async()=>{
 const state=fixture('CONTROL_BEGIN A\u0095B\u0099C\u009cD CONTROL_END');const original=JSON.stringify(state);
 const dir=resolve(process.env.REPORT_LAYOUT_QA_DIR??resolve(tmpdir(),'tmsa-report-controls'));await mkdir(dir,{recursive:true});
 const bytes=await buildFrameworkPdf(state,'TMSA','zh',undefined,{fontBytes,fallbackFontBytes});const path=resolve(dir,'approved-controls.pdf');await writeFile(path,bytes);
 const text=execFileSync('uv',['run','--offline','--with','pymupdf==1.26.5','python','-c','import sys,pymupdf;d=pymupdf.open(sys.argv[1]);print("\\n".join(p.get_text() for p in d))',path],{encoding:'utf8'});
 assert.ok(text.includes('CONTROL_BEGIN A•B•C•D CONTROL_END'),'approved controls must become U+2022 bullets, not middle dots, omissions, or hexadecimal labels');
 assert.equal(JSON.stringify(state),original,'PDF-only display substitution must not mutate the authorized source snapshot');
});
test('genuine bullet arrows and subscript remain selectable source codepoints at the body font size',async()=>{
 const source='GLYPH_BEGIN • ◄ ► ➔ ➢ ➜ CO₂ → non‑breaking soft­hyphen GLYPH_END',state=fixture(source),before=JSON.stringify(state);
 const dir=resolve(process.env.REPORT_LAYOUT_QA_DIR??resolve(tmpdir(),'tmsa-report-controls'));await mkdir(dir,{recursive:true});
 const path=resolve(dir,'fallback-glyphs.pdf');await writeFile(path,await buildFrameworkPdf(state,'TMSA','zh',undefined,{fontBytes,fallbackFontBytes}));
 const text=execFileSync('uv',['run','--offline','--with','pymupdf==1.26.5','python','-c','import sys,pymupdf;d=pymupdf.open(sys.argv[1]);print("\\n".join(p.get_text() for p in d))',path],{encoding:'utf8'});
 assert.ok(text.includes(source));assert.equal(JSON.stringify(state),before);
});
test('unapproved unsupported control code remains fail-closed rather than broad replacement',async()=>{
 await assert.rejects(buildFrameworkPdf(fixture('UNAPPROVED\u0098END'),'TMSA','zh',undefined,{fontBytes,fallbackFontBytes}),/no glyph for U\+98/);
});
