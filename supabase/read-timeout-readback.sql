-- Independent read-only catalog/count check after 003_read_timeout.sql.
-- Dedicated TMSA-DryBMS-system only. Does not execute login/read/import writers.
-- PASS means installation only, not hosted browser recovery.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
with ids as (
 select to_regprocedure('public.compliance_rpc(text,text,text,jsonb)')::oid old_oid,
        to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean)')::oid import_oid,
        to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)')::oid read_oid,
        to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)')::oid dispatch_oid,
        to_regprocedure('compliance_private.state(jsonb)')::oid state_oid
), bindings as (
 select ids.*,p4.prosrc old_body,p4.proowner old_owner,p4.proconfig old_config,p4.prosecdef old_definer,
        p5.prosrc import_body,p5.proowner import_owner,p5.proconfig import_config,p5.prosecdef import_definer,
        p6.prosrc read_body,p6.proowner read_owner,p6.proconfig read_config,p6.prosecdef read_definer,
        p6.proargnames read_names,p6.pronargdefaults read_defaults,p6.prorettype read_return,p6.prolang read_language,
        pd.prosrc dispatch_body,pd.proconfig dispatch_config,pd.prosecdef dispatch_definer,
        ps.prosrc state_body,ps.proconfig state_config,ps.prosecdef state_definer
 from ids left join pg_catalog.pg_proc p4 on p4.oid=ids.old_oid
 left join pg_catalog.pg_proc p5 on p5.oid=ids.import_oid
 left join pg_catalog.pg_proc p6 on p6.oid=ids.read_oid
 left join pg_catalog.pg_proc pd on pd.oid=ids.dispatch_oid
 left join pg_catalog.pg_proc ps on ps.oid=ids.state_oid
), checks as (
 select jsonb_build_object(
 'exact_six_argument_signature',coalesce(read_oid is not null and read_names=array['p_action','p_session','p_client_id','p_payload','p_import_mode','p_read_mode'] and read_defaults=0 and read_return='jsonb'::regtype,false),
 'read_only_body',coalesce(md5(replace(read_body,E'\r\n',E'\n'))='8e071416d849b87785a6eafd47669d8b',false),
 'fixed_15s_and_empty_search_path',coalesce(read_config @> array['statement_timeout=15s','search_path=""'] and cardinality(read_config)=2,false),
 'read_security_definer_plpgsql',coalesce(read_definer and read_language=(select oid from pg_catalog.pg_language where lanname='plpgsql'),false),
 'same_trusted_owner',coalesce(read_owner=old_owner and import_owner=old_owner,false),
 'public_execute_denied',not exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=b.read_oid and a.grantee=0 and a.privilege_type='EXECUTE'),
 'browser_grants_match_original',not exists(select 1 from pg_catalog.pg_roles r where r.rolname in('anon','authenticated') and pg_catalog.has_function_privilege(r.oid,b.read_oid,'EXECUTE') is distinct from pg_catalog.has_function_privilege(r.oid,b.old_oid,'EXECUTE')),
 'no_other_direct_execute_grants',not exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a left join pg_catalog.pg_roles r on r.oid=a.grantee where p.oid=b.read_oid and a.grantee<>p.proowner and a.grantee<>0 and a.privilege_type='EXECUTE' and coalesce(r.rolname,'') not in('anon','authenticated')),
 'private_schema_remains_denied',not exists(select 1 from pg_catalog.pg_roles r where r.rolname in('anon','authenticated') and pg_catalog.has_schema_privilege(r.oid,'compliance_private','USAGE')),
 'original_rpc_unchanged',coalesce(old_definer and old_config=array['search_path=""'] and md5(replace(old_body,E'\r\n',E'\n'))='999bb75b6d31297eeba8a5090ccb6ee2',false),
 'original_dispatch_unchanged',coalesce(dispatch_definer and dispatch_config=array['search_path=""'] and md5(replace(dispatch_body,E'\r\n',E'\n'))='2371c2842ea1c5c077f8aed9b6cd1373',false),
 'original_reader_unchanged',coalesce(state_definer and state_config=array['search_path=""'] and md5(replace(state_body,E'\r\n',E'\n'))='d8ba1c3d29a7265ce85845c58288071c',false),
 'existing_import_route_unchanged',coalesce(import_definer and md5(replace(import_body,E'\r\n',E'\n'))='63e2634760cdf3bd465726d7e2128320',false),
 'existing_import_budget_60s',coalesce(import_config @> array['statement_timeout=60s','search_path=""'] and cardinality(import_config)=2,false),
 'exact_three_rpc_overloads',(select count(*)=3 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='compliance_rpc')
 ) value from bindings b
), counted as (
 select value,(select count(*) from jsonb_each(value)) check_count,
        (select bool_and(v='true'::jsonb) from jsonb_each(value) e(k,v)) all_pass from checks
), counts as (
 select coalesce(jsonb_object_agg(kind,total),'{}'::jsonb) value from (
   select kind,count(*) total from compliance_private.records group by kind
 ) c
), state as (
 select imported,(select count(*) from compliance_private.records where kind='person' and body->>'role'='owner' and body->'active'='true'::jsonb) active_owner_count from compliance_private.control where singleton
), timeouts as (
 select coalesce(jsonb_object_agg(rolname,coalesce((select substring(v from 19) from unnest(rolconfig) v where v like 'statement_timeout=%'),'unset')),'{}'::jsonb) value
 from pg_catalog.pg_roles where rolname in('anon','authenticated','authenticator')
)
select jsonb_build_object(
 'status',case when counted.check_count=15 and counted.all_pass then 'PASS_READ_ROUTE_INSTALL_ONLY' else 'FAIL_READ_ROUTE_INSTALL' end,
 'scope','Catalog installation/counts only; NOT browser login or full REST acceptance',
 'checkCount',counted.check_count,'checks',counted.value,'counts',counts.value,
 'initialized',state.active_owner_count>0,'activeOwnerCount',state.active_owner_count,'imported',state.imported,
 'ordinaryRoleTimeouts',timeouts.value,'productionBusinessWrites',0,'authenticationWrites',0
) as read_repair_readback from counted cross join counts cross join state cross join timeouts;
commit;
