import {reportingFixture} from './fpmc-reporting-fixture.ts';
export type RemarkScale='ordinary'|'long';
export function remarkText(scale:RemarkScale,index:number):string {
 const lines=Array.from({length:scale==='long'?32:2},(_,n)=>`  ${index+1}.${n+1}. R${index+1}_L${n+1} Review the saved responsibility and evidence; retain every action, date and original reference. 完整備註：核對責任部門、追蹤人員及後續執行計劃，不得省略原始文字。 → CO₂ • non‑breaking soft\u00adhyphen.`);
 return `REMARK_${index+1}_BEGIN\n\n${lines.join('\n\n')}\nREMARK_${index+1}_END`;
}
export function remarksExportFixture(scale:RemarkScale){
 const state=reportingFixture(),item=state.items[0],assessment=state.assessments[0];
 state.items=Array.from({length:8},(_,i)=>({...structuredClone(item),id:i?'remark-item-'+i:'item-a',code:`1.1.${i+1}`,order:i}));
 state.assessments=state.items.map((item,i)=>({...structuredClone(assessment),id:'assessment-'+item.id,itemId:item.id,remarks:remarkText(scale,i),remarksStatus:(['fully_met','partial_improvable','partial_blocked','not_met_improvable','not_met_blocked','','fully_met','partial_improvable'] as const)[i]}));
 return state;
}
