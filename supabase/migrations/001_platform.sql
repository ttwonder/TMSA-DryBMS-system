-- New dedicated TMSA / DRYBMS workspace only. Never apply to another app's DB.
-- Credentials are provisioned separately; this file contains no setup secret.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists compliance_private;
revoke all on schema compliance_private from public;
alter default privileges in schema compliance_private revoke execute on functions from public;
alter default privileges in schema compliance_private revoke all on tables from public;

create table if not exists compliance_private.control (
  singleton boolean primary key default true check(singleton), initialized boolean not null default false,
  bootstrap_hash text, gate_hash text, gate_epoch bigint not null default 0, imported boolean not null default false,
  cycles jsonb not null default '[]', provenance jsonb not null default '[]', source_manifest jsonb not null default '[]'
);
insert into compliance_private.control(singleton) values(true) on conflict do nothing;
create table if not exists compliance_private.records (
  kind text not null check(kind in ('framework','chapter','item','assessment','improvement','inspection','person','dryScore','settings')),
  id text not null, version integer not null check(version>0), body jsonb not null check(jsonb_typeof(body)='object'),
  primary key(kind,id), check(body->>'id'=id), check((body->>'version')::integer=version)
);
create unique index if not exists item_code_unique on compliance_private.records ((body->>'frameworkId'),(body->>'code')) where kind='item';
create unique index if not exists chapter_code_unique on compliance_private.records ((body->>'frameworkId'),(body->>'code')) where kind='chapter';
create unique index if not exists assessment_item_unique on compliance_private.records ((body->>'itemId')) where kind='assessment';
create unique index if not exists dry_chapter_unique on compliance_private.records ((body->>'chapterId')) where kind='dryScore';
create unique index if not exists external_source_unique on compliance_private.records ((body->>'sourceKey')) where kind='improvement' and body->>'source'='external';
create unique index if not exists person_username_unique on compliance_private.records ((body->>'username')) where kind='person';
create unique index if not exists only_one_owner on compliance_private.records ((body->>'role')) where kind='person' and body->>'role'='owner';
create table if not exists compliance_private.credentials (person_id text primary key, password_hash text, epoch bigint not null default 1);
create table if not exists compliance_private.gates (token_hash text primary key, epoch bigint not null, expires_at timestamptz not null);
create table if not exists compliance_private.sessions (token_hash text primary key,person_id text not null,epoch bigint not null,expires_at timestamptz not null,revoked boolean not null default false);
create table if not exists compliance_private.leases (kind text not null,id text not null,token text not null,session_hash text not null,client_id text not null,expires_at timestamptz not null, primary key(kind,id));
create table if not exists compliance_private.operations (session_hash text not null,client_id text not null,operation_id text not null,request jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(session_hash,client_id,operation_id));
create table if not exists compliance_private.audit (id text primary key,at timestamptz not null,actor_id text not null,actor_name text not null,action text not null,kind text not null,entity_id text not null,item_codes jsonb not null,summary text not null,before_value jsonb,after_value jsonb,operation_id text not null);
create index if not exists audit_time_idx on compliance_private.audit(at desc,id);
create table if not exists compliance_private.exports (id text primary key,actor_id text not null,request jsonb not null,snapshot jsonb not null,at timestamptz not null);

create or replace function compliance_private.fail(code text) returns void language plpgsql security definer set search_path='' as $$ begin raise exception using errcode='P0001',message=code; end $$;
create or replace function compliance_private.token() returns text language sql volatile security definer set search_path='' as $$ select replace(pg_catalog.gen_random_uuid()::text,'-','')||replace(pg_catalog.gen_random_uuid()::text,'-','') $$;
create or replace function compliance_private.digest(value text) returns text language sql immutable security definer set search_path='' as $$ select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(value,'UTF8')),'hex') $$;
-- Resolve pgcrypto's actual installation namespace, including existing public installs.
create or replace function compliance_private.hash_secret(value text) returns text language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare ns text;result text;begin
  if value is null or value !~ '^[a-f0-9]{64}$' then perform compliance_private.fail('INVALID_CREDENTIAL');end if;
  select n.nspname into ns from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  execute pg_catalog.format('select %I.crypt($1,%I.gen_salt(''bf'',10))',ns,ns) into result using value; return result;
end $$;
create or replace function compliance_private.check_secret(value text,stored text) returns boolean language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare ns text;result boolean;begin
  if value is null or value !~ '^[a-f0-9]{64}$' or stored is null then return false;end if;
  select n.nspname into ns from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
  execute pg_catalog.format('select %I.crypt($1,$2)=$2',ns) into result using value,stored;return coalesce(result,false);
end $$;
create or replace function compliance_private.provision_bootstrap(code_hash text) returns void language plpgsql security definer set search_path='' as $$ begin
  update compliance_private.control set bootstrap_hash=compliance_private.hash_secret(code_hash) where singleton and not initialized and bootstrap_hash is null;
  if not found then perform compliance_private.fail('BOOTSTRAP_ALREADY_PROVISIONED');end if;
end $$;
create or replace function compliance_private.base(body jsonb,v integer,actor text,created text default null) returns jsonb language sql volatile security definer set search_path='' as $$
select (body - array['passwordHash','credentialHash','hasPassword']) || jsonb_build_object('version',v,'createdAt',coalesce(created,clock_timestamp()::text),'updatedAt',clock_timestamp()::text,'updatedBy',actor)
$$;
create or replace function compliance_private.default_settings(actor text) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare caps text[]:=array['editAssessments','createImprovements','updateImprovements','closeImprovements','manageInspections','exportReports','enterManagement','manageUsers','manageFrameworks','viewAuditLogs','manageRolePermissions','manageSystemSettings']; r text;c text;matrix jsonb:='{}';row jsonb;begin
  foreach r in array array['owner','admin','operator','vessel'] loop row:='{}';foreach c in array caps loop
    row:=row||jsonb_build_object(c,r='owner' or (r='admin' and c not in ('manageRolePermissions','manageSystemSettings')) or (r='operator' and c in ('editAssessments','createImprovements','updateImprovements','closeImprovements','exportReports')) or (r='vessel' and c='createImprovements'));
  end loop;matrix:=matrix||jsonb_build_object(r,row);end loop;
  return compliance_private.base(jsonb_build_object('id','settings','departments',jsonb_build_array(
    jsonb_build_object('id','management','name',jsonb_build_object('en','Management','zh','管理組'),'active',true),
    jsonb_build_object('id','marine','name',jsonb_build_object('en','Marine','zh','海技組'),'active',true),
    jsonb_build_object('id','technical','name',jsonb_build_object('en','Technical','zh','船工處'),'active',true),
    jsonb_build_object('id','crew','name',jsonb_build_object('en','Crewing','zh','船員組'),'active',true),
    jsonb_build_object('id','safety','name',jsonb_build_object('en','Safety / Quality','zh','安衛處'),'active',true),
    jsonb_build_object('id','shipping','name',jsonb_build_object('en','Shipping','zh','航運處'),'active',true)),
    'rolePermissions',matrix,'siteGateConfigured',true),1,actor);
end $$;

-- Pin credential epoch before role reads; revocation waits for already-admitted writes.
create or replace function compliance_private.actor(session_token text) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare s compliance_private.sessions; c compliance_private.credentials; p jsonb;begin
  select * into s from compliance_private.sessions where token_hash=compliance_private.digest(coalesce(session_token,''));
  if not found or s.revoked or s.expires_at<=clock_timestamp() then perform compliance_private.fail('SESSION_INVALID');end if;
  select * into c from compliance_private.credentials where person_id=s.person_id for share;
  if not found or c.epoch<>s.epoch then perform compliance_private.fail('SESSION_INVALID');end if;
  select body into p from compliance_private.records where kind='person' and id=s.person_id;
  if p is null or p->'active'<>'true'::jsonb then perform compliance_private.fail('SESSION_INVALID');end if;
  return p;
end $$;
create or replace function compliance_private.allowed(actor jsonb,cap text) returns boolean language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare role_name text:=actor->>'role'; matrix jsonb;begin
  if actor->'active' is distinct from 'true'::jsonb then return false;end if;
  if role_name='owner' then return true;end if;
  if cap in ('manageRolePermissions','manageSystemSettings') then return false;end if;
  if role_name='admin' and cap in ('enterManagement','manageUsers') then return true;end if;
  if cap in ('enterManagement','manageUsers','manageFrameworks','viewAuditLogs','manageInspections') and role_name<>'admin' then return false;end if;
  select body->'rolePermissions' into matrix from compliance_private.records where kind='settings' and id='settings';
  return coalesce(matrix->role_name->cap='true'::jsonb,false);
end $$;
create or replace function compliance_private.write_allowed(actor jsonb,kind text,intent text) returns boolean language sql stable security definer set search_path='' as $$
select compliance_private.allowed(actor,case kind when 'framework' then 'manageFrameworks' when 'chapter' then 'manageFrameworks' when 'item' then 'manageFrameworks' when 'assessment' then 'editAssessments' when 'dryScore' then 'editAssessments' when 'person' then 'manageUsers' when 'settings' then 'manageUsers' when 'inspection' then 'manageInspections' when 'improvement' then case when intent='create' then 'createImprovements' when intent in ('close','reopen') then 'closeImprovements' else 'updateImprovements' end else 'INVALID' end)
$$;
create or replace function compliance_private.resource(kind text,id text) returns void language plpgsql security definer set search_path='' as $$ begin
  if kind is null or kind not in ('framework','chapter','item','assessment','improvement','inspection','person','dryScore','settings') or id is null or id !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,239}$' or (kind='framework' and id not in ('TMSA','DRYBMS')) or (kind='settings' and id<>'settings') then perform compliance_private.fail('INVALID_RESOURCE');end if;
end $$;
create or replace function compliance_private.object_keys(body jsonb,keys text[]) returns void language plpgsql security definer set search_path='' as $$ begin
  if body is null or jsonb_typeof(body)<>'object' or exists(select 1 from jsonb_object_keys(body) k where not k=any(keys)) then perform compliance_private.fail('INVALID_PAYLOAD');end if;
end $$;
create or replace function compliance_private.require_fields(body jsonb,keys text[],kind text) returns void language plpgsql security definer set search_path='' as $$ declare k text;begin
  foreach k in array keys loop if not body ? k or (kind is not null and jsonb_typeof(body->k) is distinct from kind) then perform compliance_private.fail('INVALID_PAYLOAD');end if;end loop;
end $$;
create or replace function compliance_private.bi(value jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
  perform compliance_private.object_keys(value,array['en','zh']);perform compliance_private.require_fields(value,array['en','zh'],'string');
end $$;
create or replace function compliance_private.refs(value jsonb,ref_kind text,active_only boolean default false) returns void language plpgsql security definer set search_path='' as $$ declare v jsonb;ref jsonb;begin
  if jsonb_typeof(value) is distinct from 'array' then perform compliance_private.fail('INVALID_REFERENCE');end if;
  if jsonb_array_length(value)<>(select count(distinct x#>>'{}') from jsonb_array_elements(value) x) then perform compliance_private.fail('DUPLICATE_REFERENCE');end if;
  for v in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(v)<>'string' then perform compliance_private.fail('INVALID_REFERENCE');end if;
    if ref_kind='department' then select d into ref from compliance_private.records r cross join lateral jsonb_array_elements(r.body->'departments') d where r.kind='settings' and d->>'id'=v#>>'{}';
    else select body into ref from compliance_private.records where kind=ref_kind and id=v#>>'{}';end if;
    if ref is null or (active_only and ref->'active' is distinct from 'true'::jsonb) then perform compliance_private.fail('INVALID_REFERENCE');end if;
  end loop;
end $$;
-- Strict source locators exclude injected secret fields from reads and audit.
create or replace function compliance_private.sources(value jsonb) returns void language plpgsql security definer set search_path='' as $$ declare v jsonb;begin
 if jsonb_typeof(value) is distinct from 'array' then perform compliance_private.fail('INVALID_PAYLOAD');end if;
 for v in select * from jsonb_array_elements(value) loop
  perform compliance_private.object_keys(v,array['source','file','sheet','cell','pages','rawItem','note']);perform compliance_private.require_fields(v,array['source'],'string');
  if exists(select 1 from jsonb_each(v) e where e.key<>'pages' and jsonb_typeof(e.value)<>'string') then perform compliance_private.fail('INVALID_PAYLOAD');end if;
  if v ? 'pages' and (jsonb_typeof(v->'pages')<>'array' or exists(select 1 from jsonb_array_elements(v->'pages') n where jsonb_typeof(n)<>'number' or n::text !~ '^[0-9]+$')) then perform compliance_private.fail('INVALID_PAYLOAD');end if;
 end loop;
end $$;
create or replace function compliance_private.safe(value jsonb) returns jsonb language plpgsql immutable security definer set search_path='' as $$ declare outv jsonb;k text;v jsonb;begin
  if jsonb_typeof(value)='object' then outv:='{}';for k,v in select * from jsonb_each(value) loop if k !~* '(password|credential|secret|token|hash)' then outv:=outv||jsonb_build_object(k,compliance_private.safe(v));end if;end loop;return outv;
  elsif jsonb_typeof(value)='array' then select coalesce(jsonb_agg(compliance_private.safe(x)),'[]') into outv from jsonb_array_elements(value) x;return outv;
  else return value;end if;
end $$;
create or replace function compliance_private.item_codes(kind text,body jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare ids jsonb;begin
  ids:=case kind when 'item' then jsonb_build_array(body->>'id') when 'assessment' then jsonb_build_array(body->>'itemId') when 'improvement' then body->'itemIds' when 'inspection' then coalesce((select jsonb_agg(r->>'itemId') from jsonb_array_elements(body->'results') r),'[]') else '[]'::jsonb end;
  return coalesce((select jsonb_agg(code order by code) from (select distinct r.body->>'code' as code from compliance_private.records r where r.kind='item' and ids ? r.id) q),'[]');
end $$;
create or replace function compliance_private.log(actor jsonb,action text,kind text,id text,before_v jsonb,after_v jsonb,op text,codes jsonb default null) returns void language sql volatile security definer set search_path='' as $$
insert into compliance_private.audit values(pg_catalog.gen_random_uuid()::text,clock_timestamp(),actor->>'id',actor->>'name',action,kind,id,coalesce(codes,case when kind='item' then (select jsonb_agg(c order by c) from (select distinct c from jsonb_array_elements_text(jsonb_build_array(before_v->>'code',after_v->>'code')) c where c is not null) names) else compliance_private.item_codes(kind,coalesce(after_v,before_v)) end,'[]'),action||' '||kind||':'||id,compliance_private.safe(before_v),compliance_private.safe(after_v),op)
$$;

create or replace function compliance_private.validate_permissions(matrix jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r text;c text;caps text[]:=array['editAssessments','createImprovements','updateImprovements','closeImprovements','manageInspections','exportReports','enterManagement','manageUsers','manageFrameworks','viewAuditLogs','manageRolePermissions','manageSystemSettings'];begin
  perform compliance_private.object_keys(matrix,array['owner','admin','operator','vessel']);
  foreach r in array array['owner','admin','operator','vessel'] loop
    perform compliance_private.object_keys(matrix->r,caps);
    foreach c in array caps loop
      if jsonb_typeof(matrix->r->c) is distinct from 'boolean' or r='owner' and matrix->r->c<>'true'::jsonb or r<>'owner' and c in ('manageRolePermissions','manageSystemSettings') and matrix->r->c<>'false'::jsonb or r in ('operator','vessel') and c in ('enterManagement','manageUsers','manageFrameworks','viewAuditLogs','manageInspections') and matrix->r->c<>'false'::jsonb or r='admin' and c in ('enterManagement','manageUsers') and matrix->r->c<>'true'::jsonb then perform compliance_private.fail('FIXED_ROLE_BOUNDARY');end if;
    end loop;
  end loop;
end $$;

create or replace function compliance_private.validate_record(kind text,b jsonb,old jsonb,intent text,actor jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare keys text[]:=array['id','version','createdAt','updatedAt','updatedBy'];v jsonb;k text;ref jsonb;departments jsonb;old_count integer;i integer;ev jsonb;events jsonb:='[]';snap jsonb;items jsonb;frozen_ids jsonb;seen text[]:=array[]::text[];rowv jsonb;matrix jsonb;caps text[]:=array['editAssessments','createImprovements','updateImprovements','closeImprovements','manageInspections','exportReports','enterManagement','manageUsers','manageFrameworks','viewAuditLogs','manageRolePermissions','manageSystemSettings'];r text;c text;begin
  perform compliance_private.require_fields(b,array['id'],'string');
  perform compliance_private.resource(kind,b->>'id');
  if intent not in ('create','update','close','reopen','finalize','archive','activate','import','role_permissions') then perform compliance_private.fail('INVALID_INTENT');end if;
  if intent in ('archive','activate') and kind not in ('framework','chapter','item','person') then perform compliance_private.fail('INVALID_INTENT');end if;
  if intent in ('close','reopen') and kind<>'improvement' or intent='finalize' and kind<>'inspection' then perform compliance_private.fail('INVALID_INTENT');end if;
  keys:=keys||case kind
   when 'framework' then array['name','description','scoring','active','sourceVersion','scopeLabel']
   when 'chapter' then array['frameworkId','code','name','aim','order','active','priority']
   when 'item' then array['frameworkId','chapterId','code','level','order','active','kpi','guidance','departmentIds','sources','sourceGap','sourceGapResolved','analysisIndex','sourceOriginals','crosswalk','aliases']
   when 'assessment' then array['itemId','response','conformity','reviewed','selfAssessment','evidence','departmentIds','assigneeIds','executionStatus','importedYear','initialDepartmentResponses','sources','note']
   when 'improvement' then array['title','content','itemIds','departmentIds','assigneeIds','source','inspectionId','findingId','sourceKey','urgency','status','percent','targetDate','plan','events','closedAt','closedBy','sources']
   when 'inspection' then array['frameworkId','title','organization','date','type','status','snapshot','results','findings','dryLevels','supersedesId','imported','scoreNote']
   when 'person' then array['username','name','departmentId','role','active','hasPassword','passwordHash','credentialHash']
   when 'dryScore' then array['chapterId','levels','note']
   when 'settings' then array['departments','rolePermissions','siteGateConfigured'] end;
  perform compliance_private.object_keys(b,keys);
  if intent='archive' then b:=b||jsonb_build_object('active',false);elsif intent='activate' then b:=b||jsonb_build_object('active',true);end if;
  if kind in ('framework','chapter','item','person') then perform compliance_private.require_fields(b,array['active'],'boolean');end if;
  if kind in ('framework','chapter') then perform compliance_private.bi(b->'name');end if;
  if kind='framework' then
    perform compliance_private.bi(b->'description');perform compliance_private.bi(b->'scopeLabel');perform compliance_private.require_fields(b,array['sourceVersion'],'string');
    if b->>'scoring' is distinct from (case b->>'id' when 'TMSA' then 'tmsa-stage' else 'drybms-guidance' end) then perform compliance_private.fail('INVALID_SCORING');end if;
  elsif kind in ('chapter','item') then
    if b->>'frameworkId' is null or b->>'frameworkId' not in ('TMSA','DRYBMS') then perform compliance_private.fail('INVALID_REFERENCE');end if;
    perform compliance_private.refs(jsonb_build_array(b->>'frameworkId'),'framework');
    perform compliance_private.require_fields(b,array['code'],'string');
    if length(b->>'code') not between 1 and 80 or b->>'order' is null or b->>'order' !~ '^[0-9]+$' then perform compliance_private.fail('INVALID_ORDER_OR_CODE');end if;
    if old is not null and old->>'frameworkId'<>b->>'frameworkId' then perform compliance_private.fail('IMMUTABLE_IDENTITY');end if;
    if kind='chapter' then if b ? 'aim' then perform compliance_private.bi(b->'aim');end if;if b ? 'priority' then perform compliance_private.require_fields(b,array['priority'],'boolean');end if;
    else
      select body into ref from compliance_private.records where kind='chapter' and id=b->>'chapterId';
      if ref is null or ref->>'frameworkId'<>b->>'frameworkId' then perform compliance_private.fail('INVALID_REFERENCE');end if;
      if b->>'level' is null or b->>'level' not in ('1','2','3','4') then perform compliance_private.fail('INVALID_LEVEL');end if;
      perform compliance_private.bi(b->'kpi');perform compliance_private.bi(b->'guidance');perform compliance_private.refs(b->'departmentIds','department');perform compliance_private.sources(b->'sources');
      if old is not null then
        if b->'sourceOriginals' is distinct from old->'sourceOriginals' or b->'sourceGap' is distinct from old->'sourceGap' or jsonb_array_length(b->'sources')<jsonb_array_length(old->'sources') or exists(select 1 from jsonb_array_elements(old->'sources') with ordinality x(value,n) where b->'sources'->(n::integer-1) is distinct from value) then perform compliance_private.fail('IMMUTABLE_SOURCE');end if;
        if coalesce(old->>'sourceGap','')<>'' and old->'sourceGapResolved' is distinct from 'true'::jsonb and b->'sourceGapResolved'='true'::jsonb and not exists(select 1 from jsonb_array_elements(b->'sources') with ordinality x(value,n) where n>jsonb_array_length(old->'sources') and length(trim(coalesce(value->>'source','')))>0 and length(trim(coalesce(value->>'note','')))>0 and length(trim(coalesce(value->>'file','')))>0 and (length(trim(coalesce(value->>'cell','')||coalesce(value->>'rawItem','')))>0 or jsonb_array_length(coalesce(value->'pages','[]'))>0)) then perform compliance_private.fail('SOURCE_GAP_EVIDENCE_REQUIRED');end if;
      end if;
      if b ? 'sourceGap' then perform compliance_private.require_fields(b,array['sourceGap'],'string');end if;
      if b ? 'sourceGapResolved' then perform compliance_private.require_fields(b,array['sourceGapResolved'],'boolean');end if;
      if b ? 'analysisIndex' then perform compliance_private.require_fields(b,array['analysisIndex'],'boolean');end if;
      if b ? 'sourceOriginals' then
        perform compliance_private.require_fields(b,array['sourceOriginals'],'array');for v in select * from jsonb_array_elements(b->'sourceOriginals') loop perform compliance_private.object_keys(v,array['id','kind','en','page']);perform compliance_private.require_fields(v,array['id','kind','en'],'string');if v->>'page' is null or v->>'page' !~ '^[0-9]+$' then perform compliance_private.fail('INVALID_SOURCE');end if;end loop;
      end if;
      if b ? 'crosswalk' then perform compliance_private.object_keys(b->'crosswalk',array['tmsaItemCodes','match','difference','attention']);perform compliance_private.require_fields(b->'crosswalk',array['match','difference','attention'],'string');perform compliance_private.require_fields(b->'crosswalk',array['tmsaItemCodes'],'array');end if;
      if old is not null then
        b:=b||jsonb_build_object('aliases',coalesce(old->'aliases','[]')||case when old->>'code'<>b->>'code' and not coalesce(old->'aliases','[]') ? (old->>'code') then jsonb_build_array(old->>'code') else '[]'::jsonb end);
      elsif b ? 'aliases' then perform compliance_private.require_fields(b,array['aliases'],'array');end if;
    end if;
  elsif kind='assessment' then
    select body into ref from compliance_private.records where kind='item' and id=b->>'itemId';
    if ref is null or (old is not null and old->>'itemId'<>b->>'itemId') then perform compliance_private.fail('INVALID_REFERENCE');end if;
    perform compliance_private.require_fields(b,array['response'],null);perform compliance_private.require_fields(b,array['reviewed'],'boolean');
    if b->'response' not in ('"yes"','"no"','null') or b->>'conformity' is null or b->>'conformity' not in ('all','partial','none') then perform compliance_private.fail('INVALID_ASSESSMENT');end if;
    if b->>'response'='yes' and b->>'conformity'<>'all' then perform compliance_private.fail('YES_REQUIRES_ALL');end if;
    if b->>'response'='yes' and coalesce(ref->>'sourceGap','')<>'' and ref->'sourceGapResolved' is distinct from 'true'::jsonb then perform compliance_private.fail('SOURCE_GAP_UNRESOLVED');end if;
    perform compliance_private.bi(b->'selfAssessment');perform compliance_private.bi(b->'evidence');if b ? 'note' then perform compliance_private.bi(b->'note');end if;
    perform compliance_private.refs(b->'departmentIds','department');perform compliance_private.refs(b->'assigneeIds','person');perform compliance_private.sources(b->'sources');
    if b->>'executionStatus' is null or b->>'executionStatus' not in ('not_started','in_progress','completed') then perform compliance_private.fail('INVALID_ASSESSMENT');end if;
    if old is not null and (b->'sources' is distinct from old->'sources' or b->'initialDepartmentResponses' is distinct from old->'initialDepartmentResponses' or b->'importedYear' is distinct from old->'importedYear') then perform compliance_private.fail('IMMUTABLE_SOURCE');end if;
    if b ? 'initialDepartmentResponses' then
      perform compliance_private.require_fields(b,array['initialDepartmentResponses'],'array');for v in select * from jsonb_array_elements(b->'initialDepartmentResponses') loop
        perform compliance_private.object_keys(v,array['departmentId','response','assessment','evidence','source']);perform compliance_private.refs(jsonb_build_array(v->>'departmentId'),'department');perform compliance_private.bi(v->'assessment');perform compliance_private.bi(v->'evidence');perform compliance_private.sources(jsonb_build_array(v->'source'));if not v ? 'response' or v->'response' not in ('"yes"','"no"','null') then perform compliance_private.fail('INVALID_ASSESSMENT');end if;
      end loop;
    end if;
  elsif kind='person' then
    perform compliance_private.require_fields(b,array['username','name','departmentId','role'],'string');
    if length(b->>'username') not between 1 and 100 or length(b->>'name') not between 1 and 100 or b->>'role' not in ('owner','admin','operator','vessel') then perform compliance_private.fail('INVALID_PERSON');end if;
    perform compliance_private.refs(jsonb_build_array(b->>'departmentId'),'department');
    if old is null and b->>'role'='owner' then perform compliance_private.fail('OWNER_PROTECTED');end if;
    if old->>'role'='owner' and (actor->>'role'<>'owner' or b->>'role'<>'owner' or b->'active'<>'true'::jsonb) then perform compliance_private.fail('OWNER_PROTECTED');end if;
    if old->>'role'<>'owner' and b->>'role'='owner' then perform compliance_private.fail('USE_TRANSFER_OWNER');end if;
    b:=b-array['passwordHash','credentialHash','hasPassword'];
    b:=b||jsonb_build_object('hasPassword',exists(select 1 from compliance_private.credentials where person_id=b->>'id' and password_hash is not null));
    if b->>'role' in ('owner','admin') and b->'hasPassword'<>'true'::jsonb then perform compliance_private.fail('PASSWORD_REQUIRED');end if;
  elsif kind='improvement' then
    perform compliance_private.require_fields(b,array['title','source','urgency','status','targetDate','plan'],'string');perform compliance_private.bi(b->'content');
    if length(b->>'title')=0 or b->>'source' not in ('external','non_external') or b->>'urgency' not in ('urgent','high','medium','low') or b->>'status' not in ('open','in_progress','closed') or b->>'percent' is null or b->>'percent' !~ '^[0-9]+$' or (b->>'percent')::integer>100 then perform compliance_private.fail('INVALID_IMPROVEMENT');end if;
    perform compliance_private.refs(b->'itemIds','item');perform compliance_private.refs(b->'departmentIds','department');perform compliance_private.refs(b->'assigneeIds','person');perform compliance_private.sources(b->'sources');
    if b->>'source'='external' then
      select body into ref from compliance_private.records where kind='inspection' and id=b->>'inspectionId';
      select f into rowv from jsonb_array_elements(ref->'findings') f where f->>'id'=b->>'findingId';
      if ref is null or rowv is null or rowv->>'classification' not in ('finding','general') or exists(select 1 from jsonb_array_elements_text(b->'itemIds') t where not rowv->'itemIds' ? t) then perform compliance_private.fail('INVALID_EXTERNAL_SOURCE');end if;
      b:=b||jsonb_build_object('sourceKey',(b->>'inspectionId')||':'||(b->>'findingId'));
      if exists(select 1 from compliance_private.records where kind='improvement' and id<>b->>'id' and body->>'sourceKey'=b->>'sourceKey') then perform compliance_private.fail('DUPLICATE_EXTERNAL_SOURCE');end if;
    elsif coalesce(b->>'inspectionId','')<>'' or coalesce(b->>'findingId','')<>'' or coalesce(b->>'sourceKey','')<>'' then perform compliance_private.fail('INVALID_EXTERNAL_SOURCE');end if;
    perform compliance_private.require_fields(b,array['events'],'array');old_count:=coalesce(jsonb_array_length(old->'events'),0);
    if jsonb_array_length(b->'events')<old_count then perform compliance_private.fail('EVENTS_APPEND_ONLY');end if;
    if old_count>0 then for i in 0..old_count-1 loop if b->'events'->i is distinct from old->'events'->i then perform compliance_private.fail('EVENTS_APPEND_ONLY');end if;end loop;end if;
    for ev in select * from jsonb_array_elements(b->'events') loop
      perform compliance_private.object_keys(ev,array['id','at','by','content','status','percent']);perform compliance_private.require_fields(ev,array['id','content'],'string');
      if ev->>'id'=any(seen) or length(ev->>'id')=0 or ev->>'status' is null or ev->>'status' not in ('open','in_progress','closed') or ev->>'percent' is null or ev->>'percent' !~ '^[0-9]+$' or (ev->>'percent')::integer>100 then perform compliance_private.fail('INVALID_EVENT');end if;seen:=array_append(seen,ev->>'id');
      if jsonb_array_length(events)>=old_count and intent<>'import' then ev:=ev||jsonb_build_object('at',clock_timestamp()::text,'by',actor->>'id');end if;events:=events||jsonb_build_array(ev);
    end loop;b:=b||jsonb_build_object('events',events);
    if intent='close' then if old is null or old->>'status'='closed' then perform compliance_private.fail('INVALID_TRANSITION');end if;b:=b||jsonb_build_object('status','closed','closedAt',clock_timestamp()::text,'closedBy',actor->>'id');
    elsif intent='reopen' then if old is null or old->>'status'<>'closed' then perform compliance_private.fail('INVALID_TRANSITION');end if;b:=b||jsonb_build_object('status','open','closedAt',null,'closedBy',null);
    elsif intent<>'import' then
      if b->>'status'='closed' and coalesce(old->>'status','')<>'closed' or old->>'status'='closed' and b->>'status'<>'closed' then perform compliance_private.fail('USE_CLOSE_REOPEN');end if;
      b:=b||jsonb_build_object('closedAt',old->'closedAt','closedBy',old->'closedBy');
    end if;
  elsif kind='dryScore' then
    select body into ref from compliance_private.records where kind='chapter' and id=b->>'chapterId';
    if ref is null or ref->>'frameworkId'<>'DRYBMS' or old is not null and old->>'chapterId'<>b->>'chapterId' then perform compliance_private.fail('INVALID_REFERENCE');end if;
    perform compliance_private.require_fields(b,array['levels'],'array');perform compliance_private.require_fields(b,array['note'],'string');
    if jsonb_array_length(b->'levels')<>4 or exists(select 1 from jsonb_array_elements(b->'levels') x where x not in ('0','25','50','75','100','null')) then perform compliance_private.fail('INVALID_DRY_LEVEL');end if;
  elsif kind='inspection' then
    perform compliance_private.require_fields(b,array['frameworkId','title','organization','date','type','status'],'string');
    if b->>'frameworkId' not in ('TMSA','DRYBMS') or b->>'type' not in ('formal','informal') or b->>'status' not in ('draft','final') then perform compliance_private.fail('INVALID_INSPECTION');end if;
    if old is not null then
      if old->>'status'='final' then perform compliance_private.fail('FINAL_SNAPSHOT_IMMUTABLE');end if;
      if b->'snapshot' is distinct from old->'snapshot' or b->>'frameworkId'<>old->>'frameworkId' or b->'supersedesId' is distinct from old->'supersedesId' or b->'imported' is distinct from old->'imported' then perform compliance_private.fail('IMMUTABLE_SNAPSHOT');end if;snap:=old->'snapshot';
    elsif intent='import' then
      snap:=b->'snapshot';perform compliance_private.object_keys(snap,array['framework','chapters','items','scoringVersion']);
      if snap->'framework'->>'id' is distinct from b->>'frameworkId' then perform compliance_private.fail('INVALID_SNAPSHOT');end if;
    elsif coalesce(b->>'supersedesId','')<>'' then
      select body into ref from compliance_private.records where kind='inspection' and id=b->>'supersedesId';
      if ref is null or ref->>'status'<>'final' or ref->>'frameworkId'<>b->>'frameworkId' or ref->>'id'=b->>'id' then perform compliance_private.fail('INVALID_REVISION');end if;snap:=ref->'snapshot';
    else
      select body into ref from compliance_private.records where kind='framework' and id=b->>'frameworkId' and body->'active'='true';if ref is null then perform compliance_private.fail('INVALID_REFERENCE');end if;
      select coalesce(jsonb_agg(body order by (body->>'order')::integer,id),'[]') into departments from compliance_private.records where kind='chapter' and body->>'frameworkId'=b->>'frameworkId' and body->'active'='true';
      select coalesce(jsonb_agg(r.body order by (r.body->>'order')::integer,r.id),'[]') into items from compliance_private.records r where r.kind='item' and r.body->>'frameworkId'=b->>'frameworkId' and r.body->'active'='true' and exists(select 1 from jsonb_array_elements(departments) d where d->>'id'=r.body->>'chapterId');
      snap:=jsonb_build_object('framework',ref,'chapters',departments,'items',items,'scoringVersion',case b->>'frameworkId' when 'TMSA' then 'company-20-equal-stage-v1' else 'drybms-guidance-v1.1-p7' end);
    end if;
    perform compliance_private.require_fields(snap,array['chapters','items'],'array');perform compliance_private.require_fields(snap,array['scoringVersion'],'string');
    b:=b||jsonb_build_object('snapshot',snap);items:=snap->'items';select coalesce(jsonb_agg(x->>'id'),'[]') into frozen_ids from jsonb_array_elements(items) x;
    perform compliance_private.require_fields(b,array['results','findings'],'array');events:='[]';seen:=array[]::text[];
    for v in select * from jsonb_array_elements(b->'results') loop
      perform compliance_private.object_keys(v,array['itemId','response','conformity','reviewed','observation','recommendation']);perform compliance_private.require_fields(v,array['reviewed'],'boolean');perform compliance_private.require_fields(v,array['response'],null);perform compliance_private.bi(v->'observation');perform compliance_private.bi(v->'recommendation');
      if v->>'itemId' is null or not frozen_ids ? (v->>'itemId') or v->>'itemId'=any(seen) or v->'response' not in ('"yes"','"no"','null') or v->>'conformity' is null or v->>'conformity' not in ('all','partial','none') then perform compliance_private.fail('INVALID_RESULT');end if;
      if v->>'response'='yes' and v->>'conformity'<>'all' then perform compliance_private.fail('YES_REQUIRES_ALL');end if;
      select x into ref from jsonb_array_elements(items) x where x->>'id'=v->>'itemId';if v->>'response'='yes' and coalesce(ref->>'sourceGap','')<>'' and ref->'sourceGapResolved' is distinct from 'true'::jsonb then perform compliance_private.fail('SOURCE_GAP_UNRESOLVED');end if;
      seen:=array_append(seen,v->>'itemId');events:=events||jsonb_build_array(v);
    end loop;
    -- Missing grades remain explicitly unknown, never omitted to raise a score.
    for ref in select * from jsonb_array_elements(items) loop if not ref->>'id'=any(seen) then events:=events||jsonb_build_array(jsonb_build_object('itemId',ref->>'id','response',null,'conformity','none','reviewed',false,'observation',jsonb_build_object('en','','zh',''),'recommendation',jsonb_build_object('en','','zh','')));end if;end loop;
    b:=b||jsonb_build_object('results',events,'status',case when intent='finalize' or intent='import' and b->>'status'='final' then 'final' else 'draft' end,'imported',case when intent='import' then true else coalesce((old->>'imported')::boolean,false) end);
    seen:=array[]::text[];
    for v in select * from jsonb_array_elements(b->'findings') loop
      perform compliance_private.object_keys(v,array['id','itemIds','classification','observation','recommendation','sources','warning']);perform compliance_private.require_fields(v,array['id','classification'],'string');perform compliance_private.require_fields(v,array['itemIds'],'array');perform compliance_private.bi(v->'observation');perform compliance_private.bi(v->'recommendation');perform compliance_private.sources(v->'sources');
      if v->>'id'=any(seen) or v->>'classification' not in ('finding','positive','guidance','no_finding','general') or exists(select 1 from jsonb_array_elements_text(v->'itemIds') x where not frozen_ids ? x) then perform compliance_private.fail('INVALID_FINDING');end if;seen:=array_append(seen,v->>'id');
    end loop;
    if b ? 'dryLevels' then
      if b->>'frameworkId'<>'DRYBMS' then perform compliance_private.fail('INVALID_DRY_LEVEL');end if;
      for k,v in select * from jsonb_each(b->'dryLevels') loop
        if not exists(select 1 from jsonb_array_elements(snap->'chapters') ch where ch->>'id'=k) or jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>4 or exists(select 1 from jsonb_array_elements(v) x where x not in ('0','25','50','75','100','null')) then perform compliance_private.fail('INVALID_DRY_LEVEL');end if;
      end loop;
    end if;if b ? 'scoreNote' then perform compliance_private.bi(b->'scoreNote');end if;
  elsif kind='settings' then
    perform compliance_private.require_fields(b,array['departments'],'array');seen:=array[]::text[];
    for v in select * from jsonb_array_elements(b->'departments') loop
      perform compliance_private.object_keys(v,array['id','name','active']);perform compliance_private.require_fields(v,array['id'],'string');perform compliance_private.require_fields(v,array['active'],'boolean');perform compliance_private.bi(v->'name');
      if v->>'id'=any(seen) or length(v->>'id')=0 then perform compliance_private.fail('INVALID_DEPARTMENT');end if;seen:=array_append(seen,v->>'id');
    end loop;
    if exists(select 1 from compliance_private.records p where p.kind='person' and not p.body->>'departmentId'=any(seen)) then perform compliance_private.fail('DEPARTMENT_IN_USE');end if;
    if b->'siteGateConfigured' is distinct from old->'siteGateConfigured' or b->'rolePermissions' is distinct from old->'rolePermissions' and intent<>'role_permissions' then perform compliance_private.fail('USE_OWNER_SETTINGS_ACTION');end if;
    if intent='role_permissions' then
      if actor->>'role'<>'owner' or b->'departments' is distinct from old->'departments' then perform compliance_private.fail('USE_OWNER_SETTINGS_ACTION');end if;
      perform compliance_private.validate_permissions(b->'rolePermissions');
    end if;
  end if;
  return b;
end $$;

create or replace function compliance_private.state(actor jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;rows jsonb;begin
  -- One SQL statement / one MVCC snapshot for all independent records and metadata.
  with saved as materialized(select * from compliance_private.records)
  select jsonb_build_object(
    'frameworks',coalesce((select jsonb_agg(body order by id) from saved where kind='framework'),'[]'::jsonb),
    'chapters',coalesce((select jsonb_agg(body order by id) from saved where kind='chapter'),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(body order by id) from saved where kind='item'),'[]'::jsonb),
    'assessments',coalesce((select jsonb_agg(body order by id) from saved where kind='assessment'),'[]'::jsonb),
    'improvements',coalesce((select jsonb_agg(body order by id) from saved where kind='improvement'),'[]'::jsonb),
    'inspections',coalesce((select jsonb_agg(body order by id) from saved where kind='inspection'),'[]'::jsonb),
    'people',coalesce((select jsonb_agg(body order by id) from saved where kind='person'),'[]'::jsonb),
    'dryScores',coalesce((select jsonb_agg(body order by id) from saved where kind='dryScore'),'[]'::jsonb),
    'settings',(select body from saved where kind='settings' and id='settings'),
    'cycles',ctl.cycles,'provenance',ctl.provenance,
    'auditLogs',case when compliance_private.allowed(actor,'viewAuditLogs') then coalesce((select jsonb_agg(compliance_private.audit_body(a) order by at desc,id) from (select * from compliance_private.audit order by at desc,id limit 200) a),'[]'::jsonb) else '[]'::jsonb end)
  into result from compliance_private.control ctl where singleton;
  return result||jsonb_build_object('snapshotToken',compliance_private.digest((result-'auditLogs')::text),'serverTime',clock_timestamp()::text);
end $$;
create or replace function compliance_private.audit_body(a compliance_private.audit) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_strip_nulls(jsonb_build_object('id',a.id,'at',a.at,'actorId',a.actor_id,'actorName',a.actor_name,'action',a.action,'kind',a.kind,'entityId',a.entity_id,'itemCodes',a.item_codes,'summary',a.summary,'before',a.before_value,'after',a.after_value,'operationId',a.operation_id))
$$;

create or replace function compliance_private.dispatch(p_action text,p_session text,p_client_id text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
<<dispatch>>
declare ctl compliance_private.control;actor_v jsonb;body jsonb;before_v jsonb;data jsonb;rec jsonb;kind_v text;id_v text;intent_v text;op text;session_hash text:=compliance_private.digest(coalesce(p_session,''));lease_v compliance_private.leases;receipt compliance_private.operations;creds compliance_private.credentials;token_v text;now_v timestamptz:=clock_timestamp();version_v integer;expected integer;keys text[];query_v jsonb;total_v bigint;rows_v jsonb;target jsonb;seed jsonb;mapping record;import_count integer:=0;password_v text;depart_v jsonb;cap text;role_v text;matrix jsonb;row_v jsonb;export_id text; business_kind text; business_id text; dependent jsonb; dependent_before jsonb;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_client_id is null or length(p_client_id) not between 1 and 160 or octet_length(p_payload::text)>40000000 then perform compliance_private.fail('INVALID_PAYLOAD');end if;
 select * into ctl from compliance_private.control where singleton;
 if p_action='bootstrap_status' then return jsonb_build_object('initialized',ctl.initialized,'siteGateConfigured',ctl.gate_hash is not null);end if;
 if p_action='bootstrap' then
  select * into ctl from compliance_private.control where singleton for update;
  if ctl.initialized then perform compliance_private.fail('ALREADY_INITIALIZED');end if;
  password_v:=coalesce(p_payload->>'bootstrapCode',p_payload->>'initializationCode');
  if not compliance_private.check_secret(compliance_private.digest(password_v),ctl.bootstrap_hash) then perform compliance_private.fail('BOOTSTRAP_INVALID');end if;
  id_v:=coalesce(p_payload->'owner'->>'id',pg_catalog.gen_random_uuid()::text);
  perform compliance_private.resource('person',id_v);
  actor_v:=jsonb_build_object('id',id_v,'name',coalesce(p_payload->>'name',p_payload->'owner'->>'name'),'username',coalesce(p_payload->>'username',p_payload->'owner'->>'username'),'departmentId',coalesce(p_payload->>'departmentId',p_payload->'owner'->>'departmentId'),'role','owner','active',true,'hasPassword',true);
  perform compliance_private.require_fields(actor_v,array['name','username','departmentId'],'string');
  if length(actor_v->>'name')=0 or length(actor_v->>'username')=0 then perform compliance_private.fail('INVALID_PERSON');end if;
  body:=compliance_private.default_settings(id_v);if not exists(select 1 from jsonb_array_elements(body->'departments') d where d->>'id'=actor_v->>'departmentId') then perform compliance_private.fail('INVALID_REFERENCE');end if;
  insert into compliance_private.records values('settings','settings',1,body);
  actor_v:=compliance_private.base(actor_v,1,id_v)||jsonb_build_object('hasPassword',true);insert into compliance_private.records values('person',id_v,1,actor_v);
  insert into compliance_private.credentials values(id_v,compliance_private.hash_secret(coalesce(p_payload->>'credentialHash',p_payload->>'passwordHash')),1);
  update compliance_private.control set initialized=true,bootstrap_hash=null,gate_hash=compliance_private.hash_secret(coalesce(p_payload->>'gateHash',p_payload->>'sitePasswordHash')),gate_epoch=gate_epoch+1 where singleton;
  perform compliance_private.log(actor_v,'bootstrap','person',id_v,null,actor_v,coalesce(p_payload->>'operationId',pg_catalog.gen_random_uuid()::text));return jsonb_build_object('initialized',true);
 end if;
 if not ctl.initialized then perform compliance_private.fail('NOT_INITIALIZED');end if;
 if p_action='gate' then
  if not compliance_private.check_secret(p_payload->>'passwordHash',ctl.gate_hash) then perform compliance_private.fail('GATE_DENIED');end if;
  token_v:=compliance_private.token();insert into compliance_private.gates values(compliance_private.digest(token_v),ctl.gate_epoch,now_v+interval '20 minutes');return jsonb_build_object('gateToken',token_v);
 end if;
 if p_action in ('roster','login') then
  if not exists(select 1 from compliance_private.gates where token_hash=compliance_private.digest(coalesce(p_payload->>'gateToken','')) and epoch=ctl.gate_epoch and expires_at>clock_timestamp()) then perform compliance_private.fail('GATE_INVALID');end if;
  if p_action='roster' then
    select coalesce(jsonb_agg(body order by body->>'departmentId',body->>'name'),'[]') into data from compliance_private.records where kind='person' and body->'active'='true';return data;
  end if;
  select * into creds from compliance_private.credentials where person_id=p_payload->>'personId' for share;
  select body into actor_v from compliance_private.records where kind='person' and id=p_payload->>'personId' and body->'active'='true';
  if actor_v is null or creds.person_id is null or actor_v->>'role' in ('owner','admin') and creds.password_hash is null or creds.password_hash is not null and not compliance_private.check_secret(p_payload->>'passwordHash',creds.password_hash) then perform compliance_private.fail('LOGIN_DENIED');end if;
  token_v:=compliance_private.token();insert into compliance_private.sessions values(compliance_private.digest(token_v),creds.person_id,creds.epoch,clock_timestamp()+interval '12 hours',false);return jsonb_build_object('user',actor_v,'currentUser',actor_v,'sessionToken',token_v);
 end if;
 actor_v:=compliance_private.actor(p_session);
 if p_action='current_user' then return actor_v;end if;
 if p_action='logout' then update compliance_private.sessions set revoked=true where token_hash=session_hash;delete from compliance_private.leases where session_hash=dispatch.session_hash;return '{}'::jsonb;end if;
 if p_action='read' then return compliance_private.state(actor_v);end if;
 if p_action='operation_status' then
  select * into receipt from compliance_private.operations o where o.session_hash=dispatch.session_hash and o.client_id=p_client_id and o.operation_id=p_payload->>'operationId';
  if not found then return jsonb_build_object('status','unknown');end if;
  if p_payload ? 'request' and receipt.request is distinct from jsonb_build_object('action',coalesce(p_payload->>'action','save'),'requestDigest',compliance_private.digest((p_payload->'request')::text)) then perform compliance_private.fail('OPERATION_MISMATCH');end if;
  return jsonb_build_object('status','committed','record',receipt.result);
 end if;
 if p_action in ('claim','renew','release','save','role_permissions') then
  kind_v:=p_payload->>'kind';id_v:=coalesce(p_payload->>'id',p_payload->'record'->>'id');perform compliance_private.resource(kind_v,id_v);
  intent_v:=coalesce(p_payload->>'intent','update');op:=p_payload->>'operationId';
  if p_action='save' and intent_v not in ('create','update','close','reopen','finalize','archive','activate') then perform compliance_private.fail('INVALID_INTENT');end if;
  if p_action='role_permissions' and (kind_v<>'settings' or actor_v->>'role'<>'owner' or intent_v<>'update') then perform compliance_private.fail('FORBIDDEN');end if;
  if p_action in ('save','role_permissions') then
    if op is null or op !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$' then perform compliance_private.fail('INVALID_OPERATION_ID');end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('operation:'||session_hash||':'||p_client_id||':'||op,0));
    select * into receipt from compliance_private.operations o where o.session_hash=dispatch.session_hash and o.client_id=p_client_id and o.operation_id=op;
    if found then if receipt.request is distinct from jsonb_build_object('action',p_action,'requestDigest',compliance_private.digest(p_payload::text)) then perform compliance_private.fail('OPERATION_MISMATCH');end if;return receipt.result;end if;
  end if;
  if p_action<>'release' and not compliance_private.write_allowed(actor_v,kind_v,case when p_action in ('claim','renew') and not exists(select 1 from compliance_private.records where kind=kind_v and id=id_v) then 'create' else intent_v end) then perform compliance_private.fail('FORBIDDEN');end if;
  business_kind:=case when kind_v='assessment' then 'item' else kind_v end;
  business_id:=id_v;
  if kind_v='assessment' then
    select r.body->>'itemId' into business_id from compliance_private.records r where r.kind='assessment' and r.id=id_v;
    business_id:=coalesce(business_id,id_v); -- Creation uses the actual item ID, not a guessed namespace rewrite.
    select r.body into dependent from compliance_private.records r where r.kind='item' and r.id=business_id;
    if dependent is null then perform compliance_private.fail('INVALID_REFERENCE');end if;
    if dependent->'active' is distinct from 'true'::jsonb then perform compliance_private.fail('INACTIVE_ITEM');end if;
  end if;
  -- Credentials precede person rows. NOWAIT avoids cross-admin credential deadlocks.
  if p_action in ('save','role_permissions') and kind_v='person' then perform 1 from compliance_private.credentials where person_id=id_v for update nowait;end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('record:'||business_kind||':'||business_id,0));
  select body,version into before_v,version_v from compliance_private.records where kind=kind_v and id=id_v for update;
  if kind_v='person' and before_v->>'role'='owner' and actor_v->>'role'<>'owner' then perform compliance_private.fail('OWNER_PROTECTED');end if;
  select * into lease_v from compliance_private.leases where kind=business_kind and id=business_id for update;
  if p_action='claim' then
    if lease_v.expires_at>clock_timestamp() and (lease_v.session_hash<>session_hash or lease_v.client_id<>p_client_id) then
      select body->>'name' into token_v from compliance_private.records r join compliance_private.sessions s on s.person_id=r.id where r.kind='person' and s.token_hash=lease_v.session_hash;
      raise exception using errcode='P0001',message='LEASE_HELD',detail=coalesce(token_v,'另一位使用者');
    end if;
    if lease_v.expires_at>clock_timestamp() and lease_v.session_hash=session_hash and lease_v.client_id=p_client_id then token_v:=lease_v.token;else token_v:=compliance_private.token();end if;
    insert into compliance_private.leases values(business_kind,business_id,token_v,session_hash,p_client_id,clock_timestamp()+interval '75 seconds') on conflict(kind,id) do update set token=excluded.token,session_hash=excluded.session_hash,client_id=excluded.client_id,expires_at=excluded.expires_at returning * into lease_v;
  else
    if lease_v.token is null or lease_v.session_hash<>session_hash or lease_v.client_id<>p_client_id or lease_v.token is distinct from coalesce(p_payload->>'leaseToken',p_payload->>'token') or lease_v.expires_at<=clock_timestamp() then perform compliance_private.fail('LEASE_LOST');end if;
    if p_action='release' then delete from compliance_private.leases where kind=business_kind and id=business_id;return '{}'::jsonb;end if;
    if p_action='renew' then update compliance_private.leases set expires_at=clock_timestamp()+interval '75 seconds' where kind=business_kind and id=business_id returning * into lease_v;
    else
      if p_payload->>'expectedVersion' is null or p_payload->>'expectedVersion' !~ '^[0-9]+$' then perform compliance_private.fail('INVALID_VERSION');end if;expected:=(p_payload->>'expectedVersion')::integer;
      if coalesce(version_v,0)<>expected then perform compliance_private.fail('VERSION_CONFLICT');end if;
      if before_v is null and intent_v<>'create' or before_v is not null and intent_v='create' then perform compliance_private.fail('INVALID_INTENT');end if;
      body:=p_payload->'record';if kind_v='assessment' and body->>'itemId' is distinct from business_id then perform compliance_private.fail('LEASE_RESOURCE_MISMATCH');end if;if body->>'version' is distinct from expected::text then perform compliance_private.fail('INVALID_VERSION');end if;
      if kind_v='person' then
        password_v:=coalesce(p_payload->>'passwordHash',body->>'passwordHash',body->>'credentialHash');
        if before_v is null then insert into compliance_private.credentials(person_id) values(id_v);end if;
        if password_v is not null then
          if password_v='' then update compliance_private.credentials set password_hash=null,epoch=epoch+1 where person_id=id_v;
          else update compliance_private.credentials set password_hash=compliance_private.hash_secret(password_v),epoch=epoch+1 where person_id=id_v;end if;
        end if;
      end if;
      body:=compliance_private.validate_record(kind_v,body,before_v,case when p_action='role_permissions' then 'role_permissions' else intent_v end,actor_v);
      body:=compliance_private.base(body,expected+1,actor_v->>'id',before_v->>'createdAt')||case when kind_v='person' then jsonb_build_object('hasPassword',exists(select 1 from compliance_private.credentials where person_id=id_v and password_hash is not null)) else '{}'::jsonb end;
      insert into compliance_private.records values(kind_v,id_v,expected+1,body) on conflict(kind,id) do update set version=excluded.version,body=excluded.body;
      if kind_v='person' and (before_v->'role' is distinct from body->'role' or before_v->'active' is distinct from body->'active') then update compliance_private.credentials set epoch=epoch+1 where person_id=id_v;end if;
      if kind_v='item' and before_v is not null and (before_v->'kpi' is distinct from body->'kpi' or before_v->'guidance' is distinct from body->'guidance' or before_v->'level' is distinct from body->'level' or before_v->'chapterId' is distinct from body->'chapterId') then
        select r.body into dependent_before from compliance_private.records r where r.kind='assessment' and r.body->>'itemId'=id_v for update;
        if dependent_before is not null then
          dependent:=compliance_private.base(dependent_before||jsonb_build_object('reviewed',false),(dependent_before->>'version')::integer+1,actor_v->>'id',dependent_before->>'createdAt');
          update compliance_private.records set version=(dependent->>'version')::integer,body=dependent where kind='assessment' and id=dependent_before->>'id';
          perform compliance_private.log(actor_v,'requirement_reconfirmation','assessment',dependent_before->>'id',dependent_before,dependent,op);
        end if;
      end if;
      perform compliance_private.log(actor_v,case when p_action='role_permissions' then p_action else intent_v end,kind_v,id_v,before_v,body,op);
      insert into compliance_private.operations values(session_hash,p_client_id,op,jsonb_build_object('action',p_action,'requestDigest',compliance_private.digest(p_payload::text)),body,clock_timestamp());
      -- Person credentials may be submitted outside record; retain only a private digest in receipts.
      if p_payload ? 'passwordHash' or p_payload ? 'credentialHash' or p_payload->'record' ? 'passwordHash' or p_payload->'record' ? 'credentialHash' then
        update compliance_private.operations o set request=jsonb_build_object('action',p_action,'requestDigest',compliance_private.digest(p_payload::text)) where o.session_hash=dispatch.session_hash and o.client_id=p_client_id and o.operation_id=op;
      end if;
      return body;
    end if;
  end if;
  return jsonb_build_object('resourceKey',business_kind||':'||business_id,'token',lease_v.token,'expiresAt',lease_v.expires_at,'holderName',actor_v->>'name','holderId',actor_v->>'id','baseVersion',coalesce(version_v,0));
 end if;
 if p_action='import_seed' then
   if actor_v->>'role'<>'owner' then perform compliance_private.fail('FORBIDDEN');end if;
   select * into ctl from compliance_private.control where singleton for update;
   if ctl.imported or exists(select 1 from compliance_private.records where kind not in ('person','settings')) then perform compliance_private.fail('WORKSPACE_NOT_FRESH');end if;
   seed:=p_payload->'seed';perform compliance_private.object_keys(seed,array['schemaVersion','frameworks','chapters','items','assessments','improvements','inspections','dryScores','cycles','provenance','sourceManifest','importNote']);
   if seed->>'schemaVersion' is distinct from '1' then perform compliance_private.fail('INVALID_SEED');end if;perform compliance_private.bi(seed->'importNote');
   perform compliance_private.require_fields(seed,array['frameworks','chapters','items','assessments','improvements','inspections','dryScores','cycles','provenance','sourceManifest'],'array');
   -- Insert all rows inside this RPC's subtransaction; validate the entire graph before publication.
   for mapping in select * from (values('framework','frameworks'),('chapter','chapters'),('item','items'),('assessment','assessments'),('inspection','inspections'),('improvement','improvements'),('dryScore','dryScores')) m(kind,collection) loop
     for rec in select * from jsonb_array_elements(seed->mapping.collection) loop
       perform compliance_private.resource(mapping.kind,rec->>'id');body:=compliance_private.base(rec,1,actor_v->>'id');insert into compliance_private.records values(mapping.kind,rec->>'id',1,body);import_count:=import_count+1;
     end loop;
   end loop;
   for mapping in select * from (values('framework','frameworks'),('chapter','chapters'),('item','items'),('assessment','assessments'),('inspection','inspections'),('improvement','improvements'),('dryScore','dryScores')) m(kind,collection) loop
     for rec in select body from compliance_private.records where kind=mapping.kind loop
       body:=compliance_private.validate_record(mapping.kind,rec,null,'import',actor_v);update compliance_private.records set body=dispatch.body||jsonb_build_object('version',1) where kind=mapping.kind and id=rec->>'id';
     end loop;
   end loop;
   update compliance_private.control set imported=true,cycles=compliance_private.safe(seed->'cycles'),provenance=compliance_private.safe(seed->'provenance'),source_manifest=compliance_private.safe(seed->'sourceManifest') where singleton;
   perform compliance_private.log(actor_v,'import_seed','workspace','seed',null,jsonb_build_object('imported',import_count,'sourceManifest',compliance_private.safe(seed->'sourceManifest'),'importNote',seed->'importNote'),coalesce(p_payload->>'operationId',pg_catalog.gen_random_uuid()::text));return jsonb_build_object('imported',import_count);
 end if;
 if p_action='audit_query' then
   if not compliance_private.allowed(actor_v,'viewAuditLogs') then perform compliance_private.fail('FORBIDDEN');end if;
   query_v:=p_payload;perform compliance_private.object_keys(query_v,array['text','kind','itemCode','actorId','from','to','offset','limit']);
   if coalesce(query_v->>'offset','0') !~ '^[0-9]+$' or coalesce(query_v->>'limit','50') !~ '^[0-9]+$' or coalesce((query_v->>'limit')::integer,50) not between 1 and 200 then perform compliance_private.fail('INVALID_QUERY');end if;
   select count(*) into total_v from compliance_private.audit a where compliance_private.audit_matches(a,query_v);
   select coalesce(jsonb_agg(compliance_private.audit_body(a) order by a.at desc,a.id),'[]') into rows_v from (select * from compliance_private.audit a where compliance_private.audit_matches(a,query_v) order by at desc,id offset coalesce((query_v->>'offset')::integer,0) limit coalesce((query_v->>'limit')::integer,50)) a;
   return jsonb_build_object('rows',rows_v,'total',total_v);
 end if;
 if p_action='site_password' then
   if actor_v->>'role'<>'owner' then perform compliance_private.fail('FORBIDDEN');end if;
   select * into creds from compliance_private.credentials where person_id=actor_v->>'id';
   if not compliance_private.check_secret(coalesce(p_payload->>'credentialHash',p_payload->>'currentPasswordHash'),creds.password_hash) then perform compliance_private.fail('CREDENTIAL_RECHECK_FAILED');end if;
   update compliance_private.control set gate_hash=compliance_private.hash_secret(coalesce(p_payload->>'newGateHash',p_payload->>'gateHash',p_payload->>'passwordHash')),gate_epoch=gate_epoch+1 where singleton;
   select r.body into before_v from compliance_private.records r where r.kind='settings' and r.id='settings' for update;
   body:=compliance_private.base(before_v,(before_v->>'version')::integer+1,actor_v->>'id',before_v->>'createdAt');
   update compliance_private.records set version=(dispatch.body->>'version')::integer,body=dispatch.body where kind='settings' and id='settings';
   perform compliance_private.log(actor_v,'site_password','settings','settings',before_v,body,coalesce(p_payload->>'operationId',pg_catalog.gen_random_uuid()::text));return jsonb_build_object('changed',true);
 end if;
 if p_action='transfer_owner' then
   if actor_v->>'role'<>'owner' then perform compliance_private.fail('FORBIDDEN');end if;
   select * into creds from compliance_private.credentials where person_id=actor_v->>'id';
   if not compliance_private.check_secret(coalesce(p_payload->>'credentialHash',p_payload->>'currentPasswordHash'),creds.password_hash) then perform compliance_private.fail('CREDENTIAL_RECHECK_FAILED');end if;
   id_v:=coalesce(p_payload->>'targetId',p_payload->>'personId');if id_v=actor_v->>'id' then perform compliance_private.fail('INVALID_TRANSFER');end if;
   perform 1 from compliance_private.credentials where person_id=id_v for update nowait;
   select body into target from compliance_private.records where kind='person' and id=id_v for update;
   if target is null or target->'active'<>'true'::jsonb or not exists(select 1 from compliance_private.credentials where person_id=id_v and password_hash is not null) then perform compliance_private.fail('TARGET_PASSWORD_REQUIRED');end if;
   row_v:=target;before_v:=actor_v;body:=compliance_private.base(actor_v||jsonb_build_object('role','admin'),(actor_v->>'version')::integer+1,actor_v->>'id',actor_v->>'createdAt')||jsonb_build_object('hasPassword',true);
   update compliance_private.records set version=(dispatch.body->>'version')::integer,body=dispatch.body where kind='person' and id=actor_v->>'id';
   target:=compliance_private.base(target||jsonb_build_object('role','owner'),(target->>'version')::integer+1,actor_v->>'id',target->>'createdAt')||jsonb_build_object('hasPassword',true);
   update compliance_private.records set version=(target->>'version')::integer,body=target where kind='person' and id=id_v;
   update compliance_private.credentials set epoch=epoch+1 where person_id in (actor_v->>'id',id_v);
   op:=coalesce(p_payload->>'operationId',pg_catalog.gen_random_uuid()::text);
   perform compliance_private.log(actor_v,'transfer_owner','person',actor_v->>'id',before_v,body,op);
   perform compliance_private.log(actor_v,'transfer_owner','person',id_v,row_v,target,op);return jsonb_build_object('transferred',true);
 end if;
 if p_action='export_authorize' then
   if not compliance_private.allowed(actor_v,'exportReports') then perform compliance_private.fail('FORBIDDEN');end if;
   perform compliance_private.object_keys(p_payload,array['format','kind','ids','frameworkId','filters','snapshotToken','operationId']);perform compliance_private.require_fields(p_payload,array['ids'],'array');
   if p_payload->>'format' is null or p_payload->>'format' not in ('xlsx','pdf') or p_payload->>'kind' is null or p_payload->>'kind' not in ('framework','improvements','inspection','overview') then perform compliance_private.fail('INVALID_EXPORT');end if;
   data:=compliance_private.state(actor_v);if p_payload->>'snapshotToken' is distinct from data->>'snapshotToken' then perform compliance_private.fail('SNAPSHOT_STALE');end if;
   kind_v:=p_payload->>'kind';
   if kind_v<>'overview' and jsonb_array_length(p_payload->'ids')=0 then perform compliance_private.fail('EMPTY_SELECTION');end if;
   if jsonb_array_length(p_payload->'ids')<>(select count(distinct x#>>'{}') from jsonb_array_elements(p_payload->'ids') x) then perform compliance_private.fail('INVALID_SELECTION');end if;
   for rec in select * from jsonb_array_elements(p_payload->'ids') loop
     if jsonb_typeof(rec)<>'string' then perform compliance_private.fail('INVALID_SELECTION');end if;
     if kind_v='improvements' then select body into target from compliance_private.records where kind='improvement' and id=rec#>>'{}';if target is null or not compliance_private.improvement_matches(target,coalesce(p_payload->'filters','{}')) then perform compliance_private.fail('INVALID_SELECTION');end if;
     elsif kind_v='inspection' then if not exists(select 1 from compliance_private.records where kind='inspection' and id=rec#>>'{}') then perform compliance_private.fail('INVALID_SELECTION');end if;
     elsif kind_v='framework' then if not exists(select 1 from compliance_private.records where kind in ('framework','chapter','item') and id=rec#>>'{}' and coalesce(body->>'frameworkId',id)=coalesce(p_payload->>'frameworkId',coalesce(body->>'frameworkId',id))) then perform compliance_private.fail('INVALID_SELECTION');end if;end if;
   end loop;
   export_id:=pg_catalog.gen_random_uuid()::text;insert into compliance_private.exports values(export_id,actor_v->>'id',p_payload,data,clock_timestamp());
   with codes as (
     select i->>'code' as code from jsonb_array_elements(data->'items') i
     where kind_v='improvements' and exists(select 1 from jsonb_array_elements(data->'improvements') v where p_payload->'ids' ? (v->>'id') and v->'itemIds' ? (i->>'id'))
       or kind_v in ('framework','overview') and i->'active'='true'::jsonb and (p_payload->'ids' ? (i->>'frameworkId') or p_payload->'ids' ? (i->>'chapterId') or p_payload->'ids' ? (i->>'id'))
     union all
     select i->>'code' from jsonb_array_elements(data->'inspections') v cross join lateral jsonb_array_elements(v->'snapshot'->'items') i where kind_v='inspection' and p_payload->'ids' ? (v->>'id')
   ) select coalesce(jsonb_agg(code order by code),'[]') into rows_v from (select distinct code from codes where code is not null) unique_codes;
   perform compliance_private.log(actor_v,'export_authorize','export',export_id,null,jsonb_build_object('format',p_payload->>'format','kind',kind_v,'selectedIds',p_payload->'ids','filters',compliance_private.safe(p_payload->'filters'),'snapshotToken',data->>'snapshotToken','snapshotReceipt',export_id),coalesce(p_payload->>'operationId',export_id),rows_v);return data;
 end if;
 perform compliance_private.fail('UNKNOWN_ACTION');return null;
end $$;

create or replace function compliance_private.audit_matches(a compliance_private.audit,q jsonb) returns boolean language sql stable security definer set search_path='' as $$
select (coalesce(q->>'kind','')='' or a.kind=q->>'kind') and (coalesce(q->>'actorId','')='' or a.actor_id=q->>'actorId') and (coalesce(q->>'itemCode','')='' or a.item_codes ? (q->>'itemCode')) and (coalesce(q->>'from','')='' or a.at>=(q->>'from')::timestamptz) and (coalesce(q->>'to','')='' or a.at<case when length(q->>'to')=10 then (q->>'to')::timestamptz+interval '1 day' else (q->>'to')::timestamptz end) and (coalesce(q->>'text','')='' or position(lower(q->>'text') in lower(a.summary||' '||a.actor_name||' '||a.item_codes::text||' '||coalesce(a.before_value::text,'')||' '||coalesce(a.after_value::text,'')))>0)
$$;
create or replace function compliance_private.improvement_matches(b jsonb,f jsonb) returns boolean language sql stable security definer set search_path='' as $$
select (coalesce(f->>'frameworkId','all')='all' or exists(select 1 from compliance_private.records i where i.kind='item' and b->'itemIds' ? i.id and i.body->>'frameworkId'=f->>'frameworkId')) and (coalesce(f->>'chapterId','')='' or exists(select 1 from compliance_private.records i where i.kind='item' and b->'itemIds' ? i.id and i.body->>'chapterId'=f->>'chapterId')) and (coalesce(f->>'departmentId','')='' or b->'departmentIds' ? (f->>'departmentId')) and (coalesce(f->>'personId','')='' or b->'assigneeIds' ? (f->>'personId')) and (coalesce(f->>'status','')='' or b->>'status'=f->>'status') and (coalesce(f->>'urgency','')='' or b->>'urgency'=f->>'urgency') and (coalesce(f->>'from','')='' or left(b->>'updatedAt',10)>=f->>'from') and (coalesce(f->>'to','')='' or left(b->>'updatedAt',10)<=f->>'to') and (coalesce(f->>'query','')='' or position(lower(f->>'query') in lower((b->>'title')||' '||(b->'content'->>'en')||' '||(b->'content'->>'zh')||' '||(b->>'plan')||' '||(select coalesce(string_agg(i.body->>'code',' '),'') from compliance_private.records i where i.kind='item' and b->'itemIds' ? i.id)||' '||(select coalesce(string_agg(e->>'content',' '),'') from jsonb_array_elements(b->'events') e)))>0)
$$;

create or replace function public.compliance_rpc(p_action text,p_session text,p_client_id text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare result jsonb;code_v text;detail_v text;begin
 result:=compliance_private.dispatch(p_action,p_session,p_client_id,p_payload);return jsonb_build_object('ok',true,'data',result);
exception when sqlstate 'P0001' then
 get stacked diagnostics code_v=message_text,detail_v=pg_exception_detail;
 return jsonb_strip_nulls(jsonb_build_object('ok',false,'code',code_v,'message',case code_v when 'LEASE_HELD' then '此記錄正由另一位使用者編輯。' when 'SESSION_INVALID' then '登入已失效，草稿請保留並重新登入。' when 'VERSION_CONFLICT' then '雲端版本已更新，請保留草稿並重新核對。' when 'LEASE_LOST' then '編輯鎖已失效，草稿尚未保存。' when 'FORBIDDEN' then '目前角色沒有這項權限。' else '伺服器拒絕操作：'||code_v end,'holderName',case when code_v='LEASE_HELD' then detail_v end));
when unique_violation then return jsonb_build_object('ok',false,'code','DUPLICATE_RECORD','message','代碼、帳號或來源已存在。');
when lock_not_available or deadlock_detected or serialization_failure then return jsonb_build_object('ok',false,'code','WRITE_BUSY','message','權限或記錄正被更新，請保留草稿再試。');
when others then return jsonb_build_object('ok',false,'code','DB_'||sqlstate,'message','資料格式或交易驗證失敗；未完成保存。');
end $$;
revoke all on function public.compliance_rpc(text,text,text,jsonb) from public;
revoke all on all tables in schema compliance_private from public;
revoke all on all sequences in schema compliance_private from public;
revoke all on all functions in schema compliance_private from public;
do $$ declare r text;t record;begin
 for t in select tablename from pg_catalog.pg_tables where schemaname='compliance_private' loop execute format('alter table compliance_private.%I enable row level security',t.tablename);end loop;
 for r in select rolname from pg_catalog.pg_roles where rolname in ('anon','authenticated') loop
  execute format('revoke all on schema compliance_private from %I',r);
  execute format('revoke all on all tables in schema compliance_private from %I',r);
  execute format('revoke all on all sequences in schema compliance_private from %I',r);
  execute format('revoke all on all functions in schema compliance_private from %I',r);
  execute format('grant usage on schema public to %I',r);
  execute format('grant execute on function public.compliance_rpc(text,text,text,jsonb) to %I',r);
 end loop;
end $$;
comment on function public.compliance_rpc(text,text,text,jsonb) is 'Dedicated compliance workspace; opaque session authority; private per-record storage; 75-second fenced leases; CAS and immutable operation receipts.';
commit;
