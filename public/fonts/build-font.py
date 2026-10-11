"""Build the OFL-licensed report font; no company/standard data is used.
uv run --with fonttools==4.60.1 python public/fonts/build-font.py --scratch <path>
The browser font is a static TC face with basic CJK and TC Unicode coverage;
PDF fontkit further subsets it to only glyphs actually used in each report.
"""
from pathlib import Path
import argparse
import hashlib
import json
import urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

COMMIT = '165c01b46ea533872e002e0785ff17e44f6d97d8'
ROOT = f'https://raw.githubusercontent.com/notofonts/noto-cjk/{COMMIT}/Sans/'
URL = ROOT + 'Variable/TTF/NotoSansCJKtc-VF.ttf'
LICENSE_URL = f'https://raw.githubusercontent.com/notofonts/noto-cjk/{COMMIT}/LICENSE'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scratch', type=Path, required=True)
    args = parser.parse_args()
    args.scratch.mkdir(parents=True, exist_ok=True)
    out = Path(__file__).resolve().parent
    source = args.scratch / 'NotoSansCJKtc-VF.ttf'
    # Owned cache only, never an existing private/original workbook.
    if not source.exists():
        request = urllib.request.Request(URL, headers={'User-Agent': 'TMSA-report-font-build'})
        source.write_bytes(urllib.request.urlopen(request, timeout=180).read())
    raw = source.read_bytes()
    upstream = TTFont(source)
    cmap = upstream.getBestCmap()
    # Retain the full TC Unicode repertoire plus every mapped basic CJK code.
    # Drop Hangul and non-Chinese regional variants; no report text is an input.
    unicodes = {n for n in cmap if not 0xac00 <= n <= 0xd7af}
    options = subset.Options()
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    options.glyph_names = True
    shrink = subset.Subsetter(options=options)
    shrink.populate(unicodes=unicodes)
    shrink.subset(upstream)
    static = instantiateVariableFont(upstream, {'wght': 400}, inplace=False)
    # fontkit's short loca encoder needs four-byte source glyf alignment.
    # Unaligned source fonts can extract text while rendering blank glyphs.
    static['glyf'].padding = 4
    target = out / 'NotoSansTC-Regular.ttf'
    static.save(target)
    output_cmap = static.getBestCmap()
    static.close()
    upstream.close()
    # This official Noto release predates Unicode 14's final sixteen basic
    # additions (U+9FF0..U+9FFF); those remain an explicit fail-closed limit.
    assert all(n in output_cmap for n in range(0x4e00, 0x9ff0)), 'Basic CJK coverage incomplete'
    (out / 'OFL.txt').write_bytes(urllib.request.urlopen(LICENSE_URL, timeout=60).read())
    result = {
        'family': 'Noto Sans CJK TC / static Regular', 'license': 'SIL OFL 1.1',
        'upstreamRepository': 'https://github.com/notofonts/noto-cjk', 'upstreamCommit': COMMIT,
        'upstreamUrl': URL, 'licenseUrl': LICENSE_URL, 'upstreamSha256': hashlib.sha256(raw).hexdigest(),
        'conversion': 'fonttools 4.60.1; remove Hangul unicode, retain all other Unicode mappings; instantiateVariableFont(wght=400); glyf padding=4; per-report browser fontkit subset',
        'basicCjkCoverage': 'U+4E00–U+9FEF complete; U+9FF0–U+9FFF absent upstream (fail closed)', 'unicodeGlyphs': len(output_cmap),
        'file': target.name, 'bytes': target.stat().st_size,
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest()
    }
    (out / 'provenance.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
