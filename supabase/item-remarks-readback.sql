-- READ ONLY: optional manual remarks/status installation (012 after 011).
-- Catalog checks only. No credentials, user data or business writes.
begin transaction read only;
set local statement_timeout='15s';
with expected(signature,hash) as (values
 ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','57a56d2c2689584c2d88c68c0b22055f'),
 ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526'),
 ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba'),
 ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','c96f6a5c2dcb4e766244f17204fa3a1c'),
 ('compliance_private.performance_dispatch(text,text,text,jsonb)','60a8443fed5b2ff7e8055fc692ff5577'),
 ('compliance_private.restart_updates(text,text,jsonb)','25d528d967082e586c008e716d87cbfa')
), helper as (
 select p.* from pg_catalog.pg_proc p where p.oid=to_regprocedure('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)')
), checks as (
 select e.signature name,exists(select 1 from pg_catalog.pg_proc p where p.oid=to_regprocedure(e.signature) and p.prosecdef and p.proconfig=array['search_path=""'] and md5(replace(p.prosrc,E'\r\n',E'\n'))=e.hash) ok from expected e
 union all select 'public_route_preserved',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') and prosecdef and proconfig=array['search_path=""','statement_timeout=15s'] and md5(replace(prosrc,E'\r\n',E'\n'))='79d92bdca3a86f1891f91effd04653ac')
 union all select 'helper_private',exists(select 1 from helper) and not exists(select 1 from helper p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where a.grantee<>p.proowner and a.privilege_type='EXECUTE')
 union all select 'helper_owner_preserved',exists(select 1 from helper) and not exists(select 1 from helper where proowner is distinct from (select proowner from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)')))
 union all select 'private_schema_denied',not pg_catalog.has_schema_privilege('anon','compliance_private','USAGE')
) select jsonb_build_object('status',case when bool_and(coalesce(ok,false)) then 'PASS_ITEM_REMARKS_INSTALL_ONLY' else 'FAIL_ITEM_REMARKS_INSTALL' end,'checkCount',count(*),'checks',jsonb_object_agg(name,coalesce(ok,false))) item_remarks_readback from checks;
rollback;
