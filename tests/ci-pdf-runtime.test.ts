import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Pages prepares the Python PDF runtime before the unchanged offline test suite',async()=>{
 const workflow=await readFile('.github/workflows/pages.yml','utf8');
 const setup=workflow.match(/uses:\s*astral-sh\/setup-uv@([a-f0-9]{40})/);
 assert.ok(setup,'Pages must install uv; npm ci cannot provide the Python PDF test runtime');
 const tests=workflow.indexOf('- run: npm test');
 assert.ok(tests>setup.index!,'uv setup must finish before npm test');
 const beforeTests=workflow.slice(setup.index!,tests);
 assert.match(beforeTests,/version:\s*['"]0\.12\.15['"]/,'use the verified uv runtime version');
 assert.match(beforeTests,/python-version:\s*['"]3\.12['"]/,'select the supported Python runtime for uv');
 assert.match(beforeTests,/uv python install 3\.12/,'prepare Python before offline test commands');
 const prepare=beforeTests.split(/\r?\n/).map(line=>line.trim()).filter(line=>line.startsWith('uv run '));
 const required=[['pymupdf==1.26.5'],['pymupdf==1.26.5','fonttools==4.60.1','openpyxl==3.1.5']];
 for(const dependencies of required){
  const hasExactShape=(line:string)=>{
   const actual=[...line.matchAll(/--with\s+(\S+)/g)].map(match=>match[1]);
   return JSON.stringify(actual)===JSON.stringify(dependencies);
  };
  assert.ok(prepare.some(line=>hasExactShape(line)&&!line.includes('--offline')),`download the exact Python dependency set: ${dependencies.join(', ')}`);
  assert.ok(prepare.some(line=>hasExactShape(line)&&line.includes('--offline')),`prove offline readiness for: ${dependencies.join(', ')}`);
 }
 assert.doesNotMatch(beforeTests,/continue-on-error:\s*true/,'runtime preparation must fail closed');
 const [controls,layout]=await Promise.all(['tests/report-controls.test.ts','tests/report-layout.test.ts'].map(path=>readFile(path,'utf8')));
 for(const source of [controls,layout])assert.match(source,/'uv',\['run','--offline'/,'retain the original offline PDF assertions');
});
