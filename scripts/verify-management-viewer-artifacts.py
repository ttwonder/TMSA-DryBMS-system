"""Check the 12 original-browser GM downloads; synthetic data only.
uv run --offline --no-project --python 3.12 --with pymupdf==1.26.5 --with openpyxl==3.1.5 --with pywin32 python scripts/verify-management-viewer-artifacts.py RECEIPT
"""
from pathlib import Path
import gc
import hashlib
import json
import re
import shutil
import subprocess
import sys
import unicodedata
import fitz
import openpyxl


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compact(text):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text))


def expected_text(kind):
    return {'framework': ['CURRENT_ASSESSMENT_RETAINED'], 'remarks': ['MANUAL_REMARKS_RETAINED', '備註完整保留', '部分符合可完善'], 'inspection': ['FROZEN_ORIGINAL_OBSERVATION', 'FROZEN_ORIGINAL_RECOMMENDATION', 'FROZEN_ORIGINAL_FINDING', 'FROZEN_ORIGINAL_ADVICE', 'FROZEN_ORIGINAL_SOURCE'], 'overview': ['上次凍結檢查', '目前得分']}[kind]


def check_text(text, kind):
    actual = compact(text)
    for forbidden in ['HIDDEN_LIVE_IMPROVEMENT_QA', '未結案改善', '關聯改善', '改善結案', '改善篩選', '未結案事項與執行計劃', '★', '⭐']:
        assert compact(forbidden) not in actual, f'Private marker/label retained: {forbidden}'
    for required in expected_text(kind):
        assert compact(required) in actual, f'Required original content missing: {required}'


def native_worker(path):
    import win32api
    import win32com.client
    import win32con
    import win32event
    import win32process
    copy = path.with_name('native-readonly-'+path.name)
    shutil.copy2(path, copy)
    before = set(win32process.EnumProcesses())
    app = win32com.client.DispatchEx('Excel.Application')
    app.Visible = False
    app.DisplayAlerts = False
    app.EnableEvents = False
    app.AutomationSecurity = 3
    _, pid = win32process.GetWindowThreadProcessId(app.Hwnd)
    assert pid not in before, 'Will not touch an existing Excel instance'
    handle = win32api.OpenProcess(win32con.SYNCHRONIZE | win32con.PROCESS_TERMINATE, False, pid)
    book = None
    result = {'ownedPid': pid, 'readOnly': True, 'forcedOwnedStop': False}
    try:
        book = app.Workbooks.Open(str(copy.resolve()), UpdateLinks=0, ReadOnly=True, CorruptLoad=0)
        assert book.ReadOnly and book.Worksheets.Count > 0
        result['visibleSheets'] = book.Worksheets.Count
        result['acceptedWithCorruptLoad0'] = True
        printed = copy.with_suffix('.pdf')
        book.ExportAsFixedFormat(0, str(printed.resolve()))
        assert printed.is_file()
        result['nativePdf'] = str(printed)
    finally:
        if book is not None:
            book.Close(SaveChanges=False)
        book = None
        app.Quit()
        app = None
        gc.collect()
        stopped = win32event.WaitForSingleObject(handle, 8000) == win32event.WAIT_OBJECT_0
        if not stopped:
            win32api.TerminateProcess(handle, 0)
            result['forcedOwnedStop'] = True
            stopped = win32event.WaitForSingleObject(handle, 5000) == win32event.WAIT_OBJECT_0
        handle.Close()
        result['ownedExcelStopped'] = stopped
        assert stopped
    return result


def main(receipt_path):
    receipt_path = Path(receipt_path)
    receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
    downloads = receipt['downloads']
    expected = {(fw, kind, fmt) for fw in ['TMSA', 'DRYBMS'] for kind, fmt in [('framework', 'xlsx'), ('framework', 'pdf'), ('remarks', 'xlsx'), ('remarks', 'pdf'), ('inspection', 'pdf'), ('overview', 'pdf')]}
    assert len(downloads) == len(expected) == 12
    assert {(x['framework'], x['kind'], x['format']) for x in downloads} == expected
    result = {'layer': 'Saved actual browser downloads / synthetic native QA', 'verifierSha256': digest(Path(__file__)), 'result': 'PASS', 'artifacts': []}
    for entry in downloads:
        path = Path(entry['path'])
        row = {'framework': entry['framework'], 'kind': entry['kind'], 'format': entry['format'], 'path': str(path)}
        try:
            assert digest(path) == entry['sha256']
            if entry['format'] == 'pdf':
                doc = fitz.open(path)
                check_text('\n'.join(p.get_text() for p in doc), entry['kind'])
                for page in doc:
                    for b in page.get_text('dict')['blocks']:
                        for line in b.get('lines', []):
                            for span in line['spans']:
                                if not span['text'].strip():
                                    continue
                                assert span['size'] >= 13.99, 'PDF text below 14pt'
                                box = span['bbox']
                                assert box[0] >= 33 and box[2] <= page.rect.width-33 and box[1] >= 0 and box[3] <= page.rect.height, 'PDF text out of bounds'
                row['pages'] = len(doc)
                row['renders'] = []
                for n in sorted({0, len(doc)-1}):
                    render = path.with_name(path.stem+f'-verified-page-{n+1}.png')
                    doc[n].get_pixmap(matrix=fitz.Matrix(1.1, 1.1), alpha=False).save(str(render))
                    row['renders'].append(str(render))
            else:
                book = openpyxl.load_workbook(path, read_only=True, data_only=False)
                text = '\n'.join(str(c.value or '') for sheet in book for cells in sheet for c in cells)
                check_text(text, entry['kind'])
                row['sheets'] = book.sheetnames
                book.close()
                worker = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--native', str(path)], capture_output=True, text=True, encoding='utf-8', timeout=120)
                assert worker.returncode == 0, worker.stderr
                row['nativeExcel'] = json.loads(worker.stdout)
                native_pdf = fitz.open(row['nativeExcel']['nativePdf'])
                check_text('\n'.join(p.get_text() for p in native_pdf), entry['kind'])
                row['nativePrintPages'] = len(native_pdf)
            assert digest(path) == entry['sha256'], 'Source artifact modified'
            row['status'] = 'PASS'
        except Exception as exc:
            row.update(status='FAIL', error=str(exc))
            result['result'] = 'FAIL'
        result['artifacts'].append(row)
    out = receipt_path.with_name('artifact-verification.json')
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'result': result['result'], 'passed': sum(x['status']=='PASS' for x in result['artifacts']), 'count': len(result['artifacts']), 'failures': [x for x in result['artifacts'] if x['status']=='FAIL'], 'receipt': str(out)}, ensure_ascii=False))
    return 0 if result['result']=='PASS' else 1


if __name__ == '__main__':
    if sys.argv[1] == '--native':
        print(json.dumps(native_worker(Path(sys.argv[2]))))
    else:
        sys.exit(main(sys.argv[1]))
