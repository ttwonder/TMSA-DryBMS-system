-- 022: ordered improvement milestones and append-only causal journal.
-- After verified 021; DDL only, no data/backfill, no new browser capability.
-- Fixed hashes are derived from committed predecessors and explicit sources below.
-- Reinstallation is deliberately rejected; use the independent readback.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $preflight$
#variable_conflict use_column
declare e record;p record;changed boolean:=false;installed boolean:=false;
begin
 if to_regprocedure('compliance_private.prepare_improvement_milestones(jsonb,jsonb,text,jsonb)') is not null or to_regprocedure('compliance_private.milestone_rows_valid(jsonb)') is not null then raise exception 'IMPROVEMENT_MILESTONES_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 for e in select * from (values
  ('compliance_private.allowed(jsonb,text)','2b22e76491efe4bea47856cf22730ff4','2b22e76491efe4bea47856cf22730ff4'),
  ('compliance_private.dispatch(text,text,text,jsonb)','efc7dd87c1874844c6a3d5df6e43d52a','efc7dd87c1874844c6a3d5df6e43d52a'),
  ('compliance_private.improvement_matches(jsonb,jsonb)','fde8b933084d687c530a6cb3be0fa4ee','fde8b933084d687c530a6cb3be0fa4ee'),
  ('compliance_private.performance_dispatch(text,text,text,jsonb)','1d350f40ff41379be7f3bb14c1afe4ae','1d350f40ff41379be7f3bb14c1afe4ae'),
  ('compliance_private.refs(jsonb,text,boolean)','735605a70cefae48b0082c4c8230acc8','735605a70cefae48b0082c4c8230acc8'),
  ('compliance_private.state(jsonb)','3776ed715bd1165dbdf1056cee38eec7','3776ed715bd1165dbdf1056cee38eec7'),
  ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','ff892d3a2a84f742e229c18ec99d17b5','ff892d3a2a84f742e229c18ec99d17b5'),
  ('compliance_private.validate_record_before_item_remarks(text,jsonb,jsonb,text,jsonb)','e6a79c1267240daafb8a0b1624d3c526','e6a79c1267240daafb8a0b1624d3c526'),
  ('compliance_private.validate_record_finding_classes(text,jsonb,jsonb,text,jsonb)','73c115a07d7c0402148351d547a58cba','73c115a07d7c0402148351d547a58cba'),
  ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','45a098c4d69bd69ff22b63536fc24ed7','45a098c4d69bd69ff22b63536fc24ed7'),
  ('compliance_private.write_allowed(jsonb,text,text)','322d21749601a8fb572e326b035fc844','322d21749601a8fb572e326b035fc844'),
  ('public.compliance_rpc(text,text,text,jsonb)','999bb75b6d31297eeba8a5090ccb6ee2','999bb75b6d31297eeba8a5090ccb6ee2'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean)','63e2634760cdf3bd465726d7e2128320','63e2634760cdf3bd465726d7e2128320'),
  ('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)','8e071416d849b87785a6eafd47669d8b','8e071416d849b87785a6eafd47669d8b'),
  ('public.compliance_rpc(text,text,text,jsonb,text)','908e926425d02c04465599cfee58126f','908e926425d02c04465599cfee58126f')
 ) x(signature,pre,post) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  if not found or md5(replace(p.prosrc,E'\r\n',E'\n')) not in (e.pre,e.post) or not p.prosecdef or p.proconfig is distinct from (case e.signature when 'public.compliance_rpc(text,text,text,jsonb,boolean)' then array['search_path=""','statement_timeout=60s'] when 'public.compliance_rpc(text,text,text,jsonb,boolean,boolean)' then array['search_path=""','statement_timeout=15s'] when 'public.compliance_rpc(text,text,text,jsonb,text)' then array['search_path=""','statement_timeout=15s'] else array['search_path=""'] end) or p.proowner is distinct from (select proowner from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)')) then raise exception 'IMPROVEMENT_MILESTONES_UNKNOWN_PREDECESSOR: %',e.signature;end if;
  if e.pre<>e.post then
   changed:=changed or md5(replace(p.prosrc,E'\r\n',E'\n'))=e.pre;
   installed:=installed or md5(replace(p.prosrc,E'\r\n',E'\n'))=e.post;
  end if;
 end loop;
 if changed and installed then raise exception 'IMPROVEMENT_MILESTONES_MIXED_INSTALL';end if;
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='compliance_private' and a.privilege_type='EXECUTE' and a.grantee<>p.proowner)
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='compliance_rpc' and a.grantee=0)
 or exists(select 1 from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated') and pg_catalog.has_schema_privilege(r.oid,'compliance_private','USAGE'))
 or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join pg_catalog.pg_roles r where n.nspname='compliance_private' and c.relkind='r' and r.rolname in ('anon','authenticated') and pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace,lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a where n.nspname='compliance_private' and c.relkind='r' and a.grantee=0)
 or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join pg_catalog.pg_roles r where n.nspname='public' and p.proname='compliance_rpc' and r.rolname in ('anon','authenticated') and pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') is distinct from pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE')) or not exists(select 1 from pg_catalog.pg_roles r where r.rolname='anon' and pg_catalog.has_function_privilege(r.oid,to_regprocedure('public.compliance_rpc(text,text,text,jsonb)'),'EXECUTE'))
 then raise exception 'IMPROVEMENT_MILESTONES_UNEXPECTED_ACL';end if;
end $preflight$;

create function compliance_private.milestone_rows_valid(rows_v jsonb) returns void language plpgsql security definer set search_path='' as $rows$
declare r jsonb; k text; d text; ids text[]:=array[]::text[];
begin
 if jsonb_typeof(rows_v) is distinct from 'array' then perform compliance_private.fail('INVALID_MILESTONES');end if;
 for r in select * from jsonb_array_elements(rows_v) loop
  perform compliance_private.object_keys(r,array['id','goal','plannedDate','achievedDate']);
  perform compliance_private.require_fields(r,array['id','goal','plannedDate','achievedDate'],'string');
  if btrim(r->>'id',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' or btrim(r->>'goal',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' or r->>'id'=any(ids) then perform compliance_private.fail('INVALID_MILESTONE');end if;
  ids:=array_append(ids,r->>'id');
  foreach k in array array['plannedDate','achievedDate'] loop
   d:=r->>k;
   if k='plannedDate' or d<>'' then
    if d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or left(d,4)='0000' then perform compliance_private.fail('INVALID_MILESTONE_DATE');end if;
    begin
     if to_char(d::date,'YYYY-MM-DD')<>d then perform compliance_private.fail('INVALID_MILESTONE_DATE');end if;
    exception when datetime_field_overflow or invalid_datetime_format then perform compliance_private.fail('INVALID_MILESTONE_DATE');end;
   end if;
  end loop;
 end loop;
end $rows$;

create function compliance_private.prepare_improvement_milestones(b jsonb,old jsonb,intent text,actor jsonb) returns jsonb language plpgsql security definer set search_path='' as $milestones$
#variable_conflict use_column
declare rows_v jsonb:=coalesce(old->'milestones','[]'::jsonb); old_events jsonb:=coalesce(old->'milestoneEvents','[]'::jsonb);
 events_v jsonb; stamped jsonb; ev jsonb; r jsonb; prior jsonb; expected jsonb; after_v jsonb; target jsonb;
 saved_ids text[]:=array[]::text[]; seen_ids text[]:=array[]::text[]; event_ids text[]:=array[]::text[];
 i integer; j integer; idx integer; old_count integer; total integer; achieved integer; percent_v integer; delta integer; d text; kind_v text;
begin
 if not (b ?| array['milestones','milestoneEvents']) and not coalesce(old ?| array['milestones','milestoneEvents'],false) then return b;end if;
 if not (b ? 'milestones') and old ? 'milestones' then b:=b||jsonb_build_object('milestones',old->'milestones');end if;
 if not (b ? 'milestoneEvents') and old ? 'milestoneEvents' then b:=b||jsonb_build_object('milestoneEvents',old->'milestoneEvents');end if;
 if b ? 'milestones' then perform compliance_private.milestone_rows_valid(b->'milestones');end if;
 if b ? 'milestoneEvents' and jsonb_typeof(b->'milestoneEvents') is distinct from 'array' then perform compliance_private.fail('INVALID_MILESTONE_EVENT');end if;
 perform compliance_private.milestone_rows_valid(rows_v);
 events_v:=coalesce(b->'milestoneEvents',old_events);old_count:=jsonb_array_length(old_events);stamped:=old_events;
 if jsonb_array_length(events_v)<old_count or exists(select 1 from jsonb_array_elements(old_events) with ordinality x(v,n) where events_v->(n::integer-1) is distinct from v) then perform compliance_private.fail('MILESTONE_HISTORY_APPEND_ONLY');end if;
 if (old->>'status'='closed' or intent in ('close','reopen')) and (coalesce(b->'milestones',rows_v) is distinct from rows_v or events_v is distinct from old_events) then perform compliance_private.fail('MILESTONES_REOPEN_FIRST');end if;
 for r in select * from jsonb_array_elements(rows_v) loop saved_ids:=array_append(saved_ids,r->>'id');end loop;seen_ids:=saved_ids;
 for ev in select * from jsonb_array_elements(old_events) loop
  event_ids:=array_append(event_ids,ev->>'id');
  for r in select * from jsonb_array_elements((ev->'before')||(ev->'after')) loop seen_ids:=array_append(seen_ids,r->>'id');end loop;
 end loop;
 if jsonb_array_length(events_v)>old_count then
  for i in old_count..jsonb_array_length(events_v)-1 loop
   ev:=events_v->i;
   perform compliance_private.object_keys(ev,array['id','at','by','kind','milestoneId','reason','cascade','before','after']);
   perform compliance_private.require_fields(ev,array['id','at','by','kind','milestoneId','reason'],'string');
   perform compliance_private.require_fields(ev,array['cascade'],'boolean');
   perform compliance_private.milestone_rows_valid(ev->'before');perform compliance_private.milestone_rows_valid(ev->'after');
   if btrim(ev->>'id',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' or ev->>'id'=any(event_ids) then perform compliance_private.fail('INVALID_MILESTONE_EVENT');end if;
   event_ids:=array_append(event_ids,ev->>'id');after_v:=ev->'after';kind_v:=ev->>'kind';
   if rows_v is distinct from ev->'before' or rows_v=after_v then perform compliance_private.fail('MILESTONE_HISTORY_MISMATCH');end if;
   if kind_v='plan' then
    if ev->>'milestoneId'<>'' or ev->>'reason'<>'' or (ev->>'cascade')::boolean or jsonb_array_length(after_v)<jsonb_array_length(rows_v) then perform compliance_private.fail('INVALID_MILESTONE_PLAN');end if;
    for j in 0..jsonb_array_length(after_v)-1 loop
     r:=after_v->j;prior:=rows_v->j;
     if prior is not null then
      if r->'id' is distinct from prior->'id' or r->'achievedDate' is distinct from prior->'achievedDate' or prior->>'id'=any(saved_ids) and r->'plannedDate' is distinct from prior->'plannedDate' then perform compliance_private.fail('INVALID_MILESTONE_PLAN');end if;
     elsif r->>'id'=any(seen_ids) or r->>'achievedDate'<>'' then perform compliance_private.fail('INVALID_MILESTONE_PLAN');end if;
    end loop;
   else
    if kind_v not in ('achieve','correct','revoke','postpone','remove') or kind_v<>'postpone' and (ev->>'cascade')::boolean or kind_v not in ('revoke','postpone') and ev->>'reason'<>'' then perform compliance_private.fail('INVALID_MILESTONE_EVENT');end if;
    select n::integer-1,v into idx,prior from jsonb_array_elements(rows_v) with ordinality x(v,n) where v->>'id'=ev->>'milestoneId';
    if idx is null then perform compliance_private.fail('MILESTONE_NOT_FOUND');end if;
    expected:=rows_v;select v into target from jsonb_array_elements(after_v) v where v->>'id'=ev->>'milestoneId';
    if kind_v='remove' then expected:=rows_v-idx;
    elsif kind_v='revoke' then
     if prior->>'achievedDate'='' then perform compliance_private.fail('MILESTONE_NOT_ACHIEVED');end if;
     if btrim(ev->>'reason',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' then perform compliance_private.fail('MILESTONE_REASON_REQUIRED');end if;
     expected:=jsonb_set(expected,array[idx::text,'achievedDate'],'""'::jsonb);
    elsif kind_v='postpone' then
     if prior->>'achievedDate'<>'' then perform compliance_private.fail('MILESTONE_ALREADY_ACHIEVED');end if;
     if btrim(ev->>'reason',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' then perform compliance_private.fail('MILESTONE_REASON_REQUIRED');end if;
     d:=target->>'plannedDate';
     if d is null or d<=prior->>'plannedDate' then perform compliance_private.fail('MILESTONE_DATE_MUST_BE_LATER');end if;
     delta:=d::date-(prior->>'plannedDate')::date;
     for j in idx..jsonb_array_length(rows_v)-1 loop
      r:=rows_v->j;
      if j=idx or (ev->>'cascade')::boolean and r->>'achievedDate'='' then
       d:=to_char((r->>'plannedDate')::date+delta,'YYYY-MM-DD');
       expected:=jsonb_set(expected,array[j::text,'plannedDate'],to_jsonb(d));
      end if;
     end loop;
     perform compliance_private.milestone_rows_valid(expected);
    else
     if kind_v='achieve' and prior->>'achievedDate'<>'' then perform compliance_private.fail('MILESTONE_ALREADY_ACHIEVED');end if;
     if kind_v='correct' and prior->>'achievedDate'='' then perform compliance_private.fail('MILESTONE_NOT_ACHIEVED');end if;
     if coalesce(target->>'achievedDate','')='' then perform compliance_private.fail('INVALID_MILESTONE_DATE');end if;
     expected:=jsonb_set(expected,array[idx::text,'achievedDate'],target->'achievedDate');
    end if;
    if expected is distinct from after_v then perform compliance_private.fail('MILESTONE_HISTORY_MISMATCH');end if;
   end if;
   rows_v:=after_v;
   for r in select * from jsonb_array_elements(rows_v) loop if not r->>'id'=any(seen_ids) then seen_ids:=array_append(seen_ids,r->>'id');end if;end loop;
   stamped:=stamped||jsonb_build_array(ev||jsonb_build_object('at',clock_timestamp()::text,'by',actor->>'id'));
  end loop;
 end if;
 if rows_v is distinct from coalesce(b->'milestones',old->'milestones','[]'::jsonb) then perform compliance_private.fail('MILESTONE_HISTORY_MISMATCH');end if;
 total:=jsonb_array_length(rows_v);select count(*)::integer into achieved from jsonb_array_elements(rows_v) r where r->>'achievedDate'<>'';
 if total>0 then
  percent_v:=case when achieved=total then 100 else least(99,round(achieved*100.0/total)::integer) end;
  if b->'percent' is distinct from to_jsonb(percent_v) then perform compliance_private.fail('MILESTONE_PERCENT_MISMATCH');end if;
  if (intent='close' or b->>'status'='closed' and intent<>'reopen') and achieved<>total then perform compliance_private.fail('MILESTONES_INCOMPLETE');end if;
  perform compliance_private.require_fields(b,array['events'],'array');
  if exists(select 1 from jsonb_array_elements(b->'events') with ordinality e(v,n) where n>coalesce(jsonb_array_length(old->'events'),0) and v->'percent' is distinct from to_jsonb(percent_v)) then perform compliance_private.fail('MILESTONE_EVENT_PERCENT_MISMATCH');end if;
 end if;
 if b ? 'milestoneEvents' then b:=b||jsonb_build_object('milestoneEvents',stamped);end if;
 if jsonb_array_length(events_v)>old_count then
  perform compliance_private.require_fields(b,array['events'],'array');
  -- Original validator enforces the immutable progress prefix and stamps this summary.
  b:=b||jsonb_build_object('events',(b->'events')||jsonb_build_array(jsonb_build_object('id','milestones:'||(events_v->-1->>'id'),'at',clock_timestamp()::text,'by',actor->>'id','content',format('階段目標：已達成 %s/%s；異動 %s 筆 / Milestones: achieved %s/%s; %s changes (%s)',achieved,total,jsonb_array_length(events_v)-old_count,achieved,total,jsonb_array_length(events_v)-old_count,events_v->-1->>'kind'),'status',case intent when 'close' then 'closed' when 'reopen' then 'open' else b->>'status' end,'percent',b->'percent')));
 end if;
 return b;
end $milestones$;
revoke all on function compliance_private.milestone_rows_valid(jsonb) from public;
revoke all on function compliance_private.prepare_improvement_milestones(jsonb,jsonb,text,jsonb) from public;
do $acl$
declare owner_name text;r text;fn regprocedure;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid='public.compliance_rpc(text,text,text,jsonb)'::regprocedure;
 foreach fn in array array['compliance_private.milestone_rows_valid(jsonb)'::regprocedure,'compliance_private.prepare_improvement_milestones(jsonb,jsonb,text,jsonb)'::regprocedure] loop
  execute format('alter function %s owner to %I',fn,owner_name);
  for r in select pg_catalog.pg_get_userbyid(a.grantee) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=fn and a.grantee<>0 and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,r);end loop;
 end loop;
end $acl$;
do $seams$
#variable_conflict use_column
declare e record;p record;d text;
begin
 for e in select * from (values
 ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)',$old$declare validated jsonb;
begin$old$,$new$declare validated jsonb;
begin
 -- MILESTONES-022: authority before the original validator chain.
 if kind='improvement' then b:=compliance_private.prepare_improvement_milestones(b,old,intent,actor);end if;$new$),
 ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)',$old$when 'improvement' then array['chapterIds'$old$,$new$when 'improvement' then array['milestones','milestoneEvents','chapterIds'$new$)
 ) x(signature,needle,replacement) loop
  select * into strict p from pg_catalog.pg_proc where oid=to_regprocedure(e.signature);
  d:=replace(pg_catalog.pg_get_functiondef(p.oid),E'\r\n',E'\n');
  e.needle:=replace(e.needle,E'\r\n',E'\n');e.replacement:=replace(e.replacement,E'\r\n',E'\n');
  if (length(d)-length(replace(d,e.needle,'')))/length(e.needle)<>1 then raise exception 'IMPROVEMENT_MILESTONES_SEAM_MISMATCH';end if;
  execute replace(d,e.needle,e.replacement);
  if not exists(select 1 from pg_catalog.pg_proc n where n.oid=p.oid and n.proowner=p.proowner and n.proacl is not distinct from p.proacl and n.proconfig is not distinct from p.proconfig and n.prosecdef=p.prosecdef and n.proargnames is not distinct from p.proargnames and n.prorettype=p.prorettype and n.prolang=p.prolang) then raise exception 'IMPROVEMENT_MILESTONES_ATTRIBUTES_CHANGED';end if;
 end loop;
 for e in select * from (values
 ('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)','436871103836b8a12150d7f59d460102'),
 ('compliance_private.validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)','481c0de2d763a1eb8595f35e01e41153'),
 ('compliance_private.milestone_rows_valid(jsonb)','36186d839a236e26d2f6b2e2739d6697'),
 ('compliance_private.prepare_improvement_milestones(jsonb,jsonb,text,jsonb)','59c3bef36298bec0c0375322d339e038')
 ) x(signature,hash) loop
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure(e.signature) and md5(replace(prosrc,E'\r\n',E'\n'))=e.hash) then raise exception 'IMPROVEMENT_MILESTONES_POSTCHECK_FAILED: %',e.signature;end if;
 end loop;
end $seams$;

commit;
