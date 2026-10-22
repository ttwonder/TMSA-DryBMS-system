-- After 018: 船舶安全會議 / 公司安全會議; optional Item links for either source.
-- DDL only. No backfill, new RPC, permissions, source identity or save-rule changes.
-- Expected normalized bodies derived from pinned f61c9b1e201fdd21306db9f22cd134a27980d18d.
-- The historical FPMC-016 comment inside the body describes 016, not this extension.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $upgrade$
declare prior_p record; e record; definition text; body_hash text;
begin
 select * into prior_p from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)');
 if not found then raise exception 'SAFETY_MEETING_SOURCES_UNKNOWN_PREDECESSOR';end if;
 body_hash:=md5(replace(prior_p.prosrc,E'\r\n',E'\n'));
 if body_hash not in ('111b32be336c5333fc0ca2a9ae96ea92','f09ceed2e4cd01bcc1e9e3d2904f697c')
 or not prior_p.prosecdef or prior_p.proconfig is distinct from array['search_path=""']
 or prior_p.proowner is distinct from (select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'))
 then raise exception 'SAFETY_MEETING_SOURCES_UNKNOWN_PREDECESSOR';end if;
 for e in select * from (values
  ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4'),
  ('compliance_private.dispatch(text,text,text,jsonb)','efc7dd87c1874844c6a3d5df6e43d52a'),
  ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7'),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','58d41840c68fbde5d026b4d0f0ac5ace'),
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','a60c3de4ea50f4e16bcc483c385d6ef6'),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526'),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba')
 ) x(signature,hash) loop
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=to_regprocedure(e.signature) and p.prosecdef
   and p.proconfig=array['search_path=""'] and p.proowner=prior_p.proowner
   and md5(replace(p.prosrc,E'\r\n',E'\n'))=e.hash)
  then raise exception 'SAFETY_MEETING_SOURCES_UNKNOWN_PREDECESSOR: %',e.signature;end if;
 end loop;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,
  lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where n.nspname='compliance_private' and a.privilege_type='EXECUTE' and a.grantee<>p.proowner)
 then raise exception 'SAFETY_MEETING_SOURCES_UNEXPECTED_ACL';end if;
 -- An identical candidate is a successful no-op, only after all preflight checks.
 if body_hash='f09ceed2e4cd01bcc1e9e3d2904f697c' then return;end if;
 definition:=replace(pg_catalog.pg_get_functiondef(prior_p.oid),E'\r\n',E'\n');
 for e in select * from (values
  ($old$b->>'source' not in ('external','non_external','management_review','management_directive')$old$,$new$b->>'source' not in ('external','non_external','management_review','management_directive','vessel_safety_meeting','company_safety_meeting')$new$),
  ($old$b->>'source' not in ('management_review','management_directive')$old$,$new$b->>'source' not in ('management_review','management_directive','vessel_safety_meeting','company_safety_meeting')$new$)
 ) x(needle,replacement) loop
  e.needle:=replace(e.needle,E'\r\n',E'\n');e.replacement:=replace(e.replacement,E'\r\n',E'\n');
  if (length(definition)-length(replace(definition,e.needle,'')))/length(e.needle)<>1
  then raise exception 'SAFETY_MEETING_SOURCES_SEAM_MISMATCH';end if;
  definition:=replace(definition,e.needle,e.replacement);
 end loop;
 execute definition;
 if not exists(select 1 from pg_catalog.pg_proc q where q.oid=prior_p.oid and q.proowner=prior_p.proowner
  and q.proacl is not distinct from prior_p.proacl and q.proconfig is not distinct from prior_p.proconfig
  and q.prosecdef=prior_p.prosecdef and q.proargnames is not distinct from prior_p.proargnames
  and q.prorettype=prior_p.prorettype and q.prolang=prior_p.prolang
  and md5(replace(q.prosrc,E'\r\n',E'\n'))='f09ceed2e4cd01bcc1e9e3d2904f697c')
 then raise exception 'SAFETY_MEETING_SOURCES_POSTCHECK_FAILED';end if;
end $upgrade$;
commit;
