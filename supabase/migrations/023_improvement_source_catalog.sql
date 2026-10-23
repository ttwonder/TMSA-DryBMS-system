-- 023 after verified 022. DDL only: no business/audit/export backfill.
-- Frozen built-in semantics; explicit settings Save; GM projection before export persistence.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $preflight$
#variable_conflict use_column
declare e record;p record;changed boolean:=false;installed boolean:=false;
begin
 if to_regprocedure('compliance_private.improvement_source_catalog()') is not null then raise exception 'IMPROVEMENT_SOURCE_CATALOG_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 for e in select * from (values
  ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4','2b22e76491efe4bea47856cf22730ff4'),
  ('compliance_private.dispatch(text,text,text,jsonb)','efc7dd87c1874844c6a3d5df6e43d52a','efc7dd87c1874844c6a3d5df6e43d52a'),
  ('compliance_private.improvement_matches(jsonb,jsonb)','fde8b933084d687c530a6cb3be0fa4ee','fde8b933084d687c530a6cb3be0fa4ee'),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','1d350f40ff41379be7f3bb14c1afe4ae','1d350f40ff41379be7f3bb14c1afe4ae'),
  ('compliance_private.refs(jsonb,text,boolean)','735605a70cefae48b0082c4c8230acc8','735605a70cefae48b0082c4c8230acc8'),
  ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7','3776ed715bd1165dbdf1056cee38eec7'),
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','436871103836b8a12150d7f59d460102','436871103836b8a12150d7f59d460102'),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526','e6a79c1267240daafb8a0b1624d3c526'),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba','73c115a07d7c0402148351d547a58cba'),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','481c0de2d763a1eb8595f35e01e41153','481c0de2d763a1eb8595f35e01e41153'),
  ('compliance_private.write_allowed(jsonb,text,text)','322d21749601a8fb572e326b035fc844','322d21749601a8fb572e326b035fc844'),
  ('compliance_private.milestone_rows_valid(jsonb)','36186d839a236e26d2f6b2e2739d6697','36186d839a236e26d2f6b2e2739d6697'),
  ('compliance_private.prepare_improvement_milestones(jsonb,jsonb,text,jsonb)','59c3bef36298bec0c0375322d339e038','59c3bef36298bec0c0375322d339e038'),
  ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2','999bb75b6d31297eeba8a5090ccb6ee2'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320','63e2634760cdf3bd465726d7e2128320'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b','8e071416d849b87785a6eafd47669d8b'),
  ('public.compliance_rpc(text,text,text,jsonb,text)','908e926425d02c04465599cfee58126f','908e926425d02c04465599cfee58126f')
 ) x(signature,pre,post) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  if not found or md5(replace(p.prosrc,E'\r\n',E'\n')) not in (e.pre,e.post) or not p.prosecdef or p.proconfig is distinct from (case e.signature when 'public.compliance_rpc(text,text,text,jsonb,boolean)' then array['search_path=""','statement_timeout=60s'] when 'public.compliance_rpc(text,text,text,jsonb,boolean,boolean)' then array['search_path=""','statement_timeout=15s'] when 'public.compliance_rpc(text,text,text,jsonb,text)' then array['search_path=""','statement_timeout=15s'] else array['search_path=""'] end) or p.proowner is distinct from (select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)')) then raise exception 'IMPROVEMENT_SOURCE_CATALOG_UNKNOWN_PREDECESSOR: %',e.signature;end if;
  if e.pre<>e.post then
   changed:=changed or md5(replace(p.prosrc,E'\r\n',E'\n'))=e.pre;
   installed:=installed or md5(replace(p.prosrc,E'\r\n',E'\n'))=e.post;
  end if;
 end loop;
 if changed and installed then raise exception 'IMPROVEMENT_SOURCE_CATALOG_MIXED_INSTALL';end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='compliance_private' and a.privilege_type='EXECUTE' and a.grantee<>p.proowner)
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='compliance_rpc' and a.grantee=0)
 or exists(select 1 from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated') and pg_catalog.has_schema_privilege(r.oid,'compliance_private','USAGE'))
 or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join pg_catalog.pg_roles r where n.nspname='compliance_private' and c.relkind='r' and r.rolname in ('anon','authenticated') and pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace,lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a where n.nspname='compliance_private' and c.relkind='r' and a.grantee=0)
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join pg_catalog.pg_roles r where n.nspname='public' and p.proname='compliance_rpc' and r.rolname in ('anon','authenticated') and pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') is distinct from pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE')) or not exists(select 1 from pg_catalog.pg_roles r where r.rolname='anon' and pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE'))
 then raise exception 'IMPROVEMENT_SOURCE_CATALOG_UNEXPECTED_ACL';end if;
end $preflight$;

create function compliance_private.improvement_source_catalog() returns jsonb language sql security definer set search_path='' as $catalog$
 select coalesce((select body->'improvementSources' from compliance_private.records where kind='settings' and id='settings'),'[{"id":"non_external","name":{"zh":"內部管理需求","en":"Internal management needs"},"active":true},{"id":"external","name":{"zh":"外部檢查","en":"External inspection"},"active":true},{"id":"management_review","name":{"zh":"管理審查會議","en":"Management review meeting"},"active":true},{"id":"management_directive","name":{"zh":"管理層指令","en":"Management directive"},"active":true},{"id":"vessel_safety_meeting","name":{"zh":"船舶安全會議","en":"Vessel safety meeting"},"active":true},{"id":"company_safety_meeting","name":{"zh":"公司安全會議","en":"Company safety meeting"},"active":true},{"id":"seminar","name":{"zh":"研討會","en":"Seminar"},"active":true},{"id":"external_regulatory_impact","name":{"zh":"外部法規規則影響","en":"External regulatory and rule impacts"},"active":true}]'::jsonb)
$catalog$;
revoke all on function compliance_private.improvement_source_catalog() from public;
create function compliance_private.improvement_source_allowed(source_id text,existing boolean) returns boolean language sql security definer set search_path='' as $eligible$
 select exists(select 1 from jsonb_array_elements(compliance_private.improvement_source_catalog()) s where s->>'id'=source_id and (existing or s->'active'='true'::jsonb))
$eligible$;
revoke all on function compliance_private.improvement_source_allowed(text,boolean) from public;
create function compliance_private.prepare_improvement_source_catalog(b jsonb,old jsonb,actor jsonb) returns jsonb language plpgsql security definer set search_path='' as $prepare$
declare rows_v jsonb; prior jsonb; r jsonb; ids text[]:=array[]::text[]; prior_ids text[]; i integer;
begin
 if actor->'active' is distinct from 'true'::jsonb or actor->>'role' not in ('owner','admin') or not compliance_private.allowed(actor,'manageUsers') then perform compliance_private.fail('FORBIDDEN');end if;
 -- Omission preserves the catalog before the original object-key validator.
 if not (b ? 'improvementSources') then
  if old ? 'improvementSources' then b:=b||jsonb_build_object('improvementSources',old->'improvementSources');end if;
  return b;
 end if;
 rows_v:=b->'improvementSources';
 if jsonb_typeof(rows_v) is distinct from 'array' then perform compliance_private.fail('INVALID_IMPROVEMENT_SOURCES');end if;
 prior:=coalesce(old->'improvementSources',compliance_private.improvement_source_catalog());
 for r in select * from jsonb_array_elements(rows_v) loop
  perform compliance_private.object_keys(r,array['id','name','active']);
  perform compliance_private.require_fields(r,array['id'],'string');perform compliance_private.require_fields(r,array['active'],'boolean');perform compliance_private.bi(r->'name');
  if r->>'id'=any(ids) or (r->>'id' not in ('non_external','external','management_review','management_directive','vessel_safety_meeting','company_safety_meeting','seminar','external_regulatory_impact') and r->>'id' !~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') or (btrim(r#>>'{name,en}',E' \t\n\r')='' and btrim(r#>>'{name,zh}',E' \t\n\r')='') or length(r#>>'{name,en}')>160 or length(r#>>'{name,zh}')>160 then perform compliance_private.fail('INVALID_IMPROVEMENT_SOURCE');end if;
  ids:=array_append(ids,r->>'id');
 end loop;
 select array_agg(x->>'id' order by n) into prior_ids from jsonb_array_elements(prior) with ordinality a(x,n);
 if cardinality(ids)<cardinality(prior_ids) or ids[1:cardinality(prior_ids)] is distinct from prior_ids then perform compliance_private.fail('IMPROVEMENT_SOURCE_IDENTITY');end if;
 return b;
end $prepare$;
revoke all on function compliance_private.prepare_improvement_source_catalog(jsonb,jsonb,jsonb) from public;
do $acl$
declare owner_name text;r text;fn regprocedure;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid='public.compliance_rpc(text,text,text,jsonb)'::regprocedure;
 foreach fn in array array['compliance_private.improvement_source_catalog()'::regprocedure,'compliance_private.improvement_source_allowed(text,boolean)'::regprocedure,'compliance_private.prepare_improvement_source_catalog(jsonb,jsonb,jsonb)'::regprocedure] loop
  execute format('alter function %s owner to %I',fn,owner_name);
  for r in select pg_catalog.pg_get_userbyid(a.grantee) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=fn and a.grantee<>0 and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,r);end loop;
 end loop;
end $acl$;
do $seams$
declare e record;p record;d text;
begin
 for e in select * from (values
 ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)',$old$declare validated jsonb;
begin$old$,$new$declare validated jsonb;
begin
 -- SOURCE-CATALOG-023: preserve old-client omission ahead of every validator.
 if kind='settings' then b:=compliance_private.prepare_improvement_source_catalog(b,old,actor);end if;$new$),
 ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',$old$when 'settings' then array['departments'$old$,$new$when 'settings' then array['improvementSources','departments'$new$),
 ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',$old$b->>'source' not in ('external','non_external','management_review','management_directive','vessel_safety_meeting','company_safety_meeting','seminar','external_regulatory_impact')$old$,$new$not compliance_private.improvement_source_allowed(b->>'source',old is not null and old->>'source'=b->>'source')$new$),
 ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',$old$b->>'source' not in ('management_review','management_directive','vessel_safety_meeting','company_safety_meeting','seminar','external_regulatory_impact')$old$,$new$b->>'source' in ('external','non_external')$new$),
 ('compliance_private.state(jsonb)',$old$'settings',(select body from saved where kind='settings' and id='settings')$old$,$new$'settings',(select case when actor->>'role'='management_viewer' then body-'improvementSources' else body end from saved where kind='settings' and id='settings')$new$),
 ('compliance_private.performance_dispatch(text,text,text,jsonb)',$old$else r.body end) order by r.kind,r.id)$old$,$new$when r.kind='settings' and actor_v->>'role'='management_viewer' then r.body-'improvementSources'
     else r.body end) order by r.kind,r.id)$new$),
 ('compliance_private.performance_dispatch(text,text,text,jsonb)',$old$'settings',(select body from chosen where kind='settings' and id='settings')$old$,$new$'settings',(select case when actor_v->>'role'='management_viewer' then body-'improvementSources' else body end from chosen where kind='settings' and id='settings')$new$)
 ) x(signature,needle,replacement) loop
  select * into strict p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  d:=replace(pg_catalog.pg_get_functiondef(p.oid),E'\r\n',E'\n');
  e.needle:=replace(e.needle,E'\r\n',E'\n');e.replacement:=replace(e.replacement,E'\r\n',E'\n');
  if (length(d)-length(replace(d,e.needle,'')))/length(e.needle)<>1 then raise exception 'IMPROVEMENT_SOURCE_CATALOG_SEAM_MISMATCH';end if;
  execute replace(d,e.needle,e.replacement);
  if not exists(select 1 from pg_catalog.pg_proc n where n.oid=p.oid and n.proowner=p.proowner and n.proacl is not distinct from p.proacl and n.proconfig is not distinct from p.proconfig and n.prosecdef=p.prosecdef and n.proargnames is not distinct from p.proargnames and n.prorettype=p.prorettype and n.prolang=p.prolang) then raise exception 'IMPROVEMENT_SOURCE_CATALOG_ATTRIBUTES_CHANGED';end if;
 end loop;
 for e in select * from (values
 ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','5b71ad8855409d7cf0771222443fc1db'),
 ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','24fa0a455624d159aa6d260e9fcf1273'),
 ('compliance_private.state(jsonb)','7c4aaf6da4d1470f4257cc2d49934897'),
 ('compliance_private.performance_dispatch(text,text,text,jsonb)','7662643f93ceebed5c325a376ee6af79'),
 ('compliance_private.improvement_source_catalog()','2a92eb52e6a1d7f4447f7b0292c1f133'),
 ('compliance_private.improvement_source_allowed(text,boolean)','ab0f90144ea543f346000096bea6ca81'),
 ('compliance_private.prepare_improvement_source_catalog(jsonb,jsonb,jsonb)','ec6a961e48c1310f458d121e4854c1db')
 ) x(signature,hash) loop
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(e.signature) and md5(replace(prosrc,E'\r\n',E'\n'))=e.hash) then raise exception 'IMPROVEMENT_SOURCE_CATALOG_POSTCHECK_FAILED: %',e.signature;end if;
 end loop;
end $seams$;
commit;
