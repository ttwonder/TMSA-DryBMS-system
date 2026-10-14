-- READ ONLY: 011 installation only, not hosted browser acceptance.
-- Safe to run before installation: FAIL means stop and inspect, not rerun all migrations.
begin transaction read only;
set local statement_timeout='15s';
with expected(signature,hash) as (values
 ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526'),
 ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba'),
 ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','c96f6a5c2dcb4e766244f17204fa3a1c'),
 ('compliance_private.validate_record_before_tmsa14(text,jsonb,jsonb,text,jsonb)','41700e96e1ee29aeee1a6769c1e0a2f4'),
 ('compliance_private.validate_record_history_rules(text,jsonb,jsonb,text,jsonb)','864fdf4f6de7cfc217eeea488079633a'),
 ('compliance_private.performance_dispatch(text,text,text,jsonb)','60a8443fed5b2ff7e8055fc692ff5577')
), helpers as (
 select p.* from pg_catalog.pg_proc p where p.oid in (
 to_regprocedure('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)'),
 to_regprocedure('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)'))
), checks as (
 select e.signature name,exists(select 1 from pg_catalog.pg_proc p where p.oid=to_regprocedure(e.signature) and p.prosecdef and p.proconfig=array['search_path=""'] and md5(replace(p.prosrc,E'\r\n',E'\n'))=e.hash) ok from expected e
 union all select 'public_route_preserved',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') and prosecdef and proconfig=array['search_path=""','statement_timeout=15s'] and md5(replace(prosrc,E'\r\n',E'\n'))='79d92bdca3a86f1891f91effd04653ac')
 union all select 'new_helpers_private',(select count(*) from helpers)=2 and not exists(select 1 from helpers p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where a.grantee<>p.proowner and a.privilege_type='EXECUTE')
 union all select 'new_helpers_owner_preserved',(select count(*) from helpers)=2 and not exists(select 1 from helpers where proowner is distinct from (select proowner from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)')))
 union all select 'private_schema_denied',not pg_catalog.has_schema_privilege('anon','compliance_private','USAGE')
 union all select '010_admin_initialization_preserved',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.restart_updates(text,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='25d528d967082e586c008e716d87cbfa')
) select jsonb_build_object('status',case when bool_and(coalesce(ok,false)) then 'PASS_FINDING_CLASSIFICATION_INSTALL_ONLY' else 'FAIL_FINDING_CLASSIFICATION_INSTALL' end,'checkCount',count(*),'checks',jsonb_object_agg(name,coalesce(ok,false))) finding_classification_readback from checks;
-- One catalog-only JSON result; no credentials, names or source paragraphs.
rollback;
