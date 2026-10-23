import {useLayoutEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {BrowseState,Language} from './types';
import type {ImprovementListFilters} from './improvementList';
import {bi} from './domain';
import {improvementSourceLabel,improvementSources} from './improvementTracking';
import {richTextToPlainText} from './richText';
import {MultiSelect} from './ui';
type Dimension='sources'|'chapterIds'|'departmentIds'|'personIds';
export function ImprovementFilterSelect({state,lang,filters,dimension,onChange,disabled=false}:{state:BrowseState;lang:Language;filters:ImprovementListFilters;dimension:Dimension;onChange:(next:ImprovementListFilters)=>void;disabled?:boolean}){
 const labels={sources:['來源（多選）','Sources (multiple)'],chapterIds:['章節（多選）','Chapters (multiple)'],departmentIds:['部門（多選）','Departments (multiple)'],personIds:['人員（多選）','People (multiple)']};
 const scalar={sources:'source',chapterIds:'chapterId',departmentIds:'departmentId',personIds:'personId'} as const;
 const options=dimension==='sources'?[...improvementSources(state.settings).filter(row=>row.id!=='external').map(row=>({id:row.id,label:improvementSourceLabel(row.id,lang,state.settings)})),...[...state.inspections].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).map(i=>({id:'inspection:'+i.id,label:`${improvementSourceLabel('external',lang,state.settings)} · ${i.date} · ${i.frameworkId} · ${richTextToPlainText(i.title)}`}))]:dimension==='chapterIds'?state.chapters.filter(c=>!filters.frameworkId||filters.frameworkId==='all'||c.frameworkId===filters.frameworkId).map(c=>({id:c.id,label:`${c.frameworkId} ${c.code} · ${bi(c.name,lang)}`})):dimension==='departmentIds'?state.settings.departments.map(d=>({id:d.id,label:bi(d.name,lang)})):state.people.map(p=>({id:p.id,label:p.name}));
 const old=filters[scalar[dimension]],selected=filters[dimension]??(old?[old]:[]);
 const details=useRef<HTMLDetailsElement>(null),[open,setOpen]=useState(false),[position,setPosition]=useState<CSSProperties>({});
 const label=labels[dimension][lang==='zh'?0:1],names=selected.map(id=>options.find(o=>o.id===id)?.label||id);
 useLayoutEffect(()=>{
  const node=details.current;
  if(!open||!node)return;
  if(disabled){node.open=false;return;}
  const place=()=>{
   const rect=node.querySelector('summary')!.getBoundingClientRect(),width=Math.min(Math.max(rect.width,440),window.innerWidth-24);
   const below=window.innerHeight-rect.bottom-12,above=rect.top-12,up=below<220&&above>below;
   setPosition({left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),width,maxHeight:Math.max(80,Math.min(320,up?above:below)),...(up?{bottom:window.innerHeight-rect.top+4,top:'auto'}:{top:rect.bottom+4,bottom:'auto'})});
  };
  const outside=(e:PointerEvent)=>{if(!node.contains(e.target as Node))node.open=false;};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){node.open=false;node.querySelector('summary')?.focus();}};
  const other=(e:Event)=>{const target=e.target;if(target instanceof HTMLDetailsElement&&target!==node&&target.open&&target.classList.contains('improvement-filter-dropdown'))node.open=false;};
  place();document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);document.addEventListener('toggle',other,true);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);document.removeEventListener('toggle',other,true);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open,disabled]);
 return <div className={`improvement-multifilter improvement-filter-${dimension}`}><fieldset className="multi-select-control" disabled={disabled}>
  <span className="improvement-filter-caption">{label}</span>
  <details ref={details} className="improvement-filter-dropdown" onToggle={e=>setOpen(e.currentTarget.open)}>
   <summary aria-label={label} aria-disabled={disabled} tabIndex={disabled?-1:0} title={names.join('、')||label} onClick={e=>{if(disabled)e.preventDefault();}}><span className="improvement-filter-value">{names[0]||(lang==='zh'?'全部':'All')}</span><span className="improvement-filter-count">{selected.length>0&&selected.length} ▾</span></summary>
   <div className="improvement-filter-menu" style={position}><MultiSelect label={label} options={options} selected={selected} onChange={ids=>onChange({...filters,[scalar[dimension]]:undefined,[dimension]:ids})}/></div>
  </details>
 </fieldset></div>;
}
