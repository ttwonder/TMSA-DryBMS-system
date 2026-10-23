"""Verify actual catalog downloads with OOXML, owned Excel and PDFium.
No native browser Save As interaction; no user Excel instance is attached.
"""
# XML input is only this owned harness's self-generated XLSX, never an uploaded document.
import json,sys,hashlib,subprocess,uuid,unicodedata,zipfile,ctypes,math,xml.etree.ElementTree as ET
from pathlib import Path

def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def compact(s):return ''.join(unicodedata.normalize('NFKC',s).split())

def main():
 source=Path(sys.argv[1]).resolve();r=json.loads(source.read_text(encoding='utf8'));out=source.parent/('catalog-artifacts-'+uuid.uuid4().hex[:8]+'.json')
 result={'inputReceipt':str(source),'inputSha256':digest(source),'status':'RUNNING','excel':[],'pdf':[],'limitations':['PDF is produced by the original authorized popup through CDP; native browser Save As was not attempted.']}
 try:
  for e in r['downloads']:
   if not e['path'].endswith('.xlsx'):continue
   n={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
   with zipfile.ZipFile(e['path']) as z:
    styles=ET.fromstring(z.read('xl/styles.xml'));fonts=styles.find('s:fonts',n);formats=styles.find('s:cellXfs',n);checked=0
    for name in z.namelist():
     if not name.startswith('xl/worksheets/sheet') or not name.endswith('.xml'):continue
     sh=ET.fromstring(z.read(name));auto=sh.find('s:autoFilter',n);assert auto is not None
     assert sh.find('s:sheetViews/s:sheetView/s:pane',n) is not None
     for row in sh.findall('s:sheetData/s:row',n):
      if int(row.attrib['r'])<2:continue
      for cell in row.findall('s:c',n):
       if cell.find('s:v',n) is None and cell.find('s:is',n) is None:continue
       font=fonts[int(formats[int(cell.get('s','0'))].get('fontId','0'))];assert float(font.find('s:sz',n).get('val'))==12;checked+=1
    for run in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('.//s:rPr/s:sz',n):assert float(run.get('val'))==12
   p=subprocess.run([sys.executable,str(Path(__file__).with_name('verify-report-refinement-native.py')),'--worker'],input=json.dumps(e),capture_output=True,text=True,encoding='utf8',timeout=150)
   assert p.returncode==0,p.stderr
   check=json.loads(p.stdout);assert check['nativeAcceptance']=='PASS';assert check['initialHeights']=='PASS';check['twelvePointCellsChecked']=checked;result['excel'].append(check)
  import pypdfium2 as pdfium
  from pypdfium2 import raw
  for e in r['artifacts']:
   p=Path(e['pdf']);doc=pdfium.PdfDocument(p);parts=[];sizes=[];bounds=[];renders=[]
   for i in range(len(doc)):
    page=doc[i];text=page.get_textpage();parts.append(text.get_text_range());w,h=page.get_size()
    for k in range(text.count_chars()):
     ch=raw.FPDFText_GetUnicode(text,k)
     if not ch or chr(ch).isspace():continue
     matrix=raw.FS_MATRIX();assert raw.FPDFText_GetMatrix(text,k,ctypes.byref(matrix))
     size=raw.FPDFText_GetFontSize(text,k)*math.hypot(matrix.c,matrix.d);sizes.append(size)
     x0,y0,x1,y1=text.get_charbox(k)
     if x0<-1 or y0<-1 or x1>w+1 or y1>h+1:bounds.append([i,k,[x0,y0,x1,y1]])
    image=p.with_name(p.stem+'-'+str(i+1)+'.png');page.render(scale=1.5).to_pil().save(image);renders.append(str(image));text.close();page.close()
   doc.close();full='\n'.join(parts);assert compact(e['label']) in compact(full);assert min(sizes)>=11.9,(min(sizes),max(sizes));assert not bounds,bounds
   canonical=json.loads(Path(e['canonical']).read_text(encoding='utf8'));selected=set(r['downloads'][0]['request']['ids']);expected=[]
   for a in canonical['improvements']:
    if a['id'] not in selected:continue
    for s in [a['title'],*a['content'].values(),a['plan']]:
     if s:assert compact(s) in compact(full),s;expected.append(s)
   assert '匯出後再次改名' not in full
   result['pdf'].append({'path':str(p),'sha256':digest(p),'pages':len(parts),'fontMin':min(sizes),'fontMax':max(sizes),'boundsFailures':bounds,'label':e['label'],'completeFields':len(expected),'renders':renders})
  assert len(result['excel'])==len(r['downloads']) and len(result['pdf'])==len(r['artifacts']) and result['excel'] and result['pdf']
  result['status']='PASS'
 except Exception as ex:result['status']='FAIL';result['error']=str(ex)
 finally:out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'status':result['status'],'receipt':str(out),'excel':len(result['excel']),'pdf':len(result['pdf']),'error':result.get('error')}));sys.exit(0 if result['status']=='PASS' else 1)
if __name__=='__main__':main()
