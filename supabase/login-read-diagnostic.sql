-- Dedicated TMSA-DryBMS-system only (project ref: fvdzmktjmoeysdfjeuuq).
-- READ ONLY: diagnose the post-login reader, not install/import/reset.
-- SQL Editor execution is a private-reader timing probe, NOT browser login acceptance.
-- No names, source text, credential hashes or session tokens are returned.
-- The 20-second budget is local to this read-only diagnostic transaction.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '20s';
set local lock_timeout = '2s';

do $diagnostic$
declare
  report jsonb := jsonb_build_object(
    'scope', 'Post-login private reader timing + JSON encoding only; NOT browser/API acceptance',
    'productionBusinessWrites', 0,
    'authenticationWrites', 0,
    'testedAs', 'SQL Editor role via existing security-definer reader',
    'stage', 'preflight'
  );
  reader_matches boolean;
  rpc_matches boolean;
  owner_count integer;
  actor_body jsonb;
  snapshot jsonb;
  bootstrap_reply jsonb;
  started timestamptz;
  generation_ms numeric;
  encoding_ms numeric;
  response_bytes bigint;
  imported_flag boolean;
  phase text := 'preflight';
  safe_code text;
begin
  select md5(replace(p.prosrc, E'\r\n', E'\n')) = 'd8ba1c3d29a7265ce85845c58288071c'
    into reader_matches
    from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure('compliance_private.state(jsonb)');
  select md5(replace(p.prosrc, E'\r\n', E'\n')) = '999bb75b6d31297eeba8a5090ccb6ee2'
    into rpc_matches
    from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure('public.compliance_rpc(text,text,text,jsonb)');
  report := report || jsonb_build_object(
    'baselineReaderMatches', coalesce(reader_matches, false),
    'baselineRpcMatches', coalesce(rpc_matches, false)
  );
  if reader_matches is distinct from true or rpc_matches is distinct from true then
    report := report || jsonb_build_object('status', 'UNEXPECTED_FUNCTION_VERSION');
    perform pg_catalog.set_config('compliance_diagnostic.report', report::text, true);
    return;
  end if;

  select count(*) into owner_count
    from compliance_private.records
    where kind = 'person' and body->>'role' = 'owner' and body->'active' = 'true'::jsonb;
  report := report || jsonb_build_object('activeOwnerCount', owner_count);
  if owner_count <> 1 then
    report := report || jsonb_build_object('status', 'OWNER_COUNT_NOT_ONE');
    perform pg_catalog.set_config('compliance_diagnostic.report', report::text, true);
    return;
  end if;
  select body into actor_body from compliance_private.records
    where kind = 'person' and body->>'role' = 'owner' and body->'active' = 'true'::jsonb;
  select imported into imported_flag from compliance_private.control where singleton;
  report := report || jsonb_build_object('imported', imported_flag);

  phase := 'bootstrap_status';
  started := pg_catalog.clock_timestamp();
  bootstrap_reply := public.compliance_rpc('bootstrap_status', '', 'readonly-login-diagnostic', '{}'::jsonb);
  report := report || jsonb_build_object(
    'bootstrapElapsedMs', round(extract(epoch from (pg_catalog.clock_timestamp() - started)) * 1000, 2),
    'bootstrapOk', bootstrap_reply->'ok' = 'true'::jsonb,
    'initialized', bootstrap_reply->'data'->'initialized',
    'siteGateConfigured', bootstrap_reply->'data'->'siteGateConfigured'
  );
  if bootstrap_reply->'ok' is distinct from 'true'::jsonb then
    report := report || jsonb_build_object('status', 'BOOTSTRAP_NOT_CONFIRMED', 'stage', phase);
    perform pg_catalog.set_config('compliance_diagnostic.report', report::text, true);
    return;
  end if;

  phase := 'state_generation';
  started := pg_catalog.clock_timestamp();
  snapshot := compliance_private.state(actor_body);
  generation_ms := round(extract(epoch from (pg_catalog.clock_timestamp() - started)) * 1000, 2);
  report := report || jsonb_build_object('stateGenerationMs', generation_ms);

  phase := 'response_encoding';
  started := pg_catalog.clock_timestamp();
  -- Model one JSON response envelope and its UTF-8 bytes. This does NOT time
  -- PostgREST planning, session admission, TLS, browser transfer or parsing.
  response_bytes := pg_catalog.octet_length(pg_catalog.convert_to(
    jsonb_build_object('ok', true, 'data', snapshot)::text, 'UTF8'
  ));
  encoding_ms := round(extract(epoch from (pg_catalog.clock_timestamp() - started)) * 1000, 2);
  report := report || jsonb_build_object(
    'responseEncodingMs', encoding_ms,
    'generationAndEncodingMs', generation_ms + encoding_ms,
    'responseBytes', response_bytes,
    'counts', jsonb_build_object(
      'framework', jsonb_array_length(snapshot->'frameworks'),
      'chapter', jsonb_array_length(snapshot->'chapters'),
      'item', jsonb_array_length(snapshot->'items'),
      'assessment', jsonb_array_length(snapshot->'assessments'),
      'improvement', jsonb_array_length(snapshot->'improvements'),
      'inspection', jsonb_array_length(snapshot->'inspections'),
      'dryScore', jsonb_array_length(snapshot->'dryScores'),
      'person', jsonb_array_length(snapshot->'people')
    ),
    'status', 'COMPLETED_READ_DIAGNOSTIC',
    'stage', 'completed'
  );
  perform pg_catalog.set_config('compliance_diagnostic.report', report::text, true);
exception
  when query_canceled then
    report := report || jsonb_build_object(
      'status', 'READ_DIAGNOSTIC_TIMEOUT', 'stage', phase, 'safeCode', '57014',
      'phaseElapsedMs', case when started is null then null else
        round(extract(epoch from (pg_catalog.clock_timestamp() - started)) * 1000, 2) end
    );
    perform pg_catalog.set_config('compliance_diagnostic.report', report::text, true);
  when others then
    get stacked diagnostics safe_code = returned_sqlstate;
    report := report || jsonb_build_object(
      'status', 'READ_DIAGNOSTIC_ERROR', 'stage', phase, 'safeCode', safe_code
    );
    perform pg_catalog.set_config('compliance_diagnostic.report', report::text, true);
end
$diagnostic$;

select pg_catalog.current_setting('compliance_diagnostic.report')::jsonb as login_read_diagnostic;
commit;
