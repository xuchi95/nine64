create or replace function public.engine_profile_publish(
  _slug text,
  _config jsonb,
  _status text,
  _enabled boolean,
  _reason text,
  _actor uuid,
  _expected_version integer,
  _benchmark_id uuid default null,
  _stockfish_version text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.engine_profiles;
  v_next integer;
begin
  if coalesce(length(btrim(_reason)), 0) < 10 then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;
  if _status not in ('draft','canary','published','disabled') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS');
  end if;

  select * into v_row from public.engine_profiles where slug = _slug for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if _expected_version is not null and v_row.version <> _expected_version then
    return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'version', v_row.version);
  end if;

  v_next := v_row.version + 1;

  update public.engine_profiles
     set config = _config,
         draft_config = _config,
         has_draft = false,
         status = _status,
         enabled = _enabled,
         version = v_next,
         reason = _reason,
         updated_by = _actor,
         published_at = now(),
         stockfish_version = coalesce(_stockfish_version, stockfish_version)
   where slug = _slug;

  insert into public.engine_profile_versions
    (profile_id, slug, version, status, enabled, config, stockfish_version, benchmark_id, reason, changed_by)
  values
    (v_row.id, _slug, v_next, _status, _enabled, _config,
     coalesce(_stockfish_version, v_row.stockfish_version), _benchmark_id, _reason, _actor);

  return jsonb_build_object('ok', true, 'version', v_next);
end;
$$;

revoke all on function public.engine_profile_publish(text, jsonb, text, boolean, text, uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.engine_profile_publish(text, jsonb, text, boolean, text, uuid, integer, uuid, text) to service_role;

create or replace function public.ai_prompt_publish(
  _key text,
  _body text,
  _model text,
  _reason text,
  _expected_version integer,
  _actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_prompts;
  v_next integer;
begin
  if coalesce(length(btrim(_reason)), 0) < 10 then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;
  if coalesce(length(btrim(_body)), 0) < 40 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_BODY');
  end if;

  select * into v_row from public.ai_prompts where key = _key for update;

  if not found then
    if _expected_version is not null and _expected_version <> 0 then
      return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'version', 0);
    end if;
    insert into public.ai_prompts (key, body, draft_body, has_draft, version, model, reason, updated_by, published_at)
    values (_key, _body, _body, false, 1, _model, _reason, _actor, now())
    returning * into v_row;
    v_next := 1;
  else
    if _expected_version is not null and v_row.version <> _expected_version then
      return jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'version', v_row.version);
    end if;
    v_next := v_row.version + 1;
    update public.ai_prompts
       set body = _body,
           draft_body = _body,
           has_draft = false,
           version = v_next,
           model = _model,
           reason = _reason,
           updated_by = _actor,
           published_at = now(),
           updated_at = now()
     where key = _key;
  end if;

  insert into public.ai_prompt_versions (prompt_id, key, version, body, model, reason, changed_by)
  values (v_row.id, _key, v_next, _body, _model, _reason, _actor);

  return jsonb_build_object('ok', true, 'version', v_next);
end;
$$;

revoke all on function public.ai_prompt_publish(text, text, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.ai_prompt_publish(text, text, text, text, integer, uuid) to service_role;