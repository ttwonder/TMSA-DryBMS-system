-- Dedicated TMSA-DryBMS-system only. Additive, no business-data writes.
-- Run this repair once; never rerun 001_platform.sql or bootstrap initialization.
-- PostgREST hoists this overload's timeout before executing its SQL statement.
-- The unchanged four-argument RPC retains its existing ordinary request limits.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $preflight$
declare rpc_oid oid:=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)');
        dispatch_oid oid:=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)');
begin
 if rpc_oid is null or dispatch_oid is null
    or to_regclass('compliance_private.control') is null
    or to_regclass('compliance_private.records') is null then
   raise exception 'IMPORT_REPAIR_PREREQUISITE_MISSING';
 end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=rpc_oid and prosecdef
       and proconfig @> array['search_path=""']
       and md5(replace(prosrc,E'\r\n',E'\n'))='999bb75b6d31297eeba8a5090ccb6ee2')
    or not exists(select 1 from pg_catalog.pg_proc where oid=dispatch_oid and prosecdef
       and proconfig @> array['search_path=""']
       and md5(replace(prosrc,E'\r\n',E'\n'))='2371c2842ea1c5c077f8aed9b6cd1373') then
   raise exception 'IMPORT_REPAIR_UNKNOWN_PREDECESSOR';
 end if;
 if to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean)') is not null then
   raise exception 'IMPORT_ROUTE_ALREADY_INSTALLED_VERIFY_READBACK';
 end if;
end $preflight$;

create function public.compliance_rpc(
 p_action text,p_session text,p_client_id text,p_payload jsonb,p_import_mode boolean
) returns jsonb language plpgsql security definer
set search_path = ''
set statement_timeout = '60s'
as $$
begin
 if p_action is distinct from 'import_seed' or p_import_mode is distinct from true then
   return jsonb_build_object('ok',false,'code','INVALID_IMPORT_ROUTE','message','此路由僅限首次資料匯入。');
 end if;
 -- Existing session authority, Owner-only, fresh-workspace guard, validators,
 -- transaction rollback and audit all execute unchanged in the original RPC.
 return public.compliance_rpc(p_action,p_session,p_client_id,p_payload);
end $$;
revoke all on function public.compliance_rpc(text,text,text,jsonb,boolean) from public;

do $acl$
declare old_oid oid:='public.compliance_rpc(text,text,text,jsonb)'::regprocedure;
        owner_name text;r text;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid=old_oid;
 execute format('alter function public.compliance_rpc(text,text,text,jsonb,boolean) owner to %I',owner_name);
 for r in select rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated') loop
   execute format('revoke all on function public.compliance_rpc(text,text,text,jsonb,boolean) from %I',r);
   if pg_catalog.has_function_privilege(r,old_oid,'EXECUTE') then
     execute format('grant execute on function public.compliance_rpc(text,text,text,jsonb,boolean) to %I',r);
   end if;
 end loop;
end $acl$;
comment on function public.compliance_rpc(text,text,text,jsonb,boolean) is
 'Initial seed import only; fixed 60s SQL budget; original Owner/session/freshness and atomic validation unchanged. No ordinary-RPC or role-wide timeout change.';
notify pgrst, 'reload schema';
commit;
