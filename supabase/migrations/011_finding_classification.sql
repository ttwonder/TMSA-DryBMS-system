-- TMSA / DRYBMS only, after 009/010. DDL only; no record rewrite or reimport.
-- Source classification is authoritative on the inspection finding, never duplicated on actions.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $preflight$
begin
 if to_regprocedure('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)') is not null
 or to_regprocedure('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)') is not null then raise exception 'FINDING_CLASSES_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='56a451484c49501edf829de05e26ed80')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record_before_tmsa14(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='41700e96e1ee29aeee1a6769c1e0a2f4')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record_history_rules(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='864fdf4f6de7cfc217eeea488079633a')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.performance_dispatch(text,text,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='1ce567371211cc23e321773344b91fd7')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.restart_updates(text,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='25d528d967082e586c008e716d87cbfa')
 then raise exception 'FINDING_CLASSES_UNKNOWN_PREDECESSOR';end if;
end $preflight$;
-- Clone effective rules; all prior archival helpers remain byte-identical.
do $rules$
declare definition text;external_needle text:=$old$rowv->>'classification' not in ('finding','general')$old$;finding_needle text:=$old$v->>'classification' not in ('finding','positive','guidance','no_finding','general')$old$;
begin
 definition:=pg_catalog.pg_get_functiondef('compliance_private.validate_record_history_rules(text,jsonb,jsonb,text,jsonb)'::regprocedure);
 if position(external_needle in definition)=0 or position(finding_needle in definition)=0 then raise exception 'FINDING_CLASSES_RULE_SEAM_MISSING';end if;
 definition:=replace(definition,'FUNCTION compliance_private.validate_record_history_rules(','FUNCTION compliance_private.validate_record_finding_classes_rules(');
 definition:=replace(definition,external_needle,$new$rowv->>'classification' not in ('finding','ofi','general')$new$);
 definition:=replace(definition,finding_needle,$new$v->>'classification' not in ('finding','ofi','positive','guidance','no_finding','general')$new$);
 execute definition;
end $rules$;
do $history$
declare definition text;needle text:=$old$(n->'classification' is distinct from f->'classification' or n->'itemIds' is distinct from f->'itemIds')$old$;
begin
 definition:=pg_catalog.pg_get_functiondef('compliance_private.validate_record_before_tmsa14(text,jsonb,jsonb,text,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'FINDING_CLASSES_LINK_SEAM_MISSING';end if;
 definition:=replace(definition,'FUNCTION compliance_private.validate_record_before_tmsa14(','FUNCTION compliance_private.validate_record_finding_classes(');
 definition:=replace(definition,'compliance_private.validate_record_history_rules(','compliance_private.validate_record_finding_classes_rules(');
 definition:=replace(definition,needle,$new$(n->'itemIds' is distinct from f->'itemIds' or (n->'classification' is distinct from f->'classification' and not (f->>'classification' in ('finding','ofi') and n->>'classification' in ('finding','ofi'))))$new$);
 execute definition;
 -- Preserve TMSA14 policy handling exactly; only route to the extended rules.
 definition:=pg_catalog.pg_get_functiondef('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)'::regprocedure);
 definition:=replace(definition,'compliance_private.validate_record_before_tmsa14(','compliance_private.validate_record_finding_classes(');
 execute definition;
end $history$;
-- A tiny source-ID/classification projection enables all action views to follow
-- confirmed inspection revisions without downloading narrative snapshots or dual-writing actions.
do $projection$
declare definition text;needle text:=$old$'detail','summary','counts'$old$;
begin
 definition:=pg_catalog.pg_get_functiondef('compliance_private.performance_dispatch(text,text,text,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'FINDING_CLASSES_PROJECTION_SEAM_MISSING';end if;
 definition:=replace(definition,needle,$new$'detail','summary','findingClassifications',coalesce((select jsonb_object_agg(f->>'id',f->'classification') from jsonb_array_elements(r.body->'findings') f),'{}'::jsonb),'counts'$new$);
 execute definition;
end $projection$;
revoke all on function compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb) from public;
revoke all on function compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb) from public;
do $acl$
declare owner_name text;r text;fn regprocedure;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid='compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)'::regprocedure;
 foreach fn in array array['compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)'::regprocedure,'compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)'::regprocedure] loop
  execute format('alter function %s owner to %I',fn,owner_name);
  for r in select pg_catalog.pg_get_userbyid(a.grantee) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=fn and a.grantee<>0 and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,r);end loop;
 end loop;
end $acl$;
commit;
