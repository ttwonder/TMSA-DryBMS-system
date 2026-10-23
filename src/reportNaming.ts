import type {ExportRequest,PlatformState,Language} from './types';
import type {ImprovementListFilters} from './improvementList';
import {bi} from './domain.ts';
import {improvementSourceLabel} from './improvementTracking.ts';
import {richTextToPlainText} from './richText.ts';
export function reportDescriptor(state:PlatformState,request:Omit<ExportRequest,'snapshotToken'>,lang:Language){
 const t=(zh:string,en:string)=>lang==='zh'?zh:en,f=(request.filters??{}) as ImprovementListFilters&{reportVariant?:string},parts:string[]=[];
 const values=(multi:string[]|undefined,one:string|undefined)=>multi??(one?[one]:[]);
 const add=(label:string,ids:string[],resolve:(id:string)=>string)=>{if(ids.length)parts.push(label+'='+ids.map(resolve).join('+'));};
 const missing=t('不可用選項','Unavailable selection');
 const chapter=(id:string)=>{const c=state.chapters.find(c=>c.id===id);return c?`${c.frameworkId} ${c.code} ${bi(c.name,lang)}`:missing;};
 if(request.frameworkId)parts.push(request.frameworkId);else if(f.frameworkId&&f.frameworkId!=='all')parts.push(f.frameworkId);
 if(request.kind==='framework'||request.kind==='overview')add(t('章節','Chapters'),request.ids,chapter);else add(t('章節','Chapters'),values(f.chapterIds,f.chapterId),chapter);
 add(t('來源','Sources'),values(f.sources,f.source),id=>id.startsWith('inspection:')?(()=>{const i=state.inspections.find(i=>i.id===id.slice(11));return i?`${i.date} ${i.frameworkId} ${richTextToPlainText(i.title)}`:missing;})():improvementSourceLabel(id as Parameters<typeof improvementSourceLabel>[0],lang,state.settings));
 add(t('部門','Departments'),values(f.departmentIds,f.departmentId),id=>bi(state.settings.departments.find(d=>d.id===id)?.name,lang)||missing);
 add(t('人員','People'),values(f.personIds,f.personId),id=>state.people.find(p=>p.id===id)?.name||missing);
 if(f.itemId){const i=state.items.find(i=>i.id===f.itemId);parts.push('Item='+(i?i.frameworkId+' '+i.code:missing));}
 if(f.query)parts.push(t('搜尋','Search')+'='+f.query);
 if(f.status)parts.push(t('狀態','Status')+'='+({open:t('開啟','Open'),in_progress:t('進行中','In progress'),closed:t('結案','Closed')}[f.status]??f.status));
 if(f.unfinished)parts.push(t('未完成','Unfinished'));
 if(f.urgency)parts.push(t('急迫度','Urgency')+'='+({urgent:t('緊急','Urgent'),high:t('高','High'),medium:t('中','Medium'),low:t('低','Low')}[f.urgency]??f.urgency));
 for(const [key,label] of [['from',t('更新起','Updated from')],['to',t('更新迄','Updated to')],['proposedFrom',t('提出起','Proposed from')],['proposedTo',t('提出迄','Proposed to')]] as const)if(f[key])parts.push(label+'='+f[key]);
 if(request.kind==='inspection'){const i=state.inspections.find(i=>i.id===request.ids[0]);parts.push(i?`${i.date} ${i.frameworkId} ${richTextToPlainText(i.title)}`:missing);}
 const kind=f.reportVariant==='remarks'?t('條目備註','Item remarks'):({framework:t('完整自評','Assessment'),improvements:t('改善項目','Improvements'),inspection:t('歷史檢查','Inspection'),overview:t('總覽','Overview')}[request.kind]);
 const scope=parts.length?parts.join(' · '):t('不限篩選','All filters');
 const selection=request.kind==='improvements'?t(`明選${request.ids.length}筆`,`Selected ${request.ids.length}`):'';
 const full=[state.serverTime.slice(0,10),kind,selection,scope].filter(Boolean).join('-');
 const sanitized=richTextToPlainText(full).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/\s+/g,' ').replace(/[. ]+$/g,'');
 const suffix=t('-完整篩選見文件','-full scope in report');
 const name=sanitized.length>170?sanitized.slice(0,170-suffix.length)+suffix:sanitized;
 return {name,scope:[selection,scope].filter(Boolean).join(' · '),filename:name+'.'+request.format};
}
