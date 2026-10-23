import type {BrowseState,Language} from './types';
import type {ImprovementListFilters} from './improvementList';
import {bi} from './domain';
import {improvementSourceLabel,improvementSources} from './improvementTracking';
import {richTextToPlainText} from './richText';
import {MultiSelectDropdown} from './ui';
type Dimension='sources'|'chapterIds'|'departmentIds'|'personIds';
export function ImprovementFilterSelect({state,lang,filters,dimension,onChange,disabled=false}:{state:BrowseState;lang:Language;filters:ImprovementListFilters;dimension:Dimension;onChange:(next:ImprovementListFilters)=>void;disabled?:boolean}){
 const labels={sources:['來源（多選）','Sources (multiple)'],chapterIds:['章節（多選）','Chapters (multiple)'],departmentIds:['部門（多選）','Departments (multiple)'],personIds:['人員（多選）','People (multiple)']};
 const scalar={sources:'source',chapterIds:'chapterId',departmentIds:'departmentId',personIds:'personId'} as const;
 const options=dimension==='sources'?[...improvementSources(state.settings).filter(row=>row.id!=='external').map(row=>({id:row.id,label:improvementSourceLabel(row.id,lang,state.settings)})),...[...state.inspections].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).map(i=>({id:'inspection:'+i.id,label:`${improvementSourceLabel('external',lang,state.settings)} · ${i.date} · ${i.frameworkId} · ${richTextToPlainText(i.title)}`}))]:dimension==='chapterIds'?state.chapters.filter(c=>!filters.frameworkId||filters.frameworkId==='all'||c.frameworkId===filters.frameworkId).map(c=>({id:c.id,label:`${c.frameworkId} ${c.code} · ${bi(c.name,lang)}`})):dimension==='departmentIds'?state.settings.departments.map(d=>({id:d.id,label:bi(d.name,lang)})):state.people.map(p=>({id:p.id,label:p.name}));
 const old=filters[scalar[dimension]],selected=filters[dimension]??(old?[old]:[]);
 return <div className="improvement-multifilter"><MultiSelectDropdown label={labels[dimension][lang==='zh'?0:1]} options={options} selected={selected} disabled={disabled} onChange={ids=>onChange({...filters,[scalar[dimension]]:undefined,[dimension]:ids})}/></div>;
}
