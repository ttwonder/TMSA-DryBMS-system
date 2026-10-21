"""Independent saved-download verification and fresh owned Excel COM filter/sort.
Synthetic evidence only. Never save or modify the source; retain disposable copies.
"""
import json,re,sys,hashlib,io,shutil,uuid,subprocess,gc
from pathlib import Path
from collections import Counter
import fitz,openpyxl
from fontTools.ttLib import TTFont

def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def compact(v): return '\n'.join(line for line in str(v or '').replace('\r\n','\n').replace('\r','\n').split('\n') if line.strip())
def glyphtext(v): return re.sub(r'\s+','',v)
def bi(v): return compact(v.get('en','')+'\n'+v.get('zh',''))

def pdf_check(entry,state):
 p=Path(entry['path']);doc=fitz.open(p);spans=[];text='';font_hashes={};glyphs=0
 for page in doc:
  blocks=page.get_text('dict')['blocks'];page_spans=[s for b in blocks if 'lines' in b for l in b['lines'] for s in l['spans']];assert page_spans,'Blank page'
  for s in page_spans:
   assert s['size']>=13.99,('font floor',s)
   x0,y0,x1,y1=s['bbox'];assert x0>=33 and x1<=page.rect.width-33 and y0>=10 and y1<=page.rect.height-12,('clipping',s)
   spans.append((page.number,s))
  # Reading order: real draw order, strip only generated page furniture.
  for b in blocks:
   for line in b.get('lines',[]):
    t=''.join(s['text'] for s in line['spans'])
    if line['bbox'][1]<55 or line['bbox'][1]>page.rect.height-55:continue
    if re.search(r' · (續頁|continued) \d*$',t) or re.fullmatch(r'(項目|Action) \d+ · (續頁|continued)',t):continue
    text+=t+'\n'
  for trace in page.get_texttrace():
   for ch in trace['chars']:
    if chr(ch[0]).strip():assert ch[1]!=0,('missing glyph',ch[0]);glyphs+=1
  for f in page.get_fonts(full=True):
   xref=f[0]
   if xref in font_hashes:continue
   _,ext,_,data=doc.extract_font(xref)
   if data and ext in ('ttf','otf'):
    font=TTFont(io.BytesIO(data));decoded=0
    if 'glyf' in font:
     for name in font.getGlyphOrder():font['glyf'][name].getCoordinates(font['glyf']);decoded+=1
    font_hashes[xref]={'sha256':hashlib.sha256(data).hexdigest(),'decodedOutlines':decoded}
 stream=glyphtext(text);request=entry['request'];kind=request['kind'];remarks=request.get('filters',{}).get('reportVariant')=='remarks'
 fields=[];geometry={}
 def same_row(labels):
  found=[]
  for label in labels:
   candidates=[(n,s) for n,s in spans if s['text']==label];assert candidates,('header missing',label);found.append(candidates[0])
  assert len({n for n,s in found})==1 and max(s['origin'][1] for n,s in found)-min(s['origin'][1] for n,s in found)<.2,('not horizontal',labels)
  assert [s['origin'][0] for n,s in found]==sorted({s['origin'][0] for n,s in found}),('columns overlap',labels)
  return [{'page':n+1,'x':s['origin'][0],'y':s['origin'][1]} for n,s in found]
 if kind=='improvements' or remarks:
  for marker in ['TECHNICAL_SNAPSHOT_TOKEN','伺服器快照','快照識別','明選筆數','快照:', 'SECRET_IMPORT_FILE','SECRET_IMPORT_NOTE','SECRET_RAW_ITEM','來源去重鍵','發現編號']:
   assert marker not in text,('technical text',marker)
  for marker in [state['snapshotToken']]+[r['id'] for r in state.get('improvements',[])]+[e['id'] for r in state.get('improvements',[]) for e in r['events']]:assert marker not in text,('technical identity',marker)
  assert not re.search(r'\d{4}-\d\d-\d\d[T ]\d\d:',text),'Operational visible timestamp precision'
 if remarks:
  geometry['row1']=same_row(['對應章節','Item','備註狀態']);geometry['row2']=same_row(['涉及部門','追蹤人員'])
  for a in state['assessments']:
   if a.get('remarks','').strip():fields.append(a['remarks'])
  for a in state['assessments']:
   if a.get('remarks','').strip():
    for id in a['assigneeIds']:
     name=next((p['name'] for p in state['people'] if p['id']==id),id);assert name in text
 elif kind=='improvements':
  geometry['row1']=same_row(['急迫度','狀態','最新更新']);geometry['row2']=same_row(['關聯編號','來源','分類','目標日期','結案時間']);geometry['row3']=same_row(['涉及部門','執行人'])
  for row in state['improvements']:
   fields += [row['title'],row['content']['en'],row['content']['zh'],row['plan']]+[e['content'] for e in row['events']]
   for e in row['events']:assert e['at'][:10] in text
   if not row['events']:assert '尚無進度事件' in text
 elif kind=='framework':
  for i in state['items']:fields += [i['kpi']['en'],i['kpi']['zh'],i['guidance']['en'],i['guidance']['zh']]
  for a in state['assessments']:fields += [a['selfAssessment']['en'],a['selfAssessment']['zh'],a['evidence']['en'],a['evidence']['zh']]
 elif kind=='inspection':
  for i in state['inspections']:
   for item in i['snapshot']['items']:fields += [item['kpi']['en'],item['kpi']['zh'],item['guidance']['en'],item['guidance']['zh']]
   for r in i['results']:fields += [r['observation']['en'],r['observation']['zh'],r['recommendation']['en'],r['recommendation']['zh']]
   for r in i['findings']:fields += [r['observation']['en'],r['observation']['zh'],r['recommendation']['en'],r['recommendation']['zh']]
 elif kind=='overview':
  for r in state['improvements']:
   if r['itemIds'] and r['status']!='closed':fields += [r['content']['en'],r['content']['zh'],r['plan']]+([r['events'][-1]['content']] if r['events'] else [])
 # Independent full nonempty line equality/order; line wraps/page furniture only are projected away.
 count=0
 for field in fields:
  last=-1
  for line in compact(field).split('\n'):
   if not line:continue
   target=glyphtext(line.replace('\u0095','•').replace('\u0099','•').replace('\u009c','•'))
   pos=stream.find(target,last+1);assert pos>=0,('complete source line missing/out of order',p.name,line[:90]);last=pos;count+=1
 # Every operational body row occupies the full content width; check real rectangles.
 if kind=='improvements' or remarks:
  label='完整備註' if remarks else '完整內容'
  for n,s in spans:
   if s['text']==label:
    rects=[d['rect'] for d in doc[n].get_drawings() if d['rect'].x0<=34.1 and d['rect'].x1>=doc[n].rect.width-34.1 and d['rect'].y0<=s['bbox'][1] and d['rect'].y1>=s['bbox'][3]]
    assert rects,('not full width narrative cell',label)
  geometry['fullWidthNarrative']='PASS'
 images=[]
 for n in sorted({0,len(doc)//2,len(doc)-1}):
  image=p.with_name(p.stem+f'-page-{n+1}.png');doc[n].get_pixmap(matrix=fitz.Matrix(1,1),alpha=False).save(image);images.append(str(image))
 return {'pages':len(doc),'nonemptySourceLines':count,'rawGlyphs':glyphs,'embeddedFonts':font_hashes,'geometry':geometry,'images':images,'fontFloor':14}

def xlsx_check(entry,state):
 path=Path(entry['path']);book=openpyxl.load_workbook(path);request=entry['request'];remarks=request.get('filters',{}).get('reportVariant')=='remarks';operational=remarks or request['kind']=='improvements';rows_checked=0
 for sheet in book:
  if operational:
   assert sheet.freeze_panes=='A5';assert sheet.auto_filter.ref==f'A4:{openpyxl.utils.get_column_letter(sheet.max_column)}{sheet.max_row}'
   assert not any(r.max_row>=5 for r in sheet.merged_cells.ranges),'Merged data breaks sort'
  for row in sheet.iter_rows(min_row=5 if operational else 7):
   if all(c.value is None for c in row):continue
   rows_checked+=1;assert (sheet.row_dimensions[row[0].row].height or 15)<=409.5
   for c in row:
    if isinstance(c.value,str):assert len(c.value)<=32767 and not re.search(r'\n\s*\n',c.value),('blank lines',c.coordinate)
    if c.value is not None:assert c.data_type!='f' or not operational
 if remarks:
  sheet=book.worksheets[0];headers=[c.value for c in sheet[4]];assert headers==['對應章節','Item','備註狀態','涉及部門','追蹤人員','完整備註','段次']
  for a in state['assessments']:
   if not a.get('remarks','').strip():continue
   item=next(i for i in state['items'] if i['id']==a['itemId']);rows=[r for r in sheet.iter_rows(min_row=5,values_only=True) if r[1]==item['code']];rows.sort(key=lambda r:r[6]);assert ''.join(r[5] or '' for r in rows)==compact(a['remarks'])
   names=' / '.join(next((p['name'] for p in state['people'] if p['id']==id),id) for id in a['assigneeIds']) or '—';assert all(r[4]==names for r in rows)
 elif request['kind']=='improvements':
  sheet=book.worksheets[0];progress=book.worksheets[1];allrows=list(sheet.iter_rows(min_row=5,values_only=True));events=list(progress.iter_rows(min_row=5,values_only=True));assert len({r[0] for r in allrows})==len(request['ids'])
  for no,id in enumerate(request['ids'],1):
   row=next(i for i in state['improvements'] if i['id']==id);parts=sorted([r for r in allrows if r[0]==no],key=lambda r:r[15]);body=bi(row['content']);title=compact(row['title']);body=body if title in [body,compact(row['content']['en']),compact(row['content']['zh'])] else title+'\n'+body
   assert ''.join(r[13] or '' for r in parts)==body;assert ''.join(r[14] or '' for r in parts)==compact(row['plan'])
   for ix,key in [(2,'proposedDate'),(10,'updatedAt'),(11,'targetDate'),(12,'closedAt')]:
    expected=(row.get(key) or '')[:10]
    for r in parts:assert (r[ix].strftime('%Y-%m-%d') if r[ix] else '')==expected,(key,r[ix],expected)
   own=[r for r in events if r[0]==no];assert set(r[2] for r in own)==set(range(1,len(row['events'])+1))
   for n,event in enumerate(row['events'],1):assert ''.join(r[6] or '' for r in sorted([r for r in own if r[2]==n],key=lambda r:r[7]))==compact(event['content'])
 if not operational:
  assert entry.get('frameworkPlan');assert digest(entry['frameworkPlan'])==entry['frameworkPlanSha256']
  plan=json.loads(Path(entry['frameworkPlan']).read_text(encoding='utf-8'));assert len(plan)==len(state['items'])
  for spec in plan:
   sheet=book[spec['sheet']];item=next(i for i in state['items'] if i['id']==spec['itemId']);rows=[r for r in sheet.iter_rows(min_row=7,values_only=True) if r[0]==item['code']]
   for col in spec['columns']:
    expected=[p['text'] for p in col['parts']];actual=[r[col['column']-1] or '' for r in rows];assert actual==expected+['']*(len(actual)-len(expected)),('framework saved full field',item['code'],col['column'])
 return {'sheets':book.sheetnames,'physicalRows':rows_checked,'typeFilterFreezeMergeCompleteText':'PASS','operational':operational}

def native_worker(entry):
 import win32com.client,win32process,win32api,win32con,win32event
 path=Path(entry['path']);before=digest(path);copy=path.with_name(path.stem+'-owned-'+uuid.uuid4().hex[:8]+'.xlsx');shutil.copy2(path,copy)
 existing=set(win32process.EnumProcesses());app=win32com.client.DispatchEx('Excel.Application');app.Visible=False;app.DisplayAlerts=False;app.EnableEvents=False;app.AutomationSecurity=3
 _,pid=win32process.GetWindowThreadProcessId(app.Hwnd);assert pid not in existing;handle=win32api.OpenProcess(win32con.SYNCHRONIZE|win32con.PROCESS_TERMINATE,False,pid);book=sheet=rng=sort=None
 result={'ownedPid':pid,'newOwnedProcess':True,'copy':str(copy),'sheets':[],'sourceSha256':before}
 try:
  book=app.Workbooks.Open(str(copy.resolve()),UpdateLinks=0,ReadOnly=True,CorruptLoad=0);assert book.ReadOnly
  operational=entry['request']['kind']=='improvements' or entry['request'].get('filters',{}).get('reportVariant')=='remarks'
  for n in range(1,book.Worksheets.Count+1):
   sheet=book.Worksheets(n);r=int(sheet.UsedRange.Rows.Count);c=int(sheet.UsedRange.Columns.Count);sr={'name':sheet.Name,'rows':r,'columns':c}
   if operational and r>4:
    c=16 if entry['request']['kind']=='improvements' and n==1 else 8 if entry['request']['kind']=='improvements' else 7
    rng=sheet.Range(sheet.Cells(4,1),sheet.Cells(r,c));original=[tuple(sheet.Range(sheet.Cells(i,1),sheet.Cells(i,c)).Value2[0]) for i in range(5,r+1)];key=1 if entry['request']['kind']=='improvements' else 2;value=original[0][key-1]
    assert sheet.AutoFilterMode;assert sheet.AutoFilter.Range.Address==rng.Address
    rng.AutoFilter(Field=key,Criteria1=value);visible=[tuple(sheet.Range(sheet.Cells(i,1),sheet.Cells(i,c)).Value2[0]) for i in range(5,r+1) if not sheet.Rows(i).Hidden]
    assert Counter(visible)==Counter(row for row in original if row[key-1]==value);sr['filterRows']=len(visible);sheet.ShowAllData()
    if entry['request']['kind']=='improvements':
     datecol=3 if n==1 else 4;dates=[row[datecol-1] for row in original if row[datecol-1] is not None]
     if dates:
      assert all(isinstance(v,(int,float)) for v in dates);threshold=min(dates);rng.AutoFilter(Field=datecol,Criteria1='>='+str(int(threshold)));date_visible=[tuple(sheet.Range(sheet.Cells(i,1),sheet.Cells(i,c)).Value2[0]) for i in range(5,r+1) if not sheet.Rows(i).Hidden];assert Counter(date_visible)==Counter(row for row in original if row[datecol-1] is not None and row[datecol-1]>=threshold);sr['nativeDateFilterRows']=len(date_visible);sheet.ShowAllData()
    sort=sheet.Sort;sort.SortFields.Clear();sort.SortFields.Add(Key=sheet.Range(sheet.Cells(5,key),sheet.Cells(r,key)),SortOn=0,Order=2,DataOption=0);sort.SortFields.Add(Key=sheet.Range(sheet.Cells(5,c),sheet.Cells(r,c)),SortOn=0,Order=1,DataOption=0);sort.SetRange(rng);sort.Header=1;sort.MatchCase=False;sort.Orientation=1;sort.Apply()
    after=[tuple(sheet.Range(sheet.Cells(i,1),sheet.Cells(i,c)).Value2[0]) for i in range(5,r+1)];assert Counter(after)==Counter(original),'Sort detached metadata/content';assert [row[key-1] for row in after]==sorted([row[key-1] for row in original],reverse=True);sr['sortAssociation']='PASS'
    # Native auto-fit on disposable memory must fit within declared original row heights.
    heights=[sheet.Rows(i).RowHeight for i in range(5,r+1)];sheet.Range(sheet.Cells(5,1),sheet.Cells(r,c)).Rows.AutoFit();needed=[sheet.Rows(i).RowHeight for i in range(5,r+1)];assert all(h<=409.5 for h in heights);sr['nativeAutoFitMax']=max(needed);sr['declaredMax']=max(heights)
    assert all(a<=b+1 for a,b in zip(needed,heights)),('native row clipping',sheet.Name,max(a-b for a,b in zip(needed,heights)))
   result['sheets'].append(sr)
  result['acceptedWithCorruptLoad0']=True;result['readOnly']=True
 finally:
  sort=rng=sheet=None
  if book is not None:book.Close(SaveChanges=False)
  book=None;app.Quit();app=None;gc.collect();stopped=win32event.WaitForSingleObject(handle,8000)==win32event.WAIT_OBJECT_0
  if not stopped:win32api.TerminateProcess(handle,0);result['forcedOwnedStop']=True;stopped=win32event.WaitForSingleObject(handle,5000)==win32event.WAIT_OBJECT_0
  handle.Close();result['ownedExcelStopped']=stopped;assert stopped;assert digest(path)==before;assert digest(copy)==before;result['sourceAndCopyUnchanged']=True
 return result

def main():
 if '--native-worker' in sys.argv:print(json.dumps(native_worker(json.loads(sys.stdin.read())),ensure_ascii=True));return
 receipt=Path(sys.argv[1]);data=json.loads(receipt.read_text(encoding='utf-8'));out=receipt.parent/('artifact-verification-'+uuid.uuid4().hex[:8]+'.json');result={'inputReceipt':str(receipt),'receiptSha256':digest(receipt),'verifierSha256':digest(__file__),'artifacts':[]}
 try:
  for e in data['downloads']:
   assert digest(e['path'])==e['sha256'];assert digest(e['canonical'])==e['canonicalSha256'];state=json.loads(Path(e['canonical']).read_text(encoding='utf-8'));item={'path':e['path'],'sha256':e['sha256']};result['artifacts'].append(item)
   if e['path'].endswith('.pdf'):item['pdf']=pdf_check(e,state)
   else:
    item['xlsx']=xlsx_check(e,state)
    if '--com' in sys.argv:
     cmd=[sys.executable,str(Path(__file__).resolve()),'--native-worker'];r=subprocess.run(cmd,input=json.dumps(e),text=True,encoding='utf-8',capture_output=True,timeout=180);assert r.returncode==0,r.stderr;item['nativeExcel']=json.loads(r.stdout)
   out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
  result['status']='PASS'
 except Exception as e:
  result['status']='FAIL';result['failure']=str(e);raise
 finally:out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'status':result['status'],'artifacts':len(result['artifacts']),'receipt':str(out)},ensure_ascii=True))
if __name__=='__main__':main()
