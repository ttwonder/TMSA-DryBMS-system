-- Apply ONCE after verified 017. DDL only; no data backfill or permission changes.
-- departmentId is a compatibility projection, never a new primary-department choice.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $upgrade$
declare e record; prior_p record; definition text;
begin
 if exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)') and position('PERSON-018' in prosrc)>0) then raise exception 'PERSON_DEPARTMENT_HEADS_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 for e in select * from (values
  ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4'),
  ('compliance_private.dispatch(text,text,text,jsonb)','a38e4507953b956741ce2f87db52b598'),
  ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7'),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','58d41840c68fbde5d026b4d0f0ac5ace'),
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','a60c3de4ea50f4e16bcc483c385d6ef6'),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526'),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba'),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','f7361243050a98f77be3fcc20cd96a3b')
 ) x(signature,hash) loop
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(e.signature) and prosecdef and proconfig=array['search_path=""']
   and proowner=(select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'))
   and md5(replace(prosrc,E'\r\n',E'\n'))=e.hash) then raise exception 'PERSON_DEPARTMENT_HEADS_UNKNOWN_PREDECESSOR: %',e.signature;end if;
 end loop;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,
  lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  where n.nspname='compliance_private' and a.privilege_type='EXECUTE' and a.grantee<>p.proowner) then raise exception 'PERSON_DEPARTMENT_HEADS_UNEXPECTED_ACL';end if;
 -- Reject installed client/public ACL drift; do not repair permissions here.
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='compliance_rpc' and a.grantee=0)
 or exists(select 1 from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated') and pg_catalog.has_schema_privilege(r.oid,'compliance_private','USAGE'))
 or exists(select 1 from pg_catalog.pg_namespace n,lateral pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a where n.nspname='compliance_private' and a.grantee=0 and a.privilege_type='USAGE')
 or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join pg_catalog.pg_roles r where n.nspname='compliance_private' and c.relkind='r' and r.rolname in ('anon','authenticated') and pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
 or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace,lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a where n.nspname='compliance_private' and c.relkind='r' and a.grantee=0)
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join pg_catalog.pg_roles r where n.nspname='public' and p.proname='compliance_rpc' and r.rolname in ('anon','authenticated') and pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') is distinct from pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE'))
 or not exists(select 1 from pg_catalog.pg_roles r where r.rolname='anon' and pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE'))
 then raise exception 'PERSON_DEPARTMENT_HEADS_UNEXPECTED_ACL: installed private/client/public boundary'; end if;
 for e in select * from (values
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',
   $old$when 'person' then array['username','name','departmentId','role'$old$,
   $new$when 'person' then array['departmentIds','isDepartmentHead','username','name','departmentId','role'$new$),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',
   $old$  elsif kind='person' then
    perform compliance_private.require_fields$old$,
   $new$  elsif kind='person' then
    -- PERSON-018: explicit memberships are authoritative; legacy omission retains them.
    if not (b ? 'departmentIds') and old ? 'departmentIds' then
      if b ? 'departmentId' and b->'departmentId' is distinct from old->'departmentId' then
        perform compliance_private.fail('PERSON_DEPARTMENTS_UPGRADE_REQUIRED');
      end if;
      b:=b||jsonb_build_object('departmentIds',old->'departmentIds');
    end if;
    if b ? 'departmentIds' then
      perform compliance_private.refs(b->'departmentIds','department');
      if jsonb_array_length(b->'departmentIds')=0 then perform compliance_private.fail('PERSON_DEPARTMENT_REQUIRED');end if;
      b:=b||jsonb_build_object('departmentId',b->'departmentIds'->0);
    end if;
    if not (b ? 'isDepartmentHead') and old ? 'isDepartmentHead' then b:=b||jsonb_build_object('isDepartmentHead',old->'isDepartmentHead');end if;
    if b ? 'isDepartmentHead' then perform compliance_private.require_fields(b,array['isDepartmentHead'],'boolean');end if;
    perform compliance_private.require_fields$new$),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',
   $old$p.kind='person' and not p.body->>'departmentId'=any(seen)$old$,
   $new$p.kind='person' and exists(select 1 from jsonb_array_elements_text(coalesce(p.body->'departmentIds',jsonb_build_array(p.body->>'departmentId'))) d where not d=any(seen))$new$),
  ('compliance_private.dispatch(text,text,text,jsonb)',
   $old$jsonb_build_object('departmentName',d.value->'name')$old$,
   $new$jsonb_build_object('departmentName',d.value->'name','departmentNames',(select jsonb_object_agg(e->>'id',e->'name') from compliance_private.records s cross join lateral jsonb_array_elements(s.body->'departments') e where s.kind='settings' and s.id='settings' and coalesce(r.body->'departmentIds',jsonb_build_array(r.body->>'departmentId')) ? (e->>'id')))$new$)
 ) x(signature,needle,replacement) loop
  select * into strict prior_p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  definition:=replace(pg_catalog.pg_get_functiondef(prior_p.oid),E'\r\n',E'\n');
  -- Manual Windows copy/paste can make dollar-quoted seams CRLF too.
  e.needle:=replace(e.needle,E'\r\n',E'\n');
  e.replacement:=replace(e.replacement,E'\r\n',E'\n');
  if (length(definition)-length(replace(definition,e.needle,'')))/length(e.needle)<>1 then raise exception 'PERSON_DEPARTMENT_HEADS_SEAM_MISMATCH: %',e.signature;end if;
  execute replace(definition,e.needle,e.replacement);
  if not exists(select 1 from pg_catalog.pg_proc q where q.oid=prior_p.oid and q.proowner=prior_p.proowner and q.proacl is not distinct from prior_p.proacl
   and q.proconfig is not distinct from prior_p.proconfig and q.prosecdef=prior_p.prosecdef and q.proargnames is not distinct from prior_p.proargnames) then raise exception 'PERSON_DEPARTMENT_HEADS_ATTRIBUTES_CHANGED';end if;
 end loop;
end $upgrade$;
commit;
