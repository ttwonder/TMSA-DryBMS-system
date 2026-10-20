-- Apply ONCE after 014. DDL only; no business/history/audit rewrites.
-- GM-R1: omit only current assessment manual remarks; preserve source notes.
-- Reuse existing projection seams. No new helper, API, grants or token scheme.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $upgrade$
declare e record; prior_p record; definition text; occurrences integer;
begin
 if exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.state(jsonb)') and position('GM-R1' in prosrc)>0) then
  raise exception 'MANAGEMENT_VIEWER_REMARKS_ALREADY_INSTALLED_VERIFY_READBACK';
 end if;
 for e in select * from (values
 ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4',''),
 ('compliance_private.dispatch(text,text,text,jsonb)','972f77a1e9865150aa83dbf7a1b977a3',''),
 ('compliance_private.state(jsonb)','7e9d3125977ba477a6290d12a9297f57',''),
 ('compliance_private.performance_dispatch(text,text,text,jsonb)','2f1f570e245640af3c6da3e2ff42409c',''),
 ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','57a56d2c2689584c2d88c68c0b22055f',''),
 ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526',''),
 ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba',''),
 ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','a6ceb93748e13aeafd5132a8b9c5be27',''),
 ('compliance_private.validate_record_before_shared_targets(text,jsonb,jsonb,text,jsonb)','037cfe64cf3e317605dbc4851d8553f4',''),
 ('compliance_private.restart_updates(text,text,jsonb)','25d528d967082e586c008e716d87cbfa',''),
 ('compliance_private.claim_shared_targets(text,text,jsonb)','6a95ef46f5e69f1c29964c6027de73b7',''),
 ('compliance_private.save_shared_targets(text,text,jsonb)','7b439083bdedfa33d78c11f17f880bc9',''),
 ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2',''),
 ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320','statement_timeout=60s'),
 ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b','statement_timeout=15s'),
 ('public.compliance_rpc(text,text,text,jsonb,text)','908e926425d02c04465599cfee58126f','statement_timeout=15s')
 ) x(signature,hash,timeout_config) loop
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(e.signature) and prosecdef
   and proconfig=case when e.timeout_config='' then array['search_path=""'] else array['search_path=""',e.timeout_config] end
   and proowner=(select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'))
   and md5(replace(prosrc,E'\r\n',E'\n'))=e.hash) then
   raise exception 'MANAGEMENT_VIEWER_REMARKS_UNKNOWN_PREDECESSOR: %',e.signature;
  end if;
 end loop;
 if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='compliance_rpc')<>4 then raise exception 'MANAGEMENT_VIEWER_REMARKS_UNEXPECTED_RPC_OVERLOAD';end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,
   lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
   where a.privilege_type='EXECUTE' and (n.nspname='compliance_private' and a.grantee<>p.proowner
    or n.nspname='public' and p.proname='compliance_rpc' and a.grantee=0))
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname='anon' and pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE'))
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join pg_catalog.pg_roles r
   where n.nspname='public' and p.proname='compliance_rpc' and r.rolname in ('anon','authenticated')
   and pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') is distinct from pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE')) then
  raise exception 'MANAGEMENT_VIEWER_REMARKS_UNEXPECTED_ACL';
 end if;
 for e in select * from (values
  ('compliance_private.state(jsonb)',
   $old$'assessments',coalesce((select jsonb_agg(body order by id) from saved where kind='assessment'),'[]'::jsonb),$old$,
   $new$-- GM-R1: projection only; stored manual text/status remain unchanged.
    'assessments',coalesce((select jsonb_agg(case when actor->>'role'='management_viewer' then body-'remarks'-'remarksStatus' else body end order by id) from saved where kind='assessment'),'[]'::jsonb),$new$),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',
   $old$else r.body end) order by r.kind,r.id)$old$,
   $new$when r.kind='assessment' and actor_v->>'role'='management_viewer' then r.body-'remarks'-'remarksStatus'
     else r.body end) order by r.kind,r.id)$new$),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',
   $old$'assessments',coalesce((select jsonb_agg(body order by id) from chosen where kind='assessment'),'[]'::jsonb),$old$,
   $new$'assessments',coalesce((select jsonb_agg(case when actor_v->>'role'='management_viewer' then body-'remarks'-'remarksStatus' else body end order by id) from chosen where kind='assessment'),'[]'::jsonb),$new$),
  ('compliance_private.dispatch(text,text,text,jsonb)',
   $old$p_action='export_authorize' and p_payload->>'kind'='improvements'$old$,
   $new$p_action='export_authorize' and (p_payload->>'kind'='improvements' or p_payload#>>'{filters,reportVariant}'='remarks')$new$),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',
   $old$p_action='export_authorize' and p_payload->>'kind'='improvements'$old$,
   $new$p_action='export_authorize' and (p_payload->>'kind'='improvements' or p_payload#>>'{filters,reportVariant}'='remarks')$new$)
 ) x(signature,needle,replacement) loop
  select * into strict prior_p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  definition:=replace(pg_catalog.pg_get_functiondef(prior_p.oid),E'\r\n',E'\n');
  occurrences:=(length(definition)-length(replace(definition,e.needle,'')))/length(e.needle);
  if occurrences<>1 then raise exception 'MANAGEMENT_VIEWER_REMARKS_SEAM_MISMATCH: %',e.signature;end if;
  execute replace(definition,e.needle,e.replacement);
  if not exists(select 1 from pg_catalog.pg_proc q where q.oid=prior_p.oid and q.proowner=prior_p.proowner and q.proacl is not distinct from prior_p.proacl
   and q.proconfig is not distinct from prior_p.proconfig and q.prosecdef=prior_p.prosecdef and q.proargnames is not distinct from prior_p.proargnames) then raise exception 'MANAGEMENT_VIEWER_REMARKS_ATTRIBUTES_CHANGED: %',e.signature;end if;
 end loop;
end $upgrade$;
commit;
