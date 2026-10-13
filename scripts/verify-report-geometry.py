#!/usr/bin/env python3
"""Independent saved-PDF character geometry oracle; no private bodies printed."""
import argparse,json,hashlib,io,re,collections
from pathlib import Path
import pymupdf as fitz
from fontTools.ttLib import TTFont
APPROVED={0x95:0x2022,0x99:0x2022,0x9c:0x2022}
def compact(s):return re.sub(r'\s+','',s.translate(APPROVED))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def expected_fields(blocks):
 result={};rows=0
 for b in blocks:
  if b['kind']=='paragraph':result[f"p:{b['block']}"]=b['text']
  else:
   rows+=len(b['rows'])
   for ri,row in enumerate(b['rows']):
    for ci,text in enumerate(row['cells']):result[f"t:{b['block']}:{ri}:{ci}"]=text
 return result,rows

def verify(path,fields,geometry,renders):
 doc=fitz.open(path);expected,rows=expected_fields(fields);by_field=collections.defaultdict(list)
 for line in geometry:by_field[line['fieldId']].append(line)
 assert set(by_field)==set(expected),'Geometry/full expected field-ID set mismatch'
 pages={};sizes=collections.Counter();trace_counts=collections.Counter();densities=[];continuations=[];bounds_count=0;outline_count=0;outline_zero=0
 refs={f[0] for page in doc for f in page.get_fonts()}
 for ref in refs:
  _,ext,_,data=doc.extract_font(ref);assert data,'Font not embedded'
  if ext=='ttf':
   ft=TTFont(io.BytesIO(data));assert 'glyf' in ft,'Missing true glyph outlines'
   for name in ft.getGlyphOrder():
    g=ft['glyf'][name];g.getCoordinates(ft['glyf']);outline_count+=int(g.numberOfContours!=0);outline_zero+=int(g.numberOfContours==0)
   if 'loca' in ft:assert all(x%4==0 for x in ft['loca'].locations),'Invalid subset loca alignment'
   ft.close()
 assert outline_count>0
 for pi,page in enumerate(doc):
  buckets=collections.defaultdict(list);nchars=0;actualtext=page.get_text()
  assert f'{pi+1} / {len(doc)}' in actualtext,'Missing page label'
  if '續頁' in actualtext or 'continued' in actualtext:continuations.append(pi)
  for block in page.get_text('rawdict')['blocks']:
   for line in block.get('lines',[]):
    for span in line['spans']:
     size=round(span['size'],2);sizes[size]+=1;x0,y0,x1,y1=span['bbox'];bounds_count+=1
     assert size>=13.95,'Below 14pt font floor'
     assert x0>=29.9 and x1<=page.rect.width-29.9 and y0>=8 and y1<=page.rect.height-8,'Span outside page'
     if size>=14.95 and y0>=70:assert y1<page.rect.height-50,'Body/footer collision'
     for char in span['chars']:
      x,y=char['origin'];buckets[round(y,1)].append({'c':char['c'],'x':x,'y':y,'bbox':char['bbox'],'size':size,'ordinal':nchars});nchars+=1
  for chars in buckets.values():chars.sort(key=lambda c:c['x'])
  for span in page.get_texttrace():
   for cp,gid,origin,bbox in span['chars']:
    if not chr(cp).isspace():assert gid!=0,'Visible .notdef glyph'
    trace_counts[cp]+=1
  pages[pi]=buckets;densities.append(nchars)
 checked=0;empty=0;source_counts=collections.Counter();matrix=[];missing=[];used=set();narrative_widths=[];column_widths=[]
 for fid,source in expected.items():
  actual=[];regions=by_field[fid];last_page=-1;last_y=-1
  for region in regions:
   pi=region['page'];baseline=region['baseline'];x=region['x'];width=region['width'];size=region['size']
   assert pi>=last_page,'Field continuation page order'
   if pi==last_page:assert baseline>=last_y-.1,'Field line baseline order'
   last_page,last_y=pi,baseline
   chars=[c for c in pages[pi].get(round(baseline,1),[]) if c['x']>=x-.1 and c['x']<x+width-.1 and abs(c['size']-size)<.1]
   for c in chars:
    key=(pi,c['ordinal']);assert key not in used,f'Field regions overlap at {fid}, page {pi+1}, ordinal {c["ordinal"]}';used.add(key)
    assert c['bbox'][2]<=x+width+.5,'Character exceeds assigned field width';actual.append(c['c'])
   if size>=14.95:narrative_widths.append(width)
   else:column_widths.append(width)
  needle=compact(source);selected=compact(''.join(actual))
  if not needle:
   assert selected in ('','—'),'Nonempty text substituted for empty source field';empty+=1
  elif needle!=selected:missing.append({'fieldId':fid,'expectedCharacters':len(needle),'actualCharacters':len(selected),'firstMismatch':next((i for i,(a,b) in enumerate(zip(needle,selected)) if a!=b),min(len(needle),len(selected)))})
  else:checked+=1
  source_counts.update(needle)
  special={f'U+{cp:04X}':needle.count(chr(cp)) for cp in [0x2022,0x2082,0x25c4,0x25ba,0x2794,0x27a2,0x279c] if chr(cp) in needle}
  matrix.append({'fieldId':fid,'characters':len(needle),'sourceDisplaySha256':hashlib.sha256(needle.encode()).hexdigest(),'selectablePdfSha256':hashlib.sha256(selected.encode()).hexdigest(),'lines':len(regions),'pages':sorted({r['page']+1 for r in regions}),'specialGlyphs':special,'status':'PASS' if needle==selected or not needle and selected in ('','—') else 'FAIL'})
 assert not missing,json.dumps({'missingFieldCount':len(missing),'failures':missing[:10]})
 assert all(not trace_counts[cp] for cp in APPROVED),'Approved C1 controls remain in PDF'
 for cp in [0x2022,0x2082,0x25c4,0x25ba,0x2794,0x27a2,0x279c]:assert trace_counts[cp]>=source_counts[chr(cp)],'Special glyph occurrence below source-field multiplicity'
 selected_pages=sorted({0,len(doc)-1,max(range(len(doc)),key=lambda i:densities[i]),continuations[len(continuations)//2] if continuations else min(1,len(doc)-1)})
 renders.mkdir(parents=True,exist_ok=True);rendered=[]
 for i in selected_pages:
  target=renders/f'{path.stem}-page-{i+1}.png';doc[i].get_pixmap(matrix=fitz.Matrix(1.15,1.15)).save(str(target));rendered.append(str(target.resolve()))
 matrix_path=path.with_name(path.stem+'-field-glyph-matrix.json');matrix_path.write_text(json.dumps(matrix,indent=2),encoding='utf8')
 result={'pages':len(doc),'sha256':sha(path),'bytes':path.stat().st_size,'fields':len(expected),'orderedCompleteFields':checked,'emptyFields':empty,'tableRows':rows,'geometryFieldSet':'PASS','allFieldEquality':'PASS','fontSizes':dict(sizes),'spanBounds':'PASS','bodyFooterSeparation':'PASS','validEmbeddedOutlines':outline_count,'spanCount':bounds_count,'narrativeWidthMin':min(narrative_widths,default=0),'metadataWidthMin':min(column_widths,default=0),'continuationPages':len(continuations),'specialGlyphCounts':{f'U+{cp:04X}':trace_counts[cp] for cp in [0x2022,0x2082,0x25c4,0x25ba,0x2794,0x27a2,0x279c]},'sourceFieldGlyphCounts':{f'U+{cp:04X}':source_counts[chr(cp)] for cp in [0x2022,0x2082,0x25c4,0x25ba,0x2794,0x27a2,0x279c]},'fieldGlyphMatrix':str(matrix_path.resolve()),'renders':rendered};doc.close();return result

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--dir',type=Path,required=True);args=ap.parse_args();manifest=json.loads((args.dir/'generation-receipt.json').read_text());receipt={'scope':'Real source snapshot plus synthetic metadata; pure local builder only, not mounted/native download','productSha256':manifest['productSha256'],'fixtureSha256':manifest['fixtureSha256'],'checks':{},'failures':[]};names=['TMSA-full.pdf','DRYBMS-full.pdf','improvements-full.pdf','history-1.pdf','history-2.pdf','overview-TMSA.pdf','overview-DRYBMS.pdf'];outputs={o['name']:o for o in manifest['outputs']};assert set(outputs)==set(names),'Full seven-case artifact inventory'
 for name in names:
  path=args.dir/name;assert sha(path)==outputs[name]['sha256'],'Artifact changed after save'
  try:
   fields=json.loads(path.with_name(path.stem+'-private-fields.json').read_text());geometry=json.loads(path.with_name(path.stem+'-field-geometry.json').read_text());r=verify(path,fields,geometry,args.dir/'renders');receipt['checks'][name]=r;print(json.dumps({'name':name,'status':'PASS','pages':r['pages'],'fields':r['fields'],'glyphs':r['specialGlyphCounts']}),flush=True)
  except Exception as e:receipt['failures'].append({'name':name,'error':str(e)});print(json.dumps({'name':name,'status':'FAIL','error':str(e)}),flush=True)
  (args.dir/'geometry-qa-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
 print(json.dumps({'verified':len(receipt['checks']),'failures':len(receipt['failures'])}),flush=True);raise SystemExit(bool(receipt['failures']))
if __name__=='__main__':main()
