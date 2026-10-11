-- Dedicated TMSA-DryBMS-system; run separately AFTER 002_import_timeout.sql.
-- Strictly read-only: no credentials, session values, source text or raw queries.
begin transaction isolation level repeatable read read only;
set local statement_timeout='10s';
set local lock_timeout='2s';
with old_rpc as (
 select * from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)')
), new_rpc as (
 select * from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean)')
), checks(name,passed) as (
 select 'original_rpc_unchanged',exists(select 1 from old_rpc where prosecdef and proconfig @> array['search_path=""'] and md5(replace(prosrc,E'\r\n',E'\n'))='999bb75b6d31297eeba8a5090ccb6ee2')
 union all select 'original_dispatch_unchanged',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)') and prosecdef and proconfig @> array['search_path=""'] and md5(replace(prosrc,E'\r\n',E'\n'))='2371c2842ea1c5c077f8aed9b6cd1373')
 union all select 'import_only_body',exists(select 1 from new_rpc where md5(replace(prosrc,E'\r\n',E'\n'))='63e2634760cdf3bd465726d7e2128320')
 union all select 'fixed_60s_and_empty_search_path',exists(select 1 from new_rpc where prosecdef and proconfig @> array['search_path=""','statement_timeout=60s'])
 union all select 'same_trusted_owner',exists(select 1 from new_rpc n cross join old_rpc o where n.proowner=o.proowner)
 union all select 'exact_five_argument_signature',exists(select 1 from new_rpc where pg_get_function_identity_arguments(oid)='p_action text, p_session text, p_client_id text, p_payload jsonb, p_import_mode boolean' and prorettype='jsonb'::regtype)
 union all select 'public_execute_denied',exists(select 1 from new_rpc) and not exists(select 1 from new_rpc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
 union all select 'browser_grants_match_original',coalesce((select bool_and(pg_catalog.has_function_privilege(r.oid,n.oid,'EXECUTE')=pg_catalog.has_function_privilege(r.oid,o.oid,'EXECUTE')) from pg_catalog.pg_roles r cross join new_rpc n cross join old_rpc o where r.rolname in ('anon','authenticated')),false)
 union all select 'no_other_direct_execute_grants',exists(select 1 from new_rpc) and not exists(select 1 from new_rpc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a left join pg_catalog.pg_roles r on r.oid=a.grantee where a.privilege_type='EXECUTE' and a.grantee<>p.proowner and coalesce(r.rolname,'') not in ('anon','authenticated'))
 union all select 'exact_two_rpc_overloads',(select count(*)=2 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='compliance_rpc')
 union all select 'private_schema_remains_denied',coalesce((select bool_and(not pg_catalog.has_schema_privilege(r.oid,'compliance_private','USAGE')) from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated')),false)
 union all select 'authoritative_reader',coalesce((select rolsuper or rolbypassrls from pg_catalog.pg_roles where rolname=current_user),false)
), counts as (
 select kind,count(*) as n from compliance_private.records group by kind
), visibility as (
 select pg_catalog.pg_has_role(current_user,'pg_read_all_stats','MEMBER') as can_read_activity
)
select jsonb_build_object(
 'status',case when (select bool_and(passed) from checks) then 'PASS_IMPORT_ROUTE_INSTALL_ONLY' else 'STOP_IMPORT_ROUTE_CHECK_FAILED' end,
 'scope','Installation + counts snapshot only; NOT seed import or API-cache acceptance',
 'capturedAt',clock_timestamp(),
 'checks',(select jsonb_object_agg(name,passed order by name) from checks),
 'checkCount',(select count(*) from checks),
 'initialized',c.initialized,'imported',c.imported,
 'recordCounts',coalesce((select jsonb_object_agg(kind,n order by kind) from counts),'{}'::jsonb),
 'canReadActivity',v.can_read_activity,
 'unfinishedAppRpc',case when v.can_read_activity then (select count(*) from pg_catalog.pg_stat_activity a where a.datname=current_database() and a.pid<>pg_backend_pid() and a.state in ('active','idle in transaction','idle in transaction (aborted)') and a.query ilike '%compliance_rpc%') end,
 'roleStatementTimeoutSettings',coalesce((select jsonb_agg(jsonb_build_object('role',r.rolname,'statementTimeout',s.setting) order by r.rolname) from pg_catalog.pg_roles r left join lateral (select k as setting from unnest(r.rolconfig) k where k like 'statement_timeout=%') s on true where r.rolname in ('anon','authenticated','authenticator')),'[]'::jsonb)
) as import_repair_readback
from compliance_private.control c cross join visibility v where c.singleton;
commit;
