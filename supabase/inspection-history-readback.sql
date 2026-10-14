-- READ ONLY; installation proof, not hosted UI acceptance.
begin transaction read only;
set local statement_timeout='15s';
with checks as (
select 'validate_record_history_rules_exact' name,exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record_history_rules(text,jsonb,jsonb,text,jsonb)') and prosecdef and proconfig=array['search_path=""'] and md5(replace(prosrc,E'\r\n',E'\n'))='864fdf4f6de7cfc217eeea488079633a') ok
 union all select 'validate_record_exact' name,exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)') and prosecdef and proconfig=array['search_path=""'] and md5(replace(prosrc,E'\r\n',E'\n'))='41700e96e1ee29aeee1a6769c1e0a2f4') ok
 union all select 'original_validator_preserved',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record_before_shared_targets(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='037cfe64cf3e317605dbc4851d8553f4')
 union all select 'shared_route_unchanged',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') and md5(replace(prosrc,E'\r\n',E'\n'))='79d92bdca3a86f1891f91effd04653ac')
 union all select 'legacy_dispatch_unchanged',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='8cdfdd4c2952564ff8b46f580625596e')
 union all select 'private_helper_denied',not exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=to_regprocedure('compliance_private.validate_record_history_rules(text,jsonb,jsonb,text,jsonb)') and a.grantee<>p.proowner and a.privilege_type='EXECUTE')
 union all select 'private_schema_denied',not pg_catalog.has_schema_privilege('anon','compliance_private','USAGE')
 union all select 'unique_active_owner',(select count(*) from compliance_private.records where kind='person' and body->>'role'='owner' and body->'active'='true')=1
) select jsonb_build_object('status',case when bool_and(coalesce(ok,false)) then 'PASS_INSPECTION_HISTORY_INSTALL_ONLY' else 'FAIL_INSPECTION_HISTORY_INSTALL' end,'checks',jsonb_object_agg(name,coalesce(ok,false)),'checkCount',count(*)) inspection_history_readback from checks;
rollback;
