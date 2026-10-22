"""Add real OFL Bold faces only; never regenerate Regular fonts or licenses.
uv run --with fonttools==4.60.1 python public/fonts/build-Bold-fonts.py --scratch qa-evidence/rich-text-reports/font-upstream
"""
import argparse,hashlib,io,json,urllib.request
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset
import fontTools

CJK_COMMIT='165c01b46ea533872e002e0785ff17e44f6d97d8'
LATIN_COMMIT='66928797f271fed5ee428544e7229685e2d90127'
SOURCES=[
 ('NotoSansTC-Bold',f'https://raw.githubusercontent.com/notofonts/noto-cjk/{CJK_COMMIT}/Sans/Variable/TTF/NotoSansCJKtc-VF.ttf','6b40dd16cf1b73b5a7a0ed2472d641b60e3e85e87211abd20009f67d841425da',CJK_COMMIT,'OFL.txt',None),
 ('ReportSupplement-Bold',f'https://raw.githubusercontent.com/google/fonts/{LATIN_COMMIT}/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf','bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d',LATIN_COMMIT,'ReportSupplement-Regular-OFL.txt',[0x2022,0x2082,0x2011,0x00ad])]
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--scratch',type=Path,required=True);a=p.parse_args();a.scratch.mkdir(parents=True,exist_ok=True)
 out=Path(__file__).resolve().parent
 assert fontTools.__version__=='4.60.1','Use the pinned build command'
 protected={p.name:sha(p.read_bytes()) for p in out.iterdir() if p.is_file() and ('Regular' in p.name or 'OFL' in p.name or p.name=='provenance.json')}
 records=[]
 for name,url,expected,commit,license,cps in SOURCES:
  cache=a.scratch/(name+'-upstream.ttf')
  if not cache.exists():cache.write_bytes(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'FPMC-rich-text-font-build'}),timeout=180).read())
  raw=cache.read_bytes();assert sha(raw)==expected,('Pinned source hash differs',name)
  font=TTFont(io.BytesIO(raw));cmap=font.getBestCmap();unicode_set=set(cps) if cps else {cp for cp in cmap if not 0xac00<=cp<=0xd7af}
  opts=subset.Options();opts.name_IDs=['*'];opts.name_legacy=True;opts.name_languages=['*'];opts.glyph_names=True;opts.layout_features=['*']
  shrink=subset.Subsetter(options=opts);shrink.populate(unicodes=unicode_set);shrink.subset(font)
  axes={'wght':700};axes.update({'wdth':100} if any(axis.axisTag=='wdth' for axis in font['fvar'].axes) else {})
  font=instantiateVariableFont(font,axes,inplace=True)
  for record in font['name'].names:
   if record.nameID in [1,2,3,4,6,16,17]:record.string=('Bold' if record.nameID in [2,17] else name).encode(record.getEncoding())
  font['OS/2'].usWeightClass=700;font['OS/2'].fsSelection=(font['OS/2'].fsSelection|32)&~64;font['head'].macStyle|=1
  font['glyf'].padding=4;target=out/(name+'.ttf');font.save(target);font.close()
  check=TTFont(target);assert all(x%4==0 for x in check['loca'].locations)
  if cps:assert set(cps)<=set(check.getBestCmap())
  else:assert all(cp in check.getBestCmap() for cp in range(0x4e00,0x9ff0))
  for glyph in check.getGlyphOrder():check['glyf'][glyph].getCoordinates(check['glyf'])
  records.append({'file':target.name,'upstreamUrl':url,'upstreamCommit':commit,'upstreamSha256':expected,'sha256':sha(target.read_bytes()),'bytes':target.stat().st_size,'weight':700,'unicodeGlyphs':len(check.getBestCmap()),'license':'SIL OFL 1.1','existingLicenseFile':license,'existingLicenseSha256':sha((out/license).read_bytes()),'fontTools':fontTools.__version__,'transforms':['subset same Regular repertoire','instantiate real variable weight 700','rename family and mark Bold','glyf padding=4; verify every outline and loca offset']});check.close()
 assert all(sha((out/name).read_bytes())==digest for name,digest in protected.items()),'Protected Regular/license bytes changed'
 result={'fonts':records,'protectedFilesUnchanged':protected};(out/'Bold-provenance.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
if __name__=='__main__':main()
