#!/usr/bin/env python3
import argparse,json,re,sys
from pathlib import Path
import fitz

def geometry(path):
 doc=fitz.open(path); widths=[]; blank=total=0
 for page in doc:
  spans=[s for b in page.get_text('dict')['blocks'] for l in b.get('lines',[]) for s in l['spans'] if s['text'].strip()]
  for s in spans:
   if abs(s['size']-15)<.05 and ('requirement' in s['text'] or '完整繁體' in s['text']):widths.append(s['bbox'][2]-s['bbox'][0])
  for d in page.get_drawings():
   for kind,*args in d['items']:
    if kind!='re':continue
    r=args[0]
    if r.height<200:continue
    area=r.get_area();total+=area
    occupied=sum(fitz.Rect(s['bbox']).get_area() for s in spans if r.contains(fitz.Rect(s['bbox'])))
    if occupied<area*.03:blank+=area
 return {'pages':len(doc),'narrativeWidth':max(widths,default=0),'blankTallAreaFraction':blank/total if total else 0}
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--geometry',type=Path,required=True);args=ap.parse_args();print(json.dumps(geometry(args.geometry)))
