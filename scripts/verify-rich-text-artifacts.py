"""Independent saved PDF/XLSX rich-run and pure-text differential checks.
uv run --with pymupdf==1.26.7 --with fonttools==4.60.1 --with openpyxl==3.1.5 python scripts/verify-rich-text-artifacts.py <rich-receipt> --baseline <receipt> --candidate <receipt>
Not mounted UI or native Excel acceptance.
"""
import argparse,hashlib,io,json,re,zipfile
from collections import defaultdict
from pathlib import Path
import pymupdf as fitz
import openpyxl
from openpyxl.cell.rich_text import CellRichText,TextBlock
from fontTools.ttLib import TTFont
COLORS={'black':'000000','red':'C62828','blue':'1565C0','green':'237A35'}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def norm(s):return re.sub(r'\s+','',s)
def expected_chars(runs):return [(ch,r.get('bold',False),COLORS.get(r.get('color'))) for r in runs for ch in r['text'] if not ch.isspace()]
def check_chars(actual,expected,label):
 assert ''.join(c[0] for c in actual)==''.join(c[0] for c in expected),('text differs',label)
 for n,(a,e) in enumerate(zip(actual,expected)):
  if e[2]:assert a[2]==e[2],('color differs',label,n,a,e)
  # Explicit rich runs without bold should remain regular outside template headers.
  assert a[1]==e[1],('bold differs',label,n,a,e)
def font_outlines(doc):
 result={}
 for page in doc:
  for record in page.get_fonts(full=True):
   xref=record[0]
   if xref in result:continue
   name,ext,_,data=doc.extract_font(xref)
   if not data:continue
   font=TTFont(io.BytesIO(data));count=0
   if 'glyf' in font:
    for glyph in font.getGlyphOrder():font['glyf'][glyph].getCoordinates(font['glyf']);count+=1
   result[xref]={'name':name,'sha256':hashlib.sha256(data).hexdigest(),'outlines':count};font.close()
 return result
def pdf_check(entry):
 p=Path(entry['path']);doc=fitz.open(p);assert 'RT1:' not in str(doc.metadata)
 chars=[];all_text='';colors=set();fonts=set();minimum=999
 for page in doc:
  page_chars=[];all_text+=page.get_text()
  for trace in page.get_texttrace():
   minimum=min(minimum,trace['size']);assert trace['size']>=13.99
   ink=''.join(f'{round(c*255):02X}' for c in trace['color']);fonts.add(trace['font']);colors.add(ink)
   for cp,gid,origin,bbox in trace['chars']:
    ch=chr(cp)
    if not ch.isspace():assert gid!=0,('missing glyph',p.name,hex(cp))
    assert bbox[0]>=33 and bbox[2]<=page.rect.width-32 and bbox[1]>=9 and bbox[3]<=page.rect.height-12,('page clipping',p.name,page.number,ch,bbox)
    page_chars.append({'ch':ch,'x':origin[0],'y':origin[1],'bold':'Bold' in trace['font'],'color':ink,'bbox':bbox,'size':trace['size']})
  chars.append(page_chars)
 assert 'RT1:' not in all_text
 groups=defaultdict(list);field_lines=load(str(p)+'.lines.json');hanging=0
 for line in field_lines:
  own=sorted([c for c in chars[line['page']] if abs(c['y']-line['baseline'])<.2 and c['x']>=line['x']-.2 and c['x']<line['x']+line['width']+.2],key=lambda c:c['x'])
  assert own,('empty instrumented field line',p.name,line)
  assert max(c['bbox'][2] for c in own)<=line['x']+line['width']+1,('field overflow',p.name,line)
  groups[line['fieldId']].extend((c['ch'],c['bold'],c['color']) for c in own if not c['ch'].isspace())
  if line['x']>42.1 and line['width']>900:hanging+=1
 fields=load(entry['expected']);verified_chars=0
 for field in fields:
  expected=expected_chars(field['runs']);text=''.join(c[0] for c in expected);matched=False
  for group,actual in groups.items():
   stream=''.join(c[0] for c in actual);start=stream.find(text)
   if start<0:continue
   check_chars(actual[start:start+len(expected)],expected,(p.name,group,field['text'][:55]));verified_chars+=len(expected);matched=True;break
  assert matched,('complete field absent in PDF field groups',p.name,field['text'][:110])
 assert set(COLORS.values())<=colors,(p.name,'palette',colors)
 assert any('Bold' in font for font in fonts)
 if entry['kind']=='remarks':
  status=[c for page in chars for c in page if c['color']=='1F5578'];assert status,'Business status color lost'
 if p.name=='remarks-TMSA.pdf':assert len(doc)>2 and hanging>0,'Long list pagination/hanging indent not exercised'
 images=[]
 for n in sorted({0,len(doc)//2,len(doc)-1}):
  image=p.with_name(p.stem+f'-page-{n+1}.png');doc[n].get_pixmap(matrix=fitz.Matrix(1,1),alpha=False).save(image);images.append(str(image))
 return {'pages':len(doc),'sourceFields':len(fields),'verifiedStyledCharacters':verified_chars,'fontFloor':minimum,'colors':sorted(colors),'fonts':font_outlines(doc),'hangingLines':hanging,'images':images}
def cell_chars(cell):
 value=cell.value
 if value is None:return []
 def color(font):
  c=font.color
  return str(c.rgb)[-6:].upper() if c and c.type=='rgb' else None
 if isinstance(value,CellRichText):
  return [(ch,bool(part.font.b),color(part.font)) for part in value if isinstance(part,TextBlock) for ch in part.text if not ch.isspace()]+[] if all(isinstance(part,TextBlock) for part in value) else [(ch,bool(part.font.b) if isinstance(part,TextBlock) else bool(cell.font.b),color(part.font) if isinstance(part,TextBlock) else color(cell.font)) for part in value for ch in (part.text if isinstance(part,TextBlock) else str(part)) if not ch.isspace()]
 return [(ch,bool(cell.font.b),color(cell.font)) for ch in str(value) if not ch.isspace()]
def xlsx_check(entry):
 p=Path(entry['path']);book=openpyxl.load_workbook(p,rich_text=True);fields=load(entry['expected']);groups=defaultdict(list);rich_cells=0;rows=0
 for sheet in book:
  assert 'RT1:' not in sheet.title
  operational=entry['kind']!='framework';start=5 if operational else 7
  if operational:
   assert sheet.freeze_panes=='A5';assert sheet.auto_filter.ref==f'A4:{openpyxl.utils.get_column_letter(sheet.max_column)}{sheet.max_row}'
   assert not any(r.max_row>=5 for r in sheet.merged_cells.ranges)
  else:assert sheet.freeze_panes=='B7'
  for row in sheet:
   if row[0].row>=start and any(c.value is not None for c in row):rows+=1
   assert (sheet.row_dimensions[row[0].row].height or 0)<=409.5
   for c in row:
    assert 'RT1:' not in str(c.value)
    if isinstance(c.value,CellRichText):rich_cells+=1
    if c.value is not None:assert len(str(c.value))<=32767
    chars=cell_chars(c)
    if entry['kind']=='remarks' and c.column==6 and c.row>=5:
     prefix=re.match(r'^\[\d+/\d+\]\n',str(c.value));chars=chars[len(norm(prefix[0])):] if prefix else chars
    if c.row<start:groups[(sheet.title,c.coordinate)].extend(chars)
    else:
     key=(str(sheet.cell(c.row,2 if entry['kind']=='remarks' else 1).value),str(sheet.cell(c.row,3).value) if sheet.title=='全部進度' else '')
     groups[(sheet.title,key,c.column)].extend(chars)
  if entry['kind']=='remarks':
   assert sheet.max_column==6;assert sheet['C5'].font.color.rgb=='FF1F5578'
  if entry['kind']=='improvements':
   for r in range(5,sheet.max_row+1):
    for col in ([3,11,12,13] if sheet.title=='改善項目' else [4]):
     c=sheet.cell(r,col)
     if c.value is not None:assert c.is_date and c.number_format=='yyyy-mm-dd'
 verified=0
 if entry['kind']=='framework':
  plan=load(str(p)+'.plan.json')
  for target in plan:
   cell=book[target['sheet']][target['cell']];actual=cell_chars(cell);expected=expected_chars(target['runs'])
   # Preserve template bold for unspecified source runs; explicit source Bold is additive.
   expected=[(ch,b or bool(cell.font.b),color) for ch,b,color in expected]
   check_chars(actual,expected,(p.name,target['cell']));verified+=len(expected)
 else:
  for field in fields:
   expected=expected_chars(field['runs']);text=''.join(c[0] for c in expected);matched=False
   for group,actual in groups.items():
    start=''.join(c[0] for c in actual).find(text)
    if start<0:continue
    check_chars(actual[start:start+len(expected)],expected,(p.name,str(group),field['text'][:55]));verified+=len(expected);matched=True;break
   assert matched,('complete field absent in workbook groups',p.name,field['text'][:100])
 assert rich_cells>0
 if p.name in ['remarks-TMSA.xlsx','framework-TMSA.xlsx']:assert rows>10
 return {'sheets':book.sheetnames,'physicalRows':rows,'richCells':rich_cells,'verifiedStyledCharacters':verified,'sourceFields':len(fields),'filterFreezeDatesBorders':'PASS'}
def plain_compare(baseline,candidate):
 before={e['id']:e for e in load(baseline)['artifacts']};after={e['id']:e for e in load(candidate)['artifacts']};assert set(before)==set(after) and len(before)==13
 results=[]
 for name,old in before.items():
  new=after[name];assert sha(old['path'])==old['sha256'];assert sha(new['path'])==new['sha256']
  if name.endswith('.pdf'):
   def signature(path):
    doc=fitz.open(path)
    return [{'size':list(p.rect),'trace':p.get_texttrace(),'drawings':p.get_drawings()} for p in doc]
   assert signature(old['path'])==signature(new['path']),('pure PDF geometry/content changed',name)
   assert load(old['path']+'.lines.json')==load(new['path']+'.lines.json')
   results.append({'id':name,'exactGlyphGeometryAndDrawings':'PASS'})
  else:
   with zipfile.ZipFile(old['path']) as a,zipfile.ZipFile(new['path']) as b:
    assert set(a.namelist())==set(b.namelist())
    for part in a.namelist():
     if part!='docProps/core.xml':assert a.read(part)==b.read(part),('pure XLSX part changed',name,part)
   results.append({'id':name,'exactOOXMLExceptTimestamps':'PASS'})
 return results
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('receipt');parser.add_argument('--baseline');parser.add_argument('--candidate');args=parser.parse_args();data=load(args.receipt);out=Path(args.receipt).parent/'artifact-verification.json';result={'status':'RUNNING','receipt':str(Path(args.receipt).resolve()),'verifierSha256':sha(__file__),'artifacts':[]}
 try:
  if args.baseline or args.candidate:result['plainRegression']=plain_compare(args.baseline,args.candidate)
  assert len(data['artifacts'])==13
  for e in data['artifacts']:
   assert sha(e['path'])==e['sha256'];checked=pdf_check(e) if e['format']=='pdf' else xlsx_check(e);result['artifacts'].append({'id':e['id'],**checked});out.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print(e['id'],'PASS')
  result['status']='PASS';result['totals']={'artifacts':len(result['artifacts']),'pdfPages':sum(e.get('pages',0) for e in result['artifacts']),'physicalWorkbookRows':sum(e.get('physicalRows',0) for e in result['artifacts']),'verifiedStyledCharacters':sum(e['verifiedStyledCharacters'] for e in result['artifacts'])}
 except Exception as error:result['status']='FAIL';result['failure']=repr(error);raise
 finally:out.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8');print(json.dumps({'status':result['status'],'receipt':str(out),'totals':result.get('totals')}))
if __name__=='__main__':main()
