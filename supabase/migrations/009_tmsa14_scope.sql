-- TMSA / DRYBMS only, AFTER 008. DDL only: no business-data rewrite.
-- Two independent optional booleans: framework = current scope; inspection = own scope.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $preflight$
begin
 if to_regprocedure('compliance_private.validate_record_before_tmsa14(text,jsonb,jsonb,text,jsonb)') is not null then raise exception 'TMSA14_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='41700e96e1ee29aeee1a6769c1e0a2f4')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.performance_dispatch(text,text,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='450cb932c8f10ecda72b5bca1fbfbb3c') then raise exception 'TMSA14_UNKNOWN_PREDECESSOR';end if;
end $preflight$;
do $clone$
begin
 execute replace(pg_catalog.pg_get_functiondef('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)'::regprocedure),'FUNCTION compliance_private.validate_record(','FUNCTION compliance_private.validate_record_before_tmsa14(');
end $clone$;
create or replace function compliance_private.validate_record(kind text,b jsonb,old jsonb,intent text,actor jsonb)
returns jsonb language plpgsql security definer set search_path='' as $validate$
declare result_v jsonb;policy_v jsonb;framework_id text;
begin
 if kind not in ('framework','inspection') then return compliance_private.validate_record_before_tmsa14(kind,b,old,intent,actor);end if;
 framework_id:=case when kind='framework' then b->>'id' else b->>'frameworkId' end;
 if b ? 'includeTmsaChapter14' then
  if framework_id is distinct from 'TMSA' or jsonb_typeof(b->'includeTmsaChapter14') is distinct from 'boolean' then perform compliance_private.fail('INVALID_TMSA14_SCOPE');end if;
  policy_v:=b->'includeTmsaChapter14';
 elsif old ? 'includeTmsaChapter14' then policy_v:=old->'includeTmsaChapter14';
 elsif kind='inspection' and framework_id='TMSA' and old is null and intent<>'import' then
  -- Old clients creating an inspection receive a one-time current default.
  -- Existing/imported histories lacking the field retain legacy INCLUDED semantics.
  select coalesce(body->'includeTmsaChapter14','false'::jsonb) into policy_v from compliance_private.records where records.kind='framework' and id='TMSA';
 end if;
 result_v:=compliance_private.validate_record_before_tmsa14(kind,b-'includeTmsaChapter14',old-'includeTmsaChapter14',intent,actor);
 if policy_v is not null then result_v:=result_v||jsonb_build_object('includeTmsaChapter14',policy_v);end if;
 return result_v;
end $validate$;
-- Preserve the original delta-query shape; add only present per-inspection policy.
do $projection$
declare definition text;needle text:=$old$case when r.body ? 'dryLevels' then jsonb_build_object('dryLevels',r.body->'dryLevels') else '{}'::jsonb end$old$;
begin
 definition:=pg_catalog.pg_get_functiondef('compliance_private.performance_dispatch(text,text,text,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'TMSA14_PROJECTION_SEAM_MISSING';end if;
 definition:=replace(definition,needle,needle||$new$||case when r.body ? 'includeTmsaChapter14' then jsonb_build_object('includeTmsaChapter14',r.body->'includeTmsaChapter14') else '{}'::jsonb end$new$);
 execute definition;
end $projection$;
revoke all on function compliance_private.validate_record_before_tmsa14(text,jsonb,jsonb,text,jsonb) from public;
do $acl$
declare owner_name text;r text;fn regprocedure:='compliance_private.validate_record_before_tmsa14(text,jsonb,jsonb,text,jsonb)'::regprocedure;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid='compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)'::regprocedure;
 execute format('alter function %s owner to %I',fn,owner_name);
 for r in select pg_catalog.pg_get_userbyid(a.grantee) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=fn and a.grantee<>0 and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,r);end loop;
end $acl$;
commit;
