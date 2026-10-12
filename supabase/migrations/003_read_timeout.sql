-- Dedicated TMSA-DryBMS-system only. Apply after the existing 001 + 002.
-- Additive read-only route; no business, credential, session or role-setting writes.
-- Do not rerun initialization/import or the already-installed migrations.
-- PostgREST hoists this route's fixed budget before the statement starts.
-- Four-argument ordinary RPC and five-argument initial-import RPC stay unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $preflight$
declare rpc_oid oid:=to_regprocedure('public.compliance_rpc(text,text,text,jsonb)');
        import_oid oid:=to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean)');
        dispatch_oid oid:=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)');
        reader_oid oid:=to_regprocedure('compliance_private.state(jsonb)');
begin
 if rpc_oid is null or import_oid is null or dispatch_oid is null or reader_oid is null
    or to_regclass('compliance_private.control') is null
    or to_regclass('compliance_private.records') is null then
   raise exception 'READ_REPAIR_PREREQUISITE_MISSING';
 end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=rpc_oid and prosecdef
       and proconfig=array['search_path=""']
       and md5(replace(prosrc,E'\r\n',E'\n'))='999bb75b6d31297eeba8a5090ccb6ee2')
    or not exists(select 1 from pg_catalog.pg_proc where oid=import_oid and prosecdef
       and proowner=(select proowner from pg_catalog.pg_proc where oid=rpc_oid)
       and proconfig @> array['search_path=""','statement_timeout=60s'] and cardinality(proconfig)=2
       and md5(replace(prosrc,E'\r\n',E'\n'))='63e2634760cdf3bd465726d7e2128320')
    or not exists(select 1 from pg_catalog.pg_proc where oid=dispatch_oid and prosecdef
       and proconfig=array['search_path=""']
       and md5(replace(prosrc,E'\r\n',E'\n'))='2371c2842ea1c5c077f8aed9b6cd1373')
    or not exists(select 1 from pg_catalog.pg_proc where oid=reader_oid and prosecdef
       and proconfig=array['search_path=""']
       and md5(replace(prosrc,E'\r\n',E'\n'))='d8ba1c3d29a7265ce85845c58288071c') then
   raise exception 'READ_REPAIR_UNKNOWN_PREDECESSOR';
 end if;
 if to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)') is not null then
   raise exception 'READ_ROUTE_ALREADY_INSTALLED_VERIFY_READBACK';
 end if;
 if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='compliance_rpc')<>2 then
   raise exception 'READ_REPAIR_UNEXPECTED_RPC_OVERLOAD';
 end if;
end $preflight$;

create function public.compliance_rpc(
 p_action text,p_session text,p_client_id text,p_payload jsonb,p_import_mode boolean,p_read_mode boolean
) returns jsonb language plpgsql security definer
set search_path = ''
set statement_timeout = '15s'
as $$
begin
 if p_action is distinct from 'read' or p_import_mode is distinct from false or p_read_mode is distinct from true then
   return jsonb_build_object('ok',false,'code','INVALID_READ_ROUTE','message','此路由僅限完整資料讀取。');
 end if;
 -- Preserve the exact existing session/active-person authority, role projection,
 -- complete source fields, frozen history, snapshot token and error envelope.
 return public.compliance_rpc(p_action,p_session,p_client_id,p_payload);
end $$;
revoke all on function public.compliance_rpc(text,text,text,jsonb,boolean,boolean) from public;

do $acl$
declare old_oid oid:='public.compliance_rpc(text,text,text,jsonb)'::regprocedure;
        new_oid oid:='public.compliance_rpc(text,text,text,jsonb,boolean,boolean)'::regprocedure;
        owner_name text;r text;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid=old_oid;
 execute format('alter function public.compliance_rpc(text,text,text,jsonb,boolean,boolean) owner to %I',owner_name);
 -- Do not inherit unrelated project-wide default EXECUTE grants on a new function.
 for r in select pg_catalog.pg_get_userbyid(a.grantee) from pg_catalog.pg_proc p,
       lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
       where p.oid=new_oid and a.grantee<>0 and a.grantee<>p.proowner loop
   execute format('revoke all on function public.compliance_rpc(text,text,text,jsonb,boolean,boolean) from %I',r);
 end loop;
 for r in select rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated') loop
   if pg_catalog.has_function_privilege(r,old_oid,'EXECUTE') then
     execute format('grant execute on function public.compliance_rpc(text,text,text,jsonb,boolean,boolean) to %I',r);
   end if;
 end loop;
end $acl$;
comment on function public.compliance_rpc(text,text,text,jsonb,boolean,boolean) is
 'Full-state read only; fixed 15s SQL budget; original session/active-user/role projection and response unchanged. Ordinary writers, import route and role-wide settings unchanged.';
notify pgrst, 'reload schema';
commit;
