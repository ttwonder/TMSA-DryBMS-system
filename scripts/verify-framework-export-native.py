"""Owned read-only Excel: real schema, AutoFit and filter/sort associations."""
import sys,json,hashlib,shutil,uuid,gc,subprocess
from pathlib import Path
from collections import Counter

def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def worker(entry):
 import win32com.client,win32process,win32api,win32con,win32event
 path=Path(entry['path']).resolve();before=digest(path);copy=Path('qa-evidence')/('fw-native-'+uuid.uuid4().hex[:8]+'.xlsx');copy=copy.resolve();shutil.copy2(path,copy)
 existing=set(win32process.EnumProcesses());app=win32com.client.DispatchEx('Excel.Application');app.Visible=False;app.DisplayAlerts=False;app.EnableEvents=False;app.AutomationSecurity=3
 _,pid=win32process.GetWindowThreadProcessId(app.Hwnd);assert pid not in existing
 handle=win32api.OpenProcess(win32con.SYNCHRONIZE|win32con.PROCESS_TERMINATE,False,pid);book=sheet=rng=sort=None
 result={'source':str(path),'sourceSha256':before,'ownedPid':pid,'copy':str(copy),'sheets':[]}
 try:
  book=app.Workbooks.Open(str(copy),UpdateLinks=0,ReadOnly=True,CorruptLoad=0);assert book.ReadOnly
  for n in range(1,book.Worksheets.Count+1):
   sheet=book.Worksheets(n);sheet.Activate();rng=sheet.AutoFilter.Range;first=int(rng.Row)+1;last=int(rng.Row+rng.Rows.Count-1);cols=int(rng.Columns.Count)
   sr={'name':sheet.Name,'columns':cols,'first':first,'last':last,'range':rng.Address,'merges':str(rng.MergeCells)};assert cols==8 and first==3;assert app.ActiveWindow.SplitRow==2;assert sheet.PageSetup.Zoom==False;result['sheets'].append(sr)
   sr['assessmentColumnWidth']=[sheet.Columns(c).ColumnWidth for c in [5,6]];assert sr['assessmentColumnWidth'][0]==sr['assessmentColumnWidth'][1]
   if last<first:continue
   vals=lambda:[tuple(sheet.Range(sheet.Cells(i,1),sheet.Cells(i,cols)).Value2[0]) for i in range(first,last+1)]
   original=vals()
   import openpyxl
   oracle=openpyxl.load_workbook(path,rich_text=False);osheet=oracle.worksheets[n-1];assert rng.Address.replace('$','')==osheet.auto_filter.ref
   expected=[tuple(osheet.cell(r,c).value for c in range(1,cols+1)) for r in range(first,last+1)]
   assert original==expected,'Complete ordered cell associations differ from actual download'
   for r in range(first,last+1):
    if sheet.Cells(r,4).Value2=='N':
     assert int(sheet.Cells(r,4).DisplayFormat.Interior.Color)==13551615;assert int(sheet.Cells(r,4).DisplayFormat.Font.Color)==393372;assert sheet.Cells(r,4).FormatConditions.Count>=1
    assert int(sheet.Cells(r,7).Font.Color)==255,'evidence base colour remains red'
    if str(sheet.Cells(r,5).Value2).startswith('SPLIT_EN_00'):
     assert sheet.Cells(r,5).Font.Size==12 and sheet.Cells(r,6).Font.Size==12
     assert str(sheet.Cells(r,6).Value2).startswith('SPLIT_ZH_00');assert 'SPLIT_ZH_' not in sheet.Cells(r,5).Value2 and 'SPLIT_EN_' not in sheet.Cells(r,6).Value2
     sr['splitControl']={'row':r,'declared':sheet.Rows(r).RowHeight,'fontSizes':[sheet.Cells(r,c).Font.Size for c in [5,6]]}
     if entry.get('baselineControl'):
      bp=Path(entry['baselineControl']['path']);assert digest(bp)==entry['baselineControl']['sha256'];bc=copy.with_name(copy.stem+'-base.xlsx');shutil.copy2(bp,bc);bb=app.Workbooks.Open(str(bc),UpdateLinks=0,ReadOnly=True,CorruptLoad=0)
      try:
       bs=bb.Worksheets(1);assert bs.Cells(3,5).Value2==sheet.Cells(r,5).Value2+'\n'+sheet.Cells(r,6).Value2
       sr['splitControl']['baseline']={'sha256':digest(bp),'height':bs.Rows(3).RowHeight,'fontSize':bs.Cells(3,5).Font.Size,'columnWidth':bs.Columns(5).ColumnWidth};assert sheet.Rows(r).RowHeight<bs.Rows(3).RowHeight
      finally:bs=None;bb.Close(SaveChanges=False);bb=None;assert digest(bp)==entry['baselineControl']['sha256'];sheet.Activate()
    if str(sheet.Cells(r,2).Value2).startswith('KPI_dry-'):
     cell=sheet.Cells(r,2);chars=win32com.client.Dispatch(cell._oleobj_.Invoke(cell._oleobj_.GetIDsOfNames('Characters'),0,2,True,1,4));assert chars.Font.Bold;assert int(chars.Font.Color)==12608789;assert cell.Font.Size==12;chars=cell=None
   sr['exactCellAssociations']='PASS';sr['knownOverflowRows']=[r for r in range(first,last+1) if 'OVERFLOW_99' in str(sheet.Cells(r,3).Value2)]
   sr['visibleHeightLimit']='LIMITED_USE_PDF_FULL_TEXT' if sr['knownOverflowRows'] else 'not-at-known-overflow'
   for r in sr['knownOverflowRows']:
    assert sheet.Cells(r,3).Font.Size==10;assert sheet.Rows(r).RowHeight==409.5;assert 'PDF' in str(sheet.UsedRange.Value2)
   heights=[sheet.Rows(i).RowHeight for i in range(first,last+1)]
   sheet.Range(sheet.Cells(first,1),sheet.Cells(last,cols)).Rows.AutoFit();needed=[sheet.Rows(i).RowHeight for i in range(first,last+1)]
   sr.update(declared=heights,autofit=needed,clipped=[first+i for i,(a,b) in enumerate(zip(heights,needed)) if a and b>a+1],excess=[round(a-b,2) if a else 0 for a,b in zip(heights,needed)])
   sr['excessWholeLines']=[first+i for i,x in enumerate(sr['excess']) if x>=15.4]
   sr['columnWidths']=[sheet.Columns(i).Width for i in range(1,cols+1)]
   if 'splitControl' in sr:sr['splitControl']['nativeAutoFit']=needed[sr['splitControl']['row']-first];assert sr['splitControl']['declared']>=sr['splitControl']['nativeAutoFit']
   sr['footer']={'left':sheet.PageSetup.LeftFooter,'center':sheet.PageSetup.CenterFooter}
   assert sr['footer']['left'].startswith('&12') and sr['footer']['center'].startswith('&12'),sr['footer']
   # Render original row heights, not an AutoFit-repaired workbook.
   for i,h in enumerate(heights,first):
    if h is not None:sheet.Rows(i).RowHeight=h
   pdf=copy.with_name(copy.stem+'-'+str(n)+'.pdf');sheet.ExportAsFixedFormat(0,str(pdf));sr['render']=str(pdf)
   key=2 if entry['request'].get('filters',{}).get('reportVariant')=='remarks' else 1
   nonempty=[row for row in original if row[key-1] is not None]
   if nonempty:
    value=nonempty[0][key-1];rng.AutoFilter(Field=key,Criteria1=value)
    visible=[row for i,row in enumerate(vals(),first) if not sheet.Rows(i).Hidden]
    assert Counter(visible)==Counter(row for row in original if row[key-1]==value);sheet.ShowAllData();sr['filter']='PASS'
    header=tuple(sheet.Range(sheet.Cells(first-1,1),sheet.Cells(first-1,cols)).Value2[0])
    for order in [2,1]:
     sort=sheet.Sort;sort.SortFields.Clear();sort.SortFields.Add(Key=sheet.Range(sheet.Cells(first,key),sheet.Cells(last,key)),SortOn=0,Order=order,DataOption=0);sort.SetRange(rng);sort.Header=1;sort.MatchCase=False;sort.Orientation=1;sort.Apply()
     assert Counter(vals())==Counter(original);assert tuple(sheet.Range(sheet.Cells(first-1,1),sheet.Cells(first-1,cols)).Value2[0])==header
     sheet.Range(sheet.Cells(first,1),sheet.Cells(last,cols)).Rows.AutoFit()
    sr['sortAssociationsAndExplicitAutoFit']='PASS'
  result['nativeAcceptance']='PASS';result['initialHeights']='FAIL' if any(s.get('clipped') for s in result['sheets']) else ('PASS_WITH_KNOWN_OVERFLOW_LIMITATION' if any(s.get('knownOverflowRows') for s in result['sheets']) else 'PASS')
 finally:
  sort=rng=sheet=None
  if book is not None:book.Close(SaveChanges=False)
  book=None;app.Quit();app=None;gc.collect();stopped=win32event.WaitForSingleObject(handle,8000)==win32event.WAIT_OBJECT_0
  if not stopped:win32api.TerminateProcess(handle,0);result['forcedOwnedStop']=True;stopped=win32event.WaitForSingleObject(handle,5000)==win32event.WAIT_OBJECT_0
  handle.Close();result['ownedExcelStopped']=stopped;assert stopped;assert digest(path)==before and digest(copy)==before;result['sourceAndCopyUnchanged']=True
  if sys.exc_info()[0]:print(json.dumps(result,ensure_ascii=True))
 return result

def main():
 if '--worker' in sys.argv:print(json.dumps(worker(json.loads(sys.stdin.read())),ensure_ascii=True));return
 receipt=Path(sys.argv[1]);data=json.loads(receipt.read_text(encoding='utf8'));out=receipt.parent/('native-'+uuid.uuid4().hex[:8]+'.json');result={'status':'RUNNING','artifacts':[],'receiptSha256':digest(receipt),'producerSha256':digest(__file__)}
 try:
  for entry in data['artifacts']:
   if entry['format']!='xlsx':continue
   r=subprocess.run([sys.executable,__file__,'--worker'],input=json.dumps({**entry,'baselineControl':data.get('baselineControl')}),capture_output=True,text=True,encoding='utf8',timeout=100)
   if r.returncode:result['artifacts'].append({'id':entry['id'],'failure':r.stderr,'stdout':r.stdout});raise RuntimeError(r.stderr)
   artifact=json.loads(r.stdout);result['artifacts'].append(artifact);out.write_text(json.dumps(result,indent=2),encoding='utf8');assert artifact['initialHeights'] in ['PASS','PASS_WITH_KNOWN_OVERFLOW_LIMITATION'],artifact
  result['status']='PASS'
 except Exception as ex:result['status']='FAIL';result['failure']=str(ex)
 finally:out.write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'status':result['status'],'receipt':str(out)}));sys.exit(0 if result['status']=='PASS' else 1)
if __name__=='__main__':main()
