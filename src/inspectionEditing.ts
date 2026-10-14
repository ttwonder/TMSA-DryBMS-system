import type {Inspection,InspectionResult,StandardItem} from './types';
export const emptyInspectionResult=(itemId:string):InspectionResult=>({itemId,response:null,conformity:'none',reviewed:false,observation:{en:'',zh:''},recommendation:{en:'',zh:''}});
export function changeInspectionResult(current:InspectionResult,changes:Partial<InspectionResult>,item:StandardItem):InspectionResult {
 const next={...current,...changes};
 if(Object.hasOwn(changes,'conformity')){next.response=changes.conformity==='all'?'yes':'no';next.reviewed=true;}
 if(Object.hasOwn(changes,'response')){next.conformity=changes.response==='yes'?'all':changes.response==='no'&&current.conformity==='partial'?'partial':'none';next.reviewed=changes.response!==null;}
 if(next.response==='yes'&&item.sourceGap&&!item.sourceGapResolved)throw Error('SOURCE_GAP_UNRESOLVED');
 return next;
}
export function allInspectionCompliant(record:Inspection):{record:Inspection;skipped:StandardItem[]} {
 const skipped=record.snapshot.items.filter(item=>!!item.sourceGap&&!item.sourceGapResolved);
 return {record:{...record,results:record.snapshot.items.map(item=>{const old=record.results.find(r=>r.itemId===item.id)??emptyInspectionResult(item.id);return skipped.some(s=>s.id===item.id)?old:changeInspectionResult(old,{conformity:'all'},item);})},skipped};
}
export function inspectionChapterStatus(record:Inspection,chapterId:string):{color:'green'|'yellow'|'red';incomplete:boolean} {
 const items=record.snapshot.items.filter(i=>i.active&&i.chapterId===chapterId),results=items.map(i=>record.results.find(r=>r.itemId===i.id));
 const incomplete=!items.length||results.some(r=>!r?.reviewed||!r.response)||items.some(i=>!!i.sourceGap&&!i.sourceGapResolved&&record.results.find(r=>r.itemId===i.id)?.response==='yes');
 if(incomplete)return {color:'yellow',incomplete:true};
 if(results.every(r=>r?.response==='yes'&&r.conformity==='all'))return {color:'green',incomplete:false};
 if(results.every(r=>r?.response==='no'&&r.conformity==='none'))return {color:'red',incomplete:false};
 return {color:'yellow',incomplete:false};
}
