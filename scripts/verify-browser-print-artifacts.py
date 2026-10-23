"""Verify retained real Chrome PDFs (not the native save dialog)."""
import sys, json, hashlib, re
from pathlib import Path
import pymupdf as fitz
receipt_path = Path(sys.argv[1])
receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
results = []
for entry in receipt['artifacts']:
    path = Path(entry['pdf'])
    doc = fitz.open(path)
    text = '\n'.join(page.get_text() for page in doc)
    plain_path = path.with_suffix('.fulltext.txt')
    plain_path.write_text(text, encoding='utf-8')
    name = entry['name']
    expected = ['LONG_000', 'LONG_089', 'END_OF_LONG', '保留完整中文', '→', 'CO₂'] if 'remarks' in name or 'improvements' in name or name == 'popup-retry' else []
    if 'improvements' in name:
        expected += ['COMPLETE_PLAN', 'COMPLETE_MILESTONE_GOAL', '階段變更歷史', '全部進度']
    if 'inspection' in name:
        expected += ['OBSERVATION_2', 'FINDING_2', 'ADVICE_2', 'GUIDANCE_2']
    if name in ['framework','entry-TMSA','entry-DRYBMS']:
        expected += ['Guidance', 'Initial', 'None']
    if 'overview' in name:
        expected += ['分章分佈與分數', '完整分母', 'Synthetic']
    if 'remarks' in name or 'improvements' in name or name == 'popup-retry':
        expected += [f'LONG_{i:03d} Full original line 保留完整中文 → CO₂ H₂O' for i in range(90)]
    expected_path = path.with_suffix('.expected.json')
    expected_path.write_text(json.dumps(expected,ensure_ascii=False,indent=2),encoding='utf-8')
    compact = re.sub(r'\s+', '', text)
    missing = [x for x in expected if re.sub(r'\s+', '', x) not in compact]
    spans = [(p.number, s) for p in doc for block in p.get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for s in line['spans'] if s['text'].strip()]
    tiny = [(p, s['size'], s['text']) for p,s in spans if s['size'] < 13.8]
    outside = [(p,s['text']) for p,s in spans if s['bbox'][0] < 0 or s['bbox'][2] > doc[p].rect.width + 1 or s['bbox'][1] < 0 or s['bbox'][3] > doc[p].rect.height + 1]
    blank = [p.number for p in doc if not p.get_text().strip()]
    rendered = []
    for i in sorted({0, len(doc)//2, len(doc)-1}):
        target = path.with_name(path.stem+f'-page-{i+1}.png')
        doc[i].get_pixmap(matrix=fitz.Matrix(1,1)).save(target)
        rendered.append(str(target))
    result = {'name':name,'pdf':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pages':len(doc),'fulltext':str(plain_path),'expected':expected,'missing':missing,'tiny':tiny[:10],'outside':outside[:10],'blankPages':blank,'renders':rendered,'status':'PASS' if not(missing or tiny or outside or blank) else 'FAIL'}
    results.append(result)
out = receipt_path.with_name('artifact-verification.json')
out.write_text(json.dumps({'status':'PASS' if all(r['status']=='PASS' for r in results) else 'FAIL','results':results},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'receipt':str(out),'results':[{k:r[k] for k in ['name','pages','missing','tiny','outside','blankPages','status']} for r in results]},ensure_ascii=False))
sys.exit(0 if all(r['status']=='PASS' for r in results) else 1)
