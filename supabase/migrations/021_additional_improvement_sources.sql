-- 021: Seminar / External regulatory and rule impacts, independently creatable.
-- After verified 020; only two source allowlists change. No row writes/backfill.
-- Expected prosrc derived from frozen 001-020 source substitutions, not observed DB.
-- Legacy non_external stays unchanged (display label is frontend-only).
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $upgrade$
#variable_conflict use_column
declare e record; p record; d text; changed boolean:=false; installed boolean:=false;
begin
 for e in select * from (values
  ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4','2b22e76491efe4bea47856cf22730ff4'),
  ('compliance_private.dispatch(text,text,text,jsonb)','efc7dd87c1874844c6a3d5df6e43d52a','efc7dd87c1874844c6a3d5df6e43d52a'),
  ('compliance_private.improvement_matches(jsonb,jsonb)','fde8b933084d687c530a6cb3be0fa4ee','fde8b933084d687c530a6cb3be0fa4ee'),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','1d350f40ff41379be7f3bb14c1afe4ae','1d350f40ff41379be7f3bb14c1afe4ae'),
  ('compliance_private.refs(jsonb,text,boolean)','735605a70cefae48b0082c4c8230acc8','735605a70cefae48b0082c4c8230acc8'),
  ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7','3776ed715bd1165dbdf1056cee38eec7'),
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','ff892d3a2a84f742e229c18ec99d17b5','ff892d3a2a84f742e229c18ec99d17b5'),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526','e6a79c1267240daafb8a0b1624d3c526'),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba','73c115a07d7c0402148351d547a58cba'),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','eb6bc7e14bb4ace49dcf9972084b5432','45a098c4d69bd69ff22b63536fc24ed7'),
  ('compliance_private.write_allowed(jsonb,text,text)','322d21749601a8fb572e326b035fc844','322d21749601a8fb572e326b035fc844'),
  ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2','999bb75b6d31297eeba8a5090ccb6ee2'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320','63e2634760cdf3bd465726d7e2128320'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b','8e071416d849b87785a6eafd47669d8b'),
  ('public.compliance_rpc(text,text,text,jsonb,text)','908e926425d02c04465599cfee58126f','908e926425d02c04465599cfee58126f')
 ) x(signature,pre,post) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  if not found or md5(replace(p.prosrc,E'\r\n',E'\n')) not in (e.pre,e.post) or not p.prosecdef or p.proconfig is distinct from (case e.signature when 'public.compliance_rpc(text,text,text,jsonb,boolean)' then array['search_path=""','statement_timeout=60s'] when 'public.compliance_rpc(text,text,text,jsonb,boolean,boolean)' then array['search_path=""','statement_timeout=15s'] when 'public.compliance_rpc(text,text,text,jsonb,text)' then array['search_path=""','statement_timeout=15s'] else array['search_path=""'] end) or p.proowner is distinct from (select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)')) then raise exception 'ADDITIONAL_IMPROVEMENT_SOURCES_UNKNOWN_PREDECESSOR: %',e.signature;end if;
  if e.pre<>e.post then
   changed:=changed or md5(replace(p.prosrc,E'\r\n',E'\n'))=e.pre;
   installed:=installed or md5(replace(p.prosrc,E'\r\n',E'\n'))=e.post;
  end if;
 end loop;
 if changed and installed then raise exception 'ADDITIONAL_IMPROVEMENT_SOURCES_MIXED_INSTALL';end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='compliance_private' and a.privilege_type='EXECUTE' and a.grantee<>p.proowner)
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='compliance_rpc' and a.grantee=0)
 or exists(select 1 from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated') and pg_catalog.has_schema_privilege(r.oid,'compliance_private','USAGE'))
 or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join pg_catalog.pg_roles r where n.nspname='compliance_private' and c.relkind='r' and r.rolname in ('anon','authenticated') and pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace,lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a where n.nspname='compliance_private' and c.relkind='r' and a.grantee=0)
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join pg_catalog.pg_roles r where n.nspname='public' and p.proname='compliance_rpc' and r.rolname in ('anon','authenticated') and pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') is distinct from pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE')) or not exists(select 1 from pg_catalog.pg_roles r where r.rolname='anon' and pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE'))
 then raise exception 'ADDITIONAL_IMPROVEMENT_SOURCES_UNEXPECTED_ACL';end if;
 if installed then return;end if;
 for e in select * from (values
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',$old$b->>'source' not in ('external','non_external','management_review','management_directive','vessel_safety_meeting','company_safety_meeting')$old$,$new$b->>'source' not in ('external','non_external','management_review','management_directive','vessel_safety_meeting','company_safety_meeting','seminar','external_regulatory_impact')$new$),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',$old$b->>'source' not in ('management_review','management_directive','vessel_safety_meeting','company_safety_meeting')$old$,$new$b->>'source' not in ('management_review','management_directive','vessel_safety_meeting','company_safety_meeting','seminar','external_regulatory_impact')$new$)
 ) x(signature,needle,replacement) loop
  select * into strict p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  d:=replace(pg_catalog.pg_get_functiondef(p.oid),E'\r\n',E'\n');
  e.needle:=replace(e.needle,E'\r\n',E'\n');e.replacement:=replace(e.replacement,E'\r\n',E'\n');
  if (length(d)-length(replace(d,e.needle,'')))/length(e.needle)<>1 then raise exception 'ADDITIONAL_IMPROVEMENT_SOURCES_SEAM_MISMATCH: %',e.signature;end if;
  execute replace(d,e.needle,e.replacement);
  if not exists(select 1 from pg_catalog.pg_proc n where n.oid=p.oid and n.proowner=p.proowner and n.proacl is not distinct from p.proacl and n.proconfig is not distinct from p.proconfig and n.prosecdef=p.prosecdef and n.proargnames is not distinct from p.proargnames and n.prorettype=p.prorettype and n.prolang=p.prolang) then raise exception 'ADDITIONAL_IMPROVEMENT_SOURCES_ATTRIBUTES_CHANGED';end if;
 end loop;
 for e in select * from (values
  ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4','2b22e76491efe4bea47856cf22730ff4'),
  ('compliance_private.dispatch(text,text,text,jsonb)','efc7dd87c1874844c6a3d5df6e43d52a','efc7dd87c1874844c6a3d5df6e43d52a'),
  ('compliance_private.improvement_matches(jsonb,jsonb)','fde8b933084d687c530a6cb3be0fa4ee','fde8b933084d687c530a6cb3be0fa4ee'),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','1d350f40ff41379be7f3bb14c1afe4ae','1d350f40ff41379be7f3bb14c1afe4ae'),
  ('compliance_private.refs(jsonb,text,boolean)','735605a70cefae48b0082c4c8230acc8','735605a70cefae48b0082c4c8230acc8'),
  ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7','3776ed715bd1165dbdf1056cee38eec7'),
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','ff892d3a2a84f742e229c18ec99d17b5','ff892d3a2a84f742e229c18ec99d17b5'),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526','e6a79c1267240daafb8a0b1624d3c526'),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba','73c115a07d7c0402148351d547a58cba'),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','eb6bc7e14bb4ace49dcf9972084b5432','45a098c4d69bd69ff22b63536fc24ed7'),
  ('compliance_private.write_allowed(jsonb,text,text)','322d21749601a8fb572e326b035fc844','322d21749601a8fb572e326b035fc844'),
  ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2','999bb75b6d31297eeba8a5090ccb6ee2'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320','63e2634760cdf3bd465726d7e2128320'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b','8e071416d849b87785a6eafd47669d8b'),
  ('public.compliance_rpc(text,text,text,jsonb,text)','908e926425d02c04465599cfee58126f','908e926425d02c04465599cfee58126f')
 ) x(signature,pre,post) loop
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(e.signature) and md5(replace(prosrc,E'\r\n',E'\n'))=e.post) then raise exception 'ADDITIONAL_IMPROVEMENT_SOURCES_POSTCHECK_FAILED: %',e.signature;end if;
 end loop;
end $upgrade$;
commit;
