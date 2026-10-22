import assert from 'node:assert/strict';
import test from 'node:test';
import {encodeRichText,decodeRichText,richTextToPlainText,richTextRuns,isRichText,isRichTextEmpty,sliceRichText,compactRichText,richTextToEditorHtml,reflowRichText} from '../src/richText.ts';
import {formatStandardText} from '../src/standardText.ts';

test('plain legacy bytes stay literal and styled text keeps a searchable prefix',()=>{
 const legacy='  <b>literal</b>\r\n\r\n中文 😀';
 assert.equal(richTextToPlainText(legacy),legacy);
 assert.equal(encodeRichText({text:legacy,spans:[],lists:[]}),legacy);
 const text='Safety review 安全 😀';
 const value=encodeRichText({text,spans:[{start:0,end:6,bold:true,color:'red'}],lists:[]});
 assert.ok(value.startsWith(text));
 assert.equal(richTextToPlainText(value),text);
 assert.equal(isRichText(value),true);
 assert.deepEqual(decodeRichText(value),{text,spans:[{start:0,end:6,bold:true,color:'red'}],lists:[]});
 assert.deepEqual(richTextRuns(value),[{text:'Safety',bold:true,color:'red'},{text:' review 安全 😀'}]);
 assert.equal(isRichTextEmpty(' \n\u200b\u200c\u200d\ufeff'),true);
 assert.equal(encodeRichText({text:'',spans:[],lists:[]}), '');
});

test('multiple fragments compose without metadata leaks or shifted styles',()=>{
 const a=encodeRichText({text:'red',spans:[{start:0,end:3,color:'red'}],lists:[]});
 const b=encodeRichText({text:'blue',spans:[{start:0,end:4,color:'blue',bold:true}],lists:[]});
 assert.deepEqual(richTextRuns('EN: '+a+'\nZH: '+b+'!'),[{text:'EN: '},{text:'red',color:'red'},{text:'\nZH: '},{text:'blue',bold:true,color:'blue'},{text:'!'}]);
});

test('slicing and blank-line compaction keep styles and whole surrogate pairs',()=>{
 const source=encodeRichText({text:'a😀b\n \t\n  red\n\nend',spans:[{start:1,end:3,bold:true},{start:10,end:13,color:'red'}],lists:[]});
 assert.deepEqual(richTextRuns(sliceRichText(source,2,3)),[{text:'😀',bold:true}]);
 assert.deepEqual(richTextRuns(compactRichText(source)),[{text:'a'},{text:'😀',bold:true},{text:'b\n  '},{text:'red',color:'red'},{text:'\nend'}]);
 assert.equal(compactRichText(compactRichText(source)),compactRichText(source));
});

test('only metadata lists rebuild as lists; literal numbers and HTML stay text',()=>{
 const text='1. Manual\n1. Automatic\n2. Next\n• Bullet';
 const value=encodeRichText({text,spans:[{start:13,end:22,bold:true}],lists:[{start:10,end:22,kind:'ordered',ordinal:1},{start:23,end:30,kind:'ordered',ordinal:2},{start:31,end:39,kind:'bullet'}]});
 const html=richTextToEditorHtml(value);
 assert.match(html,/<div>1\. Manual<\/div>/);
 assert.match(html,/<ol start="1"><li>/);
 assert.match(html,/<ul><li>Bullet<\/li><\/ul>/);
 assert.equal(richTextToPlainText(value),text);
 assert.equal(richTextToEditorHtml('<img src=x onerror=alert(1)>'),'<div>&lt;img src=x onerror=alert(1)&gt;</div>');
});

test('strict schema rejects executable, overlapping, out-of-bounds and surrogate metadata',()=>{
 const invalid=[
  {text:'abc',spans:[{start:0,end:3,color:'url(javascript:alert(1))'}],lists:[]},
  {text:'abc',spans:[{start:0,end:3,bold:true,onclick:'x'}],lists:[]},
  {text:'abc',spans:[{start:0,end:3,bold:true},{start:1,end:2,color:'red'}],lists:[]},
  {text:'abc',spans:[{start:-1,end:8,bold:true}],lists:[]},
  {text:'😀',spans:[{start:0,end:1,bold:true}],lists:[]},
  {text:'manual',spans:[],lists:[{start:0,end:6,kind:'ordered',ordinal:1}]},
 ];
 for(const doc of invalid)assert.throws(()=>encodeRichText(doc as Parameters<typeof encodeRichText>[0]),TypeError);
 for(const meta of [{n:999,s:[[0,1,1,-1]],l:[]},{n:3,s:[[0,3,1,8]],l:[]},{n:3,s:[[0,3,1,-1]],l:[],html:'<script>x</script>'}]){
  const raw='abc\u001eRT1:'+JSON.stringify(meta)+'\u001f';
  assert.equal(richTextToPlainText(raw),raw);
  assert.equal(isRichText(raw),false);
  assert.ok(!richTextToEditorHtml(raw).includes('<script>'));
 }
});

test('composed list fragments keep visible prefixes without invalid midline list metadata',()=>{
 const list=encodeRichText({text:'1. Safe',spans:[{start:3,end:7,color:'green'}],lists:[{start:0,end:7,kind:'ordered',ordinal:1}]});
 const combined='Label: '+list+' tail';
 assert.equal(richTextToPlainText(compactRichText(combined)),'Label: 1. Safe tail');
 assert.deepEqual(decodeRichText(combined).lists,[]);
});

test('sentence display reflow preserves CJK, emoji and styled word offsets',()=>{
 const text='Safety\nreview.\n\n安全。檢查 😀';
 const start=text.indexOf('review');
 const value=encodeRichText({text,spans:[{start,end:start+6,color:'blue',bold:true}],lists:[]});
 const result=reflowRichText(value,formatStandardText(text));
 assert.equal(richTextToPlainText(result),formatStandardText(text));
 assert.ok(richTextRuns(result).some(r=>r.text==='review'&&r.color==='blue'&&r.bold));
 assert.throws(()=>reflowRichText(value,'different source'),TypeError);
});

test('list slices and compaction retain automatic metadata but manual prefixes stay literal',()=>{
 const text='Header\n\n1. First\n2. Next';
 const start=text.indexOf('1. '),second=text.indexOf('2. ');
 const value=encodeRichText({text,spans:[],lists:[{start,end:second-1,kind:'ordered',ordinal:1},{start:second,end:text.length,kind:'ordered',ordinal:2}]});
 assert.equal(decodeRichText(sliceRichText(value,start)).lists.length,2);
 assert.equal(decodeRichText(compactRichText(value)).lists.length,2);
 assert.equal(isRichText('1. First\n2. Next'),false);
 assert.equal(richTextToPlainText(sliceRichText(value,start+3,second-1)),'First');
});

test('CRLF editor reconstruction does not multiply blank lines',()=>{
 assert.equal(richTextToEditorHtml('A\r\n\r\n  B'),'<div>A</div><div><br></div><div>  B</div>');
 assert.equal(richTextToPlainText(null),'');
 assert.equal(richTextToPlainText(undefined),'');
 assert.equal(richTextToPlainText('&#x110000; <script>x</script>'),'&#x110000; <script>x</script>');
 assert.equal(isRichTextEmpty('\u2060\u200b\ufeff'),true);
});

test('metadata is numeric-only, length-bounded, and whitespace-only formatting is empty',()=>{
 const value=encodeRichText({text:'Red',spans:[{start:0,end:3,color:'red',bold:true}],lists:[]});
 const metadata=JSON.parse(value.slice(value.indexOf('\u001eRT1:')+5,-1));
 assert.deepEqual(metadata,{n:3,s:[[0,3,1,1]],l:[]});
 assert.throws(()=>encodeRichText({text:'x'.repeat(1_000_001),spans:[],lists:[]}),TypeError);
 assert.equal(encodeRichText({text:'\u200b ',spans:[{start:0,end:2,bold:true}],lists:[]}), '');
 assert.equal(encodeRichText({text:'1. ',spans:[],lists:[{start:0,end:3,kind:'ordered',ordinal:1}]}),'');
});
