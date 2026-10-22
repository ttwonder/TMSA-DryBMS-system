import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeRichText,richTextToPlainText,richTextRuns} from '../src/richText.ts';
import {bi,filteredImprovements} from '../src/domain.ts';
import {describeAudit} from '../src/auditChanges.ts';
import {hasItemRemarks} from '../src/itemRemarks.ts';
import type {Assessment,AuditLog,BrowseState} from '../src/types.ts';
const rich=(text:string,color:'red'|'blue'='red')=>encodeRichText({text,spans:[{start:0,end:text.length,bold:true,color}],lists:[]});
test('plain consumer labels and searches strip every composed rich fragment',()=>{
 const content={en:rich('Across styled boundary'),zh:rich('雙語內容','blue')};assert.equal(bi(content,'en'),'Across styled boundary');
 const action={id:'one',title:rich('Action title'),content,plan:rich('Plan details'),events:[{content:rich('Progress phrase')}],itemIds:['i'],departmentIds:[],assigneeIds:[],status:'open',urgency:'medium',updatedAt:'2026-01-01'};
 const state={items:[{id:'i',code:'I-1',frameworkId:'TMSA',chapterId:'chapter'}],improvements:[action]} as unknown as BrowseState;
 for(const query of ['styled boundary','雙語內容','Action title','Plan details','Progress phrase','I-1'])assert.deepEqual(filteredImprovements(state,{query}).map(v=>v.id),['one']);
 for(const query of ['RT1:','"s":','not present'])assert.equal(filteredImprovements(state,{query}).length,0);
});
test('format-only audit changes remain visible without exposing annotation in summary',()=>{
 const before={selfAssessment:{en:'Same words'}},after={selfAssessment:{en:rich('Same words')}};
 const entry={action:'update',kind:'assessment',before,after} as AuditLog;
 const original=JSON.stringify(entry),model=describeAudit(entry,'zh');assert.equal(model.changes.length,1);assert.equal(model.changes[0].summary,'自評／英文：文字格式已修改');assert.equal(model.changes[0].before,'Same words');assert.deepEqual(richTextRuns(model.changes[0].after),[{text:'Same words',bold:true,color:'red'}]);assert.equal(JSON.stringify(entry),original);
 const recolored=describeAudit({...entry,before:after,after:{selfAssessment:{en:rich('Same words','blue')}}},'en');assert.match(recolored.changes[0].summary,/Text formatting changed/);
});
test('remarks empty test excludes invisible text but includes automatic list content',()=>{
 for(const remarks of ['', ' \n\u200b\u2060'])assert.equal(hasItemRemarks({remarks} as Assessment),false);
 const remarks=encodeRichText({text:'• Retained',spans:[{start:2,end:10,color:'blue'}],lists:[{start:0,end:10,kind:'bullet'}]});assert.equal(hasItemRemarks({remarks} as Assessment),true);assert.equal(richTextToPlainText(remarks),'• Retained');
});
