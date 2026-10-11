-- Read-only installation checks. Run ONLY in the new dedicated target project.
-- Never select credentials, session/gate tokens, bootstrap hashes, or source bodies.
select p.oid::regprocedure::text as signature, p.prosecdef as security_definer,
       p.proconfig as function_settings,
       p.pronargs=4 and pg_catalog.pg_get_function_identity_arguments(p.oid)=
       'p_action text, p_session text, p_client_id text, p_payload jsonb' as expected_signature
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='compliance_rpc';

select c.relname as private_table,c.relrowsecurity as rls_enabled,
       pg_catalog.has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_has_any_direct_grant
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='compliance_private' and c.relkind='r' order by c.relname;

select p.proname, p.prosecdef as security_definer,p.proconfig,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute_helper
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='compliance_private' order by p.proname;

select pg_catalog.has_schema_privilege('anon','compliance_private','USAGE') as anon_private_schema_usage,
       pg_catalog.has_function_privilege('anon','public.compliance_rpc(text,text,text,jsonb)','EXECUTE') as anon_rpc_execute;

select n.nspname as actual_pgcrypto_namespace
from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';

-- Safe phase/data counts: no roster, credentials or source bodies are returned.
select initialized,gate_hash is not null as site_gate_configured,
       bootstrap_hash is not null as bootstrap_provisioned
from compliance_private.control where singleton;

select count(*) filter(where kind='person' and body->>'role'='owner'
                      and body->>'active'='true') as active_owners
from compliance_private.records;

select kind,count(*) as record_count
from compliance_private.records group by kind order by kind;

select body->>'frameworkId' as framework,count(*) as item_count
from compliance_private.records where kind='item'
group by body->>'frameworkId' order by framework;

-- A successful false status is distinct from a transport/install failure.
select public.compliance_rpc('bootstrap_status','','readback','{}'::jsonb) as bootstrap_status;
select public.compliance_rpc('roster','','readback','{"gateToken":"invalid-readback-token"}'::jsonb) as roster_must_be_denied;
select public.compliance_rpc('read','','readback','{}'::jsonb) as sessionless_read_must_be_denied;
