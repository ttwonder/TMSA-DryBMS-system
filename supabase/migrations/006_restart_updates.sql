-- Dedicated TMSA / DRYBMS only; apply after 005. Installation does not reset any data.
-- User invokes the Owner-only atomic action through Management -> System / data.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $preflight$
begin
 if to_regprocedure('compliance_private.restart_updates(text,text,jsonb)') is not null then raise exception 'RESTART_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') and prosecdef and proargnames=array['p_action','p_session','p_client_id','p_payload','p_sync_mode'] and prosrc like '%p_sync_mode is distinct from ''performance-v1''%' and prosrc not like '%restart_updates%')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='8cdfdd4c2952564ff8b46f580625596e') then raise exception 'RESTART_UNKNOWN_PREDECESSOR';end if;
end $preflight$;

create function compliance_private.restart_updates(p_session text,p_client_id text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $restart$
#variable_conflict use_column
declare actor_v jsonb; fw text; op text; session_hash_v text; request_v jsonb; receipt_v compliance_private.operations; rec record; body_v jsonb; records_v jsonb:='[]'; holder_v text; blocked_id text; item_ids text[]; n integer:=0;
begin
 perform compliance_private.object_keys(p_payload,array['frameworkId','operationId']);
 if p_client_id is null or length(p_client_id) not between 1 and 160 then perform compliance_private.fail('INVALID_PAYLOAD');end if;
 actor_v:=compliance_private.actor(p_session);
 if actor_v->>'role' is distinct from 'owner' then perform compliance_private.fail('FORBIDDEN');end if;
 fw:=p_payload->>'frameworkId';op:=p_payload->>'operationId';
 if jsonb_typeof(p_payload->'frameworkId') is distinct from 'string' or fw not in ('TMSA','DRYBMS') then perform compliance_private.fail('INVALID_FRAMEWORK');end if;
 if jsonb_typeof(p_payload->'operationId') is distinct from 'string' or op !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$' then perform compliance_private.fail('INVALID_OPERATION_ID');end if;
 session_hash_v:=compliance_private.digest(p_session);request_v:=jsonb_build_object('action','restart_updates','requestDigest',compliance_private.digest(p_payload::text));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('operation:'||session_hash_v||':'||p_client_id||':'||op,0));
 select * into receipt_v from compliance_private.operations o where o.session_hash=session_hash_v and o.client_id=p_client_id and o.operation_id=op;
 if found then if receipt_v.request is distinct from request_v then perform compliance_private.fail('OPERATION_MISMATCH');end if;return receipt_v.result;end if;
 if not exists(select 1 from compliance_private.records where kind='framework' and id=fw) then perform compliance_private.fail('INVALID_FRAMEWORK');end if;
 -- Same exact advisory key as ordinary item/assessment claim/save. Acquire all
 -- selected-framework items (including inactive ones), never other frameworks.
 -- Freeze this admission's IDs once. Later creations must not join a write set
 -- whose exact item guards and leases have already been checked.
 select coalesce(array_agg(id order by id),array[]::text[]) into item_ids from compliance_private.records where kind='item' and body->>'frameworkId'=fw;
 for rec in select unnest(item_ids) id loop
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('record:item:'||rec.id,0)) then perform compliance_private.fail('WRITE_BUSY');end if;
 end loop;
 -- Do not steal anyone's renewable editor lease, including another Owner tab.
 select l.id into blocked_id from compliance_private.leases l join compliance_private.records i on i.kind='item' and i.id=l.id where l.kind='item' and l.id=any(item_ids) and i.body->>'frameworkId'=fw and l.expires_at>clock_timestamp() order by l.id limit 1;
 if blocked_id is not null then
  select p.body->>'name' into holder_v from compliance_private.leases l join compliance_private.sessions s on s.token_hash=l.session_hash join compliance_private.records p on p.kind='person' and p.id=s.person_id where l.kind='item' and l.id=blocked_id;
  raise exception using errcode='P0001',message='LEASE_HELD',detail=coalesce(holder_v,'另一位使用者');
 end if;
 -- Current server versions are materialized under the shared per-item guards;
 -- no stale client assessment bodies are submitted or overwritten.
 for rec in select a.id,a.version,a.body from compliance_private.records a join compliance_private.records i on i.kind='item' and i.id=a.body->>'itemId' where a.kind='assessment' and i.id=any(item_ids) and i.body->>'frameworkId'=fw and a.body->'reviewed'='true'::jsonb order by a.id for update of a loop
  body_v:=rec.body||jsonb_build_object('reviewed',false,'version',rec.version+1,'updatedAt',clock_timestamp()::text,'updatedBy',actor_v->>'id');
  update compliance_private.records set version=rec.version+1,body=body_v where kind='assessment' and id=rec.id and version=rec.version;
  if not found then perform compliance_private.fail('VERSION_CONFLICT');end if;
  perform compliance_private.log(actor_v,'restart_updates','assessment',rec.id,rec.body,body_v,op);
  records_v:=records_v||jsonb_build_array(body_v);n:=n+1;
 end loop;
 body_v:=jsonb_build_object('frameworkId',fw,'operationId',op,'changedCount',n,'records',records_v);
 insert into compliance_private.operations(session_hash,client_id,operation_id,request,result) values(session_hash_v,p_client_id,op,request_v,body_v);
 return body_v;
end $restart$;

-- Keep exactly four overloads and all existing legacy/performance behavior.
create or replace function public.compliance_rpc(p_action text,p_session text,p_client_id text,p_payload jsonb,p_sync_mode text)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='15s' as $route$
declare data jsonb; code_v text; detail_v text;
begin
 if p_sync_mode is distinct from 'performance-v1' or p_action is null or p_action not in ('sync','inspection_detail','save','role_permissions','export_authorize','restart_updates') then return jsonb_build_object('ok',false,'code','INVALID_PERFORMANCE_ROUTE','message','Invalid performance route.');end if;
 if p_action='restart_updates' then data:=compliance_private.restart_updates(p_session,p_client_id,p_payload);
 else data:=compliance_private.performance_dispatch(p_action,p_session,p_client_id,p_payload);end if;
 if p_action in ('save','role_permissions') then return data;end if;
 return jsonb_build_object('ok',true,'data',data);
exception when sqlstate 'P0001' then
 get stacked diagnostics code_v=message_text,detail_v=pg_exception_detail;
 if code_v='LEASE_HELD' then return jsonb_build_object('ok',false,'code',code_v,'message','Selected framework is being edited; no updates were reset.','holderName',detail_v);end if;
 return jsonb_build_object('ok',false,'code',code_v,'message','Server rejected performance operation: '||code_v);
when lock_not_available or deadlock_detected or serialization_failure then return jsonb_build_object('ok',false,'code','WRITE_BUSY','message','Retain the draft; admission is busy.');
when others then return jsonb_build_object('ok',false,'code','DB_'||sqlstate,'message','Performance transaction was not confirmed.');
end $route$;
revoke all on function compliance_private.restart_updates(text,text,jsonb) from public;
do $acl$
declare owner_name text;r text;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid='public.compliance_rpc(text,text,text,jsonb)'::regprocedure;
 execute format('alter function compliance_private.restart_updates(text,text,jsonb) owner to %I',owner_name);
 for r in select pg_catalog.pg_get_userbyid(a.grantee) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid='compliance_private.restart_updates(text,text,jsonb)'::regprocedure and a.grantee<>0 and a.grantee<>p.proowner loop execute format('revoke all on function compliance_private.restart_updates(text,text,jsonb) from %I',r);end loop;
end $acl$;
notify pgrst,'reload schema';
commit;
