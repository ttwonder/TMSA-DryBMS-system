-- Apply ONCE after 013. DDL only; no new functions/grants or business writes.
-- Read-only marker is distinct from export snapshotToken (unchanged semantics).
-- Install + standalone readback before frontend publishing. No account setup.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $upgrade$
declare e record; p record; definition text; occurrences integer;
begin
 if exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.performance_dispatch(text,text,text,jsonb)') and position('sync-check-v1:' in prosrc)>0) then
  raise exception 'SYNC_EFFICIENCY_ALREADY_INSTALLED_VERIFY_READBACK';
 end if;
 for e in select * from (values
 ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4',''),
 ('compliance_private.dispatch(text,text,text,jsonb)','972f77a1e9865150aa83dbf7a1b977a3',''),
 ('compliance_private.state(jsonb)','7e9d3125977ba477a6290d12a9297f57',''),
 ('compliance_private.performance_dispatch(text,text,text,jsonb)','b6a37e4ed25c8ebf51ef96772dec84f0',''),
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
 ('public.compliance_rpc(text,text,text,jsonb,text)','79d92bdca3a86f1891f91effd04653ac','statement_timeout=15s')
 ) x(signature,hash,timeout_config) loop
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(e.signature) and prosecdef
   and proconfig=case when e.timeout_config='' then array['search_path=""'] else array['search_path=""',e.timeout_config] end
   and md5(replace(prosrc,E'\r\n',E'\n'))=e.hash) then
   raise exception 'SYNC_EFFICIENCY_UNKNOWN_PREDECESSOR: %',e.signature;
  end if;
 end loop;
 if (select count(*) from pg_catalog.pg_proc proc join pg_catalog.pg_namespace n on n.oid=proc.pronamespace where n.nspname='public' and proc.proname='compliance_rpc')<>4 then raise exception 'SYNC_EFFICIENCY_UNEXPECTED_RPC_OVERLOAD';end if;
 for e in select * from (values
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',$old$p_action not in ('sync','inspection_detail','export_authorize')$old$,$new$p_action not in ('sync','sync_check','inspection_detail','export_authorize')$new$),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',$old$if p_action='sync' then$old$,$new$if p_action='sync_check' then
  perform compliance_private.object_keys(p_payload,array['syncMarker']);
  perform compliance_private.require_fields(p_payload,array['syncMarker'],'string');
  if length(p_payload->>'syncMarker')>160 then perform compliance_private.fail('INVALID_SYNC_MARKER');end if;
  -- No business bodies. The visible vector, audit window and metadata are from
  -- one SQL statement snapshot. A prior check is never authority for later sync.
  with vector as materialized(select coalesce(jsonb_object_agg(kind||':'||id,version),'{}'::jsonb) v from compliance_private.records where actor_v->>'role' is distinct from 'management_viewer' or kind<>'improvement'),
  summaries as materialized(select a.id,a.at,a.actor_id,a.actor_name,a.action,a.kind,a.entity_id,a.item_codes,a.summary,a.operation_id from compliance_private.audit a where compliance_private.allowed(actor_v,'viewAuditLogs') order by a.at desc,a.id limit 200),
  marker as materialized(select 'sync-check-v1:'||compliance_private.digest(jsonb_build_object(
     'actor',actor_v,'session',compliance_private.digest(p_session),'client',p_client_id,
     'coverage','readonly-summary-v1','scope',case when actor_v->>'role'='management_viewer' then 'management_viewer' else 'standard' end,
     'versions',vector.v,'metadata',case when actor_v->>'role'='management_viewer' then 'restricted-v1' else ctl.xmin::text||':'||ctl.ctid::text end,
     'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc,a.id) from summaries a),'[]'::jsonb))::text) value from vector cross join compliance_private.control ctl where ctl.singleton)
  select jsonb_build_object('syncMarker',value,'unchanged',p_payload->>'syncMarker'=value,'historyMode','readonly-summary-v1')
   ||case when actor_v->>'role'='management_viewer' then jsonb_build_object('viewScope','management_viewer') else '{}'::jsonb end into data from marker;
  if data is null then perform compliance_private.fail('SYNC_BASELINE_INCOMPLETE');end if;
  return data;
 elsif p_action='sync' then$new$),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',$old$'user',actor_v,'versions',vector.v,'baseline',p_payload->'versions'='{}'::jsonb,$old$,$new$'syncMarker','sync-check-v1:'||compliance_private.digest(jsonb_build_object(
     'actor',actor_v,'session',compliance_private.digest(p_session),'client',p_client_id,
     'coverage','readonly-summary-v1','scope',case when actor_v->>'role'='management_viewer' then 'management_viewer' else 'standard' end,
     'versions',vector.v,'metadata',case when actor_v->>'role'='management_viewer' then 'restricted-v1' else ctl.xmin::text||':'||ctl.ctid::text end,
     'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc,a.id) from summaries a),'[]'::jsonb))::text),
   'user',actor_v,'versions',vector.v,'baseline',p_payload->'versions'='{}'::jsonb,$new$),
  ('public.compliance_rpc(text,text,text,jsonb,text)',$old$('sync','inspection_detail','save'$old$,$new$('sync','sync_check','inspection_detail','save'$new$)
 ) x(signature,needle,replacement) loop
  select * into strict p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  definition:=replace(pg_catalog.pg_get_functiondef(p.oid),E'\r\n',E'\n');
  occurrences:=(length(definition)-length(replace(definition,e.needle,'')))/length(e.needle);
  if occurrences<>1 then raise exception 'SYNC_EFFICIENCY_SEAM_MISMATCH: %',e.signature;end if;
  execute replace(definition,e.needle,e.replacement);
  if not exists(select 1 from pg_catalog.pg_proc q where q.oid=p.oid and q.proowner=p.proowner and q.proacl is not distinct from p.proacl
   and q.proconfig is not distinct from p.proconfig and q.prosecdef=p.prosecdef and q.proargnames is not distinct from p.proargnames) then raise exception 'SYNC_EFFICIENCY_ATTRIBUTES_CHANGED: %',e.signature;end if;
 end loop;
end $upgrade$;
commit;
