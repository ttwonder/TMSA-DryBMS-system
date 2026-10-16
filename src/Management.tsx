import { useEffect, useRef, useState } from 'react';
import { AuditRow } from './AuditDetails';
import type { AuditLog, AuditQuery, BaseEntity, BiText, Chapter, Framework, FrameworkId, PageProps, Person, Role, SaveIntent, SeedBundle, StandardItem, SystemSettings } from './types';
import { CAPABILITIES, bi, hasPermission, newBase, roleName } from './domain';
import { BilingualText, EditorNotice, Empty, Modal, MultiSelect, PageHeading, departmentOptions } from './ui';
import { useRecordEditor } from './useRecordEditor';
import { useFrameworkRestart } from './useFrameworkRestart';
import { runSeedImport } from './api';

export async function credentialDigest(value: string): Promise<string> {
  if (!value) throw new Error('PASSWORD_REQUIRED');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validateSeedPreview(value: unknown): SeedBundle {
  if (!value || typeof value !== 'object') throw new Error('INVALID_SEED');
  const seed = value as Record<string, unknown>;
  if (seed.schemaVersion !== 1) throw new Error('UNSUPPORTED_SCHEMA_VERSION');
  for (const key of ['frameworks', 'chapters', 'items', 'assessments', 'improvements', 'inspections', 'dryScores', 'cycles', 'provenance', 'sourceManifest']) if (!Array.isArray(seed[key])) throw new Error(`INVALID_SEED_${key}`);
  const seen = new Set<string>();
  for (const key of ['frameworks', 'chapters', 'items', 'assessments', 'improvements', 'inspections', 'dryScores']) {
    seen.clear();
    for (const row of seed[key] as Record<string, unknown>[]) {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || seen.has(row.id) || !Number.isInteger(row.version) || Number(row.version) < 0) throw new Error(`INVALID_OR_DUPLICATE_SEED_RECORD_${key}`);
      seen.add(row.id);
    }
  }
  const imports = seed.importNote as BiText | undefined;
  if (!imports || typeof imports.en !== 'string' || typeof imports.zh !== 'string') throw new Error('INVALID_IMPORT_NOTE');
  const checkSecrets = (entry: unknown): void => {
    if (Array.isArray(entry)) { entry.forEach(checkSecrets); return; }
    if (entry && typeof entry === 'object') for (const [key, field] of Object.entries(entry)) {
      if (/^(password|passwordHash|credentialHash|gateHash|serviceRole|service_role|serviceRoleKey|sessionToken)$/i.test(key)) throw new Error('SEED_CONTAINS_CREDENTIALS');
      checkSecrets(field);
    }
  };
  checkSecrets(seed);
  if ('people' in seed || 'settings' in seed) throw new Error('SEED_MUST_NOT_REPLACE_PEOPLE_OR_SETTINGS');
  return value as SeedBundle;
}
export function freshBusinessDatabase(ctx: Pick<PageProps, 'state'>): boolean {
  const state = ctx.state;
  return ['frameworks', 'chapters', 'items', 'assessments', 'improvements', 'inspections', 'dryScores'].every(key => (state[key as keyof typeof state] as unknown[]).length === 0) && ('controlSummary' in state ? state.controlSummary.cycles===0&&state.controlSummary.provenance===0 : state.cycles.length===0&&state.provenance.length===0);
}
export function gapResolutionSupported(item: StandardItem, baseline?: StandardItem): boolean {
  if (!item.sourceGapResolved || !item.sourceGap || baseline?.sourceGapResolved) return true;
  return item.sources.some(source => source.source.trim() && source.file?.trim() && source.note?.trim() && (source.cell?.trim() || source.rawItem?.trim() || source.pages?.some(page => Number.isInteger(page) && page > 0)) && !baseline?.sources.some(old => JSON.stringify(old) === JSON.stringify(source)));
}
const roles: Role[] = ['owner', 'admin', 'operator'];
const blankText = (): BiText => ({ en: '', zh: '' });

export default function Management(ctx: PageProps) {
  const { state, t } = ctx;
  const personEditor = useRecordEditor<Person>(ctx, 'person');
  const frameworkEditor = useRecordEditor<Framework>(ctx, 'framework');
  const chapterEditor = useRecordEditor<Chapter>(ctx, 'chapter');
  const itemEditor = useRecordEditor<StandardItem>(ctx, 'item');
  const settingsEditor = useRecordEditor<SystemSettings>(ctx, 'settings');
  const restart = useFrameworkRestart(ctx);
  const [section, setSection] = useState<'people' | 'frameworks' | 'departments' | 'audit' | 'system'>('people');
  const [frameworkId, setFrameworkId] = useState<FrameworkId>('TMSA');
  const [chapterFilter, setChapterFilter] = useState('');
  const [search, setSearch] = useState('');
  const [peopleDepartment, setPeopleDepartment] = useState('');
  const [peopleRole, setPeopleRole] = useState<Role | ''>('');
  const [showInactive, setShowInactive] = useState(true);
  const [validation, setValidation] = useState('');
  const [personPassword, setPersonPassword] = useState('');
  const [hashing, setHashing] = useState(false);
  const hashGeneration = useRef(0);
  const [settingsMode, setSettingsMode] = useState<'departments' | 'permissions'>('departments');
  const [query, setQuery] = useState<AuditQuery>({ limit: 25, offset: 0 });
  const [submittedQuery, setSubmittedQuery] = useState<AuditQuery | null>(null);
  const [auditRows, setAuditRows] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState('');
  const auditGeneration = useRef(0);
  const [seed, setSeed] = useState<SeedBundle | null>(null);
  const [seedName, setSeedName] = useState('');
  const [seedError, setSeedError] = useState('');
  const [seedImportAcknowledged, setSeedImportAcknowledged] = useState(false);
  const [systemWorking, setSystemBusy] = useState(false);
  const systemBusy = systemWorking || restart.busy;
  const [gatePassword, setGatePassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [transferPassword, setTransferPassword] = useState('');
  const [targetOwner, setTargetOwner] = useState('');
  const [systemError, setSystemError] = useState('');
  const owner = ctx.user.active && ctx.user.role === 'owner';
  const can = (cap: Parameters<typeof hasPermission>[2]) => hasPermission(state.settings.rolePermissions, ctx.user, cap);
  const allowed = (owner || ctx.user.role === 'admin') && can('enterManagement');
  const anyDraft = !!(personEditor.draft || frameworkEditor.draft || chapterEditor.draft || itemEditor.draft || settingsEditor.draft);
  const anyBusy = personEditor.busy || frameworkEditor.busy || chapterEditor.busy || itemEditor.busy || settingsEditor.busy || restart.busy;
  const fieldPair = (label: string, value: BiText, onChange: (text: BiText) => void) => <>{(['en', 'zh'] as const).map(lang => <label className="field" key={`${label}-${lang}`}>{label} · {lang === 'en' ? t('英文', 'English') : t('繁中', 'Traditional Chinese')}<textarea rows={3} value={value[lang]} onChange={event => onChange({ ...value, [lang]: event.target.value })} /></label>)}</>;
  const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
  const discard = (cancel: () => Promise<void>) => { if (!anyBusy && !hashing && (!(personEditor.isDirty || frameworkEditor.isDirty || chapterEditor.isDirty || itemEditor.isDirty || settingsEditor.isDirty || personPassword) || window.confirm(t('放棄此草稿？取消不會保存。', 'Discard this draft? Cancel does not save.')))) { hashGeneration.current++; setPersonPassword(''); setValidation(''); void cancel(); } };
  const intent = <T extends BaseEntity & { active: boolean }>(record: T, baseline?: T): SaveIntent => record.version === 0 ? 'create' : baseline?.active !== record.active ? record.active ? 'activate' : 'archive' : 'update';
  const openPerson = async (person: Person) => { if (!owner && person.role === 'owner') return; hashGeneration.current++; setPersonPassword(''); setValidation(''); await personEditor.open(person); };
  const preparePersonPassword = async () => {
    if (!personEditor.draft || !personPassword) return;
    const generation = ++hashGeneration.current;
    const id = personEditor.draft.id;
    setHashing(true);
    try {
      const credentialHash = await credentialDigest(personPassword);
      if (generation !== hashGeneration.current) return;
      personEditor.setDraft(old => old?.id === id ? { ...old, credentialHash, hasPassword: true } : old);
      setPersonPassword('');
    } catch (error) { setValidation(errorMessage(error)); }
    finally { setHashing(false); }
  };
  const savePerson = async () => {
    const draft = personEditor.draft as Person & { credentialHash?: string | null } | null;
    if (!draft) return;
    if (!draft.name.trim() || !draft.username.trim() || !draft.departmentId) { setValidation(t('請填寫姓名、登入名稱及部門。', 'Enter a name, username and department.')); return; }
    if (personPassword) { setValidation(t('請先準備密碼，再按確認保存；尚未雜湊的密碼不會傳送。', 'Prepare the password first, then confirm save. Unhashed passwords are never sent.')); return; }
    if (draft.role === 'owner' && !draft.hasPassword) { setValidation(t('Owner必須保留個人密碼。', 'The Owner must retain a personal password.')); return; }
    if (!owner && (draft.role === 'owner' || state.people.find(row => row.id === draft.id)?.role === 'owner')) { setValidation(t('管理員不能管理Owner。', 'Administrators cannot manage the Owner.')); return; }
    if (state.people.some(row => row.id !== draft.id && row.username.toLocaleLowerCase() === draft.username.trim().toLocaleLowerCase())) { setValidation(t('登入名稱已存在，包括停用帳戶。', 'This username already exists, including inactive accounts.')); return; }
    if (!draft.active && !window.confirm(t('停用會使其舊登入失去寫入權，歷史仍保留。確定保存？', 'Deactivation revokes existing sessions’ write access and retains history. Save?'))) return;
    await personEditor.save(intent(draft, state.people.find(row => row.id === draft.id)));
  };
  const saveFramework = async () => {
    const draft = frameworkEditor.draft;
    if (!draft) return;
    if (!draft.name.en.trim() && !draft.name.zh.trim() || !draft.sourceVersion.trim()) { setValidation(t('請填寫框架名稱及來源版本。', 'Enter the framework name and source version.')); return; }
    await frameworkEditor.save(intent(draft, state.frameworks.find(row => row.id === draft.id)));
  };
  const saveChapter = async () => {
    const draft = chapterEditor.draft;
    if (!draft) return;
    if (!draft.code.trim() || !draft.name.en.trim() && !draft.name.zh.trim() || !Number.isFinite(draft.order)) { setValidation(t('請填寫章節代碼、名稱及有效排序。', 'Enter a chapter code, name and valid order.')); return; }
    if (state.chapters.some(row => row.id !== draft.id && row.frameworkId === draft.frameworkId && row.code === draft.code)) { setValidation(t('此框架內章節代碼已存在。', 'The chapter code already exists in this framework.')); return; }
    await chapterEditor.save(intent(draft, state.chapters.find(row => row.id === draft.id)));
  };
  const saveItem = async () => {
    const draft = itemEditor.draft;
    if (!draft) return;
    const baseline = state.items.find(row => row.id === draft.id);
    if (!draft.code.trim() || !draft.chapterId || !draft.kpi.en.trim() && !draft.kpi.zh.trim() || ![1, 2, 3, 4].includes(draft.level) || !Number.isFinite(draft.order)) { setValidation(t('請填寫代碼、章節、KPI、級別1–4及排序。', 'Enter a code, chapter, KPI, level 1–4 and order.')); return; }
    if (state.items.some(row => row.id !== draft.id && row.frameworkId === draft.frameworkId && row.code === draft.code)) { setValidation(t('此框架內Item代碼已存在。', 'The item code already exists in this framework.')); return; }
    if (!gapResolutionSupported(draft, baseline)) { setValidation(t('來源缺口只能在新增具定位及補證說明的來源後明確保存為已補齊；不可僅勾選。', 'Resolve a source gap only with an additional located source and supporting note, then explicitly save. A checkbox alone is insufficient.')); return; }
    if (draft.sources.some(source => !source.source.trim() || source.pages?.some(page => !Number.isInteger(page) || page < 1))) { setValidation(t('來源名稱必填，頁碼須為正整數。', 'Source names are required and page numbers must be positive integers.')); return; }
    await itemEditor.save(intent(draft, baseline));
  };
  const loadAudit = async (request: AuditQuery) => {
    const generation = ++auditGeneration.current;
    setAuditBusy(true); setAuditError('');
    try {
      const response = await ctx.api.queryAudit(request);
      if (generation !== auditGeneration.current) return;
      if (!Number.isInteger(response.total) || response.total < 0 || !Array.isArray(response.rows) || response.rows.length > (request.limit || 25) || response.rows.length > response.total) throw new Error('INVALID_AUDIT_PAGE');
      setAuditRows(response.rows); setAuditTotal(response.total); setSubmittedQuery(request);
    } catch (error) { if (generation === auditGeneration.current) setAuditError(errorMessage(error)); }
    finally { if (generation === auditGeneration.current) setAuditBusy(false); }
  };
  useEffect(() => { if (allowed && section === 'audit' && can('viewAuditLogs')) void loadAudit({ ...query, offset: 0 }); return () => { auditGeneration.current++; }; }, [section, ctx.user.id, ctx.api]);
  useEffect(() => {
    const key = 'management:transient-credentials';
    const dirty = !!(personPassword || ownerPassword || gatePassword || transferPassword);
    const busy = hashing || systemWorking;
    window.dispatchEvent(new CustomEvent('compliance-editor-status', { detail: { key, dirty, busy } }));
    return () => { window.dispatchEvent(new CustomEvent('compliance-editor-status', { detail: { key, dirty: false, busy: false } })); };
  }, [personPassword, ownerPassword, gatePassword, transferPassword, hashing, systemWorking]);
  const openRoleSettings = async () => {
    if (!owner) return;
    setSettingsMode('permissions'); setValidation('');
    if (await settingsEditor.open(state.settings)) settingsEditor.setDraft(current => {
      if (!current) return current;
      const rolePermissions = structuredClone(current.rolePermissions);
      for (const role of roles) for (const capability of CAPABILITIES) rolePermissions[role][capability] = hasPermission(current.rolePermissions, { role, active: true }, capability);
      return { ...current, rolePermissions };
    });
  };
  const saveSettings = async () => {
    const draft = settingsEditor.draft;
    if (!draft || settingsMode === 'permissions' && !owner) return;
    if (draft.departments.some(department => !department.name.en.trim() && !department.name.zh.trim())) { setValidation(t('每個部門需填寫名稱。', 'Each department requires a name.')); return; }
    if (settingsMode === 'permissions' && !window.confirm(t('確認保存角色權限矩陣？伺服器仍會強制Owner專屬能力與管理入口。', 'Save the role capability matrix? Server-enforced Owner-only capabilities and management access remain.'))) return;
    await settingsEditor.save('update');
  };
  const seedUpload = async (file?: File) => {
    setSeed(null); setSeedName(file?.name || ''); setSeedError('');
    if (!file) return;
    try { const parsed = validateSeedPreview(JSON.parse(await file.text())); setSeed(parsed); }
    catch (error) { setSeedError(errorMessage(error)); }
  };
  const importSeed = async () => {
    if (!seed || !owner || seedImportAcknowledged || !freshBusinessDatabase(ctx)) return;
    if (!window.confirm(t('確認只向目前空白業務資料庫匯入此私有seed？這會寫入雲端，伺服器會再次驗證。', 'Import this private seed into the currently empty business database? This writes cloud data and is validated again by the server.'))) return;
    setSystemBusy(true); setSeedError('');
    try {
      const outcome = await runSeedImport(ctx.api, seed, ctx.refresh);
      setSeedImportAcknowledged(true); setSeed(null);
      if (outcome.status === 'committed_readback_pending') {
        const message = `${t('伺服器已確認寫入記錄數', 'Server-confirmed committed records')}: ${outcome.imported} · ${t('最新資料尚未讀回，請勿重新匯入。', 'Latest data has not been read back; do not import again.')} ${errorMessage(outcome.error)}`;
        setSeedError(message); ctx.notify(message, 'info');
      } else ctx.notify(`${t('伺服器已確認匯入及資料讀回，記錄數', 'Import and authoritative readback confirmed, records')}: ${outcome.imported}`, 'success');
    }
    catch (error) { setSeedError(errorMessage(error)); }
    finally { setSystemBusy(false); }
  };
  const backup = async () => {
    setSystemBusy(true); setSystemError('');
    try {
      const canonical = await ctx.api.read();
      const data = { schemaVersion: 1, exportedAt: new Date().toISOString(), purpose: 'private-platform-backup', state: canonical };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `tmsa-drybms-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      ctx.notify(t('私有備份已產生並啟動下載。備份不是初始seed，請勿提交至Git。', 'Private backup generated and download started. This is not an initial seed; never commit it to Git.'), 'success');
    } catch (error) { setSystemError(errorMessage(error)); }
    finally { setSystemBusy(false); }
  };
  const sensitive = async (action: 'site_password' | 'transfer_owner') => {
    if (!owner || systemBusy) return;
    const credential = action === 'site_password' ? ownerPassword : transferPassword;
    if (!credential || action === 'site_password' && !gatePassword || action === 'transfer_owner' && !targetOwner) { setSystemError(t('請完整填寫此專用表單。', 'Complete this dedicated form.')); return; }
    if (!window.confirm(action === 'site_password' ? t('確認更新進站密碼？', 'Change the site entry password?') : t('確認轉移唯一Owner？你將失去Owner身份，舊session可能立即失效。', 'Transfer the sole Owner role? You will lose Owner authority and existing sessions may be invalidated.'))) return;
    setSystemBusy(true); setSystemError('');
    try {
      const credentialHash = await credentialDigest(credential);
      if (action === 'site_password') await ctx.api.rpc('site_password', { credentialHash, newGateHash: await credentialDigest(gatePassword) });
      else await ctx.api.rpc('transfer_owner', { targetId: targetOwner, credentialHash });
      setOwnerPassword(''); setGatePassword(''); setTransferPassword('');
      // Readback precedes success feedback; a transfer may deliberately revoke this session.
      const confirmed = await ctx.api.read();
      if (action === 'site_password' && !confirmed.settings.siteGateConfigured) throw new Error('GATE_READBACK_NOT_CONFIRMED');
      if (action === 'transfer_owner' && (confirmed.people.filter(person => person.role === 'owner' && person.active).length !== 1 || !confirmed.people.some(person => person.id === targetOwner && person.role === 'owner' && person.active))) throw new Error('OWNER_READBACK_NOT_CONFIRMED');
      await ctx.refresh();
      ctx.notify(t('伺服器變更已讀回確認。', 'Server change verified by readback.'), 'success');
    } catch (error) { setSystemError(`${errorMessage(error)} · ${t('未確認讀回，請重新登入確認；不會顯示假成功。', 'Readback not confirmed. Sign in again to verify; no false success is shown.')}`); }
    finally { setSystemBusy(false); }
  };
  const sourcesEditor = (item: StandardItem) => <fieldset className="multi-select"><legend>{t('來源定位（保留原文，不批量清缺口）', 'Source locators (retain originals, no bulk gap clearing)')}</legend>{item.sources.map((source, index) => <div className="form-grid notice" key={index}>{(['source', 'file', 'sheet', 'cell', 'rawItem', 'note'] as const).map(key => <label className="field" key={key}>{({ source: t('來源', 'Source'), file: t('檔案', 'File'), sheet: t('工作表', 'Sheet'), cell: t('儲存格', 'Cell'), rawItem: t('原始Item／原文', 'Raw item / original text'), note: t('定位／補證說明', 'Locator / supporting note') })[key]}<textarea rows={key === 'rawItem' || key === 'note' ? 3 : 1} disabled={index < (state.items.find(row => row.id === item.id)?.sources.length || 0)} value={source[key] || ''} onChange={event => itemEditor.setDraft(old => old ? { ...old, sources: old.sources.map((row, i) => i === index ? { ...row, [key]: event.target.value } : row) } : old)} /></label>)}<label className="field">{t('頁碼（逗號分隔）', 'Pages (comma-separated)')}<input disabled={index < (state.items.find(row => row.id === item.id)?.sources.length || 0)} value={source.pages?.join(',') || ''} onChange={event => itemEditor.setDraft(old => old ? { ...old, sources: old.sources.map((row, i) => i === index ? { ...row, pages: event.target.value.trim() ? event.target.value.split(',').map(value => Number(value.trim())) : [] } : row) } : old)} /></label></div>)}<button className="btn neutral" onClick={() => itemEditor.setDraft(old => old ? { ...old, sources: [...old.sources, { source: '', file: '', note: '' }] } : old)}>{t('新增補充來源', 'Add supporting source')}</button></fieldset>;

  if (!allowed) return <Empty>{t('只有Owner及具管理入口權限的管理員可進入管理。操作員／船舶帳戶不能進入。', 'Only the Owner and authorized administrators can enter management. Operators and vessel accounts cannot enter.')}</Empty>;
  return <>
    <PageHeading title={t('管理', 'Management')} subtitle={t('停用不刪除歷史；角色及所有寫入仍由伺服器再次授權。', 'Deactivation retains history. Roles and every write are authorized again by the server.')} />
    <nav className="toolbar" aria-label={t('管理分類', 'Management sections')}>{([{ id: 'people', name: t('人員', 'People'), permitted: can('manageUsers') }, { id: 'frameworks', name: t('框架／條目', 'Frameworks / items'), permitted: can('manageFrameworks') }, { id: 'departments', name: t('部門', 'Departments'), permitted: can('manageUsers') }, { id: 'audit', name: t('操作紀錄', 'Audit logs'), permitted: can('viewAuditLogs') }, { id: 'system', name: t('系統／資料', 'System / data'), permitted: owner }] as const).filter(tab => tab.permitted).map(tab => <button key={tab.id} className={`btn ${section === tab.id ? 'primary' : 'neutral'}`} disabled={anyDraft || anyBusy} onClick={() => { setSection(tab.id); setValidation(''); }}>{tab.name}</button>)}</nav>
    {section === 'people' && can('manageUsers') && <>
      <div className="toolbar"><label className="field">{t('姓名／帳號／部門', 'Name / username / department')}<input value={search} onChange={e => setSearch(e.target.value)} /></label><label className="field">{t('部門篩選', 'Department filter')}<select aria-label={t('人員部門篩選', 'Personnel department filter')} value={peopleDepartment} onChange={e => setPeopleDepartment(e.target.value)}><option value="">{t('全部部門', 'All departments')}</option>{state.settings.departments.map(dept => <option key={dept.id} value={dept.id}>{bi(dept.name, ctx.lang)}{dept.active ? '' : ` · ${t('停用', 'Inactive')}`}</option>)}</select></label><label className="field">{t('角色篩選', 'Role filter')}<select aria-label={t('人員角色篩選', 'Personnel role filter')} value={peopleRole} onChange={e => setPeopleRole(e.target.value as Role | '')}><option value="">{t('全部角色', 'All roles')}</option>{roles.map(role => <option key={role} value={role}>{roleName(role, ctx.lang)}</option>)}</select></label><label><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />{t('顯示停用記錄', 'Include inactive records')}</label><button className="btn primary" disabled={anyDraft || anyBusy} onClick={() => void openPerson({ ...newBase(), username: '', name: '', departmentId: state.settings.departments.find(row => row.active)?.id || '', role: 'operator', active: true, hasPassword: false })}>{t('新增人員', 'Add person')}</button></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('部門', 'Department')}</th><th>{t('姓名', 'Name')}</th><th>{t('登入名稱', 'Username')}</th><th>{t('角色／狀態', 'Role / status')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>{state.people.filter(person => (showInactive || person.active) && (!peopleDepartment || person.departmentId === peopleDepartment) && (!peopleRole || person.role === peopleRole) && `${person.name} ${person.username} ${bi(state.settings.departments.find(row => row.id === person.departmentId)?.name, ctx.lang)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(person => <tr key={person.id}><td>{bi(state.settings.departments.find(row => row.id === person.departmentId)?.name, ctx.lang) || person.departmentId}</td><td>{person.name}</td><td>{person.username}</td><td>{roleName(person.role, ctx.lang)} · {person.active ? t('啟用', 'Active') : t('停用', 'Inactive')}</td><td><button className="btn neutral" disabled={anyDraft || anyBusy || !owner && person.role === 'owner'} onClick={() => void openPerson(person)}>{t('編輯／停用／再啟用', 'Edit / deactivate / reactivate')}</button></td></tr>)}</tbody></table></div>
    </>}
    {section === 'frameworks' && can('manageFrameworks') && <>
      <div className="toolbar"><label className="field">{t('框架', 'Framework')}<select value={frameworkId} onChange={e => { setFrameworkId(e.target.value as FrameworkId); setChapterFilter(''); }}><option>TMSA</option><option>DRYBMS</option></select></label><label className="field">{t('章節', 'Chapter')}<select value={chapterFilter} onChange={e => setChapterFilter(e.target.value)}><option value="">{t('全部', 'All')}</option>{state.chapters.filter(row => row.frameworkId === frameworkId).map(row => <option key={row.id} value={row.id}>{row.code} · {bi(row.name, ctx.lang)}{row.active ? '' : t('（停用）', ' (inactive)')}</option>)}</select></label><label className="field">{t('搜尋Item／KPI／BPG', 'Search item / KPI / BPG')}<input value={search} onChange={e => setSearch(e.target.value)} /></label><label><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />{t('顯示停用', 'Include inactive')}</label></div>
      <div className="page-actions"><button className="btn neutral" disabled={anyDraft || anyBusy} onClick={() => { setValidation(''); void frameworkEditor.open(state.frameworks.find(row => row.id === frameworkId) || { ...newBase(), id: frameworkId, name: { en: frameworkId, zh: frameworkId }, description: blankText(), scoring: frameworkId === 'TMSA' ? 'tmsa-stage' : 'drybms-guidance', active: true, sourceVersion: '', scopeLabel: blankText() }); }}>{state.frameworks.some(row => row.id === frameworkId) ? t('編輯框架', 'Edit framework') : t('建立此框架', 'Create this framework')}</button><button className="btn primary" disabled={anyDraft || anyBusy || !state.frameworks.some(row => row.id === frameworkId && row.active)} onClick={() => { setValidation(''); void chapterEditor.open({ ...newBase(), frameworkId, code: '', name: blankText(), aim: blankText(), order: state.chapters.filter(row => row.frameworkId === frameworkId).length + 1, active: true }); }}>{t('新增章節', 'Add chapter')}</button><button className="btn primary" disabled={anyDraft || anyBusy || !state.chapters.some(row => row.frameworkId === frameworkId && row.active)} onClick={() => { setValidation(''); void itemEditor.open({ ...newBase(), frameworkId, chapterId: chapterFilter || state.chapters.find(row => row.frameworkId === frameworkId && row.active)?.id || '', code: '', level: 1, order: state.items.filter(row => row.frameworkId === frameworkId).length + 1, active: true, kpi: blankText(), guidance: blankText(), departmentIds: [], sources: [] }); }}>{t('新增Item', 'Add item')}</button></div>
      <h3>{t('章節（穩定id及歷史保留）', 'Chapters (stable IDs and retained history)')}</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>{t('代碼／排序', 'Code / order')}</th><th>{t('名稱', 'Name')}</th><th>{t('狀態／操作', 'Status / actions')}</th></tr></thead><tbody>{state.chapters.filter(row => row.frameworkId === frameworkId && (showInactive || row.active) && (!chapterFilter || row.id === chapterFilter)).sort((a, b) => a.order - b.order).map(row => <tr key={row.id}><td>{row.code} · {row.order}</td><td><BilingualText value={row.name} /></td><td>{row.active ? t('啟用', 'Active') : t('停用', 'Inactive')} <button className="btn neutral" disabled={anyDraft || anyBusy} onClick={() => { setValidation(''); void chapterEditor.open(row); }}>{t('編輯／停用／再啟用', 'Edit / deactivate / reactivate')}</button></td></tr>)}</tbody></table></div>
      <h3>Items</h3><div className="table-wrap"><table className="data-table"><thead><tr><th>{t('代碼／級別', 'Code / level')}</th><th>KPI / BPG</th><th>{t('部門／來源', 'Departments / source')}</th><th>{t('狀態／操作', 'Status / actions')}</th></tr></thead><tbody>{state.items.filter(row => row.frameworkId === frameworkId && (showInactive || row.active) && (!chapterFilter || row.chapterId === chapterFilter) && `${row.code} ${row.kpi.en} ${row.kpi.zh} ${row.guidance.en} ${row.guidance.zh}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => a.order - b.order).map(item => <tr key={item.id}><td>{item.code} · {item.level}<small>{item.analysisIndex && t('（分析索引，非官方編號）', ' (analysis index, not official numbering)')}</small></td><td><BilingualText value={item.kpi} sentence /><BilingualText value={item.guidance} sentence /></td><td>{item.departmentIds.map(id => bi(state.settings.departments.find(row => row.id === id)?.name, ctx.lang) || id).join(' / ')}{item.sourceGap && <div className="notice warning">{item.sourceGap} · {item.sourceGapResolved ? t('已補證', 'Supporting resolution') : t('未補齊', 'Unresolved')}</div>}</td><td>{item.active ? t('啟用', 'Active') : t('停用', 'Inactive')}<button className="btn neutral" disabled={anyDraft || anyBusy} onClick={() => { setValidation(''); void itemEditor.open(item); }}>{t('編輯／停用／再啟用', 'Edit / deactivate / reactivate')}</button></td></tr>)}</tbody></table></div>
    </>}
    {section === 'departments' && can('manageUsers') && <><PageHeading title={t('部門管理', 'Departments')} actions={<button className="btn primary" disabled={anyDraft || anyBusy} onClick={() => { setSettingsMode('departments'); setValidation(''); void settingsEditor.open(state.settings); }}>{t('編輯部門／新增／停用', 'Edit / add / deactivate departments')}</button>} /><div className="table-wrap"><table className="data-table"><thead><tr><th>{t('部門', 'Department')}</th><th>{t('狀態', 'Status')}</th></tr></thead><tbody>{state.settings.departments.map(department => <tr key={department.id}><td><BilingualText value={department.name} /></td><td>{department.active ? t('啟用', 'Active') : t('停用', 'Inactive')}</td></tr>)}</tbody></table></div></>}
    {section === 'audit' && can('viewAuditLogs') && <>
      <form className="toolbar" onSubmit={event => { event.preventDefault(); void loadAudit({ ...query, offset: 0 }); }}><label className="field">{t('記錄種類', 'Record kind')}<select value={query.kind || ''} onChange={e => setQuery({ ...query, kind: e.target.value })}><option value="">{t('全部', 'All')}</option>{['framework', 'chapter', 'item', 'assessment', 'improvement', 'inspection', 'person', 'dryScore', 'settings', 'export', 'import'].map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label><label className="field">{t('Item編號', 'Item code')}<input value={query.itemCode || ''} onChange={e => setQuery({ ...query, itemCode: e.target.value })} /></label><label className="field">{t('操作人', 'Actor')}<select value={query.actorId || ''} onChange={e => setQuery({ ...query, actorId: e.target.value })}><option value="">{t('全部', 'All')}</option>{state.people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="field">{t('起日', 'From')}<input type="date" value={query.from || ''} onChange={e => setQuery({ ...query, from: e.target.value })} /></label><label className="field">{t('迄日', 'To')}<input type="date" value={query.to || ''} onChange={e => setQuery({ ...query, to: e.target.value })} /></label><label className="field">{t('全文搜尋', 'Full-text search')}<input value={query.text || ''} onChange={e => setQuery({ ...query, text: e.target.value })} /></label><label className="field">{t('每頁筆數', 'Page size')}<select value={query.limit || 25} onChange={e => setQuery({ ...query, limit: Number(e.target.value) })}>{[25, 50, 100].map(value => <option key={value}>{value}</option>)}</select></label><button className="btn primary" disabled={auditBusy}>{t('查詢伺服器', 'Query server')}</button></form>
      {auditError && <div role="alert" className="notice error">{auditError}</div>}<p>{auditBusy ? t('查詢中…', 'Querying…') : `${t('伺服器符合總數', 'Server total matches')}: ${auditTotal}`} · {t('此頁不是本機最新1000筆篩選', 'This is not filtering a cached latest-1000 list')}</p>
      <div className="table-wrap"><table className="data-table audit-table"><thead><tr><th>{t('時間／使用者', 'Time / actor')}</th><th>{t('動作／種類', 'Action / kind')}</th><th>{t('Item／實體', 'Items / entity')}</th><th>{t('摘要', 'Summary')}</th></tr></thead><tbody>{auditRows.map(log => <AuditRow key={log.id} log={log} lang={ctx.lang} state={state} />)}</tbody></table></div>{!auditBusy && !auditRows.length && <Empty>{t('沒有符合的操作紀錄。', 'No matching audit records.')}</Empty>}
      {submittedQuery && <div className="page-actions"><button className="btn neutral" disabled={auditBusy || !(submittedQuery.offset || 0)} onClick={() => void loadAudit({ ...submittedQuery, offset: Math.max(0, (submittedQuery.offset || 0) - (submittedQuery.limit || 25)) })}>{t('上一頁', 'Previous')}</button><span>{auditRows.length ? (submittedQuery.offset || 0) + 1 : 0}–{auditRows.length ? (submittedQuery.offset || 0) + auditRows.length : 0} / {auditTotal}</span><button className="btn neutral" disabled={auditBusy || (submittedQuery.offset || 0) + (submittedQuery.limit || 25) >= auditTotal} onClick={() => void loadAudit({ ...submittedQuery, offset: (submittedQuery.offset || 0) + (submittedQuery.limit || 25) })}>{t('下一頁', 'Next')}</button></div>}
    </>}
    {owner && restart.dialogOpen && <Modal title={t('一鍵重新開始', 'Start over')} onClose={restart.close}><EditorNotice error={restart.error} lost={false} /><p>{restart.pending ? t('先前操作結果尚未確認。請使用原操作核對／重播，不會另建批次。', 'The previous result is unconfirmed. Check/replay the original operation; no new batch will be created.') : t('要將TMSA還是DRYBMS所有項目的「已完成本次更新」恢復為未勾選？選「否」保持不變。', 'Reset all “completed this update” flags for TMSA or DRYBMS? Choose No to leave everything unchanged.')}</p><p className="notice warning">{t('只清除完成更新勾選，其他資料與歷史保留。TMSA現行分數依原計分規則重算；DRYBMS四級自評百分比不清空。有人編輯所選框架時，整批不執行。', 'Only completion flags are cleared; other data and history are retained. Current TMSA scores recalculate under existing rules; DRYBMS maturity percentages remain. Active edits in the selected framework block the entire batch.')}</p>{restart.pending && <p>{restart.pending.frameworkId} · {t('原操作編號', 'Original operation')}: <code>{restart.pending.operationId}</code></p>}<div className="page-actions">{restart.pending ? <><button className="btn warning" disabled={restart.busy} onClick={()=>void restart.submit()}>{restart.busy ? t('核對中…', 'Checking…') : t('核對／重播原操作', 'Check / replay original operation')}</button><button className="btn neutral" disabled={restart.busy} onClick={restart.close}>{t('關閉（保留原操作）', 'Close (retain original operation)')}</button></> : <><button className="btn neutral" disabled={restart.busy} onClick={restart.close}>{t('否', 'No')}</button>{(['TMSA','DRYBMS'] as FrameworkId[]).map(fw=><button key={fw} className="btn warning" disabled={restart.busy} onClick={()=>void restart.submit(fw)}>{fw}</button>)}</>}</div></Modal>}
    {section === 'system' && owner && <>
      {systemError && <div role="alert" className="notice error">{systemError}</div>}
      <section className="notice"><h3>{t('本次更新狀態', 'Current update-completion state')}</h3><p>{t('只恢復所選框架的完成更新勾選，包含停用條目；不刪除自評、佐證、Y/N、改善或歷史。', 'Reset only the selected framework’s completion flags, including inactive items. Assessments, evidence, Y/N, improvements and history are retained.')}</p>{restart.error && <div role="alert" className="notice error">{restart.error}</div>}<button className="btn warning" disabled={systemBusy || anyDraft || anyBusy || !restart.ready} onClick={restart.open}>{restart.pending ? t('核對原操作', 'Check original operation') : t('一鍵重新開始', 'Start over')}</button></section>
      <section className="notice"><h3>{t('公開連線設定', 'Public connection configuration')}</h3><p>{t('Supabase URL', 'Supabase URL')}: {ctx.api.config.url}</p><label className="field">{t('公開anon key（不是service-role）', 'Public anon key (not service-role)')}<textarea readOnly rows={3} value={ctx.api.config.anonKey} /></label><p>{t('SQL安裝及連線初始化請使用登入設定面板；此處不接受service-role。', 'Use the login setup panel for SQL installation and connection initialization. This panel never accepts service-role credentials.')}</p></section>
      <section className="notice"><h3>{t('角色權限矩陣（僅Owner）', 'Role capabilities (Owner only)')}</h3><button className="btn primary" disabled={anyDraft || anyBusy} onClick={() => void openRoleSettings()}>{t('編輯角色權限', 'Edit role capabilities')}</button></section>
      <form className="notice form-grid" onSubmit={event => { event.preventDefault(); void sensitive('site_password'); }}><h3>{t('進站密碼（專用動作）', 'Site entry password (dedicated action)')}</h3><label className="field">{t('目前Owner個人密碼', 'Current Owner personal password')}<input type="password" autoComplete="current-password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} /></label><label className="field">{t('新進站密碼', 'New site entry password')}<input type="password" autoComplete="new-password" value={gatePassword} onChange={e => setGatePassword(e.target.value)} /></label><button className="btn warning" disabled={systemBusy || anyDraft}>{t('確認更新進站密碼', 'Confirm site password change')}</button></form>
      <form className="notice form-grid" onSubmit={event => { event.preventDefault(); void sensitive('transfer_owner'); }}><h3>{t('轉移唯一Owner（專用動作）', 'Transfer sole Owner (dedicated action)')}</h3><label className="field">{t('新Owner（啟用且已設定個人密碼）', 'New Owner (active with personal password)')}<select value={targetOwner} onChange={e => setTargetOwner(e.target.value)}><option value="">{t('請選擇', 'Select')}</option>{state.people.filter(person => person.active && person.hasPassword && person.id !== ctx.user.id && person.role !== 'owner').map(person => <option key={person.id} value={person.id}>{person.name} · {roleName(person.role, ctx.lang)}</option>)}</select></label><label className="field">{t('目前Owner個人密碼', 'Current Owner personal password')}<input type="password" autoComplete="current-password" value={transferPassword} onChange={e => setTransferPassword(e.target.value)} /></label><button className="btn danger" disabled={systemBusy || anyDraft}>{t('確認轉移Owner', 'Confirm Owner transfer')}</button></form>
      <section className="notice"><h3>{t('資料管理／私有seed初始匯入', 'Data management / initial private seed import')}</h3><p>{t('只允許空白業務資料库；不覆寫人員或設定、不把私有JSON打包至網站。完整資料及來源仍由伺服器驗證。', 'Only an empty business database can be seeded. People and settings are not replaced. Private JSON is never bundled with the website; the server validates full data and provenance.')}</p><label className="field">{t('選擇本機私有seed JSON', 'Choose local private seed JSON')}<input type="file" accept=".json,application/json" disabled={systemBusy || seedImportAcknowledged || !freshBusinessDatabase(ctx)} onChange={event => void seedUpload(event.target.files?.[0])} /></label>{seedError && <div role="alert" className="notice error">{seedError}</div>}{!freshBusinessDatabase(ctx) && <p className="notice warning">{t('已有業務資料，初始seed匯入已停用。', 'Business data exists; initial seed import is disabled.')}</p>}{seed && <><p>{seedName} · schemaVersion {seed.schemaVersion}</p><BilingualText value={seed.importNote} /><ul>{(['frameworks', 'chapters', 'items', 'assessments', 'improvements', 'inspections', 'dryScores', 'cycles', 'provenance', 'sourceManifest'] as const).map(key => <li key={key}>{key}: {seed[key].length}</li>)}</ul><button className="btn warning" disabled={systemBusy || seedImportAcknowledged || !freshBusinessDatabase(ctx)} onClick={() => void importSeed()}>{t('確認初始匯入', 'Confirm initial import')}</button></>}<button className="btn neutral" disabled={systemBusy} onClick={() => void backup()}>{t('下载本機私有備份JSON', 'Download private backup JSON')}</button></section>
    </>}
    {personEditor.draft && <Modal title={t('編輯人員（歷史帳戶保留）', 'Edit person (history retained)')} onClose={() => discard(personEditor.cancel)}><EditorNotice error={personEditor.error || validation} lost={personEditor.lost} /><div className="form-grid"><label className="field">{t('部門', 'Department')}<select value={personEditor.draft.departmentId} onChange={e => personEditor.setDraft(old => old ? { ...old, departmentId: e.target.value } : old)}><option value="">{t('請選擇', 'Select')}</option>{state.settings.departments.filter(dept => dept.active || dept.id === personEditor.draft?.departmentId).map(dept => <option key={dept.id} value={dept.id}>{bi(dept.name, ctx.lang)}</option>)}</select></label><label className="field">{t('姓名', 'Name')}<input value={personEditor.draft.name} onChange={e => personEditor.setDraft(old => old ? { ...old, name: e.target.value } : old)} /></label><label className="field">{t('登入名稱（不用Email）', 'Username (no email required)')}<input autoComplete="off" value={personEditor.draft.username} onChange={e => personEditor.setDraft(old => old ? { ...old, username: e.target.value } : old)} /></label><label className="field">{t('角色', 'Role')}<select disabled={personEditor.draft.role === 'owner'} value={personEditor.draft.role} onChange={e => personEditor.setDraft(old => old ? { ...old, role: e.target.value as Role } : old)}>{roles.filter(role => role !== 'owner' || personEditor.draft?.role === 'owner').map(role => <option key={role} value={role}>{roleName(role, ctx.lang)}</option>)}</select></label><label><input type="checkbox" disabled={personEditor.draft.role === 'owner' || personEditor.draft.id === ctx.user.id} checked={personEditor.draft.active} onChange={e => personEditor.setDraft(old => old ? { ...old, active: e.target.checked } : old)} />{t('啟用（取消勾選＝停用，非刪除）', 'Active (uncheck to deactivate, never delete)')}</label><label className="field">{t('新個人密碼（留空保留原狀；僅Owner必需）', 'New personal password (blank retains current state; required only for Owner)')}<input type="password" autoComplete="new-password" value={personPassword} disabled={hashing} onChange={e => { hashGeneration.current++; setPersonPassword(e.target.value); }} /></label><button className="btn neutral" disabled={!personPassword || hashing || personEditor.busy || personEditor.lost} onClick={() => void preparePersonPassword()}>{hashing ? t('準備中…', 'Preparing…') : t('在瀏覽器準備密碼', 'Prepare password in browser')}</button>{personEditor.draft.role !== 'owner' && <label><input type="checkbox" aria-label={t('取消個人密碼', 'Remove personal password')} disabled={hashing || personEditor.busy || personEditor.lost} checked={(personEditor.draft as Person & { credentialHash?: string | null }).credentialHash === ''} onChange={e => { hashGeneration.current++; setPersonPassword(''); const clear = e.target.checked; personEditor.setDraft(old => old ? { ...old, credentialHash: clear ? '' : undefined, hasPassword: clear ? false : state.people.find(row => row.id === old.id)?.hasPassword ?? false } : old); }} />{t('取消個人密碼（保存後生效）', 'Remove personal password (takes effect after save)')}</label>}<p>{(personEditor.draft as Person & { credentialHash?: string | null }).credentialHash ? t('新密碼已準備；僅在確認保存後生效。', 'New password prepared; it takes effect only after confirmed save.') : personEditor.draft.hasPassword ? t('已設定個人密碼（不顯示內容）。', 'Personal password configured (never displayed).') : t('尚無個人密碼。', 'No personal password configured.')}</p></div><div className="page-actions"><button className="btn primary" disabled={!personEditor.canSave || hashing} onClick={() => void savePerson()}>{t('確認保存', 'Confirm save')}</button><button className="btn neutral" disabled={personEditor.busy || hashing} onClick={() => discard(personEditor.cancel)}>{t('取消', 'Cancel')}</button></div></Modal>}
    {frameworkEditor.draft && <Modal title={t('編輯框架', 'Edit framework')} wide onClose={() => discard(frameworkEditor.cancel)}><EditorNotice error={frameworkEditor.error || validation} lost={frameworkEditor.lost} /><div className="form-grid"><p>{frameworkEditor.draft.id} · {frameworkEditor.draft.scoring}</p>{fieldPair(t('框架名稱', 'Framework name'), frameworkEditor.draft.name, name => frameworkEditor.setDraft(old => old ? { ...old, name } : old))}{fieldPair(t('描述', 'Description'), frameworkEditor.draft.description, description => frameworkEditor.setDraft(old => old ? { ...old, description } : old))}{fieldPair(t('計分範圍明示', 'Scoring scope label'), frameworkEditor.draft.scopeLabel, scopeLabel => frameworkEditor.setDraft(old => old ? { ...old, scopeLabel } : old))}<label className="field">{t('來源版本', 'Source version')}<input value={frameworkEditor.draft.sourceVersion} onChange={e => frameworkEditor.setDraft(old => old ? { ...old, sourceVersion: e.target.value } : old)} /></label><label><input type="checkbox" checked={frameworkEditor.draft.active} onChange={e => frameworkEditor.setDraft(old => old ? { ...old, active: e.target.checked } : old)} />{t('啟用框架（停用仍保留歷史）', 'Active framework (deactivation retains history)')}</label></div><div className="page-actions"><button className="btn primary" disabled={!frameworkEditor.canSave} onClick={() => void saveFramework()}>{t('確認保存', 'Confirm save')}</button><button className="btn neutral" disabled={frameworkEditor.busy} onClick={() => discard(frameworkEditor.cancel)}>{t('取消', 'Cancel')}</button></div></Modal>}
    {chapterEditor.draft && <Modal title={t('編輯章節', 'Edit chapter')} wide onClose={() => discard(chapterEditor.cancel)}><EditorNotice error={chapterEditor.error || validation} lost={chapterEditor.lost} /><div className="form-grid"><p>{chapterEditor.draft.frameworkId} · {t('穩定識別', 'Stable identity')}: {chapterEditor.draft.id}</p><label className="field">{t('章節代碼', 'Chapter code')}<input value={chapterEditor.draft.code} onChange={e => chapterEditor.setDraft(old => old ? { ...old, code: e.target.value } : old)} /></label><label className="field">{t('排序', 'Order')}<input type="number" value={chapterEditor.draft.order} onChange={e => chapterEditor.setDraft(old => old ? { ...old, order: Number(e.target.value) } : old)} /></label>{fieldPair(t('章節名稱', 'Chapter name'), chapterEditor.draft.name, name => chapterEditor.setDraft(old => old ? { ...old, name } : old))}{fieldPair(t('目標', 'Aim'), chapterEditor.draft.aim || blankText(), aim => chapterEditor.setDraft(old => old ? { ...old, aim } : old))}<label><input type="checkbox" checked={chapterEditor.draft.active} onChange={e => chapterEditor.setDraft(old => old ? { ...old, active: e.target.checked } : old)} />{t('啟用（停用保留Item與歷史）', 'Active (deactivation retains items and history)')}</label></div><div className="page-actions"><button className="btn primary" disabled={!chapterEditor.canSave} onClick={() => void saveChapter()}>{t('確認保存', 'Confirm save')}</button><button className="btn neutral" disabled={chapterEditor.busy} onClick={() => discard(chapterEditor.cancel)}>{t('取消', 'Cancel')}</button></div></Modal>}
    {itemEditor.draft && <Modal title={t('編輯標準Item（id不變）', 'Edit standard item (stable ID)')} wide onClose={() => discard(itemEditor.cancel)}><EditorNotice error={itemEditor.error || validation} lost={itemEditor.lost} /><div className="form-grid"><p>{itemEditor.draft.frameworkId} · {itemEditor.draft.id}</p><label className="field">{t('所屬章節', 'Chapter')}<select value={itemEditor.draft.chapterId} onChange={e => itemEditor.setDraft(old => old ? { ...old, chapterId: e.target.value } : old)}>{state.chapters.filter(row => row.frameworkId === itemEditor.draft?.frameworkId && (row.active || row.id === itemEditor.draft?.chapterId)).map(row => <option key={row.id} value={row.id}>{row.code} · {bi(row.name, ctx.lang)}</option>)}</select></label><label className="field">{t('Item代碼（穩定id不改）', 'Item code (stable ID unchanged)')}<input value={itemEditor.draft.code} onChange={e => itemEditor.setDraft(old => old ? { ...old, code: e.target.value } : old)} /></label><label className="field">{t('級別1–4', 'Level 1–4')}<select value={itemEditor.draft.level} onChange={e => itemEditor.setDraft(old => old ? { ...old, level: Number(e.target.value) } : old)}>{[1, 2, 3, 4].map(level => <option key={level}>{level}</option>)}</select></label><label className="field">{t('排序', 'Order')}<input type="number" value={itemEditor.draft.order} onChange={e => itemEditor.setDraft(old => old ? { ...old, order: Number(e.target.value) } : old)} /></label>{fieldPair(t('KPI／要求', 'KPI / requirement'), itemEditor.draft.kpi, kpi => itemEditor.setDraft(old => old ? { ...old, kpi } : old))}{fieldPair(t('BPG／指引／建議證據（不是要求）', 'BPG / guidance / suggested evidence (not requirements)'), itemEditor.draft.guidance, guidance => itemEditor.setDraft(old => old ? { ...old, guidance } : old))}<MultiSelect label={t('部門（多選）', 'Departments (multiple)')} options={departmentOptions(ctx)} selected={itemEditor.draft.departmentIds} onChange={departmentIds => itemEditor.setDraft(old => old ? { ...old, departmentIds } : old)} /><label><input type="checkbox" checked={itemEditor.draft.active} onChange={e => itemEditor.setDraft(old => old ? { ...old, active: e.target.checked } : old)} />{t('啟用（停用／再啟用，保留關聯）', 'Active (deactivate / reactivate, retain relations)')}</label></div>
      {itemEditor.draft.sourceGap && <div className="notice warning"><p>{itemEditor.draft.sourceGap}</p><label><input type="checkbox" checked={itemEditor.draft.sourceGapResolved === true} onChange={e => itemEditor.setDraft(old => old ? { ...old, sourceGapResolved: e.target.checked } : old)} />{t('已附新增補證來源，確認補齊此缺口（需明確保存）', 'Additional supporting source provided; resolve this gap (explicit save required)')}</label></div>}{sourcesEditor(itemEditor.draft)}{itemEditor.draft.sourceOriginals?.map(original => <article className="notice" key={original.id}><small>{original.kind} · {t('頁', 'Page')} {original.page}</small><p className="preserve-lines" lang="en">{original.en}</p></article>)}{itemEditor.draft.crosswalk && <div className="notice preserve-lines"><p>{itemEditor.draft.crosswalk.tmsaItemCodes.join(' / ')}</p><p>{itemEditor.draft.crosswalk.match}</p><p>{itemEditor.draft.crosswalk.difference}</p><p>{itemEditor.draft.crosswalk.attention}</p></div>}<div className="page-actions"><button className="btn primary" disabled={!itemEditor.canSave} onClick={() => void saveItem()}>{t('確認保存', 'Confirm save')}</button><button className="btn neutral" disabled={itemEditor.busy} onClick={() => discard(itemEditor.cancel)}>{t('取消', 'Cancel')}</button></div></Modal>}
    {settingsEditor.draft && <Modal title={settingsMode === 'permissions' ? t('角色權限矩陣（僅Owner）', 'Role capabilities (Owner only)') : t('編輯部門', 'Edit departments')} wide onClose={() => discard(settingsEditor.cancel)}><EditorNotice error={settingsEditor.error || validation} lost={settingsEditor.lost} />{settingsMode === 'permissions' ? <><p className="notice warning">{t('Owner固定全權；非Owner不能取得敏感設定權限；操作員／船舶帳戶不能透過矩陣取得管理入口。', 'Owner always has full authority. Non-Owners cannot gain sensitive settings permissions, and operators/vessels cannot gain management access through this matrix.')}</p><div className="table-wrap"><table className="data-table"><thead><tr><th>{t('能力', 'Capability')}</th>{roles.map(role => <th key={role}>{roleName(role, ctx.lang)}</th>)}</tr></thead><tbody>{CAPABILITIES.map(capability => <tr key={capability}><td>{({ editAssessments: t('編輯自評', 'Edit assessments'), createImprovements: t('新增改善', 'Create improvements'), updateImprovements: t('更新改善', 'Update improvements'), closeImprovements: t('結案／重開改善', 'Close / reopen improvements'), manageInspections: t('管理檢查', 'Manage inspections'), exportReports: t('匯出報告', 'Export reports'), enterManagement: t('管理入口', 'Enter management'), manageUsers: t('管理人員／部門', 'Manage users / departments'), manageFrameworks: t('管理框架', 'Manage frameworks'), viewAuditLogs: t('查看操作紀錄', 'View audit logs'), manageRolePermissions: t('角色權限', 'Role permissions'), manageSystemSettings: t('系統敏感設定', 'Sensitive system settings') })[capability]}</td>{roles.map(role => { const forced = role === 'owner' || role === 'admin' && ['enterManagement', 'manageUsers'].includes(capability); const locked = forced || ['manageRolePermissions', 'manageSystemSettings'].includes(capability) || role !== 'admin' && ['enterManagement', 'manageUsers', 'manageFrameworks', 'viewAuditLogs', 'manageInspections'].includes(capability); return <td key={role}><input type="checkbox" aria-label={`${roleName(role, ctx.lang)} ${capability}`} disabled={!owner || locked} checked={forced || !locked && settingsEditor.draft!.rolePermissions[role][capability]} onChange={event => settingsEditor.setDraft(old => old ? { ...old, rolePermissions: { ...old.rolePermissions, [role]: { ...old.rolePermissions[role], [capability]: event.target.checked } } } : old)} /></td>; })}</tr>)}</tbody></table></div></> : <>{settingsEditor.draft.departments.map((department, index) => <div className="form-grid notice" key={department.id}>{fieldPair(t('部門名稱', 'Department name'), department.name, name => settingsEditor.setDraft(old => old ? { ...old, departments: old.departments.map((row, i) => i === index ? { ...row, name } : row) } : old))}<label><input type="checkbox" checked={department.active} onChange={event => settingsEditor.setDraft(old => old ? { ...old, departments: old.departments.map((row, i) => i === index ? { ...row, active: event.target.checked } : row) } : old)} />{t('啟用（舊關聯保留）', 'Active (existing relations retained)')}</label></div>)}<button className="btn neutral" onClick={() => settingsEditor.setDraft(old => old ? { ...old, departments: [...old.departments, { id: crypto.randomUUID(), name: blankText(), active: true }] } : old)}>{t('新增部門', 'Add department')}</button></>}<div className="page-actions"><button className="btn primary" disabled={!settingsEditor.canSave || settingsMode === 'permissions' && !owner} onClick={() => void saveSettings()}>{t('確認保存', 'Confirm save')}</button><button className="btn neutral" disabled={settingsEditor.busy} onClick={() => discard(settingsEditor.cancel)}>{t('取消', 'Cancel')}</button></div></Modal>}
  </>;
}
