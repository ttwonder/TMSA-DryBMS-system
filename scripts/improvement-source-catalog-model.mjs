import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './native-postgres.mjs';
const redOnly=false,readbackPath='supabase/improvement-milestones-readback.sql';
function deriveExpected(){
const sourceText=n=>readFileSync(join(root,'supabase/migrations',readdirSync(join(root,'supabase/migrations')).find(f=>f.startsWith(n+'_'))),'utf8').replaceAll('\r\n','\n');
const md5=x=>createHash('md5').update(x).digest('hex');
let expected=sourceText('001').match(/create or replace function compliance_private\.validate_record\(.*? as \$\$([\s\S]*?)\$\$;/s)[1];
const replaceOne=(a,b)=>{assert.equal(expected.split(a).length-1,1);expected=expected.split(a).join(b);};
assert.equal(md5(expected),'8ed96f4315cb077f8762dd0c21cc193e');
replaceOne("if b->>'role' in ('owner','admin') and b->'hasPassword'","if b->>'role' ='owner' and b->'hasPassword'");
for(const m of sourceText('008').matchAll(/\$old\$([\s\S]*?)\$old\$,\$new\$([\s\S]*?)\$new\$/g))replaceOne(m[1],m[2]);
replaceOne("rowv->>'classification' not in ('finding','general')","rowv->>'classification' not in ('finding','ofi','general')");
replaceOne("v->>'classification' not in ('finding','positive','guidance','no_finding','general')","v->>'classification' not in ('finding','ofi','positive','guidance','no_finding','general')");
const rulesPairs=/\('compliance_private\.validate_record_finding_classes_rules\(text,jsonb,jsonb,text,jsonb\)',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$/g;
for(const n of ['013','016','018'])for(const m of sourceText(n).matchAll(rulesPairs))replaceOne(m[1],m[2]);
assert.equal(md5(expected),'111b32be336c5333fc0ca2a9ae96ea92');
for(const m of sourceText('019').matchAll(/\$old\$([\s\S]*?)\$old\$,\$new\$([\s\S]*?)\$new\$/g))replaceOne(m[1],m[2]);
for(const m of sourceText('020').matchAll(rulesPairs))replaceOne(m[1],m[2]);
assert.equal(md5(expected),'eb6bc7e14bb4ace49dcf9972084b5432');
const expectedPre=expected;
for(const prefix of ["'external','non_external',",'']){
 const old="b->>'source' not in ("+prefix+"'management_review','management_directive','vessel_safety_meeting','company_safety_meeting')";
 replaceOne(old,old.slice(0,-1)+",'seminar','external_regulatory_impact')");
}
assert.equal(md5(expected),'45a098c4d69bd69ff22b63536fc24ed7');

let wrapper=sourceText('012').match(/create or replace function compliance_private\.validate_record\(.*? as \$\$([\s\S]*?)\$\$;/s)[1];
const wrapperPairs=/\('compliance_private\.validate_record\(text,jsonb,jsonb,text,jsonb\)',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$/g;
for(const n of ['016','018','020'])for(const m of sourceText(n).matchAll(wrapperPairs)){assert.equal(wrapper.split(m[1]).length-1,1);wrapper=wrapper.replace(m[1],m[2]);}
assert.equal(md5(wrapper),'ff892d3a2a84f742e229c18ec99d17b5');
const pre={'compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)':wrapper,'compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)':expected};
const post={...pre};
if(!redOnly){
 const sql=sourceText('022');
 for(const m of sql.matchAll(/\('(compliance_private\.validate_record(?:_finding_classes_rules)?\(text,jsonb,jsonb,text,jsonb\))',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$/g)){assert.equal(post[m[1]].split(m[2]).length-1,1);post[m[1]]=post[m[1]].replace(m[2],m[3]);}
 for(const [name,args,tag] of [['milestone_rows_valid','jsonb','rows'],['prepare_improvement_milestones','jsonb,jsonb,text,jsonb','milestones']])post['compliance_private.'+name+'('+args+')']=sql.split(' as $'+tag+'$')[1].split('$'+tag+'$;')[0];
 for(const body of Object.values(post)){assert(sql.includes(md5(body)));assert(readFileSync(join(root,readbackPath),'utf8').includes(md5(body)));}
}
return {pre,post,hashes:Object.fromEntries(Object.entries(post).map(([s,b])=>[s,md5(b)]))};
}
export function catalogPredecessors(){
 const result=deriveExpected().post;
 const source=n=>readFileSync(join(root,'supabase/migrations',readdirSync(join(root,'supabase/migrations')).find(f=>f.startsWith(n+'_'))),'utf8').replaceAll('\r\n','\n');
 for(const [name,first,args] of [['state','001','jsonb'],['performance_dispatch','005','text,text,text,jsonb']]){
  const signature='compliance_private.'+name+'('+args+')';
  const chunk=source(first).split('function compliance_private.'+name+'(')[1];const tag=chunk.match(/ as (\$[a-z]*\$)/)[1];let body=chunk.split(tag)[1];
  if(name==='performance_dispatch'){
   for(const n of ['009','011']){const projection=source(n).split('do $projection$')[1];const old=projection.match(/\$old\$([\s\S]*?)\$old\$/)[1],change=projection.match(/\$new\$([\s\S]*?)\$new\$/)[1];assert.equal(body.split(old).length-1,1);body=body.replace(old,n==='009'?old+change:change);}
  }
  for(const n of ['013','014','015','016','017','018','019','020','021','022']){
   const pattern=/\('(compliance_private\.[^']+)',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$(?:,(\d+))?/g;
   for(const m of source(n).matchAll(pattern))if(m[1]===signature){assert.equal(body.split(m[2]).length-1,Number(m[4]||1),n+' '+signature);body=body.split(m[2]).join(m[3]);}
  }
  if(name==='performance_dispatch'){const sql=source('017'),old=sql.match(/\$old\$([\s\S]*?)\$old\$/)[1],next=sql.match(/\$new\$([\s\S]*?)\$new\$/)[1];assert.equal(body.split(old).length-1,1);body=body.replace(old,next);assert.equal(createHash('md5').update(body).digest('hex'),'1d350f40ff41379be7f3bb14c1afe4ae');}
  result[signature]=body;
 }
 return result;
}

if(process.argv.includes('--post-hashes')){
 const bodies=catalogPredecessors(),sql=readFileSync(join(root,'supabase/migrations/023_improvement_source_catalog.sql'),'utf8');
 for(const m of sql.matchAll(/\('(compliance_private\.[^']+)',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$/g)){assert.equal(bodies[m[1]].split(m[2]).length-1,1);bodies[m[1]]=bodies[m[1]].replace(m[2],m[3]);}
 console.log(JSON.stringify(Object.fromEntries(Object.entries(bodies).map(([s,b])=>[s,createHash('md5').update(b).digest('hex')]))));
}
