import { useMemo, useState } from 'react';
import type { AuditLog, BrowseState, Language } from './types';
import { describeAudit } from './auditChanges';

/** Details are mounted only when expanded; opening a row never requests or writes data. */
export function AuditRow({log,lang,state}:{log:AuditLog;lang:Language;state:BrowseState}) {
  const [open,setOpen]=useState(false);
  const model=useMemo(()=>describeAudit(log,lang,state),[log,lang,state]);
  const t=(zh:string,en:string)=>lang==='zh'?zh:en;
  return <tr>
    <td>{log.at}<br/>{log.actorName}</td>
    <td title={`${log.action} / ${log.kind}`}>{model.action}<br/>{model.kind}</td>
    <td>{log.itemCodes.join(' / ')}<br/><small>{log.entityId}</small></td>
    <td className="preserve-lines">
      {model.notice&&<div className="audit-change-notice">{model.notice}</div>}
      {model.changes.length>0?<>
        <ul className="audit-summary-list">{model.changes.slice(0,3).map(change=><li key={change.path}>{change.summary}</li>)}</ul>
        <details className="audit-row-details" onToggle={event=>setOpen(event.currentTarget.open)}>
          <summary>{t('查看變更明細','View change details')} ({model.changes.length})</summary>
          {open&&<>
            <table className="data-table audit-change-table" aria-label={t('修改前後對照','Before and after comparison')}>
              <thead><tr><th>{t('欄位','Field')}</th><th>{t('修改前','Before')}</th><th>{t('修改後','After')}</th></tr></thead>
              <tbody>{model.changes.map(change=><tr key={change.path}><td title={change.path}>{change.label}</td><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody>
            </table>
            <p className="audit-detail-note">{t('內容來自此筆操作保存的快照；未記錄／空值不作推測。人員、部門及條目名稱可由目前名冊補充顯示，原 ID 保留。','Content comes from this operation’s saved snapshots; missing/null values are not inferred. People, department and item labels may be enriched from current catalogs; original IDs are retained.')}</p>
            <div className="audit-original-summary">{log.summary}</div>
          </>}
        </details>
      </>:<div className="audit-original-summary">{log.summary}</div>}
    </td>
  </tr>;
}
