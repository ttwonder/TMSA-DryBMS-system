import type {Inspection,PlatformState} from '../src/types.ts';
const base=(id:string)=>({id,version:1,createdAt:'2026-01-01',updatedAt:'2026-01-01',updatedBy:'qa'});
export function scoringFixture(){
 const frameworks=[{...base('TMSA'),active:true,scoring:'tmsa-stage',name:{en:'TMSA',zh:'TMSA'},description:{en:'',zh:''},scopeLabel:{en:'',zh:''},sourceVersion:'qa'}];
 const chapters=[1,14].map(n=>({...base(`TMSA:${n}`),frameworkId:'TMSA',code:String(n),name:{en:`Chapter ${n}`,zh:`第${n}章`},active:true,order:n}));
 const items=chapters.flatMap(c=>[1,2,3,4].map(level=>({...base(`${c.id}.${level}`),frameworkId:'TMSA',chapterId:c.id,code:`${c.code}.${level}.1`,level,active:true,order:level,kpi:{en:'Requirement',zh:'條文'},guidance:{en:'Guidance',zh:'指引'},departmentIds:[],sources:[]})));
 const assessments=items.map(i=>({...base(`assessment-${i.id}`),itemId:i.id,response:i.chapterId==='TMSA:14'?'no':'yes',conformity:i.chapterId==='TMSA:14'?'none':'all',reviewed:true,selfAssessment:{en:'',zh:''},evidence:{en:'',zh:''},departmentIds:[],assigneeIds:[],executionStatus:'not_started',sources:[]}));
 const state={frameworks,chapters,items,assessments,dryScores:[],inspections:[]} as unknown as PlatformState;
 const inspection={...base('history'),frameworkId:'TMSA',title:'Frozen',organization:'QA',date:'2026-01-01',type:'formal',status:'final',imported:true,snapshot:{framework:structuredClone(frameworks[0]),chapters:structuredClone(chapters),items:structuredClone(items),scoringVersion:'company-20-equal-stage-v1'},results:assessments.map(a=>({itemId:a.itemId,response:a.response,conformity:a.conformity,reviewed:a.reviewed,observation:{en:'Keep',zh:'保留'},recommendation:{en:'',zh:''}})),findings:[]} as Inspection;
 return {state,inspection};
}
