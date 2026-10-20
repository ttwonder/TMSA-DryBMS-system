import type {Assessment,Language,RemarksStatus} from './types.ts';

// Remarks are a separate manual judgement, never an input to Y/N or scoring.
export const REMARKS_STATUSES:ReadonlyArray<{value:RemarksStatus;zh:string;en:string;background:string;color:string}> = [
 {value:'fully_met',zh:'完全符合',en:'Fully compliant',background:'#DFF2E6',color:'#195C36'},
 {value:'partial_improvable',zh:'部分符合可完善',en:'Partially compliant — can be improved',background:'#E1EFFA',color:'#1F5578'},
 {value:'partial_blocked',zh:'部分符合近期無法完善',en:'Partially compliant — cannot be improved in the near term',background:'#EEE5F7',color:'#643881'},
 {value:'not_met_improvable',zh:'不符合可完善',en:'Non-compliant — can be improved',background:'#FCE8CD',color:'#8A4909'},
 {value:'not_met_blocked',zh:'不符合近期無法完善',en:'Non-compliant — cannot be improved in the near term',background:'#FBE1E1',color:'#9B2929'},
];
export const remarksStatusDefinition=(value:Assessment['remarksStatus'])=>REMARKS_STATUSES.find(s=>s.value===value);
export const remarksStatusLabel=(value:Assessment['remarksStatus'],lang:Language)=>remarksStatusDefinition(value)?.[lang]??(lang==='zh'?'未選擇':'Not selected');
export const remarksStatusStyle=(value:Assessment['remarksStatus'])=>{const s=remarksStatusDefinition(value);return s?{backgroundColor:s.background,color:s.color}:undefined;};
export const hasItemRemarks=(assessment:Assessment|undefined)=>!!assessment?.remarks?.trim();
