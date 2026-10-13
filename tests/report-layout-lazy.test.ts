import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
test('homepage production entry excludes report heavy dependencies',async()=>{
 const output=process.env.REPORT_ENTRY_DIR??'../lazy-red-dist';
 execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',output],{stdio:'pipe'});
 const html=await readFile(resolve(output,'index.html'),'utf8');const src=/type="module"[^>]*src="([^"]+)"/.exec(html)![1];
 const size=(await stat(resolve(output,src))).size;
 assert.ok(size<700_000,`Homepage entry is ${size} bytes; report dependencies must load only on export`);
});
