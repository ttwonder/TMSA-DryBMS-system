"""Finite physical PDF differential + six-column XLSX/native Excel acceptance.
Original artifacts remain byte-identical; all disposable copies retained.
"""
import json,re,sys,hashlib,importlib.util,subprocess,uuid,gc,shutil,traceback
from pathlib import Path
from collections import Counter
import fitz,openpyxl
spec=importlib.util.spec_from_file_location('prior',Path(__file__).with_name('verify-fpmc-reporting-artifacts.py'));prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
digest=prior.digest
strip_prefix=lambda s: re.sub(r'^\[\d+/\d+\]\n','',str(s or ''))
def xlsx(entry,state):
 book=openpyxl.load_workbook(entry['path']);assert len(book.worksheets)==1;s=book.worksheets[0];lang=entry['lang'];headers=['對應章節','Item','備註狀態','涉及部門','追蹤人員','完整備註'] if lang=='zh' else ['Chapter','Item','Remarks status','Departments','Follow-up people','Complete remarks']
 assert s.max_column==6;assert [c.value for c in s[4]]==headers;assert s.freeze_panes=='A5';assert s.auto_filter.ref==f'A4:F{s.max_row}';assert list(map(str,s.merged_cells.ranges))==['A2:F3'];assert str(s.print_area).endswith(f"$A$1:$F${s.max_row}")
 assert [s.column_dimensions[c].width for c in 'ABCDEF']==[22,10,13,22,20,126];assert not any(d.hidden for d in s.column_dimensions.values());assert all(s.row_dimensions[n].height<=409.5 for n in range(5,s.max_row+1));assert len({s.row_dimensions[n].height for n in range(5,s.max_row+1)})==1
 rows=list(s.iter_rows(min_row=5,values_only=True));assert len({r[1] for r in rows})==8
 for a in state['assessments']:
  item=next(i for i in state['items'] if i['id']==a['itemId']);parts=[r for r in rows if r[1]==item['code']];assert parts
  if len(parts)>1:
   for i,r in enumerate(parts,1):
    m=re.match(r'^\[(\d+)/(\d+)\]\n',r[5]);assert m and (int(m[1]),int(m[2]))==(i,len(parts))
  assert ''.join(strip_prefix(r[5]) for r in parts)==prior.compact(a['remarks'])
  names=' / '.join(next(p['name'] for p in state['people'] if p['id']==id) for id in a['assigneeIds']);departments=' / '.join(next(d['name'][lang] for d in state['settings']['departments'] if d['id']==id) for id in a['departmentIds'])
  assert all(r[4]==names and r[3]==departments for r in parts),'Full saved responsibilities repeated'
 for row in s.iter_rows(min_row=5):
  for c in row:assert c.data_type=='s' and c.alignment.wrap_text and not c.alignment.shrink_to_fit and len(c.value or '')<=32767
 return {'columns':6,'items':8,'physicalRows':len(rows),'fullTextAndAssignments':True,'filterFreezePrintArea':True,'widths':[22,10,13,22,20,126]}
def native(entry):
 import win32com.client,win32process,win32api,win32con,win32event
 p=Path(entry['path']);before=digest(p);copy=p.with_name(p.stem+'-owned-'+uuid.uuid4().hex[:8]+'.xlsx');shutil.copy2(p,copy);existing=set(win32process.EnumProcesses());app=win32com.client.DispatchEx('Excel.Application');app.Visible=False;app.DisplayAlerts=False;app.EnableEvents=False;app.AutomationSecurity=3
 _,pid=win32process.GetWindowThreadProcessId(app.Hwnd);assert pid not in existing;handle=win32api.OpenProcess(win32con.SYNCHRONIZE|win32con.PROCESS_TERMINATE,False,pid);book=sheet=rng=sort=None;result={'ownedPid':pid,'newOwnedProcess':True,'copy':str(copy)}
 try:
  book=app.Workbooks.Open(str(copy.resolve()),UpdateLinks=0,ReadOnly=True,CorruptLoad=0);assert book.ReadOnly;assert book.Worksheets.Count==1;sheet=book.Worksheets(1);r=sheet.UsedRange.Rows.Count;assert sheet.UsedRange.Columns.Count==6;assert not sheet.Columns(7).Hidden
  rng=sheet.Range(sheet.Cells(4,1),sheet.Cells(r,6));read=lambda:[tuple(sheet.Range(sheet.Cells(i,1),sheet.Cells(i,6)).Value2[0]) for i in range(5,r+1)];original=read();assert sheet.AutoFilter.Range.Address==rng.Address
  rng.AutoFilter(Field=2,Criteria1=original[0][1]);visible=[tuple(sheet.Range(sheet.Cells(i,1),sheet.Cells(i,6)).Value2[0]) for i in range(5,r+1) if not sheet.Rows(i).Hidden];assert Counter(visible)==Counter(x for x in original if x[1]==original[0][1]);result['filterRows']=len(visible);sheet.ShowAllData()
  sort=sheet.Sort;sort.SortFields.Clear();sort.SortFields.Add(Key=sheet.Range(sheet.Cells(5,2),sheet.Cells(r,2)),SortOn=0,Order=2,DataOption=0);sort.SortFields.Add(Key=sheet.Range(sheet.Cells(5,6),sheet.Cells(r,6)),SortOn=0,Order=1,DataOption=0);sort.SetRange(rng);sort.Header=1;sort.MatchCase=False;sort.Orientation=1;sort.Apply();after=read();assert Counter(after)==Counter(original);assert [x[1] for x in after]==sorted([x[1] for x in original],reverse=True)
  for code in {x[1] for x in original}:assert [x for x in after if x[1]==code]==[x for x in original if x[1]==code],'Visible prefix restores reading order after cross-record sort'
  heights=[sheet.Rows(i).RowHeight for i in range(5,r+1)];sheet.Range(sheet.Cells(5,1),sheet.Cells(r,6)).Rows.AutoFit();needed=[sheet.Rows(i).RowHeight for i in range(5,r+1)];assert all(a<=b+1 for a,b in zip(needed,heights)),('native row clipping',max(needed),max(heights));assert max(heights)<=409.5
  for i,h in enumerate(heights,5):sheet.Rows(i).RowHeight=h
  result.update({'corruptLoad0':True,'readOnly':True,'sortFullAssociationAndOrder':True,'nativeAutoFitMax':max(needed),'declaredMax':max(heights),'columns':6})
  pdf=p.with_name(p.stem+'-native-excel.pdf');sheet.ExportAsFixedFormat(0,str(pdf.resolve()),0,True,False);result['nativeRender']=str(pdf)
 finally:
  sort=rng=sheet=None
  if book is not None:book.Close(SaveChanges=False)
  book=None;app.Quit();app=None;gc.collect();stopped=win32event.WaitForSingleObject(handle,8000)==win32event.WAIT_OBJECT_0
  if not stopped:win32api.TerminateProcess(handle,0);result['forcedOwnedStop']=True;stopped=win32event.WaitForSingleObject(handle,5000)==win32event.WAIT_OBJECT_0
  handle.Close();assert stopped;result['ownedExcelStopped']=stopped;assert digest(p)==before and digest(copy)==before;result['sourceAndCopyUnchanged']=True
 return result
def physical(path):
 doc=fitz.open(path);result=[]
 for p in doc:
  spans=[(s['text'],round(s['size'],3),tuple(round(v,3) for v in s['bbox']),tuple(round(v,3) for v in s['origin']),s['color']) for b in p.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans']]
  traces=[(t['size'],t['type'],[(c[0],tuple(round(v,3) for v in c[2]),tuple(round(v,3) for v in c[3])) for c in t['chars']]) for t in p.get_texttrace()]
  result.append({'spans':spans,'traces':traces,'renderSha256':hashlib.sha256(p.get_pixmap(matrix=fitz.Matrix(.7,.7)).samples).hexdigest()})
 return result
def main():
 if '--native-worker' in sys.argv:print(json.dumps(native(json.loads(sys.stdin.read())),ensure_ascii=True));return
 base=Path(sys.argv[1]);candidate=Path(sys.argv[2]);out=candidate.parent/('physical-'+uuid.uuid4().hex[:8]+'.json');result={'baseline':str(base),'candidate':str(candidate),'verifierSha256':digest(__file__),'cases':[]}
 def record(id,details):result['cases'].append({'id':id,'status':'PASS',**details});out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 try:
  b=json.loads(base.read_text(encoding='utf-8'));c=json.loads(candidate.read_text(encoding='utf-8'));old={e['id']:e for e in b['downloads']}
  for entry in c['downloads']:
   assert digest(entry['path'])==entry['sha256'];assert digest(entry['canonical'])==entry['canonicalSha256'];state=json.loads(Path(entry['canonical']).read_text(encoding='utf-8'))
   if entry['path'].endswith('.pdf'):
    details=prior.pdf_check(entry,state)
    if entry['id'] in old:
     previous=old[entry['id']];assert digest(previous['path'])==previous['sha256'];assert physical(previous['path'])==physical(entry['path']),'Exact Unicode/geometry/raster differential';details['baselinePhysicalExact']=True
    record('physical-'+entry['id'],details)
   else:
    details=xlsx(entry,state);p=subprocess.run([sys.executable,__file__,'--native-worker'],input=json.dumps(entry),text=True,encoding='utf-8',capture_output=True,timeout=180);assert p.returncode==0,p.stderr;details['nativeExcel']=json.loads(p.stdout)
    doc=fitz.open(details['nativeExcel']['nativeRender']);image=Path(entry['path']).with_suffix('.native.png');doc[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(image);details['nativeImage']=str(image);record('physical-'+entry['id'],details)
  result['status']='PASS'
 except Exception:
  result['status']='FAIL';result['failure']=traceback.format_exc();raise
 finally:out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'status':result['status'],'cases':len(result['cases']),'failure':result.get('failure'),'receipt':str(out)},ensure_ascii=True))
if __name__=='__main__':main()
