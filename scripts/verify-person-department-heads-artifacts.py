"""Verify downloaded person-reference samples; never modify report implementation."""
from pathlib import Path
import csv
import gc
import hashlib
import io
import json
import subprocess
import sys
import time
import traceback
import fitz
import openpyxl

source = Path(sys.argv[1]).resolve()
manifest = json.loads(source.read_text(encoding='utf-8'))
out = source.parent / ('artifact-check-' + str(time.time_ns()))
out.mkdir()
hash_file = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
receipt = {'layer': 'Saved original-browser artifacts; PyMuPDF/openpyxl and owned native Excel', 'sourceReceipt': str(source), 'sourceSha256': hash_file(source), 'verifierSha256': hash_file(__file__), 'cases': [], 'renders': [], 'cleanup': {}}

def check(case_id, details):
    receipt['cases'].append({'id': case_id, 'status': 'PASS', **details})

def excel_pids():
    output = subprocess.check_output(['tasklist', '/FO', 'CSV', '/NH'], text=True, encoding='utf-8', errors='replace')
    return {int(row[1]) for row in csv.reader(io.StringIO(output)) if row and row[0].lower() == 'excel.exe'}

app = None
pid = None
existing = set()
try:
    for artifact in manifest['artifacts']:
        path = Path(artifact['path'])
        assert hash_file(path) == artifact['sha256']
        if artifact['format'] == 'pdf':
            doc = fitz.open(path)
            text = '\n'.join(page.get_text() for page in doc)
            for name in artifact['expectedNames']:
                assert ''.join(name.split()) in ''.join(text.split()), (path.name, name)
            for page in doc:
                for block in page.get_text('dict')['blocks']:
                    for line in block.get('lines', []):
                        for span in line['spans']:
                            if span['text'].strip():
                                x0,y0,x1,y1 = span['bbox']
                                assert x0 >= 0 and y0 >= 0 and x1 <= page.rect.width+1 and y1 <= page.rect.height+1
            render = out / (path.stem + '-page1.png')
            doc[0].get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(render)
            receipt['renders'].append({'path': str(render), 'sha256': hash_file(render)})
            check('PDH-A-' + path.stem + '-pdf-names', {'pages': len(doc), 'expectedNames': artifact['expectedNames'], 'sha256': hash_file(path), 'textBoundsValid': True})
            doc.close()
        else:
            book = openpyxl.load_workbook(path, read_only=True, data_only=False)
            text = '\n'.join(str(cell) for sheet in book for row in sheet.values for cell in row if cell is not None)
            for name in artifact['expectedNames']:
                assert name in text, (path.name, name)
            check('PDH-A-' + path.stem + '-xlsx-names', {'worksheets': book.sheetnames, 'expectedNames': artifact['expectedNames'], 'sha256': hash_file(path)})
            book.close()
    import pythoncom
    import win32com.client
    import win32process
    pythoncom.CoInitialize()
    existing = excel_pids()
    app = win32com.client.DispatchEx('Excel.Application')
    pid = win32process.GetWindowThreadProcessId(app.Hwnd)[1]
    assert pid not in existing, 'Never operate a user Excel process'
    app.Visible = False
    app.DisplayAlerts = False
    app.EnableEvents = False
    app.AutomationSecurity = 3
    for artifact in manifest['artifacts']:
        if artifact['format'] != 'xlsx':
            continue
        path = Path(artifact['path'])
        book = app.Workbooks.Open(str(path), UpdateLinks=0, ReadOnly=True, IgnoreReadOnlyRecommended=True, CorruptLoad=0)
        try:
            values = []
            sheets = []
            for index in range(1, book.Worksheets.Count+1):
                sheet = book.Worksheets(index)
                sheets.append(sheet.Name)
                values.append(str(sheet.UsedRange.Value))
                del sheet
            for name in artifact['expectedNames']:
                assert name in '\n'.join(values), (path.name, name)
            check('PDH-A-' + path.stem + '-native-excel-names', {'worksheets': sheets, 'readOnly': bool(book.ReadOnly), 'corruptLoad': 0, 'expectedNames': artifact['expectedNames'], 'ownedPid': pid})
        finally:
            book.Close(SaveChanges=False)
            del book
        assert hash_file(path) == artifact['sha256']
    receipt['result'] = 'PASS'
except Exception:
    receipt['result'] = 'FAIL'
    receipt['failure'] = traceback.format_exc()
    sys.exitcode = 1
finally:
    if app is not None:
        app.Quit()
        del app
        gc.collect()
        pythoncom.CoUninitialize()
    forced = False
    if pid is not None and pid not in existing:
        for _ in range(20):
            if pid not in excel_pids():
                break
            time.sleep(.25)
        if pid in excel_pids():
            subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'], check=True, capture_output=True)
            forced = True
        receipt['cleanup'] = {'ownedPid': pid, 'wasPreexisting': False, 'stopped': pid not in excel_pids(), 'forcedOwnedCleanup': forced, 'existingExcelPids': sorted(existing), 'existingStillPresent': existing <= excel_pids()}
        if not receipt['cleanup']['stopped'] or not receipt['cleanup']['existingStillPresent']:
            receipt['result'] = 'FAIL'
    receipt['sourceArtifactsUnchanged'] = all(hash_file(a['path']) == a['sha256'] for a in manifest['artifacts'])
    if not receipt['sourceArtifactsUnchanged']:
        receipt['result'] = 'FAIL'
    target = out / 'receipt.json'
    target.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'result': receipt['result'], 'cases': len(receipt['cases']), 'cleanup': receipt['cleanup'], 'receipt': str(target)}, ensure_ascii=True))
sys.exit(0 if receipt['result'] == 'PASS' else 1)
