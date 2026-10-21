import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import JSZip from 'jszip';
const root=path.resolve(import.meta.dirname,'..'),dist=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'dist');
assert.ok(fs.existsSync(path.join(dist,'index.html')),'Build output exists');
const all=[];function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else all.push(p);}}walk(dist);
for(const p of all){assert.ok(!/(private-seed|qa-evidence|platform-seed|source-verification|bootstrap-config)/i.test(path.relative(dist,p)),'No private payload file in public build');assert.ok(!/^\.env/.test(path.basename(p)),'No env file in build');}
const template=path.join(dist,'templates','tmsa-template.xlsx');assert.ok(fs.existsSync(template),'Sanitized Excel style template is served');
const zip=await JSZip.loadAsync(fs.readFileSync(template));assert.deepEqual(Object.keys(zip.files).filter(n=>/xl\/comments|externalLinks/.test(n)),[],'Template contains no comments or external links');
const textContents=[];for(const p of all.filter(p=>/\.(js|html|json|css|txt)$/.test(p)))textContents.push(fs.readFileSync(p,'utf8'));for(const [n,f] of Object.entries(zip.files))if(/\.xml$/.test(n))textContents.push(await f.async('string'));
const body=textContents.join('\n');assert.ok(!/sb_secret_[A-Za-z0-9_-]{15,}/.test(body),'No Supabase secret key');
const seedPath=path.join(root,'private-seed','platform-seed.json');let checked=0;
if(fs.existsSync(seedPath)){const seed=JSON.parse(fs.readFileSync(seedPath,'utf8'));const narratives=seed.assessments.flatMap(a=>[a.selfAssessment?.en,a.selfAssessment?.zh,a.evidence?.en,a.evidence?.zh]).concat(seed.items.flatMap(i=>[i.kpi?.en,i.kpi?.zh,i.guidance?.en,i.guidance?.zh]));const markers=[...new Set(narratives.filter(s=>typeof s==='string'&&s.length>100).map(s=>s.slice(0,150)))];for(const marker of markers){assert.ok(!body.includes(marker),'A private business/standard narrative was found in publicly served text');checked++;}}
console.log(JSON.stringify({status:'PASS',publicFiles:all.length,templateCommentParts:0,privateNarrativeMarkersChecked:checked,privateDataPublished:false}));
