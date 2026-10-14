import type {Inspection,InspectionResult,StandardItem} from './types';
export const emptyInspectionResult=(itemId:string):InspectionResult=>({itemId,response:null,conformity:'none',reviewed:false,observation:{en:'',zh:''},recommendation:{en:'',zh:''}});
export function changeInspectionResult(current:InspectionResult,changes:Partial<InspectionResult>,item:StandardItem):InspectionResult {
 const next={...current,...changes};
 if(Object.hasOwn(changes,'conformity')){next.response=changes.conformity==='all'?'yes':'no';next.reviewed=true;}
 if(Object.hasOwn(changes,'response')){next.conformity=changes.response==='yes'?'all':changes.response==='no'&&current.conformity==='partial'?'partial':'none';next.reviewed=changes.response!==null;}
 if(next.response==='yes'&&item.sourceGap&&!item.sourceGapResolved)throw Error('SOURCE_GAP_UNRESOLVED');
 return next;
}
export type InspectionGradingScope = {chapterId:string;level?:StandardItem['level']};
export function bulkInspectionGrading(record:Inspection,conformity:'all'|'none',scope?:InspectionGradingScope):{record:Inspection;skipped:StandardItem[]} {
 const items=record.snapshot.items.filter(item=>!scope||item.chapterId===scope.chapterId&&(scope.level===undefined||item.level===scope.level));
 const skipped=conformity==='all'?items.filter(item=>!!item.sourceGap&&!item.sourceGapResolved):[];
 const skippedIds=new Set(skipped.map(item=>item.id));
 const targets=new Map(items.filter(item=>!skippedIds.has(item.id)).map(item=>[item.id,item]));
 if(!targets.size)return {record,skipped};
 const results=record.results.map(old=>{const item=targets.get(old.itemId);if(!item)return old;targets.delete(old.itemId);return changeInspectionResult(old,{conformity},item);});
 for(const item of targets.values())results.push(changeInspectionResult(emptyInspectionResult(item.id),{conformity},item));
 return {record:{...record,results},skipped};
}
export function allInspectionCompliant(record:Inspection,scope?:InspectionGradingScope):{record:Inspection;skipped:StandardItem[]} {
 return bulkInspectionGrading(record,'all',scope);
}
export function inspectionChapterStatus(record:Inspection,chapterId:string):{color:'green'|'yellow'|'red';incomplete:boolean} {
 const items=record.snapshot.items.filter(i=>i.active&&i.chapterId===chapterId),results=items.map(i=>record.results.find(r=>r.itemId===i.id));
 const incomplete=!items.length||results.some(r=>!r?.reviewed||!r.response)||items.some(i=>!!i.sourceGap&&!i.sourceGapResolved&&record.results.find(r=>r.itemId===i.id)?.response==='yes');
 if(incomplete)return {color:'yellow',incomplete:true};
 if(results.every(r=>r?.response==='yes'&&r.conformity==='all'))return {color:'green',incomplete:false};
 if(results.every(r=>r?.response==='no'&&r.conformity==='none'))return {color:'red',incomplete:false};
 return {color:'yellow',incomplete:false};
}
