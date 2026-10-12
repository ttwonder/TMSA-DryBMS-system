// Full private corpus integrity; no standard paragraphs are logged or bundled.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {formatStandardText,compactBlankLines} from '../src/standardText.ts';
const root=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2);
const argument=name=>{const at=args.indexOf(name);if(at<0)return undefined;assert.ok(args[at+1],`${name} needs a path`);return resolve(args[at+1]);};
const seedPath=argument('--seed')||join(root,'private-seed','platform-seed.json');
const output=argument('--output')||join(root,'qa-evidence','personnel-text','standard-corpus.json');
const source=readFileSync(seedPath),seed=JSON.parse(source);
const sha=value=>createHash('sha256').update(value).digest('hex');
const before=JSON.stringify(seed);
const nonblank=text=>text.replace(/\s/gu,'');
assert.ok(Array.isArray(seed.items)&&seed.items.length>0,'No real standard corpus supplied');
const ids=new Set();const counts={TMSA:0,DRYBMS:0};let fields=0,reflowed=0;
for(const item of seed.items){
 assert.ok(!ids.has(item.id),'Duplicate Item ID');ids.add(item.id);
 assert.ok(item.frameworkId in counts,'Unknown framework');counts[item.frameworkId]++;
 for(const field of ['kpi','guidance'])for(const language of ['en','zh']){
  const raw=item[field]?.[language];assert.equal(typeof raw,'string','Missing standard text');
  const display=formatStandardText(raw);
  assert.equal(nonblank(display),nonblank(raw),'Standard non-whitespace code points changed');
  assert.equal(formatStandardText(display),display,'Standard reflow must be stable');
  assert.ok(!/\n[^\S\n]*\n/u.test(display),'Standard still has surplus blank display lines');
  fields++;if(display!==raw)reflowed++;
 }
}
let authoredFields=0;
for(const assessment of seed.assessments||[])for(const field of ['selfAssessment','evidence','note'])for(const language of ['en','zh']){
 const raw=assessment[field]?.[language];if(typeof raw!=='string')continue;
 const display=compactBlankLines(raw);
 assert.equal(nonblank(display),nonblank(raw),'Authored non-whitespace code points changed');
 assert.deepEqual(display ? display.split('\n') : [],raw.split(/\r\n?|\n/u).filter(line=>/\S/u.test(line)),'Authored nonempty line boundaries changed');
 authoredFields++;
}
assert.equal(JSON.stringify(seed),before,'Any stored corpus data changed');
assert.equal(sha(readFileSync(seedPath)),sha(source),'Private seed file changed');
const result={status:'PASS_DISPLAY_CORPUS_INTEGRITY_ONLY',evidenceLayer:'real private source data + production display helper; not browser/database/hosted acceptance',items:seed.items.length,frameworkCounts:counts,standardFieldsChecked:fields,reflowedFields:reflowed,authoredFieldsChecked:authoredFields,rawSeedFileSha256:sha(source),rawSeedUnchanged:true,nonWhitespacePreserved:true,idsUnique:true,allFieldFormattingStable:true,helperSha256:sha(readFileSync(join(root,'src','standardText.ts')))};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
