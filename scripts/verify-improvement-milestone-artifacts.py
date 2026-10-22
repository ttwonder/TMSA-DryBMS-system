"""Verify actual milestone downloads with PyMuPDF and owned native Excel.
Run with the original-App evidence directory; never opens production or user workbooks.
"""
from pathlib import Path
import sys, json, hashlib, shutil, gc, traceback
import pymupdf as fitz
import win32com.client, win32process, win32api, win32event, win32con
out = Path(sys.argv[1]).resolve()
result = {'layer': 'Actual original-App downloads; independent PDF parser/render and native Excel COM', 'status': 'RUNNING', 'pdf': [], 'xlsx': []}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
compact = lambda s: ''.join(s.split())
record = json.loads((out / 'pdf-authorized-snapshot.json').read_text('utf-8'))['improvements'][0]
app = book = sheet = cell = area = None
pid = None
existing = set(win32process.EnumProcesses())
try:
    for lang in ['zh', 'en']:
        path = out / f'milestones-{lang}.pdf'
        doc = fitz.open(path)
        text = '\n'.join(page.get_text() for page in doc)
        merged = compact(text)
        assert not doc.is_encrypted and doc.page_count > 1
        assert compact(record['title']) in merged and 'QAlegacymanual' not in merged
        for token in ['100%', 'OVERALL_PLAN', 'HANDWRITTEN', 'Supplier delay', 'Evidence correction', 'Stage three', '2026-11-20 → 2026-11-27', '2026-11-30 → 2026-12-07']:
            assert compact(token) in merged, (lang, token)
        goals = [row['goal'] for row in record['milestones']]
        for event in record['milestoneEvents']:
            goals.extend(row['goal'] for row in event['before'] + event['after'])
            if event['reason']:
                assert compact(event['reason']) in merged
        for goal in goals:
            for line in goal.splitlines():
                if line.strip():
                    assert compact(line) in merged, (lang, line)
        sizes = []
        for page in doc:
            for block in page.get_text('dict')['blocks']:
                for line in block.get('lines', []):
                    for span in line['spans']:
                        if not span['text'].strip():
                            continue
                        sizes.append(span['size'])
                        x0, y0, x1, y1 = span['bbox']
                        assert x0 >= 0 and y0 >= 0 and x1 <= page.rect.width + .5 and y1 <= page.rect.height + .5
        assert min(sizes) >= 13.9
        renders = []
        for n in sorted({0, doc.page_count // 2, doc.page_count - 1}):
            image = out / f'milestones-{lang}-page-{n + 1}.png'
            doc[n].get_pixmap(matrix=fitz.Matrix(1.25, 1.25)).save(str(image))
            renders.append(str(image))
        (out / f'milestones-{lang}.txt').write_text(text, encoding='utf-8')
        result['pdf'].append({'path': str(path), 'sha256': sha(path), 'pages': doc.page_count, 'minimumFont': min(sizes), 'completeGoalLinesAndReasons': True, 'boundsPass': True, 'renders': renders})
        doc.close()
    app = win32com.client.DispatchEx('Excel.Application')
    pid = win32process.GetWindowThreadProcessId(app.Hwnd)[1]
    assert pid not in existing
    app.Visible = False
    app.DisplayAlerts = False
    app.EnableEvents = False
    app.AutomationSecurity = 3
    native = out / 'native-excel'
    native.mkdir(exist_ok=True)
    for lang in ['zh', 'en']:
        path = out / f'milestones-{lang}.xlsx'
        before = sha(path)
        copy = native / path.name
        if not copy.exists():
            shutil.copy2(path, copy)
        assert sha(copy) == before
        book = app.Workbooks.Open(str(copy), UpdateLinks=0, ReadOnly=True, CorruptLoad=0)
        assert book.ReadOnly and book.Worksheets.Count == 4
        sheets, text = [], []
        for i in range(1, 5):
            sheet = book.Worksheets(i)
            sheet.Activate()
            last, columns = sheet.UsedRange.Rows.Count, sheet.UsedRange.Columns.Count
            assert sheet.AutoFilterMode and sheet.AutoFilter.Range.Rows.Count == last - 3
            assert sheet.AutoFilter.Range.Columns.Count == columns
            assert app.ActiveWindow.FreezePanes and app.ActiveWindow.SplitRow == 4
            assert sheet.Range(sheet.Cells(5, 1), sheet.Cells(last, columns)).MergeCells is False
            if i >= 3:
                declared_height = sheet.Rows(4).RowHeight
                sheet.Rows(4).AutoFit()
                needed_height = sheet.Rows(4).RowHeight
                assert declared_height >= needed_height, (lang, sheet.Name, 'header clipped', declared_height, needed_height)
                sheet.Rows(4).RowHeight = declared_height
            values = sheet.UsedRange.Value
            text.extend(str(v) for row in values for v in row if v is not None)
            sheets.append({'name': sheet.Name, 'rows': last, 'columns': columns, 'filter': sheet.AutoFilter.Range.Address, 'bodyUnmerged': True, 'frozenHeaderRows': 4})
            sheet = None
        joined = '\n'.join(text)
        for token in ['QA milestone action', 'OVERALL_PLAN', 'HANDWRITTEN', 'Supplier delay', 'Evidence correction', 'Stage three']:
            assert token in joined, (lang, token)
        assert 'QA legacy manual' not in joined
        assert book.Worksheets(1).Cells(5, 17).Value2 == 100
        sheet = book.Worksheets(3)
        assert sheet.UsedRange.Rows.Count == 7
        for row in range(5, 8):
            assert hasattr(sheet.Cells(row, 5).Value, 'year') and hasattr(sheet.Cells(row, 7).Value, 'year')
            assert sheet.Cells(row, 5).Value2 > 0 and sheet.Cells(row, 7).Value2 > 0
            assert sheet.Cells(row, 5).NumberFormat == 'yyyy-mm-dd'
        original = list(sheet.Range('A5:I7').Value2)
        area = sheet.AutoFilter.Range
        header = sheet.Range('A4:I4').Value2
        def sort_stages(order):
            sheet.Sort.SortFields.Clear()
            sheet.Sort.SortFields.Add(Key=sheet.Range('C5:C7'), SortOn=0, Order=order)
            sheet.Sort.SortFields.Add(Key=sheet.Range('I5:I7'), SortOn=0, Order=1)
            sheet.Sort.SetRange(sheet.Range('A4:I7'))
            sheet.Sort.Header = 1
            sheet.Sort.Orientation = 1
            assert sheet.Sort.Header == 1
            sheet.Sort.Apply()
            assert sheet.Range('A4:I4').Value2 == header
        sort_stages(2)
        sorted_rows = list(sheet.Range('A5:I7').Value2)
        assert sorted(original, key=repr) == sorted(sorted_rows, key=repr)
        assert [row[2] for row in sorted_rows] == [3, 2, 1]
        area.AutoFilter(Field=3, Criteria1=2)
        visible = [sheet.Cells(row, 3).Value2 for row in range(5, 8) if not sheet.Rows(row).Hidden]
        assert visible == [2]
        sheet.ShowAllData()
        sort_stages(1)
        assert list(sheet.Range('A5:I7').Value2) == original, {'original': original, 'restored': list(sheet.Range('A5:I7').Value2), 'range': area.Address}
        rendered = native / f'milestone-sheet-{lang}.pdf'
        sheet.ExportAsFixedFormat(0, str(rendered))
        printed = fitz.open(rendered)
        printed_text = compact(''.join(p.get_text() for p in printed))
        for stage in record['milestones']:
            for line in stage['goal'].splitlines():
                if line.strip():
                    assert compact(line) in printed_text, (lang, 'native clipping', line)
        png = native / f'milestone-sheet-{lang}.png'
        printed[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(png))
        printed.close()
        area = sheet = None
        book.Close(False)
        book = None
        assert sha(copy) == before and sha(path) == before
        result['xlsx'].append({'path': str(path), 'sha256': before, 'sheets': sheets, 'acceptedWithCorruptLoad0': True, 'nativeNumericFilterAndStageSort': True, 'dateCells': True, 'sourceAndCopyUnchanged': True, 'nativeGoalRender': str(png)})
    result['status'] = 'PASS'
except Exception:
    result['status'] = 'FAIL'
    result['failure'] = traceback.format_exc()
finally:
    if book is not None:
        try:
            book.Close(False)
        except Exception:
            pass
    if app is not None:
        try:
            app.Quit()
        except Exception:
            pass
    book = sheet = cell = area = app = None
    gc.collect()
    if pid:
        forced = False
        try:
            handle = win32api.OpenProcess(win32con.SYNCHRONIZE | win32con.PROCESS_TERMINATE, False, pid)
            if win32event.WaitForSingleObject(handle, 8000) == win32con.WAIT_TIMEOUT:
                assert pid not in existing
                win32api.TerminateProcess(handle, 0)
                forced = True
                win32event.WaitForSingleObject(handle, 5000)
            win32api.CloseHandle(handle)
        except Exception:
            if pid in set(win32process.EnumProcesses()):
                result['status'] = 'FAIL'
        result['cleanup'] = {'ownedPid': pid, 'ownedExcelStopped': pid not in set(win32process.EnumProcesses()), 'forcedOwnedCleanup': forced}
        if not result['cleanup']['ownedExcelStopped']:
            result['status'] = 'FAIL'
    result['verifierSha256'] = sha(Path(__file__))
    (out / 'artifact-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
raise SystemExit(result['status'] != 'PASS')
