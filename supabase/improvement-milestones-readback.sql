-- Independent catalog-only installation receipt; no business body reads.
begin read only;
with expected(signature,pre,hash) as (values
  ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4','2b22e76491efe4bea47856cf22730ff4'),
  ('compliance_private.dispatch(text,text,text,jsonb)','efc7dd87c1874844c6a3d5df6e43d52a','efc7dd87c1874844c6a3d5df6e43d52a'),
  ('compliance_private.improvement_matches(jsonb,jsonb)','fde8b933084d687c530a6cb3be0fa4ee','fde8b933084d687c530a6cb3be0fa4ee'),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','1d350f40ff41379be7f3bb14c1afe4ae','1d350f40ff41379be7f3bb14c1afe4ae'),
  ('compliance_private.refs(jsonb,text,boolean)','735605a70cefae48b0082c4c8230acc8','735605a70cefae48b0082c4c8230acc8'),
  ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7','3776ed715bd1165dbdf1056cee38eec7'),
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','ff892d3a2a84f742e229c18ec99d17b5','436871103836b8a12150d7f59d460102'),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526','e6a79c1267240daafb8a0b1624d3c526'),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba','73c115a07d7c0402148351d547a58cba'),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','45a098c4d69bd69ff22b63536fc24ed7','481c0de2d763a1eb8595f35e01e41153'),
  ('compliance_private.write_allowed(jsonb,text,text)','322d21749601a8fb572e326b035fc844','322d21749601a8fb572e326b035fc844'),
  ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2','999bb75b6d31297eeba8a5090ccb6ee2'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320','63e2634760cdf3bd465726d7e2128320'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b','8e071416d849b87785a6eafd47669d8b'),
  ('public.compliance_rpc(text,text,text,jsonb,text)','908e926425d02c04465599cfee58126f','908e926425d02c04465599cfee58126f')
,('compliance_private.milestone_rows_valid(jsonb)','', '36186d839a236e26d2f6b2e2739d6697'),('compliance_private.prepare_improvement_milestones(jsonb,jsonb,text,jsonb)','', '59c3bef36298bec0c0375322d339e038')
), checks as (
 select 'body:'||e.signature name,coalesce(md5(replace(p.prosrc,E'\r\n',E'\n'))=e.hash and p.prosecdef and p.proconfig=case e.signature when 'public.compliance_rpc(text,text,text,jsonb,boolean)' then array['search_path=""','statement_timeout=60s'] when 'public.compliance_rpc(text,text,text,jsonb,boolean,boolean)' then array['search_path=""','statement_timeout=15s'] when 'public.compliance_rpc(text,text,text,jsonb,text)' then array['search_path=""','statement_timeout=15s'] else array['search_path=""'] end and p.proowner=(select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)')),false) ok from expected e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
 union all select 'private_execute',not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='compliance_private' and a.privilege_type='EXECUTE' and a.grantee<>p.proowner)
 union all select 'private_schema',not exists(select 1 from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated') and pg_catalog.has_schema_privilege(r.oid,'compliance_private','USAGE'))
 union all select 'public_rpc',not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='compliance_rpc' and a.grantee=0)
 union all select 'private_tables',not (exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join pg_catalog.pg_roles r where n.nspname='compliance_private' and c.relkind='r' and r.rolname in ('anon','authenticated') and pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace,lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a where n.nspname='compliance_private' and c.relkind='r' and a.grantee=0))
 union all select 'rpc_client_parity',not (exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join pg_catalog.pg_roles r where n.nspname='public' and p.proname='compliance_rpc' and r.rolname in ('anon','authenticated') and pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') is distinct from pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE')) or not exists(select 1 from pg_catalog.pg_roles r where r.rolname='anon' and pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE')))
 union all select 'anon_rpc',exists(select 1 from pg_catalog.pg_roles r where r.rolname='anon' and pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE'))
 union all select 'frozen_chapter_seam',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)') and position('jsonb_array_elements(ref#>''{snapshot,items}'')' in prosrc)>0)
 union all select 'omission_seam',exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)') and position('CHAPTER-020' in prosrc)>0)
)
select jsonb_build_object('status',case when bool_and(ok) then 'PASS_IMPROVEMENT_MILESTONES_INSTALL_ONLY' else 'FAIL_IMPROVEMENT_MILESTONES_INSTALL' end,'checkCount',count(*),'checks',jsonb_object_agg(name,ok),'meaning','Catalog installation only; not hosted/UI/export-file acceptance') improvement_milestones_readback from checks;
commit;
