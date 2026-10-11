#!/usr/bin/env python3
"""Independent XLSX/PDF gates. Read-only native Excel uses an owned disposable copy.
Run with uv run --with openpyxl==3.1.5 --with pymupdf==1.26.5 --with pywin32 python ...
No source workbooks or private seeds are loaded; supply only synthetic exports.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import unicodedata
import uuid
import xml.etree.ElementTree as ET
import zipfile


def compact(value: str) -> str:
    # Display text only. Never normalize business identifiers.
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))


def verify_xlsx(path: Path, expected: dict, template_path: Path | None) -> dict:
    import openpyxl
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, 'Damaged ZIP'
        for name in archive.namelist():
            if re.fullmatch(r'xl/worksheets/sheet\d+\.xml', name):
                # Only owned generated OOXML is accepted; reject DTD/entity input
                # and cap inflated XML before using stdlib's non-network parser.
                xml_bytes = archive.read(name)
                assert len(xml_bytes) <= 20_000_000 and b'<!DOCTYPE' not in xml_bytes.upper() and b'<!ENTITY' not in xml_bytes.upper(), 'Unsafe OOXML input'
                root = ET.fromstring(xml_bytes)
                namespace = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
                props = root.find(namespace + 'sheetPr')
                if props is not None:
                    children = [child.tag.split('}')[-1] for child in props]
                    ranks = {'tabColor': 0, 'outlinePr': 1, 'pageSetUpPr': 2}
                    order = [ranks[tag] for tag in children if tag in ranks]
                    assert order == sorted(order), 'Excel sheetPr child ordering defect'
                    if 'outlinePr' in children and 'pageSetUpPr' in children:
                        assert children.index('outlinePr') < children.index('pageSetUpPr'), 'Excel sheetPr ordering defect'
        assert not any('comments' in name.lower() for name in archive.namelist()), 'Source comments must not survive'
    book = openpyxl.load_workbook(path)
    if 'sheets' in expected:
        assert book.sheetnames == expected['sheets'], (book.sheetnames, expected['sheets'])
    codes, values, rows, max_height = set(), [], 0, 0.0
    for sheet in book:
        assert sheet.print_area, f'No print area: {sheet.title}'
        assert sheet.sheet_properties.pageSetUpPr.fitToPage, f'Fit-to-width disabled: {sheet.title}'
        assert sheet.page_setup.fitToWidth == 1, f'Horizontal page splitting: {sheet.title}'
        for row in sheet.iter_rows(min_row=6, max_col=7):
            if row[0].row >= 7 and row[0].value is not None:
                codes.add(str(row[0].value))
                rows += 1
            for cell in row:
                if cell.value is not None:
                    values.append(str(cell.value))
                if not isinstance(cell, openpyxl.cell.cell.MergedCell):
                    for side in ['top', 'bottom', 'left', 'right']:
                        assert getattr(cell.border, side).style, f'Missing real border: {sheet.title}!{cell.coordinate} {side}'
            height = sheet.row_dimensions[row[0].row].height or 15
            max_height = max(max_height, height)
            assert height <= 409.5, f'Row beyond Excel height limit: {sheet.title}!{row[0].row}'
    if 'itemCodes' in expected:
        assert codes == set(expected['itemCodes']), {'missing': sorted(set(expected['itemCodes']) - codes), 'unexpected': sorted(codes - set(expected['itemCodes']))}
    if 'uniqueItems' in expected:
        assert len(codes) == expected['uniqueItems']
    assert not codes.intersection(expected.get('forbiddenCodes', [])), 'Inactive current item leaked'
    text = '\n'.join(values)
    for marker in expected.get('required', []):
        assert marker in text, f'Missing XLSX marker: {marker}'
    for segment in expected.get('segments', []):
        assert book[segment['sheet']][segment['cell']].value == segment['text'], f'Segment changed: {segment["cell"]}'
    for field in expected.get('fullFields', []):
        assert ''.join(field['enSegments']) == field['en']
        assert ''.join(field['zhSegments']) == field['zh']
    comparisons = 0
    if template_path:
        template = openpyxl.load_workbook(template_path)
        for source in template:
            if source.title not in book.sheetnames:
                continue
            target = book[source.title]
            assert target.column_dimensions['A'].width == source.column_dimensions['A'].width
            assert target.column_dimensions['D'].width == source.column_dimensions['D'].width
            assert target.column_dimensions['G'].width == source.column_dimensions['G'].width
            assert set(map(str, source.merged_cells.ranges)).issubset(set(map(str, target.merged_cells.ranges)))
            assert target.page_setup.orientation == source.page_setup.orientation
            assert target.page_setup.paperSize == source.page_setup.paperSize
            for row in [6, 7]:
                for col in range(1, 8):
                    original, exported = source.cell(row, col), target.cell(row, col)
                    # StyleProxy equality against another proxy is false even
                    # when its underlying style fields are identical.
                    import copy
                    assert copy.copy(original.fill) == copy.copy(exported.fill), f'Fill lost: {source.title}!{original.coordinate}'
                    for side in ['top', 'bottom', 'left', 'right']:
                        border = getattr(original.border, side)
                        if border.style:
                            assert getattr(exported.border, side).style == border.style
                    comparisons += 1
    return {'path': str(path.resolve()), 'sheets': len(book.worksheets), 'uniqueItems': len(codes), 'physicalItemRows': rows, 'maxRowHeight': max_height, 'sourceStyleCellsCompared': comparisons, 'exactSegments': len(expected.get('segments', [])), 'ooxmlSheetPrOrder': 'PASS', 'bordersIncludingBlanks': 'PASS'}


def verify_pdf(path: Path, expected: dict, render_dir: Path | None) -> dict:
    import fitz
    document = fitz.open(path)
    # Selectable text is not sufficient: malformed fontkit glyf subsets can
    # extract perfectly while rendering blank glyphs. Decode every outline.
    import io
    from fontTools.ttLib import TTFont
    font_refs = {font[0] for page in document for font in page.get_fonts()}
    outline_count = 0
    for reference in font_refs:
        _, extension, _, font_data = document.extract_font(reference)
        assert font_data, 'PDF font is not embedded'
        if extension == 'ttf':
            font = TTFont(io.BytesIO(font_data))
            if 'glyf' in font:
                for name in font.getGlyphOrder():
                    glyph = font['glyf'][name]
                    glyph.getCoordinates(font['glyf'])
                    outline_count += int(glyph.numberOfContours != 0)
            font.close()
    assert outline_count > 0, 'No valid embedded glyph outlines'
    all_text, content_text, sizes, chinese = [], [], Counter(), 0
    minimum = expected.get('minimumOther', 14)
    for index, page in enumerate(document):
        text = page.get_text('text')
        assert text.strip(), f'Image-only/empty PDF page {index + 1}'
        all_text.append(text)
        assert f'{index + 1} / {len(document)}' in text, f'No page label: {index + 1}'
        spans = []
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                spans.extend(line['spans'])
        for span in spans:
            if not span['text'].strip():
                continue
            size, (x0, y0, x1, y1) = span['size'], span['bbox']
            sizes[round(size, 2)] += 1
            assert size >= minimum - .05, f'Font below minimum on page {index+1}: {size}'
            assert x0 >= 30 - .1 and x1 <= page.rect.width - 30 + .1, f'Horizontal clipping: page {index+1}, {span["bbox"]}'
            assert y0 >= 8 and y1 <= page.rect.height - 8, f'Page-edge clipping: page {index+1}, {span["bbox"]}'
            if size >= 15 - .05 and y0 >= 70:
                assert y1 < page.rect.height - 50, f'Body overlaps footer: page {index+1}'
            chinese += len(re.findall(r'[\u4e00-\u9fff]', span['text']))
        if expected.get('fullText'):
            ratios, column = expected['ratios'], expected['contentColumn']
            width, total = page.rect.width - 68, sum(ratios)
            left, right = 34 + width * sum(ratios[:column]) / total, 34 + width * sum(ratios[:column+1]) / total
            selected = [s for s in spans if s['bbox'][0] >= left - .1 and s['bbox'][2] <= right + .1 and abs(s['size']-15) < .05]
            selected.sort(key=lambda span: (round(span['origin'][1], 2), span['origin'][0]))
            content_text.extend(s['text'] for s in selected)
        if render_dir and index in {0, 1, len(document)-1}:
            render_dir.mkdir(parents=True, exist_ok=True)
            page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2)).save(str(render_dir / f'{path.stem}-page-{index+1}.png'))
    extracted = compact('\n'.join(all_text))
    assert chinese > 0, 'No selectable Chinese text'
    for marker in expected.get('required', []):
        assert compact(marker) in extracted, f'Missing PDF text: {marker}'
    for marker in expected.get('forbidden', []):
        assert compact(marker) not in extracted, f'Unselected/current data leaked: {marker}'
    for field in expected.get('fullText', []):
        assert compact(field) in compact(''.join(content_text)), 'Full content column does not reconstruct'
    assert 15.0 in sizes, 'No actual 15pt body text'
    return {'path': str(path.resolve()), 'pages': len(document), 'bytes': path.stat().st_size, 'fontSizes': dict(sizes), 'selectableChineseCharacters': chinese, 'fullFieldsChecked': len(expected.get('fullText', [])), 'validEmbeddedOutlines': outline_count, 'spanBounds': 'PASS', 'bodyFooterSeparation': 'PASS'}


def verify_native_excel(path: Path, expected: dict, export_pdf: Path | None) -> dict:
    import win32com.client
    import win32process
    source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    owned = path.parent / f'{path.stem}-owned-native-{uuid.uuid4().hex[:8]}.xlsx'
    shutil.copy2(path, owned)
    application = win32com.client.DispatchEx('Excel.Application')
    application.Visible = False
    application.DisplayAlerts = False
    application.EnableEvents = False
    application.AutomationSecurity = 3
    _, pid = win32process.GetWindowThreadProcessId(application.Hwnd)
    book = None
    result = {}
    try:
        book = application.Workbooks.Open(str(owned.resolve()), UpdateLinks=0, ReadOnly=True, CorruptLoad=0)
        actual_sheets = [book.Worksheets(i).Name for i in range(1, book.Worksheets.Count+1)]
        if 'sheets' in expected:
            assert actual_sheets == expected['sheets'], 'Native Excel lost/repaired worksheets'
        native_codes = set()
        for sheet in book.Worksheets:
            assert sheet.PageSetup.Zoom is False, 'Native numeric Zoom disables fit-to-width'
            assert sheet.PageSetup.FitToPagesWide == 1
            for row in range(7, sheet.UsedRange.Rows.Count+sheet.UsedRange.Row):
                code = sheet.Cells(row, 1).Value
                if code is not None:
                    native_codes.add(str(code))
            for col in range(1, 8):
                for border in [7, 8, 9, 10]:
                    assert sheet.Cells(6, col).Borders(border).LineStyle != -4142, 'Native border absent'
        if 'itemCodes' in expected:
            assert native_codes == set(expected['itemCodes'])
        for segment in expected.get('segments', []):
            assert book.Worksheets(segment['sheet']).Range(segment['cell']).Value == segment['text']
        if export_pdf:
            book.ExportAsFixedFormat(0, str(export_pdf.resolve()))
            assert export_pdf.is_file(), 'Native PDF export did not create the exact output path'
        result = {'acceptedWithCorruptLoad0': True, 'readOnly': bool(book.ReadOnly), 'sheets': book.Worksheets.Count, 'uniqueItems': len(native_codes), 'ownedPid': pid, 'copy': str(owned.resolve()), 'nativePdf': str(export_pdf.resolve()) if export_pdf else None}
    finally:
        if book is not None:
            book.Close(SaveChanges=False)
        application.Quit()
        assert hashlib.sha256(path.read_bytes()).hexdigest() == source_hash, 'Generated input was changed'
    if export_pdf and expected.get('nativeTextBand'):
        import fitz
        pdf = fitz.open(export_pdf)
        x0, x1, y0, y1 = expected['nativeTextBand']
        extracted = []
        for page in pdf:
            spans = [span for block in page.get_text('dict')['blocks'] for line in block.get('lines', []) for span in line['spans'] if span['bbox'][0] >= x0 and span['bbox'][2] <= x1 and span['bbox'][1] >= y0 and span['bbox'][3] <= y1]
            spans.sort(key=lambda span: (round(span['origin'][1], 2), span['origin'][0]))
            extracted.extend(span['text'] for span in spans)
        actual, offset = compact(''.join(extracted)), 0
        for segment in expected.get('segments', []):
            needle = compact(segment['text'])
            position = actual.find(needle, offset)
            assert position >= 0, f'Native print clipped/reordered segment: {segment["cell"]}'
            offset = position + len(needle)
        result['nativePrintedSegments'] = len(expected.get('segments', []))
        result['nativePdfPages'] = len(pdf)
        result['nativePrintedText'] = 'PASS'
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--xlsx', type=Path)
    parser.add_argument('--template', type=Path)
    parser.add_argument('--expected', type=Path)
    parser.add_argument('--pdf', type=Path)
    parser.add_argument('--pdf-expected', type=Path)
    parser.add_argument('--render-dir', type=Path)
    parser.add_argument('--native-excel', action='store_true')
    parser.add_argument('--native-pdf', type=Path)
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    assert args.xlsx or args.pdf, 'Provide at least one generated artifact'
    result = {'evidence': 'Local synthetic artifacts; not production/cloud/provider acceptance', 'checks': {}}
    if args.xlsx:
        expected = json.loads(args.expected.read_text(encoding='utf-8')) if args.expected else {}
        result['checks']['xlsx'] = verify_xlsx(args.xlsx, expected, args.template)
        if args.native_excel:
            result['checks']['nativeExcel'] = verify_native_excel(args.xlsx, expected, args.native_pdf)
    if args.pdf:
        expected = json.loads(args.pdf_expected.read_text(encoding='utf-8')) if args.pdf_expected else {}
        result['checks']['pdf'] = verify_pdf(args.pdf, expected, args.render_dir)
    result['status'] = 'PASS'
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(output+'\n', encoding='utf-8')
    print(output)


if __name__ == '__main__':
    main()
