-- Additive performance-v1 route for the dedicated TMSA / DRYBMS platform.
-- Apply AFTER 001+002+003+004. No business/identity/credential data writes.
-- The old four-, five-boolean and six-boolean RPC contracts remain unchanged.
-- Backend installation/readback precedes the user's frontend Push.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $preflight$
begin
 if to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') is not null then
  raise exception 'PERFORMANCE_ROUTE_ALREADY_INSTALLED_VERIFY_READBACK';
 end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)') and prosecdef and proconfig=array['search_path=""'] and md5(replace(prosrc,E'\r\n',E'\n'))='999bb75b6d31297eeba8a5090ccb6ee2')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean)') and prosecdef and proconfig=array['search_path=""','statement_timeout=60s'] and md5(replace(prosrc,E'\r\n',E'\n'))='63e2634760cdf3bd465726d7e2128320')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)') and prosecdef and proconfig=array['search_path=""','statement_timeout=15s'] and md5(replace(prosrc,E'\r\n',E'\n'))='8e071416d849b87785a6eafd47669d8b')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)') and prosecdef and proconfig=array['search_path=""'] and md5(replace(prosrc,E'\r\n',E'\n'))='8cdfdd4c2952564ff8b46f580625596e')
 or (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='compliance_rpc')<>3 then
  raise exception 'PERFORMANCE_UNKNOWN_PREDECESSOR';
 end if;
end $preflight$;

create function compliance_private.performance_dispatch(p_action text,p_session text,p_client_id text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $performance$
#variable_conflict use_column
declare actor_v jsonb; data jsonb; result_v jsonb; token_v text; related_v jsonb; kind_v text; selection_v jsonb; rec jsonb; target jsonb; export_id text; codes_v jsonb;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_client_id is null or length(p_client_id) not between 1 and 160 or octet_length(p_payload::text)>40000000 then perform compliance_private.fail('INVALID_PAYLOAD');end if;
 -- This holds the same credential-epoch admission lock as the legacy dispatcher.
 actor_v:=compliance_private.actor(p_session);
 if p_action='sync' then
  perform compliance_private.object_keys(p_payload,array['versions','metadataToken']);
  perform compliance_private.require_fields(p_payload,array['versions'],'object');
  if exists(select 1 from jsonb_each(p_payload->'versions') e where jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[0-9]{1,10}$' or e.value::numeric>2147483647) then perform compliance_private.fail('INVALID_VERSION_VECTOR');end if;
  -- Do not materialize unchanged TOAST bodies: scan only kind/id/version metadata.
  -- All vector, changed bodies, control metadata and summaries share ONE snapshot.
  with vector as materialized(select coalesce(jsonb_object_agg(kind||':'||id,version),'{}'::jsonb) v from compliance_private.records),
  summaries as materialized(select a.id,a.at,a.actor_id,a.actor_name,a.action,a.kind,a.entity_id,a.item_codes,a.summary,a.operation_id from compliance_private.audit a where compliance_private.allowed(actor_v,'viewAuditLogs') order by a.at desc,a.id limit 200)
  select jsonb_build_object(
   'user',actor_v,'versions',vector.v,'baseline',p_payload->'versions'='{}'::jsonb,
   'records',coalesce((select jsonb_agg(jsonb_build_object('kind',r.kind,'body',case when r.kind='inspection' then
     (select jsonb_object_agg(k,v) from jsonb_each(r.body) e(k,v) where k=any(array['id','version','createdAt','updatedAt','updatedBy','frameworkId','title','organization','date','type','status','supersedesId','imported']))||jsonb_build_object(
      'detail','summary','counts',jsonb_build_object('chapters',jsonb_array_length(r.body#>'{snapshot,chapters}'),'items',jsonb_array_length(r.body#>'{snapshot,items}'),'results',jsonb_array_length(r.body->'results'),'findings',jsonb_array_length(r.body->'findings')),
      'scoring',jsonb_build_object('frameworkId',r.body->'frameworkId','snapshot',jsonb_build_object(
       'chapters',coalesce((select jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(x) e(k,v) where k=any(array['id','frameworkId','active','order'])) order by n) from jsonb_array_elements(r.body#>'{snapshot,chapters}') with ordinality a(x,n)),'[]'::jsonb),
       'items',coalesce((select jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(x) e(k,v) where k=any(array['id','chapterId','code','level','active','sourceGap','sourceGapResolved'])) order by n) from jsonb_array_elements(r.body#>'{snapshot,items}') with ordinality a(x,n)),'[]'::jsonb)),
       'results',coalesce((select jsonb_agg((select jsonb_object_agg(k,v) from jsonb_each(x) e(k,v) where k=any(array['itemId','response','conformity','reviewed'])) order by n) from jsonb_array_elements(r.body->'results') with ordinality a(x,n)),'[]'::jsonb))||case when r.body ? 'dryLevels' then jsonb_build_object('dryLevels',r.body->'dryLevels') else '{}'::jsonb end)
     else r.body end) order by r.kind,r.id) from compliance_private.records r where p_payload->'versions'->(r.kind||':'||r.id) is distinct from to_jsonb(r.version)),'[]'::jsonb),
   'metadataToken',ctl.xmin::text||':'||ctl.ctid::text,
   'historyMode','readonly-summary-v1',
   'controlSummary',jsonb_build_object('cycles',jsonb_array_length(ctl.cycles),'provenance',jsonb_array_length(ctl.provenance)),
   'auditLogs',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'at',a.at,'actorId',a.actor_id,'actorName',a.actor_name,'action',a.action,'kind',a.kind,'entityId',a.entity_id,'itemCodes',a.item_codes,'summary',a.summary,'operationId',a.operation_id) order by a.at desc,a.id) from summaries a),'[]'::jsonb),
   'serverTime',clock_timestamp()::text,
   'snapshotToken','performance-v1:'||compliance_private.digest(jsonb_build_object('versions',vector.v,'metadataToken',ctl.xmin::text||':'||ctl.ctid::text)::text))
  into data from vector cross join compliance_private.control ctl where ctl.singleton;
  return data;
 elsif p_action='inspection_detail' then
  perform compliance_private.object_keys(p_payload,array['id','version']);
  perform compliance_private.require_fields(p_payload,array['id'],'string');
  if jsonb_typeof(p_payload->'version') is distinct from 'number' or p_payload->>'version' !~ '^[0-9]{1,10}$' then perform compliance_private.fail('INVALID_DETAIL_VERSION');end if;
  select jsonb_build_object('inspection',r.body,'metadataToken',ctl.xmin::text||':'||ctl.ctid::text) into data from compliance_private.records r cross join compliance_private.control ctl where r.kind='inspection' and r.id=p_payload->>'id' and ctl.singleton;
  if data is null then perform compliance_private.fail('RECORD_NOT_FOUND');end if;
  if data#>>'{inspection,version}' is distinct from p_payload->>'version' then perform compliance_private.fail('STALE_DETAIL');end if;
  return data;
 elsif p_action in ('save','role_permissions') then
  -- Keep original lease/CAS/idempotency admission and immutable request digest.
  result_v:=public.compliance_rpc(p_action,p_session,p_client_id,p_payload);
  if not coalesce((result_v->>'ok')::boolean,false) then return result_v;end if;
  data:=result_v->'data';related_v:='[]'::jsonb;
  if p_payload->>'kind'='item' then
   -- Replay returns the original secondary ACK, not a later independently edited row.
   select coalesce(jsonb_agg(jsonb_build_object('kind','assessment','body',a.after_value) order by a.entity_id),'[]'::jsonb) into related_v
   from compliance_private.audit a join compliance_private.operations o on o.session_hash=compliance_private.digest(p_session) and o.client_id=p_client_id and o.operation_id=p_payload->>'operationId'
   where a.action='requirement_reconfirmation' and a.operation_id=o.operation_id and a.actor_id=actor_v->>'id' and a.after_value->>'itemId'=data->>'id'
    and a.at>=(data->>'updatedAt')::timestamptz and a.at<=o.at;
  end if;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('record',data,'related',related_v));
 elsif p_action='export_authorize' then
  if not compliance_private.allowed(actor_v,'exportReports') then perform compliance_private.fail('FORBIDDEN');end if;
  perform compliance_private.object_keys(p_payload,array['format','kind','ids','frameworkId','filters','snapshotToken','operationId']);
  perform compliance_private.require_fields(p_payload,array['ids'],'array');
  perform compliance_private.require_fields(p_payload,array['format','kind','snapshotToken'],'string');
  kind_v:=p_payload->>'kind';selection_v:=p_payload->'ids';
  if p_payload->>'format' not in ('xlsx','pdf') or kind_v not in ('framework','improvements','inspection','overview') or p_payload->>'format'='xlsx' and kind_v<>'framework' then perform compliance_private.fail('INVALID_EXPORT');end if;
  if jsonb_array_length(selection_v)=0 then perform compliance_private.fail('EMPTY_SELECTION');end if;
  if jsonb_array_length(selection_v)<>(select count(distinct x#>>'{}') from jsonb_array_elements(selection_v) x) then perform compliance_private.fail('INVALID_SELECTION');end if;
  if kind_v='inspection' and jsonb_array_length(selection_v)<>1 then perform compliance_private.fail('INVALID_SELECTION');end if;
  for rec in select * from jsonb_array_elements(selection_v) loop
   if jsonb_typeof(rec)<>'string' then perform compliance_private.fail('INVALID_SELECTION');end if;
   if kind_v='improvements' then
    select body into target from compliance_private.records where kind='improvement' and id=rec#>>'{}';
    if target is null or not coalesce(compliance_private.improvement_matches(target,coalesce(p_payload->'filters','{}')),false) then perform compliance_private.fail('INVALID_SELECTION');end if;
   elsif kind_v='inspection' then
    if not exists(select 1 from compliance_private.records where kind='inspection' and id=rec#>>'{}') then perform compliance_private.fail('INVALID_SELECTION');end if;
   else
    if not exists(select 1 from compliance_private.records where kind in ('framework','chapter','item') and id=rec#>>'{}' and body->'active'='true'::jsonb and coalesce(body->>'frameworkId',id)=p_payload->>'frameworkId') then perform compliance_private.fail('INVALID_SELECTION');end if;
   end if;
  end loop;
  -- Build only the selected complete scope and mandatory related records.
  -- The freshness vector and every returned body share this statement's MVCC snapshot.
  with vector as materialized(select coalesce(jsonb_object_agg(kind||':'||id,version),'{}'::jsonb) v from compliance_private.records),
  selected_inspections as materialized(
   select r.* from compliance_private.records r where r.kind='inspection' and (
    kind_v='inspection' and selection_v ? r.id or
    kind_v='improvements' and exists(select 1 from compliance_private.records i where i.kind='improvement' and selection_v ? i.id and i.body->>'inspectionId'=r.id) or
    kind_v='overview' and r.id=(select z.id from compliance_private.records z where z.kind='inspection' and z.body->>'frameworkId'=p_payload->>'frameworkId' and z.body->>'status'='final' order by z.body->>'date' desc,z.body->>'createdAt' desc,z.id limit 1))),
  selected_items as materialized(
   select r.* from compliance_private.records r where r.kind='item' and (
    kind_v in ('framework','overview') and r.body->'active'='true'::jsonb and r.body->>'frameworkId'=p_payload->>'frameworkId' and (selection_v ? r.id or selection_v ? (r.body->>'chapterId') or selection_v ? (r.body->>'frameworkId')) or
    kind_v='improvements' and exists(select 1 from compliance_private.records i where i.kind='improvement' and selection_v ? i.id and i.body->'itemIds' ? r.id) or
    kind_v='inspection' and exists(select 1 from selected_inspections i cross join lateral jsonb_array_elements(i.body->'snapshot'->'items') s where s->>'id'=r.id))),
  selected_improvements as materialized(
   select r.* from compliance_private.records r where r.kind='improvement' and (
    kind_v='improvements' and selection_v ? r.id or
    kind_v in ('framework','overview') and exists(select 1 from selected_items i where r.body->'itemIds' ? i.id) or
    kind_v='inspection' and exists(select 1 from selected_inspections i where r.body->>'inspectionId'=i.id))),
  selected_assessments as materialized(select r.* from compliance_private.records r where r.kind='assessment' and exists(select 1 from selected_items i where i.id=r.body->>'itemId')),
  selected_chapters as materialized(select r.* from compliance_private.records r where r.kind='chapter' and (exists(select 1 from selected_items i where i.body->>'chapterId'=r.id) or kind_v in ('framework','overview') and r.body->'active'='true'::jsonb and r.body->>'frameworkId'=p_payload->>'frameworkId' and (selection_v ? r.id or selection_v ? (r.body->>'frameworkId')))),
  chosen as materialized(
   select * from selected_items union all select * from selected_improvements union all select * from selected_assessments union all select * from selected_inspections union all select * from selected_chapters
   union all select r.* from compliance_private.records r where r.kind='settings'
    or r.kind='framework' and (r.id=p_payload->>'frameworkId' or exists(select 1 from selected_chapters c where c.body->>'frameworkId'=r.id) or exists(select 1 from selected_inspections i where i.body->>'frameworkId'=r.id))
    or r.kind='dryScore' and exists(select 1 from selected_chapters c where c.id=r.body->>'chapterId')
    -- Names used by selected progress/closure stay resolvable, including inactive historical authors.
    or r.kind='person' and (r.id=actor_v->>'id' or exists(select 1 from selected_improvements i where i.body->'assigneeIds' ? r.id or i.body->>'closedBy'=r.id or exists(select 1 from jsonb_array_elements(i.body->'events') ev where ev->>'by'=r.id)) or exists(select 1 from selected_assessments a where a.body->'assigneeIds' ? r.id)))
  select jsonb_build_object(
   'frameworks',coalesce((select jsonb_agg(body order by id) from chosen where kind='framework'),'[]'::jsonb),
   'chapters',coalesce((select jsonb_agg(body order by id) from chosen where kind='chapter'),'[]'::jsonb),
   'items',coalesce((select jsonb_agg(body order by id) from chosen where kind='item'),'[]'::jsonb),
   'assessments',coalesce((select jsonb_agg(body order by id) from chosen where kind='assessment'),'[]'::jsonb),
   'improvements',coalesce((select jsonb_agg(body order by id) from chosen where kind='improvement'),'[]'::jsonb),
   'inspections',coalesce((select jsonb_agg(body order by id) from chosen where kind='inspection'),'[]'::jsonb),
   'people',coalesce((select jsonb_agg(body order by id) from chosen where kind='person'),'[]'::jsonb),
   'dryScores',coalesce((select jsonb_agg(body order by id) from chosen where kind='dryScore'),'[]'::jsonb),
   'settings',(select body from chosen where kind='settings' and id='settings'),
   'cycles','[]'::jsonb,'provenance','[]'::jsonb,'auditLogs','[]'::jsonb,'serverTime',clock_timestamp()::text,
   'snapshotToken','performance-v1:'||compliance_private.digest(jsonb_build_object('versions',vector.v,'metadataToken',ctl.xmin::text||':'||ctl.ctid::text)::text))
  into data from vector cross join compliance_private.control ctl where ctl.singleton;
  if p_payload->>'snapshotToken' is distinct from data->>'snapshotToken' then perform compliance_private.fail('SNAPSHOT_STALE');end if;
  -- Recheck selection against the actual coherent projection, not earlier reads.
  for rec in select * from jsonb_array_elements(selection_v) loop
   if kind_v='improvements' then
    select x into target from jsonb_array_elements(data->'improvements') x where x->>'id'=rec#>>'{}';
    if target is null or not coalesce(compliance_private.improvement_matches(target,coalesce(p_payload->'filters','{}')),false) then perform compliance_private.fail('INVALID_SELECTION');end if;
   elsif kind_v='inspection' then
    if not exists(select 1 from jsonb_array_elements(data->'inspections') x where x->>'id'=rec#>>'{}') then perform compliance_private.fail('INVALID_SELECTION');end if;
   else
    if not exists(select 1 from jsonb_array_elements((data->'frameworks')||(data->'chapters')||(data->'items')) x where x->>'id'=rec#>>'{}' and x->'active'='true'::jsonb and coalesce(x->>'frameworkId',x->>'id')=p_payload->>'frameworkId') then perform compliance_private.fail('INVALID_SELECTION');end if;
   end if;
  end loop;
  export_id:=pg_catalog.gen_random_uuid()::text;
  insert into compliance_private.exports values(export_id,actor_v->>'id',p_payload,data,clock_timestamp());
  select coalesce(jsonb_agg(code order by code),'[]') into codes_v from (
   select distinct x->>'code' code from jsonb_array_elements(data->'items') x
   union select distinct x->>'code' from jsonb_array_elements(data->'inspections') i cross join lateral jsonb_array_elements(i->'snapshot'->'items') x where kind_v='inspection') codes where code is not null;
  perform compliance_private.log(actor_v,'export_authorize','export',export_id,null,jsonb_build_object('format',p_payload->>'format','kind',kind_v,'selectedIds',selection_v,'filters',compliance_private.safe(p_payload->'filters'),'snapshotToken',data->>'snapshotToken','snapshotReceipt',export_id),coalesce(p_payload->>'operationId',export_id),codes_v);
  return data;
 end if;
 perform compliance_private.fail('INVALID_PERFORMANCE_ROUTE');return null;
end $performance$;

create function public.compliance_rpc(p_action text,p_session text,p_client_id text,p_payload jsonb,p_sync_mode text)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='15s' as $route$
declare data jsonb; code_v text;
begin
 if p_sync_mode is distinct from 'performance-v1' or p_action is null or p_action not in ('sync','inspection_detail','save','role_permissions','export_authorize') then return jsonb_build_object('ok',false,'code','INVALID_PERFORMANCE_ROUTE','message','Invalid performance route.');end if;
 data:=compliance_private.performance_dispatch(p_action,p_session,p_client_id,p_payload);
 if p_action in ('save','role_permissions') then return data;end if;
 return jsonb_build_object('ok',true,'data',data);
exception when sqlstate 'P0001' then
 get stacked diagnostics code_v=message_text;
 return jsonb_build_object('ok',false,'code',code_v,'message','Server rejected performance operation: '||code_v);
when lock_not_available or deadlock_detected or serialization_failure then return jsonb_build_object('ok',false,'code','WRITE_BUSY','message','Retain the draft; admission is busy.');
when others then return jsonb_build_object('ok',false,'code','DB_'||sqlstate,'message','Performance transaction was not confirmed.');
end $route$;
revoke all on function compliance_private.performance_dispatch(text,text,text,jsonb) from public;
revoke all on function public.compliance_rpc(text,text,text,jsonb,text) from public;
do $acl$
declare r text; owner_name text; oid_v oid;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid='public.compliance_rpc(text,text,text,jsonb)'::regprocedure;
 execute format('alter function compliance_private.performance_dispatch(text,text,text,jsonb) owner to %I',owner_name);
 execute format('alter function public.compliance_rpc(text,text,text,jsonb,text) owner to %I',owner_name);
 for oid_v in select oid from pg_catalog.pg_proc where oid in ('compliance_private.performance_dispatch(text,text,text,jsonb)'::regprocedure,'public.compliance_rpc(text,text,text,jsonb,text)'::regprocedure) loop
  for r in select pg_catalog.pg_get_userbyid(a.grantee) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=oid_v and a.grantee<>0 and a.grantee<>p.proowner loop
   execute format('revoke all on function %s from %I',oid_v::regprocedure,r);
  end loop;
 end loop;
 for r in select rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated') loop
  if pg_catalog.has_function_privilege(r,'public.compliance_rpc(text,text,text,jsonb)'::regprocedure,'EXECUTE') then execute format('grant execute on function public.compliance_rpc(text,text,text,jsonb,text) to %I',r);end if;
 end loop;
end $acl$;
comment on function public.compliance_rpc(text,text,text,jsonb,text) is 'performance-v1: authoritative complete version-vector deltas, canonical primary/secondary save ACK, selected complete atomic export; original RPCs unchanged.';
notify pgrst, 'reload schema';
commit;
