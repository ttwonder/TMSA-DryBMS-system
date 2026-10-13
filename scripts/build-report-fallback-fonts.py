#!/usr/bin/env python3
"""Pinned OFL sources -> tiny renamed four-byte-aligned PDF supplements."""
import hashlib, io, json, urllib.request
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset
COMMIT='66928797f271fed5ee428544e7229685e2d90127'
SOURCES=[('notosans','NotoSans[wdth,wght].ttf','bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d', [0x2022,0x2082,0x2011,0x00ad], 'ReportSupplement-Regular'),('notosanssymbols2','NotoSansSymbols2-Regular.ttf','7d5fb73b7ca67a6798101741f5d280a3d016a56a197afcd4199dbb57b4b82a21',[0x25c4,0x25ba,0x2794,0x27a2,0x279c],'ReportSymbols-Regular')]
def build(out, upstream):
 out.mkdir(parents=True,exist_ok=True);records=[]
 for family,filename,sha,cps,name in SOURCES:
  data=(upstream/family/filename).read_bytes();license=(upstream/family/'OFL.txt').read_bytes();digest=hashlib.sha256(data).hexdigest()
  expected=next(r for r in json.loads((upstream/'provenance.json').read_text()) if r['family']==family)
  assert digest==sha and expected['commit']==COMMIT,'Pinned upstream source differs'
  assert digest==expected['sha256'];assert hashlib.sha256(license).hexdigest()==expected['licenseSha256']
  font=TTFont(io.BytesIO(data))
  if 'fvar' in font:font=instantiateVariableFont(font,{'wght':400,'wdth':100},inplace=True)
  opts=subset.Options();opts.layout_features=['*'];sub=subset.Subsetter(options=opts);sub.populate(unicodes=cps);sub.subset(font)
  for record in font['name'].names:
   if record.nameID in [1,2,3,4,6,16,17]:record.string=(('Regular' if record.nameID in [2,17] else name).encode(record.getEncoding(),errors='strict'))
  font['glyf'].padding=4;path=out/(name+'.ttf');font.save(path);check=TTFont(path);assert set(cps)<=set(check.getBestCmap());assert all(x%4==0 for x in check['loca'].locations)
  # Preserve all OFL terms; only trim trailing line whitespace in the distributed copy.
  output_license=b'\n'.join(line.rstrip(b' \t\r') for line in license.split(b'\n'))
  (out/(name+'-OFL.txt')).write_bytes(output_license)
  records.append({**expected,'output':path.name,'outputLicenseSha256':hashlib.sha256(output_license).hexdigest(),'licenseTransform':'trailing line whitespace only; legal text unchanged','outputSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'outputBytes':path.stat().st_size,'codepoints':[f'U+{cp:04X}' for cp in cps],'transforms':['instantiate wght=400 wdth=100 where variable','subset exact supplement codepoints with real outlines','rename family to ReportSupplement/ReportSymbols','glyf padding=4; assert loca four-byte alignment'],'fontTools':'4.60.1'})
 (out/'report-fallback-provenance.json').write_text(json.dumps(records,indent=2),encoding='utf8');print(json.dumps(records))
if __name__=='__main__':
 import argparse;p=argparse.ArgumentParser();p.add_argument('--upstream',type=Path,required=True);args=p.parse_args();build(Path(__file__).resolve().parents[1]/'public/fonts',args.upstream)
