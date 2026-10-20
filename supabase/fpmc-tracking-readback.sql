-- READ ONLY: independent installation verification for 016 after 015.
-- Catalog/ACL only: no business rows, account details, credentials or sessions.
-- PASS proves installation, not hosted login, UI/report acceptance or provisioning.
begin transaction read only;
set local statement_timeout='15s';
with expected(signature,hash,timeout_config) as (values
 ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4',''),
 ('compliance_private.dispatch(text,text,text,jsonb)','a38e4507953b956741ce2f87db52b598',''),
 ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7',''),
 ('compliance_private.performance_dispatch(text,text,text,jsonb)','a3c5453737d82fdc04d879713f8bec14',''),
 ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','a60c3de4ea50f4e16bcc483c385d6ef6',''),
 ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526',''),
 ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba',''),
 ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','f7361243050a98f77be3fcc20cd96a3b',''),
 ('compliance_private.validate_record_before_shared_targets(text,jsonb,jsonb,text,jsonb)','037cfe64cf3e317605dbc4851d8553f4',''),
 ('compliance_private.restart_updates(text,text,jsonb)','25d528d967082e586c008e716d87cbfa',''),
 ('compliance_private.claim_shared_targets(text,text,jsonb)','6a95ef46f5e69f1c29964c6027de73b7',''),
 ('compliance_private.save_shared_targets(text,text,jsonb)','7b439083bdedfa33d78c11f17f880bc9',''),
 ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2',''),
 ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320','statement_timeout=60s'),
 ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b','statement_timeout=15s'),
 ('public.compliance_rpc(text,text,text,jsonb,text)','908e926425d02c04465599cfee58126f','statement_timeout=15s')
), routes as (
 select p.* from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='compliance_rpc'
), private_functions as (
 select p.* from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='compliance_private'
), private_tables as (
 select c.* from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='compliance_private' and c.relkind='r'
), client_roles as (
 select oid,rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated')
), checks as (
 select e.signature name,exists(select 1 from pg_catalog.pg_proc p where p.oid=to_regprocedure(e.signature)
  and p.prosecdef and p.proconfig=case when e.timeout_config='' then array['search_path=""'] else array['search_path=""',e.timeout_config] end
  and md5(replace(p.prosrc,E'\r\n',E'\n'))=e.hash) ok from expected e
 union all select 'exactly_four_public_routes',(select count(*) from routes)=4
 union all select 'expected_owners',not exists(select 1 from pg_catalog.pg_proc p join expected e on p.oid=to_regprocedure(e.signature) where p.proowner is distinct from (select proowner from routes where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)')))
 union all select 'private_functions_owner_only',not exists(select 1 from private_functions p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where a.grantee<>p.proowner and a.privilege_type='EXECUTE')
 union all select 'private_schema_client_and_public_denied',exists(select 1 from pg_catalog.pg_namespace where nspname='compliance_private')
  and not exists(select 1 from client_roles r where pg_catalog.has_schema_privilege(r.oid,'compliance_private','USAGE'))
  and not exists(select 1 from pg_catalog.pg_namespace n,lateral pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a where n.nspname='compliance_private' and a.grantee=0 and a.privilege_type='USAGE')
 union all select 'private_tables_rls',exists(select 1 from private_tables) and not exists(select 1 from private_tables where not relrowsecurity)
 union all select 'private_tables_client_and_public_denied',not exists(select 1 from private_tables t cross join client_roles r where pg_catalog.has_table_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  and not exists(select 1 from private_tables t,lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) a where a.grantee=0)
 union all select 'public_routes_not_public',not exists(select 1 from routes p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
 union all select 'client_route_grants_preserved',exists(select 1 from client_roles where rolname='anon') and not exists(select 1 from routes p cross join client_roles r where pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') is distinct from pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE'))
  and exists(select 1 from client_roles r where r.rolname='anon' and pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE'))
)
select jsonb_build_object('status',case when bool_and(coalesce(ok,false)) then 'PASS_FPMC_TRACKING_INSTALL_ONLY' else 'FAIL_FPMC_TRACKING_INSTALL' end,
 'checkCount',count(*),'checks',jsonb_object_agg(name,coalesce(ok,false))) fpmc_tracking_readback from checks;
rollback;
