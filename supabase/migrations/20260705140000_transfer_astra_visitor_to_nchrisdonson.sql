-- Transfer anonymous Astra dev workspace to nchrisdonson@gmail.com (idempotent)

DO $$
DECLARE
  target_user_id uuid;
  platform_ws_id uuid;
  primary_workspace_id uuid;
  primary_astra_key constant text := 'ak_6cae9ddc5b654d5c9eb76674da4cb84f';
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = 'nchrisdonson@gmail.com'
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User nchrisdonson@gmail.com not found in auth.users';
  END IF;

  INSERT INTO public.worker_workspaces (user_id, worker_slug, name)
  VALUES (target_user_id, 'astra', 'My Space')
  ON CONFLICT DO NOTHING;

  SELECT id INTO platform_ws_id
  FROM public.worker_workspaces
  WHERE user_id = target_user_id
    AND worker_slug = 'astra'
  ORDER BY created_at ASC
  LIMIT 1;

  IF platform_ws_id IS NULL THEN
    RAISE EXCEPTION 'Failed to resolve worker_workspaces row for astra';
  END IF;

  SELECT aw.id INTO primary_workspace_id
  FROM public.astra_workspaces aw
  WHERE aw.astra_key = primary_astra_key
  LIMIT 1;

  IF primary_workspace_id IS NULL THEN
    SELECT aw.id INTO primary_workspace_id
    FROM public.astra_workspaces aw
    WHERE aw.user_id IS NULL
      AND aw.astra_key NOT IN (
        'ak_chrysty_benchmark_suite',
        'ak_backgroundjob_smoke_test',
        'ak_smoketest000000000000000000000000'
      )
    ORDER BY (
      (SELECT COUNT(*) FROM public.astra_generated_documents gd WHERE gd.workspace_id = aw.id)
      + (SELECT COUNT(*) FROM public.astra_conversation_turns ct WHERE ct.workspace_id = aw.id)
      + (SELECT COUNT(*) FROM public.astra_background_jobs bj WHERE bj.workspace_id = aw.id)
    ) DESC,
    aw.created_at ASC
    LIMIT 1;
  END IF;

  IF primary_workspace_id IS NULL THEN
    RAISE EXCEPTION 'No anonymous Astra workspace found to transfer';
  END IF;

  UPDATE public.astra_workspaces
  SET is_default = false
  WHERE user_id = target_user_id
    AND id <> primary_workspace_id;

  UPDATE public.astra_workspaces
  SET
    user_id = target_user_id,
    platform_workspace_id = platform_ws_id,
    is_default = true,
    updated_at = now()
  WHERE id = primary_workspace_id;

  UPDATE public.astra_companion_profiles
  SET user_id = target_user_id, updated_at = now()
  WHERE workspace_id = primary_workspace_id
    AND user_id IS NULL;

  UPDATE public.astra_reference_documents
  SET user_id = target_user_id
  WHERE workspace_id = primary_workspace_id
    AND user_id IS NULL;

  UPDATE public.astra_generated_documents
  SET user_id = target_user_id
  WHERE workspace_id = primary_workspace_id
    AND user_id IS NULL;

  UPDATE public.astra_conversation_turns
  SET user_id = target_user_id
  WHERE workspace_id = primary_workspace_id
    AND user_id IS NULL;

  UPDATE public.astra_background_jobs
  SET user_id = target_user_id
  WHERE workspace_id = primary_workspace_id
    AND user_id IS NULL;
END $$;
