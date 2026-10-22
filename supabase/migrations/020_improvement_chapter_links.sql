-- 020: genuine optional direct chapter links. Apply after 019; no row writes/backfill.
-- Frozen predecessor: 48418274dc27da6ec0eb4da4751d60e158461b43. Preserve all RPC hooks.
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
  ('compliance_private.improvement_matches(jsonb,jsonb)','1b1b56066b1f49e1713e630ac0255a07','fde8b933084d687c530a6cb3be0fa4ee'),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','58d41840c68fbde5d026b4d0f0ac5ace','1d350f40ff41379be7f3bb14c1afe4ae'),
  ('compliance_private.refs(jsonb,text,boolean)','735605a70cefae48b0082c4c8230acc8','735605a70cefae48b0082c4c8230acc8'),
  ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7','3776ed715bd1165dbdf1056cee38eec7'),
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','a60c3de4ea50f4e16bcc483c385d6ef6','ff892d3a2a84f742e229c18ec99d17b5'),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526','e6a79c1267240daafb8a0b1624d3c526'),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba','73c115a07d7c0402148351d547a58cba'),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','f09ceed2e4cd01bcc1e9e3d2904f697c','eb6bc7e14bb4ace49dcf9972084b5432'),
  ('compliance_private.write_allowed(jsonb,text,text)','322d21749601a8fb572e326b035fc844','322d21749601a8fb572e326b035fc844'),
  ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2','999bb75b6d31297eeba8a5090ccb6ee2'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320','63e2634760cdf3bd465726d7e2128320'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b','8e071416d849b87785a6eafd47669d8b'),
  ('public.compliance_rpc(text,text,text,jsonb,text)','908e926425d02c04465599cfee58126f','908e926425d02c04465599cfee58126f')
 ) x(signature,pre,post) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  if not found or md5(replace(p.prosrc,E'\r\n',E'\n')) not in (e.pre,e.post) or not p.prosecdef or p.proconfig is distinct from (case e.signature when 'public.compliance_rpc(text,text,text,jsonb,boolean)' then array['search_path=""','statement_timeout=60s'] when 'public.compliance_rpc(text,text,text,jsonb,boolean,boolean)' then array['search_path=""','statement_timeout=15s'] when 'public.compliance_rpc(text,text,text,jsonb,text)' then array['search_path=""','statement_timeout=15s'] else array['search_path=""'] end) or p.proowner is distinct from (select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)')) then raise exception 'IMPROVEMENT_CHAPTER_LINKS_UNKNOWN_PREDECESSOR: %',e.signature;end if;
  if e.pre<>e.post then
   changed:=changed or md5(replace(p.prosrc,E'\r\n',E'\n'))=e.pre;
   installed:=installed or md5(replace(p.prosrc,E'\r\n',E'\n'))=e.post;
  end if;
 end loop;
 if changed and installed then raise exception 'IMPROVEMENT_CHAPTER_LINKS_MIXED_INSTALL';end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='compliance_private' and a.privilege_type='EXECUTE' and a.grantee<>p.proowner)
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='compliance_rpc' and a.grantee=0)
 or exists(select 1 from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated') and pg_catalog.has_schema_privilege(r.oid,'compliance_private','USAGE'))
 or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join pg_catalog.pg_roles r where n.nspname='compliance_private' and c.relkind='r' and r.rolname in ('anon','authenticated') and pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace,lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a where n.nspname='compliance_private' and c.relkind='r' and a.grantee=0)
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join pg_catalog.pg_roles r where n.nspname='public' and p.proname='compliance_rpc' and r.rolname in ('anon','authenticated') and pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') is distinct from pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE')) or not exists(select 1 from pg_catalog.pg_roles r where r.rolname='anon' and pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE'))
 then raise exception 'IMPROVEMENT_CHAPTER_LINKS_UNEXPECTED_ACL';end if;
 if installed then return;end if;
 for e in select * from (values
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)',$old$ if kind<>'assessment' then$old$,$new$ -- CHAPTER-020: omission preserves a directly saved relation, never inferred Items.
 if kind='improvement' and not (b ? 'chapterIds') and old ? 'chapterIds' then b:=b||jsonb_build_object('chapterIds',old->'chapterIds');end if;
 if kind<>'assessment' then$new$),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',$old$when 'improvement' then array['proposedDate'$old$,$new$when 'improvement' then array['chapterIds','proposedDate'$new$),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',$old$    -- FPMC-016: an independent optional date-only fact, never a timestamp fallback.$old$,$new$    -- CHAPTER-020: optional direct references follow the existing inactive-history policy.
    if b ? 'chapterIds' then perform compliance_private.refs(b->'chapterIds','chapter');end if;
    -- FPMC-016: an independent optional date-only fact, never a timestamp fallback.$new$),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',$old$if intent<>'import' and jsonb_array_length(b->'itemIds')=0 and b->>'source'$old$,$new$if intent<>'import' and jsonb_array_length(b->'itemIds')=0 and jsonb_array_length(coalesce(b->'chapterIds','[]'::jsonb))=0 and b->>'source'$new$),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',$old$      b:=b||jsonb_build_object('sourceKey'$old$,$new$      -- Frozen finding membership, not today's Item chapter after relocation.
      if exists(select 1 from jsonb_array_elements_text(coalesce(b->'chapterIds','[]'::jsonb)) c where not exists(select 1 from jsonb_array_elements(ref#>'{snapshot,items}') i where rowv->'itemIds' ? (i->>'id') and i->>'chapterId'=c)) then perform compliance_private.fail('INVALID_EXTERNAL_SOURCE');end if;
      b:=b||jsonb_build_object('sourceKey'$new$),
  ('compliance_private.improvement_matches(jsonb,jsonb)',$old$select (coalesce(f->>'frameworkId'$old$,$new$select (coalesce(f->>'source','')='' or case when left(f->>'source',11)='inspection:' then b->>'source'='external' and b->>'inspectionId'=substring(f->>'source' from 12) else b->>'source'=f->>'source' end) and (coalesce(f->>'proposedFrom','')='' or coalesce(b->>'proposedDate','')<>'' and b->>'proposedDate'>=f->>'proposedFrom') and (coalesce(f->>'proposedTo','')='' or coalesce(b->>'proposedDate','')<>'' and b->>'proposedDate'<=f->>'proposedTo') and (coalesce(f->>'itemId','')='' or b->'itemIds' ? (f->>'itemId')) and (coalesce(f->>'frameworkId'$new$),
  ('compliance_private.improvement_matches(jsonb,jsonb)',$old$i.body->>'frameworkId'=f->>'frameworkId'))$old$,$new$i.body->>'frameworkId'=f->>'frameworkId') or exists(select 1 from compliance_private.records c where c.kind='chapter' and b->'chapterIds' ? c.id and c.body->>'frameworkId'=f->>'frameworkId'))$new$),
  ('compliance_private.improvement_matches(jsonb,jsonb)',$old$coalesce(f->>'chapterId','')='' or exists$old$,$new$coalesce(f->>'chapterId','')='' or coalesce(b->'chapterIds','[]'::jsonb) ? (f->>'chapterId') or exists$new$),
  ('compliance_private.improvement_matches(jsonb,jsonb)',$old$||(select coalesce(string_agg(e->>'content'$old$,$new$||(select coalesce(string_agg(concat_ws(' ',c.body->>'code',c.body#>>'{name,en}',c.body#>>'{name,zh}'),' '),'') from compliance_private.records c where c.kind='chapter' and b->'chapterIds' ? c.id)||' '||(select coalesce(string_agg(e->>'content'$new$),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',$old$kind_v in ('framework','overview') and exists(select 1 from selected_items i where r.body->'itemIds' ? i.id)$old$,$new$kind_v in ('framework','overview') and (exists(select 1 from selected_items i where r.body->'itemIds' ? i.id) or exists(select 1 from compliance_private.records c where c.kind='chapter' and c.body->'active'='true'::jsonb and c.body->>'frameworkId'=p_payload->>'frameworkId' and r.body->'chapterIds' ? c.id and (selection_v ? c.id or selection_v ? (c.body->>'frameworkId'))))$new$),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)',$old$r.kind='chapter' and (exists(select 1 from selected_items$old$,$new$r.kind='chapter' and (exists(select 1 from selected_improvements i where i.body->'chapterIds' ? r.id) or exists(select 1 from selected_items$new$)
 ) x(signature,needle,replacement) loop
  select * into strict p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  d:=replace(pg_catalog.pg_get_functiondef(p.oid),E'\r\n',E'\n');
  e.needle:=replace(e.needle,E'\r\n',E'\n');e.replacement:=replace(e.replacement,E'\r\n',E'\n');
  if (length(d)-length(replace(d,e.needle,'')))/length(e.needle)<>1 then raise exception 'IMPROVEMENT_CHAPTER_LINKS_SEAM_MISMATCH: %',e.signature;end if;
  execute replace(d,e.needle,e.replacement);
  if not exists(select 1 from pg_catalog.pg_proc n where n.oid=p.oid and n.proowner=p.proowner and n.proacl is not distinct from p.proacl and n.proconfig is not distinct from p.proconfig and n.prosecdef=p.prosecdef and n.proargnames is not distinct from p.proargnames and n.prorettype=p.prorettype and n.prolang=p.prolang) then raise exception 'IMPROVEMENT_CHAPTER_LINKS_ATTRIBUTES_CHANGED';end if;
 end loop;
 for e in select * from (values
  ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4','2b22e76491efe4bea47856cf22730ff4'),
  ('compliance_private.dispatch(text,text,text,jsonb)','efc7dd87c1874844c6a3d5df6e43d52a','efc7dd87c1874844c6a3d5df6e43d52a'),
  ('compliance_private.improvement_matches(jsonb,jsonb)','1b1b56066b1f49e1713e630ac0255a07','fde8b933084d687c530a6cb3be0fa4ee'),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','58d41840c68fbde5d026b4d0f0ac5ace','1d350f40ff41379be7f3bb14c1afe4ae'),
  ('compliance_private.refs(jsonb,text,boolean)','735605a70cefae48b0082c4c8230acc8','735605a70cefae48b0082c4c8230acc8'),
  ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7','3776ed715bd1165dbdf1056cee38eec7'),
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','a60c3de4ea50f4e16bcc483c385d6ef6','ff892d3a2a84f742e229c18ec99d17b5'),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526','e6a79c1267240daafb8a0b1624d3c526'),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba','73c115a07d7c0402148351d547a58cba'),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','f09ceed2e4cd01bcc1e9e3d2904f697c','eb6bc7e14bb4ace49dcf9972084b5432'),
  ('compliance_private.write_allowed(jsonb,text,text)','322d21749601a8fb572e326b035fc844','322d21749601a8fb572e326b035fc844'),
  ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2','999bb75b6d31297eeba8a5090ccb6ee2'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320','63e2634760cdf3bd465726d7e2128320'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b','8e071416d849b87785a6eafd47669d8b'),
  ('public.compliance_rpc(text,text,text,jsonb,text)','908e926425d02c04465599cfee58126f','908e926425d02c04465599cfee58126f')
 ) x(signature,pre,post) loop
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(e.signature) and md5(replace(prosrc,E'\r\n',E'\n'))=e.post) then raise exception 'IMPROVEMENT_CHAPTER_LINKS_POSTCHECK_FAILED: %',e.signature;end if;
 end loop;
end $upgrade$;
commit;
