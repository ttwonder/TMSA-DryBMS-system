-- TMSA / DRYBMS only. Requires the unchanged 006 restart helper.
-- Extends ONLY initialization to active Owner/admin; other Owner actions stay private.
-- Installation changes one function predicate. It does NOT reset any assessments.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $upgrade$
declare definition text; body_hash text;
 old_guard text:=$old$if actor_v->>'role' is distinct from 'owner' then$old$;
 new_guard text:=$new$if coalesce(actor_v->>'role','') not in ('owner','admin') then$new$;
begin
 select md5(replace(prosrc,E'\r\n',E'\n')) into body_hash from pg_catalog.pg_proc
 where oid=to_regprocedure('compliance_private.restart_updates(text,text,jsonb)');
 if body_hash='25d528d967082e586c008e716d87cbfa' then raise exception 'RESTART_ADMIN_ALREADY_INSTALLED_VERIFY_READBACK';end if;
 if body_hash is distinct from '47fbae83d036de80c3fc9b44e24e9348' then raise exception 'RESTART_ADMIN_UNKNOWN_PREDECESSOR';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.restart_updates(text,text,jsonb)')
  and prosecdef and proconfig=array['search_path=""'] and proargnames=array['p_session','p_client_id','p_payload'])
 then raise exception 'RESTART_ADMIN_UNEXPECTED_FUNCTION';end if;
 definition:=pg_catalog.pg_get_functiondef('compliance_private.restart_updates(text,text,jsonb)'::regprocedure);
 if position(old_guard in definition)=0 then raise exception 'RESTART_ADMIN_GUARD_MISSING';end if;
 execute replace(definition,old_guard,new_guard);
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('compliance_private.restart_updates(text,text,jsonb)')
  and md5(replace(prosrc,E'\r\n',E'\n'))='25d528d967082e586c008e716d87cbfa') then raise exception 'RESTART_ADMIN_POSTCHECK_FAILED';end if;
end $upgrade$;
commit;
