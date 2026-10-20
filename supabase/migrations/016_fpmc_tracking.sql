-- Apply ONCE after 015. FPMC company-level tracking; DDL only, no data backfill.
-- Extend the installed guarded rules directly: never disguise a source as non_external.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $upgrade$
declare e record; prior_p record; definition text; occurrences integer;
begin
 if exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)') and position('FPMC-016' in prosrc)>0) then raise exception 'FPMC_TRACKING_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 for e in select * from (values
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','57a56d2c2689584c2d88c68c0b22055f'),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526'),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba'),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','a6ceb93748e13aeafd5132a8b9c5be27'),
  ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4'),
  ('compliance_private.dispatch(text,text,text,jsonb)','a38e4507953b956741ce2f87db52b598'),
  ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7'),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','a3c5453737d82fdc04d879713f8bec14')
 ) x(signature,hash) loop
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(e.signature) and prosecdef and proconfig=array['search_path=""']
   and proowner=(select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'))
   and md5(replace(prosrc,E'\r\n',E'\n'))=e.hash) then raise exception 'FPMC_TRACKING_UNKNOWN_PREDECESSOR: %',e.signature;end if;
 end loop;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,
  lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where n.nspname='compliance_private' and a.privilege_type='EXECUTE' and a.grantee<>p.proowner) then raise exception 'FPMC_TRACKING_UNEXPECTED_ACL';end if;
 for e in select * from (values
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)',
   $old$ if kind<>'assessment' then$old$,
   $new$ -- FPMC-016: normalize omission before the existing history/empty-event guards.
 if kind='improvement' and not (b ? 'proposedDate') and old ? 'proposedDate' then b:=b||jsonb_build_object('proposedDate',old->'proposedDate');end if;
 if kind<>'assessment' then$new$),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',
   $old$when 'improvement' then array['title','content','itemIds'$old$,
   $new$when 'improvement' then array['proposedDate','title','content','itemIds'$new$),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',
   $old$b->>'source' not in ('external','non_external')$old$,
   $new$b->>'source' not in ('external','non_external','management_review','management_directive')$new$),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',
   $old$    if b->>'source'='external' then$old$,
   $new$    -- FPMC-016: an independent optional date-only fact, never a timestamp fallback.
    if b ? 'proposedDate' then
      perform compliance_private.require_fields(b,array['proposedDate'],'string');
      if b->>'proposedDate'<>'' then
        if b->>'proposedDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then perform compliance_private.fail('INVALID_PROPOSED_DATE');end if;
        begin
          if to_char((b->>'proposedDate')::date,'YYYY-MM-DD')<>b->>'proposedDate' then perform compliance_private.fail('INVALID_PROPOSED_DATE');end if;
        exception when datetime_field_overflow or invalid_datetime_format then perform compliance_private.fail('INVALID_PROPOSED_DATE');end;
      end if;
    end if;
    if old is not null and (b->'source' is distinct from old->'source' or b->'inspectionId' is distinct from old->'inspectionId' or b->'findingId' is distinct from old->'findingId' or b->'sourceKey' is distinct from old->'sourceKey' or b->'sources' is distinct from old->'sources') then perform compliance_private.fail('IMMUTABLE_SOURCE');end if;
    -- Keep the original UI Item rule; only the two company sources may be standalone.
    -- Existing imported general themes retain their deliberately unlocated identity.
    if intent<>'import' and jsonb_array_length(b->'itemIds')=0 and b->>'source' not in ('management_review','management_directive') and not (
      old is not null and old->>'source'='external' and jsonb_array_length(old->'itemIds')=0 and exists(
        select 1 from compliance_private.records r,jsonb_array_elements(r.body->'findings') f
        where r.kind='inspection' and r.id=old->>'inspectionId' and r.body->'imported'='true'::jsonb
        and f->>'id'=old->>'findingId' and f->>'classification'='general' and jsonb_array_length(f->'itemIds')=0
      )
    ) then perform compliance_private.fail('RELATED_ITEM_REQUIRED');end if;
    if b->>'source'='external' then$new$)
 ) x(signature,needle,replacement) loop
  select * into strict prior_p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  definition:=replace(pg_catalog.pg_get_functiondef(prior_p.oid),E'\r\n',E'\n');
  occurrences:=(length(definition)-length(replace(definition,e.needle,'')))/length(e.needle);
  if occurrences<>1 then raise exception 'FPMC_TRACKING_SEAM_MISMATCH: %',e.signature;end if;
  execute replace(definition,e.needle,e.replacement);
  if not exists(select 1 from pg_catalog.pg_proc q where q.oid=prior_p.oid and q.proowner=prior_p.proowner and q.proacl is not distinct from prior_p.proacl
   and q.proconfig is not distinct from prior_p.proconfig and q.prosecdef=prior_p.prosecdef and q.proargnames is not distinct from prior_p.proargnames) then raise exception 'FPMC_TRACKING_ATTRIBUTES_CHANGED: %',e.signature;end if;
 end loop;
end $upgrade$;
commit;
