"""Verify real report-selection downloads; native Excel uses owned read-only copies."""
import gc, hashlib, json, re, shutil, subprocess, sys, uuid, unicodedata
from collections import Counter
from pathlib import Path
import pymupdf as fitz
import openpyxl

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def flat(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', str(value or '')))

def native(entry):
    # Reuse the current content-specific-height native checker rather than the
    # superseded common-height-after-sort oracle. Always disposable/read-only.
    import importlib.util
    spec=importlib.util.spec_from_file_location('refinement_native',Path(__file__).with_name('verify-report-refinement-native.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    result=module.worker(entry)
    assert result['initialHeights']=='PASS',result
    return result


def ordered_actions(state,ids):
    selected=[row for row in state['improvements'] if row['id'] in ids]
    rank={'urgent':0,'high':1,'medium':2,'low':3}
    return sorted(selected,key=lambda r:(rank.get(r.get('urgency'),99),r.get('targetDate') or '9999',r.get('proposedDate') or '9999',r['id']))

def verify(receipt_path):
    path=Path(receipt_path);receipt=json.loads(path.read_text(encoding='utf-8'));assert receipt['status']=='PASS'
    result={'status':'RUNNING','layer':'Saved browser downloads + independent parser + native Excel COM','sourceReceiptSha256':sha(path),'verifierSha256':sha(__file__),'artifacts':[]}
    target=path.with_name('artifacts-'+uuid.uuid4().hex[:8]+'.json')
    try:
        for entry in receipt['downloads']:
            assert sha(entry['path'])==entry['sha256'] and sha(entry['canonical'])==entry['canonicalSha256']
            state=json.loads(Path(entry['canonical']).read_text(encoding='utf-8'));part={'name':entry['name'],'sha256':entry['sha256']}
            if entry['format']=='pdf':
                doc=fitz.open(entry['path']);text='\n'.join(p.get_text() for p in doc);compact=flat(text)
                for page in doc:
                    spans=[s for b in page.get_text('dict')['blocks'] if 'lines' in b for line in b['lines'] for s in line['spans']]
                    assert spans
                    for s in spans:assert any(abs(s['size']-size)<0.02 for size in (12,17)) and s['bbox'][0]>=27 and s['bbox'][2]<=page.rect.width-27
                if entry['kind']=='framework':
                    remark=entry['request'].get('filters',{}).get('reportVariant')=='remarks';prefixes=['REMARK_MARKER_'] if remark else ['KPI_MARKER_','GUIDANCE_MARKER_','ASSESSMENT_MARKER_','EVIDENCE_MARKER_']
                    for item in state['items']:
                        for prefix in prefixes:assert (flat(prefix+item['id']) in compact)==(item['id'] in entry['expectedItems']),(entry['name'],prefix,item['id'])
                    if not remark:
                        filtered=bool(entry['request'].get('filters',{}).get('departmentIds'))
                        if filtered:assert '不按部門重算' in compact and '部門自評摘錄' in compact
                        else:assert '完整自評報告' in compact and '不按部門重算' not in compact
                if entry['kind']=='improvements':
                    if entry['name'].startswith('multi-'):
                        for row in state['improvements']:
                            if row['id'] in entry['request']['ids']:assert flat(row['title']) in compact and flat(row['plan']) in compact
                            elif row['id'].startswith('multi-action-'):assert flat(row['title']) not in compact
                    else:
                        for marker in ['COMPLETE_ACTION_0','PLAN_MARKER_0','PROGRESS_MARKER_COMPLETE','MILESTONE_MARKER_COMPLETE']:assert marker in compact
                        assert 'OTHERAction' not in compact
                image=Path(entry['path']).with_suffix('.png');doc[0].get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(image);part.update(pages=len(doc),image=str(image),textAndFontFloor='PASS');doc.close()
            else:
                book=openpyxl.load_workbook(entry['path']);part['sheets']=book.sheetnames
                if entry['kind']=='improvements':
                    sheet=book.worksheets[0];assert sheet.freeze_panes=='A5' and sheet.auto_filter.ref==f'A4:S{sheet.max_row}'
                    assert not any(m.min_row>=4 for m in sheet.merged_cells.ranges)
                    assert sheet.column_dimensions['N'].width>sheet.column_dimensions['A'].width
                    rows=list(sheet.iter_rows(min_row=5,values_only=True))
                    assert set(r[0] for r in rows)==set(range(1,len(entry['request']['ids'])+1))
                    for number,original in enumerate(ordered_actions(state,entry['request']['ids']),1):
                        selected=sorted([r for r in rows if r[0]==number],key=lambda r:r[15]);content=''.join(r[13] or '' for r in selected);plan=''.join(r[14] or '' for r in selected)
                        assert flat(original['content']['en']) in flat(content) and flat(original['content']['zh']) in flat(content);assert flat(plan)==flat(original['plan'])
                        for r in selected:assert r[11].strftime('%Y-%m-%d')==original['targetDate']
                worker=path.with_name(entry['name']+'-native-request.json');worker.write_text(json.dumps(entry),encoding='utf-8')
                process=subprocess.run([sys.executable,__file__,'--native',str(worker)],capture_output=True,text=True,encoding='utf-8',timeout=120)
                assert process.returncode==0,process.stderr or process.stdout;part['native']=json.loads(process.stdout)
                for sheet in part['native']['sheets']:
                    if sheet.get('render'):
                        d=fitz.open(sheet['render']);image=Path(sheet['render']).with_suffix('.png');d[0].get_pixmap(matrix=fitz.Matrix(2,2)).save(image);part['nativeImage']=str(image);d.close()
            result['artifacts'].append(part);target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        result['status']='PASS';result['artifactCount']=len(result['artifacts']);assert result['artifactCount']==len(receipt['downloads'])
    except Exception as error:result.update(status='FAIL',failure=str(error));raise
    finally:target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':result['status'],'artifactCount':result['artifactCount'],'receipt':str(target)},ensure_ascii=False))

if __name__=='__main__':
    if sys.argv[1]=='--native':print(json.dumps(native(json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))),ensure_ascii=False))
    else:verify(sys.argv[1])
