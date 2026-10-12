-- 03 READ ONLY: installed office capability. No login, gate, RPC or writes.
-- Catalog evidence only, not provider/target authentication.
begin read only;
set local statement_timeout='15s';
with expected(signature,body_md5,config) as (values
 ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','037cfe64cf3e317605dbc4851d8553f4',array['search_path=""']),
 ('compliance_private.dispatch(text,text,text,jsonb)','8cdfdd4c2952564ff8b46f580625596e',array['search_path=""']),
 ('compliance_private.import_office_directory(jsonb)','26011b1c65ff709fa3c5b5caa8461e90',array['search_path=""']),
 ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2',array['search_path=""']),
 ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320',array['search_path=""','statement_timeout=60s']),
 ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b',array['search_path=""','statement_timeout=15s'])
),checks(name,ok) as (
 select 'function:'||e.signature,coalesce(p.prosecdef and p.proconfig=e.config and md5(replace(p.prosrc,E'\r\n',E'\n'))=e.body_md5,false) from expected e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
 union all select 'rpc_exactly_three_overloads',count(*)=3 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='compliance_rpc'
 union all select 'anon_rpc_execute_preserved',coalesce(bool_and(case when p.oid is not null and exists(select 1 from pg_roles where rolname='anon') then has_function_privilege('anon',p.oid,'execute') else false end),false) from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature) where e.signature like 'public.%'
 union all select 'public_rpc_denied',coalesce(bool_and(case when p.oid is not null then not has_function_privilege('public',p.oid,'execute') else false end),false) from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature) where e.signature like 'public.%'
 union all select 'private_helper_denied_'||r.role,case when p.oid is not null and (r.role='public' or exists(select 1 from pg_roles where rolname=r.role)) then not has_function_privilege(r.role,p.oid,'execute') else false end from (values('public'),('anon'),('authenticated')) r(role) left join pg_proc p on p.oid=to_regprocedure('compliance_private.import_office_directory(jsonb)')
 union all select 'receipt_table_denied_'||r.role,case when c.oid is not null and (r.role='public' or exists(select 1 from pg_roles where rolname=r.role)) then not has_table_privilege(r.role,c.oid,'SELECT,INSERT,UPDATE,DELETE') else false end from (values('public'),('anon'),('authenticated')) r(role) left join pg_class c on c.oid=to_regclass('compliance_private.office_directory_imports')
 union all select 'receipt_RLS',coalesce(c.relrowsecurity,false) from (values(1)) v(n) left join pg_class c on c.oid=to_regclass('compliance_private.office_directory_imports')
 union all select 'receipt_columns',count(*)=7 from information_schema.columns where table_schema='compliance_private' and table_name='office_directory_imports' and column_name in ('import_id','payload_digest','source_person_count','source_department_count','owner_id','receipt','created_at')
 union all select 'helper_owner_matches_installed_dispatch',coalesce(h.proowner=d.proowner,false) from (values(1)) v(n) left join pg_proc h on h.oid=to_regprocedure('compliance_private.import_office_directory(jsonb)') left join pg_proc d on d.oid=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)')
)
select case when bool_and(ok) then 'PASS' else 'FAIL' end as status,count(*) as check_count,coalesce(jsonb_agg(name order by name) filter(where not ok),'[]') as failed_checks from checks;
commit;
