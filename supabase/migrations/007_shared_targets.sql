-- Dedicated TMSA / DRYBMS only, after 006. Installation does not save/reset goals.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $preflight$
begin
 if to_regprocedure('compliance_private.save_shared_targets(text,text,jsonb)') is not null then raise exception 'SHARED_TARGETS_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,text)') and md5(replace(prosrc,E'\r\n',E'\n'))='b3516f7a0b36f5083a213c8e934d0596')
 or not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='8cdfdd4c2952564ff8b46f580625596e') then raise exception 'SHARED_TARGETS_UNKNOWN_PREDECESSOR';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)') and md5(replace(prosrc,E'\r\n',E'\n'))='037cfe64cf3e317605dbc4851d8553f4') or to_regprocedure('compliance_private.validate_record_before_shared_targets(text,jsonb,jsonb,text,jsonb)') is not null then raise exception 'SHARED_TARGETS_UNKNOWN_VALIDATOR';end if;
end $preflight$;

-- Preserve the exact predecessor validator for every existing field/record kind.
do $clone$
begin
 execute replace(pg_catalog.pg_get_functiondef('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)'::regprocedure),'FUNCTION compliance_private.validate_record(','FUNCTION compliance_private.validate_record_before_shared_targets(');
end $clone$;
create or replace function compliance_private.validate_record(kind text,b jsonb,old jsonb,intent text,actor jsonb)
returns jsonb language plpgsql security definer set search_path='' as $validate$
declare result_v jsonb;
begin
 if kind='framework' then
  if b ? 'scoreTargets' and b->'scoreTargets' is distinct from old->'scoreTargets' then perform compliance_private.fail('TARGETS_USE_DEDICATED_SAVE');end if;
  result_v:=compliance_private.validate_record_before_shared_targets(kind,b-'scoreTargets',old-'scoreTargets',intent,actor);
  if old ? 'scoreTargets' then result_v:=result_v||jsonb_build_object('scoreTargets',old->'scoreTargets');end if;
  return result_v;
 end if;
 return compliance_private.validate_record_before_shared_targets(kind,b,old,intent,actor);
end $validate$;
revoke all on function compliance_private.validate_record_before_shared_targets(text,jsonb,jsonb,text,jsonb) from public;

-- Goal authority is Owner/admin, independent of framework-definition capability.
-- Reuse the exact framework lease so definition edits and goal saves still fence.
create function compliance_private.claim_shared_targets(p_session text,p_client_id text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $claim$
#variable_conflict use_column
declare actor_v jsonb;fw text;session_hash_v text;lease_v compliance_private.leases;version_v integer;token_v text;holder_v text;
begin
 perform compliance_private.object_keys(p_payload,array['frameworkId']);
 perform compliance_private.require_fields(p_payload,array['frameworkId'],'string');
 if p_client_id is null or length(p_client_id) not between 1 and 160 then perform compliance_private.fail('INVALID_PAYLOAD');end if;
 actor_v:=compliance_private.actor(p_session);if actor_v->>'role' not in ('owner','admin') then perform compliance_private.fail('FORBIDDEN');end if;
 fw:=p_payload->>'frameworkId';if fw not in ('TMSA','DRYBMS') then perform compliance_private.fail('INVALID_FRAMEWORK');end if;
 session_hash_v:=compliance_private.digest(p_session);
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('record:framework:'||fw,0)) then perform compliance_private.fail('WRITE_BUSY');end if;
 select version into version_v from compliance_private.records where kind='framework' and id=fw for update;if not found then perform compliance_private.fail('INVALID_FRAMEWORK');end if;
 select * into lease_v from compliance_private.leases where kind='framework' and id=fw for update;
 if lease_v.expires_at>clock_timestamp() and (lease_v.session_hash<>session_hash_v or lease_v.client_id<>p_client_id) then
  select p.body->>'name' into holder_v from compliance_private.sessions s join compliance_private.records p on p.kind='person' and p.id=s.person_id where s.token_hash=lease_v.session_hash;
  raise exception using errcode='P0001',message='LEASE_HELD',detail=coalesce(holder_v,'另一位使用者');
 end if;
 token_v:=case when lease_v.expires_at>clock_timestamp() and lease_v.session_hash=session_hash_v and lease_v.client_id=p_client_id then lease_v.token else compliance_private.token() end;
 insert into compliance_private.leases values('framework',fw,token_v,session_hash_v,p_client_id,clock_timestamp()+interval '75 seconds') on conflict(kind,id) do update set token=excluded.token,session_hash=excluded.session_hash,client_id=excluded.client_id,expires_at=excluded.expires_at returning * into lease_v;
 return jsonb_build_object('resourceKey','framework:'||fw,'token',lease_v.token,'expiresAt',lease_v.expires_at,'holderName',actor_v->>'name','holderId',actor_v->>'id','baseVersion',version_v);
end $claim$;

create function compliance_private.save_shared_targets(p_session text,p_client_id text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $targets$
#variable_conflict use_column
declare actor_v jsonb;fw text;op text;session_hash_v text;request_v jsonb;receipt_v compliance_private.operations;rec compliance_private.records;lease_v compliance_private.leases;targets_v jsonb;pair record;body_v jsonb;result_v jsonb;expected integer;
begin
 perform compliance_private.object_keys(p_payload,array['frameworkId','targets','expectedVersion','leaseToken','operationId']);
 perform compliance_private.require_fields(p_payload,array['frameworkId','leaseToken','operationId'],'string');
 if p_client_id is null or length(p_client_id) not between 1 and 160 then perform compliance_private.fail('INVALID_PAYLOAD');end if;
 actor_v:=compliance_private.actor(p_session);
 if actor_v->>'role' not in ('owner','admin') then perform compliance_private.fail('FORBIDDEN');end if;
 fw:=p_payload->>'frameworkId';op:=p_payload->>'operationId';targets_v:=p_payload->'targets';
 if fw not in ('TMSA','DRYBMS') then perform compliance_private.fail('INVALID_FRAMEWORK');end if;
 if op !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$' then perform compliance_private.fail('INVALID_OPERATION_ID');end if;
 if jsonb_typeof(p_payload->'expectedVersion') is distinct from 'number' or p_payload->>'expectedVersion' !~ '^[0-9]+$' or (p_payload->>'expectedVersion')::numeric not between 1 and 2147483646 then perform compliance_private.fail('INVALID_VERSION');end if;
 expected:=(p_payload->>'expectedVersion')::integer;
 session_hash_v:=compliance_private.digest(p_session);request_v:=jsonb_build_object('action','target_save','requestDigest',compliance_private.digest(p_payload::text));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('operation:'||session_hash_v||':'||p_client_id||':'||op,0));
 select * into receipt_v from compliance_private.operations o where o.session_hash=session_hash_v and o.client_id=p_client_id and o.operation_id=op;
 if found then if receipt_v.request is distinct from request_v then perform compliance_private.fail('OPERATION_MISMATCH');end if;return receipt_v.result;end if;
 if jsonb_typeof(targets_v) is distinct from 'object' or octet_length(targets_v::text)>200000 then perform compliance_private.fail('INVALID_TARGETS');end if;
 for pair in select key,value from jsonb_each(targets_v) loop
  if not exists(select 1 from compliance_private.records c where c.kind='chapter' and c.id=pair.key and c.body->>'frameworkId'=fw) then perform compliance_private.fail('INVALID_TARGET_CHAPTER');end if;
  if pair.value<>'null'::jsonb and (jsonb_typeof(pair.value)<>'number' or (pair.value#>>'{}')::numeric not between 0 and 4 or (fw='TMSA' and trunc((pair.value#>>'{}')::numeric)<>(pair.value#>>'{}')::numeric)) then perform compliance_private.fail('INVALID_TARGET_SCORE');end if;
 end loop;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('record:framework:'||fw,0)) then perform compliance_private.fail('WRITE_BUSY');end if;
 select * into rec from compliance_private.records where kind='framework' and id=fw for update;
 if not found then perform compliance_private.fail('INVALID_FRAMEWORK');end if;
 select * into lease_v from compliance_private.leases where kind='framework' and id=fw for update;
 if lease_v.token is null or lease_v.token is distinct from p_payload->>'leaseToken' or lease_v.session_hash<>session_hash_v or lease_v.client_id<>p_client_id or lease_v.expires_at<=clock_timestamp() then perform compliance_private.fail('LEASE_LOST');end if;
 if rec.version<>expected then perform compliance_private.fail('VERSION_CONFLICT');end if;
 body_v:=compliance_private.base(rec.body||jsonb_build_object('scoreTargets',targets_v),rec.version+1,actor_v->>'id',rec.body->>'createdAt');
 update compliance_private.records set version=rec.version+1,body=body_v where kind='framework' and id=fw and version=expected;
 if not found then perform compliance_private.fail('VERSION_CONFLICT');end if;
 perform compliance_private.log(actor_v,'target_save','framework',fw,rec.body,body_v,op);
 result_v:=jsonb_build_object('frameworkId',fw,'operationId',op,'record',body_v);
 insert into compliance_private.operations(session_hash,client_id,operation_id,request,result) values(session_hash_v,p_client_id,op,request_v,result_v);
 return result_v;
end $targets$;

create or replace function public.compliance_rpc(p_action text,p_session text,p_client_id text,p_payload jsonb,p_sync_mode text)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='15s' as $route$
declare data jsonb;code_v text;detail_v text;
begin
 if p_sync_mode is distinct from 'performance-v1' or p_action is null or p_action not in ('sync','inspection_detail','save','role_permissions','export_authorize','restart_updates','target_claim','target_save') then return jsonb_build_object('ok',false,'code','INVALID_PERFORMANCE_ROUTE','message','Invalid performance route.');end if;
 if p_action='restart_updates' then data:=compliance_private.restart_updates(p_session,p_client_id,p_payload);
 elsif p_action='target_claim' then data:=compliance_private.claim_shared_targets(p_session,p_client_id,p_payload);
 elsif p_action='target_save' then data:=compliance_private.save_shared_targets(p_session,p_client_id,p_payload);
 else data:=compliance_private.performance_dispatch(p_action,p_session,p_client_id,p_payload);end if;
 if p_action in ('save','role_permissions') then return data;end if;
 return jsonb_build_object('ok',true,'data',data);
exception when sqlstate 'P0001' then
 get stacked diagnostics code_v=message_text,detail_v=pg_exception_detail;
 if code_v='LEASE_HELD' then return jsonb_build_object('ok',false,'code',code_v,'message','Framework is being edited; no change was made.','holderName',detail_v);end if;
 return jsonb_build_object('ok',false,'code',code_v,'message','Server rejected performance operation: '||code_v);
when lock_not_available or deadlock_detected or serialization_failure then return jsonb_build_object('ok',false,'code','WRITE_BUSY','message','Retain the draft; admission is busy.');
when others then return jsonb_build_object('ok',false,'code','DB_'||sqlstate,'message','Performance transaction was not confirmed.');
end $route$;
revoke all on function compliance_private.save_shared_targets(text,text,jsonb) from public;
do $acl$
declare owner_name text;r text;fn regprocedure;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid='public.compliance_rpc(text,text,text,jsonb)'::regprocedure;
 foreach fn in array array['compliance_private.save_shared_targets(text,text,jsonb)'::regprocedure,'compliance_private.claim_shared_targets(text,text,jsonb)'::regprocedure,'compliance_private.validate_record_before_shared_targets(text,jsonb,jsonb,text,jsonb)'::regprocedure] loop
  execute format('alter function %s owner to %I',fn,owner_name);execute format('revoke all on function %s from public',fn);
  for r in select pg_catalog.pg_get_userbyid(a.grantee) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=fn and a.grantee<>0 and a.grantee<>p.proowner loop execute format('revoke all on function %s from %I',fn,r);end loop;
 end loop;
end $acl$;
notify pgrst,'reload schema';
commit;
