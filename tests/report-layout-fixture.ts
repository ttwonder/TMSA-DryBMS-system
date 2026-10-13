import {DEFAULT_PERMISSIONS} from '../src/domain.ts';
import type {PlatformState} from '../src/types.ts';
const base=(id:string)=>({id,version:1,createdAt:'2026-10-11T01:00:00Z',updatedAt:'2026-10-11T02:00:00Z',updatedBy:'qa-person'});
export function layoutFixture():PlatformState {
 const state:PlatformState={frameworks:[{...base('TMSA'),name:{en:'QA',zh:'測試'},description:{en:'Synthetic layout regression',zh:'合成排版回歸'},scoring:'tmsa-stage',active:true,sourceVersion:'QA',scopeLabel:{en:'Company scope',zh:'公司範圍'}}],chapters:[{...base('qa-ch'),frameworkId:'TMSA',code:'1',name:{en:'Long narrative',zh:'長文測試'},order:1,active:true}],items:[],assessments:[],improvements:[],inspections:[],people:[],settings:{...base('settings'),departments:[],rolePermissions:DEFAULT_PERMISSIONS,siteGateConfigured:false},dryScores:[],auditLogs:[],cycles:[],provenance:[],serverTime:'2026-10-11T03:00:00Z',snapshotToken:'0123456789abcdef'.repeat(8)};
 state.items=[{...base('qa-item'),frameworkId:'TMSA',chapterId:'qa-ch',code:'1.1.1',level:1,order:1,active:true,kpi:{en:'Complete KPI 12.5% UPPER',zh:'完整指標第12.5%'},guidance:{en:'BPG_BEGIN\n'+('Complete English numbered requirement 1.2 and evidence 12.5%. '.repeat(140))+'\nBPG_END',zh:'中文開始\n'+('完整繁體指引、條列1.2及數字12.5%不得遺失。'.repeat(120))+'\n中文結尾'},departmentIds:[],sources:[]}];
 return state;
}
