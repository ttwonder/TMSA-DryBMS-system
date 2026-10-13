-- Independent READ ONLY install verification. No bootstrap, imports or writes.
-- Run only after 005 on the dedicated TMSA / DRYBMS project; frontend Push is separate.
begin transaction read only;
set local statement_timeout='15s';
with installed as (
 select p.*,n.nspname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
), checks as (
 select 'exact_four_rpc_overloads' name,(select count(*) from installed where nspname='public' and proname='compliance_rpc')=4 ok
 union all select 'legacy_four_unchanged',exists(select 1 from installed where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)') and prosecdef and proconfig=array['search_path=""'] and md5(replace(prosrc,E'\r\n',E'\n'))='999bb75b6d31297eeba8a5090ccb6ee2')
 union all select 'legacy_five_boolean_unchanged',exists(select 1 from installed where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean)') and prosecdef and proconfig=array['search_path=""','statement_timeout=60s'] and md5(replace(prosrc,E'\r\n',E'\n'))='63e2634760cdf3bd465726d7e2128320')
 union all select 'legacy_six_boolean_unchanged',exists(select 1 from installed where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)') and prosecdef and proconfig=array['search_path=""','statement_timeout=15s'] and md5(replace(prosrc,E'\r\n',E'\n'))='8e071416d849b87785a6eafd47669d8b')
 union all select 'legacy_dispatch_unchanged',exists(select 1 from installed where oid=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)') and prosecdef and proconfig=array['search_path=""'] and md5(replace(prosrc,E'\r\n',E'\n'))='8cdfdd4c2952564ff8b46f580625596e')
 union all select 'performance_route_definer_budget',exists(select 1 from installed where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') and prosecdef and proconfig=array['search_path=""','statement_timeout=15s'] and proargnames=array['p_action','p_session','p_client_id','p_payload','p_sync_mode'] and prosrc like '%p_sync_mode is distinct from ''performance-v1''%')
 union all select 'performance_helper_definer',exists(select 1 from installed where oid=to_regprocedure('compliance_private.performance_dispatch(text,text,text,jsonb)') and prosecdef and proconfig=array['search_path=""'])
 union all select 'matching_function_owner',(select proowner from installed where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)'))=(select proowner from installed where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'))
 union all select 'anon_public_route_execute',exists(select 1 from installed where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') and pg_catalog.has_function_privilege('anon',oid,'EXECUTE'))
 union all select 'anon_private_helper_denied',not exists(select 1 from installed where oid=to_regprocedure('compliance_private.performance_dispatch(text,text,text,jsonb)') and pg_catalog.has_function_privilege('anon',oid,'EXECUTE'))
 union all select 'public_route_no_public_acl',not exists(select 1 from installed p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') and a.grantee=0 and a.privilege_type='EXECUTE')
 union all select 'private_tables_rls_and_anon_denied',not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='compliance_private' and c.relkind='r' and (not c.relrowsecurity or pg_catalog.has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')))
 union all select 'private_schema_anon_denied',not pg_catalog.has_schema_privilege('anon','compliance_private','USAGE')
)
select jsonb_build_object(
 'status',case when bool_and(coalesce(ok,false)) then 'PASS_PERFORMANCE_ROUTE_INSTALL_ONLY' else 'FAIL_PERFORMANCE_ROUTE_INSTALL' end,
 'checks',jsonb_object_agg(name,coalesce(ok,false)),
 'checkCount',count(*),
 'initialized',(select initialized from compliance_private.control where singleton),
 'imported',(select imported from compliance_private.control where singleton),
 'activeOwnerCount',(select count(*) from compliance_private.records where kind='person' and body->'active'='true'::jsonb and body->>'role'='owner'),
 'recordCounts',(select jsonb_object_agg(kind,n) from (select kind,count(*) n from compliance_private.records group by kind) c),
 'meaning','Catalog installation only; not hosted login, performance or export acceptance') performance_readback
from checks;
rollback;
