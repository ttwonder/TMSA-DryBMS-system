#!/usr/bin/env python3
"""Verify saved real-source reports without printing private business bodies."""
import argparse, hashlib, importlib.util, json, re, io
from pathlib import Path
import fitz
from fontTools.ttLib import TTFont

def compact(s):
    # Keep all source code points; only PDF layout whitespace is omitted.
    return re.sub(r'\s+', '', s.replace('\r\n','\n').replace('\t','    '))

def verify_pdf(path, fields, render_dir):
    doc=fitz.open(path); by_size={}; sizes={}; glyphs=0; chinese=0; spans_checked=0
    refs={f[0] for page in doc for f in page.get_fonts()}
    for ref in refs:
        _,ext,_,data=doc.extract_font(ref)
        assert data, 'Font not embedded'
        if ext=='ttf':
            font=TTFont(io.BytesIO(data))
            if 'glyf' in font:
                for name in font.getGlyphOrder():
                    g=font['glyf'][name];g.getCoordinates(font['glyf']);glyphs+=int(g.numberOfContours!=0)
            font.close()
    assert glyphs>0, 'No valid embedded outlines'
    densities=[]; continuation=[]
    for index,page in enumerate(doc):
        spans=[s for b in page.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans'] if s['text'].strip()]
        spans.sort(key=lambda s:(round(s['origin'][1],2),s['origin'][0]))
        assert f'{index+1} / {len(doc)}' in page.get_text(), 'Missing page number'
        densities.append(sum(len(s['text']) for s in spans))
        if '續頁' in page.get_text() or 'continued' in page.get_text():continuation.append(index)
        for s in spans:
            size=round(s['size'],2);sizes[size]=sizes.get(size,0)+1;spans_checked+=1
            x0,y0,x1,y1=s['bbox'];assert size>=13.95, 'Below 14pt font floor'
            assert x0>=29.9 and x1<=page.rect.width-29.9 and y0>=8 and y1<=page.rect.height-8, 'Span outside page bounds'
            if size>=14.95 and y0>=70:assert y1<page.rect.height-50, 'Body/footer overlap'
            if y0>=70 and y1<page.rect.height-50:by_size.setdefault(size,[]).append(s['text'])
            chinese+=len(re.findall(r'[\u4e00-\u9fff]',s['text']))
    actual={k:compact(''.join(v)) for k,v in by_size.items()}; offsets={}; checked=0; empty=0; table_rows=0; failed=[]
    for block_index,block in enumerate(fields):
        if block['kind']=='paragraph':candidates=[(block.get('size',15),block['text'])]
        else:
            table_rows+=len(block['rows']);candidates=[]
            for row in block['rows']:
                for column,text in enumerate(row['cells']):
                    header=block['headers'][column]
                    short=(header=='Item' or re.match(r'^(Y/N|符合程度|Conformity)',header)) and '\n' not in text and len(text)<=80
                    candidates.append((14 if short else 15,text))
        for ordinal,(size,text) in enumerate(candidates):
            needle=compact(text)
            if not needle:empty+=1;continue
            stream=actual.get(float(size),'');offset=offsets.get(size,0);position=stream.find(needle,offset)
            if position<0:failed.append({'block':block_index,'fieldOrdinal':ordinal,'fontSize':size,'characters':len(text)})
            else:offsets[size]=position+len(needle);checked+=1
    assert not failed, json.dumps({'orderedFullFieldsMissing':failed[:8], 'totalMissing':len(failed)})
    assert chinese>0 and 15.0 in sizes, 'Missing Chinese or 15pt body'
    render_dir.mkdir(parents=True,exist_ok=True)
    selected=sorted({0,len(doc)-1,max(range(len(doc)),key=lambda i:densities[i]),continuation[len(continuation)//2] if continuation else min(1,len(doc)-1)})
    renders=[]
    for i in selected:
        target=render_dir/f'{path.stem}-page-{i+1}.png';doc[i].get_pixmap(matrix=fitz.Matrix(1.15,1.15)).save(str(target));renders.append(str(target.resolve()))
    result={'pages':len(doc),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'fontSizes':sizes,'spanCount':spans_checked,'spanBounds':'PASS','bodyFooterSeparation':'PASS','validEmbeddedOutlines':glyphs,'selectableChineseCharacters':chinese,'orderedCompleteFields':checked,'emptyFields':empty,'tableRows':table_rows,'continuationPages':len(continuation),'renderedPages':[i+1 for i in selected],'renders':renders,'sourceCodepointsPreserved':'PASS'}
    doc.close();return result

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--dir',type=Path,required=True);ap.add_argument('--template',type=Path,required=True);args=ap.parse_args()
    spec=importlib.util.spec_from_file_location('saved_file_qa',Path(__file__).with_name('verify-report-files.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    receipt={'scope':'Private local real-source snapshot; NOT mounted download, native Excel or hosted acceptance','checks':{},'failures':[]}
    inventories=[json.loads(p.read_text(encoding='utf8')) for p in args.dir.glob('generation*receipt.json') if p.name!='generation-combined-receipt.json']; merged={}
    for inventory in inventories:
        for output in inventory['outputs']:
            if output['name'] in merged:assert merged[output['name']]['sha256']==output['sha256'],'Conflicting artifact receipts'
            merged[output['name']]=output
    manifest={'outputs':list(merged.values())};(args.dir/'generation-combined-receipt.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
    for output in manifest['outputs']:
        path=Path(output['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==output['sha256'],'Artifact changed after generation'
        try:
            if path.suffix=='.xlsx':
                expected=json.loads((args.dir/f'{path.stem.split("-")[0]}-private-xlsx-streams.json').read_text(encoding='utf8'))
                result=module.verify_xlsx(path,expected,args.template if path.stem.startswith('TMSA') else None)
                result['completeLanguageStreams']=len(expected['fullFields'])*2;result['orderedSavedCellSegments']=len(expected['segments'])
            else:
                fields=json.loads(path.with_name(path.stem+'-private-fields.json').read_text(encoding='utf8'));result=verify_pdf(path,fields,args.dir/'renders')
            receipt['checks'][path.name]=result;print(json.dumps({'name':path.name,'status':'PASS',**{k:result[k] for k in ['pages','sheets','uniqueItems','completeLanguageStreams','orderedCompleteFields','fontSizes'] if k in result}},ensure_ascii=False))
        except Exception as e:
            receipt['failures'].append({'name':path.name,'error':str(e)});print(json.dumps({'name':path.name,'status':'FAIL','error':str(e)},ensure_ascii=False))
        (args.dir/'qa-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'verifiedArtifacts':len(receipt['checks']),'failures':len(receipt['failures'])}))
    raise SystemExit(bool(receipt['failures']))
if __name__=='__main__':main()
