-- Dedicated TMSA / DRYBMS only. Apply 004 alone to an installed 001+002+003.
-- NO initialization, automatic replay, public import route or source-data embedding.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $upgrade$
declare v_oid oid:=to_regprocedure('compliance_private.validate_record(text,jsonb,jsonb,text,jsonb)');
 d_oid oid:=to_regprocedure('compliance_private.dispatch(text,text,text,jsonb)');
 h_oid oid:=to_regprocedure('compliance_private.import_office_directory(jsonb)');
 before_v record; before_d record; v_hash text; d_hash text; definition text;
begin
 if v_oid is null or d_oid is null or to_regprocedure('public.compliance_rpc(text,text,text,jsonb,boolean,boolean)') is null then raise exception 'OFFICE_MIGRATION_PREREQUISITE_MISSING';end if;
 select * into before_v from pg_catalog.pg_proc where oid=v_oid;
 select * into before_d from pg_catalog.pg_proc where oid=d_oid;
 if not before_v.prosecdef or not before_d.prosecdef or before_v.proconfig is distinct from array['search_path=""'] or before_d.proconfig is distinct from array['search_path=""'] then raise exception 'OFFICE_MIGRATION_UNKNOWN_VERSION';end if;
 v_hash:=md5(replace(before_v.prosrc,E'\r\n',E'\n'));d_hash:=md5(replace(before_d.prosrc,E'\r\n',E'\n'));
 if not ((v_hash='8ed96f4315cb077f8762dd0c21cc193e' and d_hash='2371c2842ea1c5c077f8aed9b6cd1373') or (v_hash='037cfe64cf3e317605dbc4851d8553f4' and d_hash='8cdfdd4c2952564ff8b46f580625596e')) then raise exception 'OFFICE_MIGRATION_UNKNOWN_VERSION';end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid='public.compliance_rpc(text,text,text,jsonb)'::regprocedure and prosecdef and proconfig=array['search_path=""'] and md5(replace(prosrc,E'\r\n',E'\n'))='999bb75b6d31297eeba8a5090ccb6ee2')
 or not exists(select 1 from pg_catalog.pg_proc where oid='public.compliance_rpc(text,text,text,jsonb,boolean)'::regprocedure and prosecdef and proconfig=array['search_path=""','statement_timeout=60s'] and md5(replace(prosrc,E'\r\n',E'\n'))='63e2634760cdf3bd465726d7e2128320')
 or not exists(select 1 from pg_catalog.pg_proc where oid='public.compliance_rpc(text,text,text,jsonb,boolean,boolean)'::regprocedure and prosecdef and proconfig=array['search_path=""','statement_timeout=15s'] and md5(replace(prosrc,E'\r\n',E'\n'))='8e071416d849b87785a6eafd47669d8b') then raise exception 'OFFICE_MIGRATION_UNKNOWN_RPC_VERSION';end if;
 if h_oid is not null and not exists(select 1 from pg_catalog.pg_proc where oid=h_oid and prosecdef and proconfig=array['search_path=""'] and md5(replace(prosrc,E'\r\n',E'\n'))='26011b1c65ff709fa3c5b5caa8461e90') then raise exception 'OFFICE_MIGRATION_UNKNOWN_HELPER_VERSION';end if;
 if v_hash='8ed96f4315cb077f8762dd0c21cc193e' then
  definition:=pg_catalog.pg_get_functiondef(v_oid);
  if (length(definition)-length(replace(definition,$snippet$if b->>'role' in ('owner','admin') and b->'hasPassword'<>'true'::jsonb then perform compliance_private.fail('PASSWORD_REQUIRED');end if;$snippet$,'')))/length($snippet$if b->>'role' in ('owner','admin') and b->'hasPassword'<>'true'::jsonb then perform compliance_private.fail('PASSWORD_REQUIRED');end if;$snippet$)<>1 then raise exception 'OFFICE_MIGRATION_SNIPPET_MISMATCH';end if;
  execute replace(definition,$snippet$if b->>'role' in ('owner','admin') and b->'hasPassword'<>'true'::jsonb then perform compliance_private.fail('PASSWORD_REQUIRED');end if;$snippet$,$snippet$if b->>'role' ='owner' and b->'hasPassword'<>'true'::jsonb then perform compliance_private.fail('PASSWORD_REQUIRED');end if;$snippet$);
  definition:=pg_catalog.pg_get_functiondef(d_oid);
  if (length(definition)-length(replace(definition,$snippet$actor_v->>'role' in ('owner','admin') and creds.password_hash is null$snippet$,'')))/length($snippet$actor_v->>'role' in ('owner','admin') and creds.password_hash is null$snippet$)<>1 or (length(definition)-length(replace(definition,$snippet$select coalesce(jsonb_agg(body order by body->>'departmentId',body->>'name'),'[]') into data from compliance_private.records where kind='person' and body->'active'='true';return data;$snippet$,'')))/length($snippet$select coalesce(jsonb_agg(body order by body->>'departmentId',body->>'name'),'[]') into data from compliance_private.records where kind='person' and body->'active'='true';return data;$snippet$)<>1 then raise exception 'OFFICE_MIGRATION_SNIPPET_MISMATCH';end if;
  execute replace(replace(definition,$snippet$actor_v->>'role' in ('owner','admin') and creds.password_hash is null$snippet$,$snippet$actor_v->>'role' ='owner' and creds.password_hash is null$snippet$),$snippet$select coalesce(jsonb_agg(body order by body->>'departmentId',body->>'name'),'[]') into data from compliance_private.records where kind='person' and body->'active'='true';return data;$snippet$,$snippet$select coalesce(jsonb_agg(r.body||jsonb_build_object('departmentName',d.value->'name') order by r.body->>'departmentId',r.body->>'name'),'[]') into data from compliance_private.records r left join lateral (select value from compliance_private.records s cross join lateral jsonb_array_elements(s.body->'departments') e(value) where s.kind='settings' and s.id='settings' and value->>'id'=r.body->>'departmentId') d on true where r.kind='person' and r.body->'active'='true';return data;$snippet$);
 end if;
 if not exists(select 1 from pg_catalog.pg_proc where oid=v_oid and proowner=before_v.proowner and proacl is not distinct from before_v.proacl and proconfig is not distinct from before_v.proconfig and prosecdef=before_v.prosecdef and md5(replace(prosrc,E'\r\n',E'\n'))='037cfe64cf3e317605dbc4851d8553f4')
 or not exists(select 1 from pg_catalog.pg_proc where oid=d_oid and proowner=before_d.proowner and proacl is not distinct from before_d.proacl and proconfig is not distinct from before_d.proconfig and prosecdef=before_d.prosecdef and md5(replace(prosrc,E'\r\n',E'\n'))='8cdfdd4c2952564ff8b46f580625596e') then raise exception 'OFFICE_MIGRATION_READBACK_MISMATCH';end if;
end $upgrade$;
create table if not exists compliance_private.office_directory_imports(
 import_id text primary key,payload_digest text not null,source_person_count integer not null,
 source_department_count integer not null,owner_id text not null,receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table compliance_private.office_directory_imports enable row level security;
create or replace function compliance_private.import_office_directory(bundle jsonb) returns jsonb language plpgsql security definer set search_path='' as $office$
#variable_conflict use_column
declare
 payload_hash text; import_key text; saved compliance_private.office_directory_imports;
 ctl compliance_private.control; owner_before jsonb; owner_after jsonb; owner_key text;
 owner_credential compliance_private.credentials; settings_before jsonb; settings_after jsonb;
 departments_v jsonb; department_map jsonb:='[]'; person_map jsonb:='[]';
 p jsonb; d jsonb; source_name text; target_key text; department_key text;
 n integer; b jsonb; result_v jsonb; lock_key text;
begin
 -- Strict nested allowlists make every unrecognized credential/secret field invalid.
 perform compliance_private.object_keys(bundle,array['schemaVersion','capturedAt','source','departments','people','targetProjectRef','ownerSourceId','credentialPolicy']);
 perform compliance_private.require_fields(bundle,array['capturedAt','targetProjectRef','ownerSourceId','credentialPolicy'],'string');
 perform compliance_private.require_fields(bundle,array['schemaVersion'],'number');
 perform compliance_private.require_fields(bundle,array['source'],'object');
 perform compliance_private.require_fields(bundle,array['departments','people'],'array');
 if bundle->'schemaVersion'<>'1'::jsonb or bundle->>'targetProjectRef'<>'fvdzmktjmoeysdfjeuuq'
    or bundle->>'credentialPolicy'<>'drop-non-owner' or octet_length(bundle::text)>2000000
    or length(bundle->>'capturedAt') not between 1 and 100 then perform compliance_private.fail('OFFICE_INVALID_BUNDLE');end if;
 perform compliance_private.object_keys(bundle->'source',array['repository','gitRevision','projectRef','workspaceKey','storageMode','revision']);
 perform compliance_private.require_fields(bundle->'source',array['repository','gitRevision','projectRef','workspaceKey','storageMode'],'string');
 perform compliance_private.require_fields(bundle->'source',array['revision'],'number');
 if length(bundle->'source'->>'repository') not between 1 and 500
    or bundle->'source'->>'gitRevision'<>'c1f7b022eaf4e7b5bb158d5ce2e46774db8307c0'
    or bundle->'source'->>'projectRef'<>'cyzpcvvhmoiihsqvjspp'
    or bundle->'source'->>'workspaceKey'<>'ship-dynamics-main'
    or bundle->'source'->>'storageMode'<>'records-v1'
    or bundle->'source'->>'revision' !~ '^[0-9]{1,10}$'
    or (bundle->'source'->>'revision')::numeric>2147483647 then perform compliance_private.fail('OFFICE_INVALID_SOURCE');end if;
 if jsonb_array_length(bundle->'people') not between 1 and 500
    or jsonb_array_length(bundle->'departments') not between 1 and 100 then perform compliance_private.fail('OFFICE_INVALID_BUNDLE');end if;
 for d in select value from jsonb_array_elements(bundle->'departments') loop
  if jsonb_typeof(d)<>'string' or length(d#>>'{}') not between 1 and 100
     or d#>>'{}' ~ '^[[:space:]　]|[[:space:]　]$' then perform compliance_private.fail('OFFICE_INVALID_DEPARTMENT');end if;
 end loop;
 if (select count(distinct value) from jsonb_array_elements(bundle->'departments'))<>jsonb_array_length(bundle->'departments') then perform compliance_private.fail('OFFICE_DUPLICATE_DEPARTMENT');end if;
 for p in select value from jsonb_array_elements(bundle->'people') loop
  perform compliance_private.object_keys(p,array['sourceId','name','username','department','active','role']);
  perform compliance_private.require_fields(p,array['sourceId','name','username','department','role'],'string');
  perform compliance_private.require_fields(p,array['active'],'boolean');
  if length(p->>'name') not between 1 and 100 or length(p->>'username') not between 1 and 100
     or p->>'name' ~ '^[[:space:]　]|[[:space:]　]$' or p->>'username' ~ '^[[:space:]　]|[[:space:]　]$'
     or p->>'sourceId' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,219}$'
     or p->>'role' not in ('owner','admin','operator')
     or not bundle->'departments' ? (p->>'department') then perform compliance_private.fail('OFFICE_INVALID_PERSON');end if;
  perform compliance_private.resource('person','sd-office-person-'||(p->>'sourceId'));
 end loop;
 if (select count(distinct value->>'sourceId') from jsonb_array_elements(bundle->'people'))<>jsonb_array_length(bundle->'people')
    or (select count(distinct lower(value->>'username')) from jsonb_array_elements(bundle->'people'))<>jsonb_array_length(bundle->'people') then perform compliance_private.fail('OFFICE_DUPLICATE_PERSON');end if;
 if (select count(*) from jsonb_array_elements(bundle->'people') where value->>'role'='owner')<>1
    or not exists(select 1 from jsonb_array_elements(bundle->'people') where value->>'role'='owner' and value->>'sourceId'=bundle->>'ownerSourceId' and value->'active'='true'::jsonb) then perform compliance_private.fail('OFFICE_INVALID_OWNER');end if;
 payload_hash:=compliance_private.digest(bundle::text);import_key:='sd-office-import-'||payload_hash;
 -- This source workspace can be imported once, not once per mutated payload hash.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('office-directory:ship-dynamics-main',0));
 select * into saved from compliance_private.office_directory_imports order by import_id limit 1;
 if found then
  if saved.import_id=import_key and saved.payload_digest=payload_hash then return saved.receipt;end if;
  perform compliance_private.fail('OFFICE_IMPORT_CONFLICT');
 end if;
 select id into owner_key from compliance_private.records where kind='person' and body->>'role'='owner';
 if owner_key is null then perform compliance_private.fail('OFFICE_TARGET_NOT_FRESH');end if;
 -- Match ordinary writers: credentials precede record advisory locks and rows.
 select * into owner_credential from compliance_private.credentials where person_id=owner_key for update nowait;
 if not found or owner_credential.password_hash is null then perform compliance_private.fail('OFFICE_TARGET_NOT_FRESH');end if;
 select * into ctl from compliance_private.control where singleton for update nowait;
 if not found or not ctl.initialized or not ctl.imported or ctl.gate_hash is null then perform compliance_private.fail('OFFICE_TARGET_NOT_FRESH');end if;
 for lock_key in select value from (
  select 'record:person:'||owner_key as value union select 'record:settings:settings'
  union select 'record:person:sd-office-person-'||(value->>'sourceId') from jsonb_array_elements(bundle->'people') where value->>'role'<>'owner'
 ) q order by value loop perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_key,0));end loop;
 perform 1 from compliance_private.records where kind in ('person','settings') order by kind,id for update nowait;
 if (select count(*) from compliance_private.records where kind='person')<>1
    or not exists(select 1 from compliance_private.records where kind='person' and id=owner_key and body->>'role'='owner' and body->'active'='true'::jsonb)
    or (select count(*) from compliance_private.records where kind='settings')<>1 then perform compliance_private.fail('OFFICE_TARGET_NOT_FRESH');end if;
 if exists(select 1 from compliance_private.leases where kind in ('person','settings') and expires_at>clock_timestamp()) then perform compliance_private.fail('OFFICE_DIRECTORY_BUSY');end if;
 select body into owner_before from compliance_private.records where kind='person' and id=owner_key;
 select body into settings_before from compliance_private.records where kind='settings' and id='settings';
 if settings_before is null then perform compliance_private.fail('OFFICE_TARGET_NOT_FRESH');end if;
 -- Account collisions include the preserved Owner username, not its source username.
 if exists(select 1 from jsonb_array_elements(bundle->'people') where value->>'role'<>'owner' and lower(value->>'username')=lower(owner_before->>'username')) then perform compliance_private.fail('OFFICE_DUPLICATE_PERSON');end if;
 departments_v:=settings_before->'departments';
 for source_name in select value from jsonb_array_elements_text(bundle->'departments') loop
  select count(*) into n from jsonb_array_elements(departments_v) where value->'name'->>'zh'=source_name;
  if n>1 then perform compliance_private.fail('OFFICE_AMBIGUOUS_DEPARTMENT');end if;
  if n=1 then
   select value into d from jsonb_array_elements(departments_v) where value->'name'->>'zh'=source_name;
   if d->'active' is distinct from 'true'::jsonb then perform compliance_private.fail('OFFICE_INACTIVE_DEPARTMENT');end if;
   department_key:=d->>'id';
  else
   department_key:='sd-office-dept-'||left(compliance_private.digest(source_name),16);
   if exists(select 1 from jsonb_array_elements(departments_v) where value->>'id'=department_key) then perform compliance_private.fail('OFFICE_DEPARTMENT_ID_CONFLICT');end if;
   departments_v:=departments_v||jsonb_build_array(jsonb_build_object('id',department_key,'name',jsonb_build_object('en','','zh',source_name),'active',true));
  end if;
  department_map:=department_map||jsonb_build_array(jsonb_build_object('sourceName',source_name,'targetId',department_key));
 end loop;
 settings_after:=compliance_private.validate_record('settings',settings_before||jsonb_build_object('departments',departments_v),settings_before,'update',owner_before);
 settings_after:=compliance_private.base(settings_after,(settings_before->>'version')::integer+1,owner_key,settings_before->>'createdAt');
 update compliance_private.records set version=(settings_after->>'version')::integer,body=settings_after where kind='settings' and id='settings';
 for p in select value from jsonb_array_elements(bundle->'people') loop
  select value->>'targetId' into department_key from jsonb_array_elements(department_map) where value->>'sourceName'=p->>'department';
  if p->>'role'='owner' then
   target_key:=owner_key;
   b:=compliance_private.validate_record('person',owner_before||jsonb_build_object('name',p->>'name','departmentId',department_key),owner_before,'update',owner_before);
   owner_after:=compliance_private.base(b,(owner_before->>'version')::integer+1,owner_key,owner_before->>'createdAt')||jsonb_build_object('hasPassword',true);
   update compliance_private.records set version=(owner_after->>'version')::integer,body=owner_after where kind='person' and id=owner_key;
  else
   target_key:='sd-office-person-'||(p->>'sourceId');
   insert into compliance_private.credentials(person_id,password_hash,epoch) values(target_key,null,1);
   b:=jsonb_build_object('id',target_key,'username',p->>'username','name',p->>'name','departmentId',department_key,'role',p->>'role','active',p->'active');
   b:=compliance_private.validate_record('person',b,null,'create',owner_before);
   b:=compliance_private.base(b,1,owner_key)||jsonb_build_object('hasPassword',false);
   insert into compliance_private.records values('person',target_key,1,b);
  end if;
  person_map:=person_map||jsonb_build_array(jsonb_build_object('sourceId',p->>'sourceId','targetId',target_key,'sourceUsername',p->>'username'));
 end loop;
 result_v:=jsonb_build_object('importId',import_key,'payloadDigest',payload_hash,'source',bundle->'source','sourcePersonCount',jsonb_array_length(bundle->'people'),'sourceDepartmentCount',jsonb_array_length(bundle->'departments'),'ownerId',owner_key,'people',person_map,'departments',department_map);
 insert into compliance_private.office_directory_imports(import_id,payload_digest,source_person_count,source_department_count,owner_id,receipt)
 values(import_key,payload_hash,jsonb_array_length(bundle->'people'),jsonb_array_length(bundle->'departments'),owner_key,result_v);
 perform compliance_private.log(owner_before,'import_office_directory','settings','settings',settings_before,settings_after,import_key);
 perform compliance_private.log(owner_before,'import_office_directory','person',owner_key,owner_before,owner_after,import_key);
 -- Keep source usernames and source identity exclusively in the private receipt.
 perform compliance_private.log(owner_before,'import_office_directory','workspace',import_key,null,jsonb_build_object('people',jsonb_array_length(bundle->'people'),'departments',jsonb_array_length(bundle->'departments')),import_key);
 return result_v;
exception
 when sqlstate 'P0001' then raise;
 when lock_not_available or deadlock_detected or serialization_failure then raise exception using errcode='P0001',message='OFFICE_DIRECTORY_BUSY';
 when others then raise exception using errcode='P0001',message='OFFICE_IMPORT_REJECTED';
end
$office$;
revoke all on table compliance_private.office_directory_imports from public;
revoke all on function compliance_private.import_office_directory(jsonb) from public;
do $private_acl$
declare r text; owner_name text;
begin
 select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc where oid='compliance_private.dispatch(text,text,text,jsonb)'::regprocedure;
 execute format('alter function compliance_private.import_office_directory(jsonb) owner to %I',owner_name);
 execute format('alter table compliance_private.office_directory_imports owner to %I',owner_name);
 for r in select rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated') loop
  execute format('revoke all on function compliance_private.import_office_directory(jsonb) from %I',r);
  execute format('revoke all on table compliance_private.office_directory_imports from %I',r);
 end loop;
end $private_acl$;
comment on function compliance_private.import_office_directory(jsonb) is 'SQL-editor administrator only; atomic office-only source directory; preserve existing Owner credentials/session; private deterministic exact-replay receipt.';
notify pgrst, 'reload schema';
commit;
