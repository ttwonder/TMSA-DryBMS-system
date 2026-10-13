-- READ ONLY: 006 installation only; this does NOT execute restart_updates.
-- Dedicated TMSA / DRYBMS project; do not rerun 001-005 or business imports.
begin transaction read only;
set local statement_timeout='15s';
with functions as (
 select p.*,n.nspname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
), checks as (
 select 'exact_four_rpc_overloads' name,(select count(*) from functions where nspname='public' and proname='compliance_rpc')=4 ok
 union all select 'legacy_dispatch_unchanged',exists(select 1 from functions where oid=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='8cdfdd4c2952564ff8b46f580625596e')
 union all select 'restart_helper_definer',exists(select 1 from functions where oid=to_regprocedure('compliance_private.restart_updates(text,text,jsonb)') and prosecdef and proconfig=array['search_path=""'] and proargnames=array['p_session','p_client_id','p_payload'] and md5(replace(prosrc,E'\r\n',E'\n'))='47fbae83d036de80c3fc9b44e24e9348')
 union all select 'restart_helper_owner_only',exists(select 1 from functions where oid=to_regprocedure('compliance_private.restart_updates(text,text,jsonb)') and prosrc like '%actor_v->>''role'' is distinct from ''owner''%' and prosrc like '%record:item:%' and prosrc like '%o.operation_id=op%')
 union all select 'restart_route_bound',exists(select 1 from functions where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') and prosecdef and proconfig=array['search_path=""','statement_timeout=15s'] and md5(replace(prosrc,E'\r\n',E'\n')) in ('b3516f7a0b36f5083a213c8e934d0596','79d92bdca3a86f1891f91effd04653ac'))
 union all select 'restart_function_owner_matches',(select proowner from functions where oid=to_regprocedure('compliance_private.restart_updates(text,text,jsonb)'))=(select proowner from functions where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'))
 union all select 'private_restart_anon_denied',not pg_catalog.has_function_privilege('anon',to_regprocedure('compliance_private.restart_updates(text,text,jsonb)'),'EXECUTE')
 union all select 'public_route_anon_allowed',pg_catalog.has_function_privilege('anon',to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)'),'EXECUTE')
 union all select 'restart_no_public_execute',not exists(select 1 from functions p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=to_regprocedure('compliance_private.restart_updates(text,text,jsonb)') and a.grantee=0 and a.privilege_type='EXECUTE')
 union all select 'private_schema_denied',not pg_catalog.has_schema_privilege('anon','compliance_private','USAGE')
 union all select 'private_tables_rls_and_anon_denied',not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='compliance_private' and c.relkind='r' and (not c.relrowsecurity or pg_catalog.has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')))
)
select jsonb_build_object(
 'status',case when bool_and(coalesce(ok,false)) then 'PASS_RESTART_UPDATES_INSTALL_ONLY' else 'FAIL_RESTART_UPDATES_INSTALL' end,
 'checks',jsonb_object_agg(name,coalesce(ok,false)),'checkCount',count(*),
 'initialized',(select initialized from compliance_private.control where singleton),
 'imported',(select imported from compliance_private.control where singleton),
 'activeOwnerCount',(select count(*) from compliance_private.records where kind='person' and body->'active'='true'::jsonb and body->>'role'='owner'),
 'meaning','Catalog installation only. No restart, business write or hosted UI acceptance performed.'
) restart_updates_readback from checks;
rollback;
