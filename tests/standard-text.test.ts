import assert from 'node:assert/strict';
import test from 'node:test';
import {formatStandardText} from '../src/standardText.ts';

const cases:[string,string,string][]=[
 ['PDF wraps and empty lines','A clear\ncommitment.\n\nRecords are kept.','A clear commitment.\nRecords are kept.'],
 ['CRLF and whitespace-only lines','  Policies\r\n are reviewed.\r\n \t\r\nRecords exist.  ','Policies are reviewed.\nRecords exist.'],
 ['Chinese wraps','管理階層\n確保安全。\n\n定期審查。','管理階層確保安全。\n定期審查。'],
 ['Chinese sentences without spaces','確保安全。定期審查！完成？','確保安全。\n定期審查！\n完成？'],
 ['mixed CJK and Latin wrap','遵循\nISO 9001\n要求。','遵循ISO 9001要求。'],
 ['bullet boundaries and continuation','Evidence:\n\n• Review\nrecords\n• Training\nlogs','Evidence:\n• Review records\n• Training logs'],
 ['numbered list and decimal','1. Maintain\nrecords at 2.5%.\n2) Review\nItem 1.2.3.','1. Maintain records at 2.5%.\n2) Review Item 1.2.3.'],
 ['letter and roman list','a) Keep\nrecords\n(ii) Review\nlogs\nIII. Record\nactions','a) Keep records\n(ii) Review logs\nIII. Record actions'],
 ['colon introduction','Records include:\nCurrent procedures\nand training.','Records include:\nCurrent procedures and training.'],
 ['common abbreviations','Dr. Smith reviews e.g.\ntraining under Sec. 2.1.\nRecords are kept.','Dr. Smith reviews e.g. training under Sec. 2.1.\nRecords are kept.'],
 ['dotted acronym','U.S.\npersonnel use PPE.\nThey review it.','U.S. personnel use PPE.\nThey review it.'],
 ['item codes and versions','Item D01-B-01 and v1.1\nremain unchanged.\nReview Item 1A.2.','Item D01-B-01 and v1.1 remain unchanged.\nReview Item 1A.2.'],
 ['initial and company suffix','J. Smith at Acme Ltd.\nreviews records.','J. Smith at Acme Ltd. reviews records.'],
 ['closing quotes','The policy says “Review it.”\nRecords are kept.','The policy says “Review it.”\nRecords are kept.'],
 ['hyphen is retained','Safety-\nrelated requirements apply.','Safety-related requirements apply.'],
 ['no proofreading','The managers\ndemonstrate a cleer commitment.','The managers demonstrate a cleer commitment.'],
 ['empty input','\n\n \t',''],
 ['single sentence','Records are kept.','Records are kept.'],
];
for(const [name,input,expected] of cases){
 test(name,()=>assert.equal(formatStandardText(input),expected));
}
test('only whitespace may change, preserving every literal code point',()=>{
 for(const [,input] of cases) assert.equal(formatStandardText(input).replace(/\s/gu,''),input.replace(/\s/gu,''));
});
test('formatting is idempotent',()=>{
 for(const [,input] of cases) assert.equal(formatStandardText(formatStandardText(input)),formatStandardText(input));
});

test('standalone PDF bullet markers preserve boundaries',()=>assert.equal(formatStandardText("The policy is clear.\n•\nMaintain\nrecords\n•\nReview logs"),"The policy is clear.\n• Maintain records\n• Review logs"));
