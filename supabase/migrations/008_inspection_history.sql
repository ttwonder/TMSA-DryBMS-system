-- TMSA / DRYBMS only; after 007. No business-data update or reimport.
-- Supersedes only the historical inspection read-only/copy workflow.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $preflight$
begin
 if to_regprocedure('compliance_private.validate_record_history_rules(text,jsonb,jsonb,text,jsonb)') is not null then raise exception 'INSPECTION_HISTORY_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='7998f089736bd984cddd7e940672a143')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record_before_shared_targets(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='037cfe64cf3e317605dbc4851d8553f4')
 then raise exception 'INSPECTION_HISTORY_UNKNOWN_PREDECESSOR';end if;
end $preflight$;
-- Clone the exact installed original; leave its archival definition untouched.
do $clone$
declare definition text;
begin
 definition:=pg_catalog.pg_get_functiondef('compliance_private.validate_record_before_shared_targets(text,jsonb,jsonb,text,jsonb)'::regprocedure);
 definition:=replace(definition,'FUNCTION compliance_private.validate_record_before_shared_targets(','FUNCTION compliance_private.validate_record_history_rules(');
 definition:=replace(definition,$old$if old->>'status'='final' then perform compliance_private.fail('FINAL_SNAPSHOT_IMMUTABLE');end if;$old$,$new$if old->>'status'='final' and b->>'status'<>'final' then perform compliance_private.fail('FINAL_STATUS_REQUIRED');end if;$new$);
 definition:=replace(definition,$old$when intent='finalize' or intent='import' and b->>'status'='final' then 'final'$old$,$new$when old->>'status'='final' or intent='finalize' or intent='import' and b->>'status'='final' then 'final'$new$);
 execute definition;
end $clone$;
create or replace function compliance_private.validate_record(kind text,b jsonb,old jsonb,intent text,actor jsonb)
returns jsonb language plpgsql security definer set search_path='' as $validate$
declare result_v jsonb;
begin

 if kind='inspection' and old is not null then
  -- Existing source locators and finding identities are not editable evidence.
  if exists(select 1 from jsonb_array_elements(old->'findings') f where not exists(
   select 1 from jsonb_array_elements(b->'findings') n where n->>'id'=f->>'id' and n->'sources' is not distinct from f->'sources' and n->'warning' is not distinct from f->'warning'
  )) then perform compliance_private.fail('IMMUTABLE_FINDING_SOURCE');end if;
  if exists(select 1 from compliance_private.records r,jsonb_array_elements(old->'findings') f,jsonb_array_elements(b->'findings') n
   where r.kind='improvement' and r.body->>'inspectionId'=old->>'id' and r.body->>'findingId'=f->>'id' and n->>'id'=f->>'id'
   and (n->'classification' is distinct from f->'classification' or n->'itemIds' is distinct from f->'itemIds')) then perform compliance_private.fail('LINKED_FINDING_IDENTITY');end if;
 end if;
 if kind='improvement' and old is not null and intent<>'import' and jsonb_array_length(b->'events')>jsonb_array_length(old->'events')
  and b-array['events','version','createdAt','updatedAt','updatedBy'] = old-array['events','version','createdAt','updatedAt','updatedBy']
  and not exists(select 1 from jsonb_array_elements(b->'events') with ordinality e(v,n) where n>jsonb_array_length(old->'events') and (length(btrim(v->>'content'))>0 or v->'percent' is distinct from old->'percent' or v->'status' is distinct from old->'status'))
 then perform compliance_private.fail('EMPTY_PROGRESS');end if;
 if kind='framework' then
  if b ? 'scoreTargets' and b->'scoreTargets' is distinct from old->'scoreTargets' then perform compliance_private.fail('TARGETS_USE_DEDICATED_SAVE');end if;
  result_v:=compliance_private.validate_record_before_shared_targets(kind,b-'scoreTargets',old-'scoreTargets',intent,actor);
  if old ? 'scoreTargets' then result_v:=result_v||jsonb_build_object('scoreTargets',old->'scoreTargets');end if;
  return result_v;
 end if;
 return compliance_private.validate_record_history_rules(kind,b,old,intent,actor);
end $validate$;
revoke all on function compliance_private.validate_record_history_rules(text,jsonb,jsonb,text,jsonb) from public;
do $acl$
declare owner_name text;r text;fn regprocedure:='compliance_private.validate_record_history_rules(text,jsonb,jsonb,text,jsonb)'::regprocedure;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid='compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)'::regprocedure;
 execute format('alter function %s owner to %I',fn,owner_name);
 for r in select pg_catalog.pg_get_userbyid(a.grantee) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=fn and a.grantee<>0 and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,r);end loop;
end $acl$;
commit;
