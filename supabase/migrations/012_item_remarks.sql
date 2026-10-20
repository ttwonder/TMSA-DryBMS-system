-- TMSA / DRYBMS: independent, optional manual remarks on the current assessment.
-- Apply after 011. DDL only: no record, source, score or history rewrite.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $preflight$
begin
 if to_regprocedure('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)') is not null then raise exception 'ITEM_REMARKS_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='e6a79c1267240daafb8a0b1624d3c526')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='c96f6a5c2dcb4e766244f17204fa3a1c')
 then raise exception 'ITEM_REMARKS_UNKNOWN_PREDECESSOR';end if;
end $preflight$;
do $preserve$
declare definition text;
begin
 definition:=pg_catalog.pg_get_functiondef('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)'::regprocedure);
 definition:=replace(definition,'FUNCTION compliance_private.validate_record(','FUNCTION compliance_private.validate_record_before_item_remarks(');
 execute definition;
end $preserve$;
create or replace function compliance_private.validate_record(kind text,b jsonb,old jsonb,intent text,actor jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare validated jsonb;
begin
 if kind<>'assessment' then return compliance_private.validate_record_before_item_remarks(kind,b,old,intent,actor);end if;
 if b ? 'remarks' then perform compliance_private.require_fields(b,array['remarks'],'string');end if;
 if b ? 'remarksStatus' then
  perform compliance_private.require_fields(b,array['remarksStatus'],'string');
  if b->>'remarksStatus' not in ('','fully_met','partial_improvable','partial_blocked','not_met_improvable','not_met_blocked') then perform compliance_private.fail('INVALID_REMARKS_STATUS');end if;
 end if;
 validated:=compliance_private.validate_record_before_item_remarks(kind,b-'remarks'-'remarksStatus',old-'remarks'-'remarksStatus',intent,actor);
 -- Absence from an older client is not permission to erase a newer saved field.
 -- An explicit empty string clears the remarks through the same lease/CAS save.
 if b ? 'remarks' then validated:=validated||jsonb_build_object('remarks',b->'remarks');
 elsif old ? 'remarks' then validated:=validated||jsonb_build_object('remarks',old->'remarks');end if;
 if b ? 'remarksStatus' then validated:=validated||jsonb_build_object('remarksStatus',b->'remarksStatus');
 elsif old ? 'remarksStatus' then validated:=validated||jsonb_build_object('remarksStatus',old->'remarksStatus');end if;
 return validated;
end $$;
revoke all on function compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb) from public;
do $acl$
declare owner_name text;r text;fn regprocedure:='compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)'::regprocedure;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid='compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)'::regprocedure;
 execute format('alter function %s owner to %I',fn,owner_name);
 for r in select pg_catalog.pg_get_userbyid(a.grantee) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=fn and a.grantee<>0 and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,r);end loop;
end $acl$;
commit;
