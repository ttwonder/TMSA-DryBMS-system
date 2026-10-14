-- READ ONLY. Verifies 009 installation; does not prove hosted UI acceptance.
begin transaction read only;
set local statement_timeout='15s';
with expected(signature,hash) as (values
 ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','56a451484c49501edf829de05e26ed80'),
 ('compliance_private.validate_record_before_tmsa14(text,jsonb,jsonb,text,jsonb)','41700e96e1ee29aeee1a6769c1e0a2f4'),
 ('compliance_private.performance_dispatch(text,text,text,jsonb)','1ce567371211cc23e321773344b91fd7')
), checks as (
 select e.signature name,exists(select 1 from pg_catalog.pg_proc p where p.oid=to_regprocedure(e.signature) and p.prosecdef and p.proconfig=array['search_path=""'] and md5(replace(p.prosrc,E'\r\n',E'\n'))=e.hash) ok from expected e
 union all select 'history_rules_preserved',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record_history_rules(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='864fdf4f6de7cfc217eeea488079633a')
 union all select 'public_route_preserved',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') and md5(replace(prosrc,E'\r\n',E'\n'))='79d92bdca3a86f1891f91effd04653ac')
 union all select 'new_private_helper_denied',not exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=to_regprocedure('compliance_private.validate_record_before_tmsa14(text,jsonb,jsonb,text,jsonb)') and a.grantee<>p.proowner and a.privilege_type='EXECUTE')
 union all select 'private_schema_denied',not pg_catalog.has_schema_privilege('anon','compliance_private','USAGE')
 union all select 'unique_active_owner',(select count(*) from compliance_private.records where kind='person' and body->>'role'='owner' and body->'active'='true')=1
 union all select 'present_policy_values_valid',not exists(select 1 from compliance_private.records r where r.body ? 'includeTmsaChapter14' and (r.kind not in ('framework','inspection') or jsonb_typeof(r.body->'includeTmsaChapter14') is distinct from 'boolean' or case when r.kind='framework' then r.id else r.body->>'frameworkId' end is distinct from 'TMSA'))
) select jsonb_build_object('status',case when bool_and(coalesce(ok,false)) then 'PASS_TMSA14_SCOPE_INSTALL_ONLY' else 'FAIL_TMSA14_SCOPE_INSTALL' end,'checkCount',count(*),'checks',jsonb_object_agg(name,coalesce(ok,false))) tmsa14_scope_readback from checks;
-- Counts and flags only; no credentials, source paragraphs, names or descriptions.
select kind,count(*) records from compliance_private.records group by kind order by kind;
select id,version,body->'includeTmsaChapter14' stored_policy,coalesce(body->'includeTmsaChapter14','false'::jsonb) effective_current_policy from compliance_private.records where kind='framework' and id='TMSA';
select count(*) tmsa_histories,count(*) filter(where not(body ? 'includeTmsaChapter14')) legacy_included,count(*) filter(where body->'includeTmsaChapter14'='true'::jsonb) explicit_included,count(*) filter(where body->'includeTmsaChapter14'='false'::jsonb) explicit_excluded from compliance_private.records where kind='inspection' and body->>'frameworkId'='TMSA';
rollback;
