-- TMSA / DRYBMS only; apply ONCE after 012. Installation is DDL only.
-- No account provisioning, credentials, business/history rewrites or new grants.
-- General Manager is created later through the existing Owner/admin person editor.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $upgrade$
declare e record; p record; definition text; occurrences integer;
begin
 if exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.allowed(jsonb,text)') and position('management_viewer' in prosrc)>0) then
  raise exception 'MANAGEMENT_VIEWER_ALREADY_INSTALLED_VERIFY_READBACK';
 end if;
 -- Pin the effective validator chain, all four public overloads, and every
 -- private authority/read seam. Never patch an unused archival validator.
 for e in select * from (values
  ('compliance_private.allowed(jsonb,text)','fb2a2b21269c36f47fb450496a300b93',''),
  ('compliance_private.dispatch(text,text,text,jsonb)','8cdfdd4c2952564ff8b46f580625596e',''),
  ('compliance_private.state(jsonb)','d8ba1c3d29a7265ce85845c58288071c',''),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','60a8443fed5b2ff7e8055fc692ff5577',''),
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','57a56d2c2689584c2d88c68c0b22055f',''),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526',''),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba',''),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','c96f6a5c2dcb4e766244f17204fa3a1c',''),
  ('compliance_private.validate_record_before_shared_targets(text,jsonb,jsonb,text,jsonb)','037cfe64cf3e317605dbc4851d8553f4',''),
  ('compliance_private.restart_updates(text,text,jsonb)','25d528d967082e586c008e716d87cbfa',''),
  ('compliance_private.claim_shared_targets(text,text,jsonb)','6a95ef46f5e69f1c29964c6027de73b7',''),
  ('compliance_private.save_shared_targets(text,text,jsonb)','7b439083bdedfa33d78c11f17f880bc9',''),
  ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2',''),
  ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320','statement_timeout=60s'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b','statement_timeout=15s'),
  ('public.compliance_rpc(text,text,text,jsonb,text)','79d92bdca3a86f1891f91effd04653ac','statement_timeout=15s')
 ) x(signature,hash,timeout_config) loop
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(e.signature)
   and prosecdef and proconfig=case when e.timeout_config='' then array['search_path=""'] else array['search_path=""',e.timeout_config] end
   and md5(replace(prosrc,E'\r\n',E'\n'))=e.hash) then
   raise exception 'MANAGEMENT_VIEWER_UNKNOWN_PREDECESSOR: %',e.signature;
  end if;
 end loop;
 if (select count(*) from pg_catalog.pg_proc proc join pg_catalog.pg_namespace n on n.oid=proc.pronamespace where n.nspname='public' and proc.proname='compliance_rpc')<>4 then
  raise exception 'MANAGEMENT_VIEWER_UNEXPECTED_RPC_OVERLOAD';
 end if;
 -- Exact, counted substitutions preserve each function's owner, ACL, arguments,
 -- security-definer and search_path attributes. No new callable surface.
 for e in select * from (values
  ('compliance_private.allowed(jsonb,text)',
   $old$if role_name='owner' then return true;end if;$old$,
   $new$if role_name='management_viewer' then return cap in ('exportReports','enterManagement');end if;
  if role_name='owner' then return true;end if;$new$,1),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',
   $old$b->>'role' not in ('owner','admin','operator','vessel')$old$,
   $new$b->>'role' not in ('owner','admin','operator','vessel','management_viewer')$new$,1),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',
   $old$b->>'role' ='owner' and b->'hasPassword'<>'true'::jsonb$old$,
   $new$b->>'role' in ('owner','management_viewer') and b->'hasPassword'<>'true'::jsonb$new$,1),
  ('compliance_private.dispatch(text,text,text,jsonb)',
   $old$actor_v->>'role' ='owner' and creds.password_hash is null$old$,
   $new$actor_v->>'role' in ('owner','management_viewer') and creds.password_hash is null$new$,1),
  ('compliance_private.dispatch(text,text,text,jsonb)',
   $old$actor_v:=compliance_private.actor(p_session);$old$,
   $new$actor_v:=compliance_private.actor(p_session);
 -- Fixed read/export role: reject before leases, receipts or any mutation.
 if actor_v->>'role'='management_viewer' and (p_action is null or p_action not in ('current_user','logout','read','export_authorize') or p_action='export_authorize' and p_payload->>'kind'='improvements') then perform compliance_private.fail('FORBIDDEN');end if;$new$,1),
  ('compliance_private.state(jsonb)',
   $old$with saved as materialized(select * from compliance_private.records)$old$,
   $new$with saved as materialized(select * from compliance_private.records where actor->>'role' is distinct from 'management_viewer' or kind<>'improvement')$new$,1),
  ('compliance_private.state(jsonb)',
   $old$'cycles',ctl.cycles,'provenance',ctl.provenance,$old$,
   $new$'cycles',case when actor->>'role'='management_viewer' then '[]'::jsonb else ctl.cycles end,'provenance',case when actor->>'role'='management_viewer' then '[]'::jsonb else ctl.provenance end,$new$,1),
  ('compliance_private.state(jsonb)',
   $old$return result||jsonb_build_object('snapshotToken'$old$,
   $new$if actor->>'role'='management_viewer' then result:=result||jsonb_build_object('viewScope','management_viewer');end if;
  return result||jsonb_build_object('snapshotToken'$new$,1),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',
   $old$actor_v:=compliance_private.actor(p_session);$old$,
   $new$actor_v:=compliance_private.actor(p_session);
 if actor_v->>'role'='management_viewer' and (p_action is null or p_action not in ('sync','inspection_detail','export_authorize') or p_action='export_authorize' and p_payload->>'kind'='improvements') then perform compliance_private.fail('FORBIDDEN');end if;$new$,1),
  -- Apply the identical complete authorized vector in both sync and export.
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',
   $old$with vector as materialized(select coalesce(jsonb_object_agg(kind||':'||id,version),'{}'::jsonb) v from compliance_private.records),$old$,
   $new$with vector as materialized(select coalesce(jsonb_object_agg(kind||':'||id,version),'{}'::jsonb) v from compliance_private.records where actor_v->>'role' is distinct from 'management_viewer' or kind<>'improvement'),$new$,2),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',
   $old$from compliance_private.records r where p_payload->'versions'->(r.kind||':'||r.id) is distinct from to_jsonb(r.version)$old$,
   $new$from compliance_private.records r where (actor_v->>'role' is distinct from 'management_viewer' or r.kind<>'improvement') and p_payload->'versions'->(r.kind||':'||r.id) is distinct from to_jsonb(r.version)$new$,1),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',
   $old$'controlSummary',jsonb_build_object('cycles',jsonb_array_length(ctl.cycles),'provenance',jsonb_array_length(ctl.provenance)),$old$,
   $new$'controlSummary',case when actor_v->>'role'='management_viewer' then '{}'::jsonb else jsonb_build_object('cycles',jsonb_array_length(ctl.cycles),'provenance',jsonb_array_length(ctl.provenance)) end,$new$,1),
  -- Never construct/store a private improvement snapshot and redact it later.
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',
   $old$select r.* from compliance_private.records r where r.kind='improvement' and ($old$,
   $new$select r.* from compliance_private.records r where actor_v->>'role' is distinct from 'management_viewer' and r.kind='improvement' and ($new$,1),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',
   $old$compliance_private.digest(jsonb_build_object('versions',vector.v,'metadataToken',ctl.xmin::text||':'||ctl.ctid::text)::text)$old$,
   $new$compliance_private.digest((jsonb_build_object('versions',vector.v,'metadataToken',ctl.xmin::text||':'||ctl.ctid::text)||case when actor_v->>'role'='management_viewer' then jsonb_build_object('viewScope','management_viewer') else '{}'::jsonb end)::text)$new$,2),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',
   $old$into data from vector cross join compliance_private.control ctl where ctl.singleton;$old$,
   $new$into data from vector cross join compliance_private.control ctl where ctl.singleton;
  -- Server-authored restricted envelope, not a claim of zero improvements.
  if actor_v->>'role'='management_viewer' then data:=data||jsonb_build_object('viewScope','management_viewer','improvements','[]'::jsonb,'auditLogs','[]'::jsonb,'cycles','[]'::jsonb,'provenance','[]'::jsonb);end if;$new$,2)
 ) x(signature,needle,replacement,expected_count) loop
  select * into strict p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  definition:=replace(pg_catalog.pg_get_functiondef(p.oid),E'\r\n',E'\n');
  occurrences:=(length(definition)-length(replace(definition,e.needle,'')))/length(e.needle);
  if occurrences<>e.expected_count then raise exception 'MANAGEMENT_VIEWER_SEAM_MISMATCH: %',e.signature;end if;
  execute replace(definition,e.needle,e.replacement);
  if not exists(select 1 from pg_catalog.pg_proc q where q.oid=p.oid and q.proowner=p.proowner
   and q.proacl is not distinct from p.proacl and q.proconfig is not distinct from p.proconfig
   and q.prosecdef=p.prosecdef and q.proargnames is not distinct from p.proargnames) then
   raise exception 'MANAGEMENT_VIEWER_ATTRIBUTES_CHANGED: %',e.signature;
  end if;
 end loop;
end $upgrade$;
commit;
