-- ============================================================================
-- BURNING UPP — FRICTIONLESS ONBOARDING AUTH TRIGGER & INVITATION PREVIEW
-- ============================================================================

CREATE OR REPLACE FUNCTION private.autoconfirm_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.email_confirmed_at := coalesce(NEW.email_confirmed_at, now());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.autoconfirm_new_user() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_autoconfirm'
  ) THEN
    CREATE TRIGGER on_auth_user_autoconfirm
      BEFORE INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION private.autoconfirm_new_user();
  END IF;
END $$;

-- Preview Invitation helper (allows authenticated user to check invite code validity)
CREATE OR REPLACE FUNCTION private.impl_preview_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clean_token text := upper(trim(coalesce(p_token, '')));
  v_inv public.invitations%rowtype;
  v_ws_name text;
  v_team_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM public.invitations
  WHERE upper(token) = v_clean_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'ไม่พบรหัสคำเชิญนี้');
  END IF;

  IF v_inv.status <> 'pending' OR v_inv.expires_at <= now() OR v_inv.use_count >= v_inv.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'รหัสคำเชิญนี้หมดอายุหรือถูกใช้งานครบจำนวนแล้ว');
  END IF;

  SELECT name INTO v_ws_name FROM public.workspaces WHERE id = v_inv.workspace_id;
  SELECT name INTO v_team_name FROM public.teams WHERE id = v_inv.team_id AND workspace_id = v_inv.workspace_id;

  RETURN jsonb_build_object(
    'valid', true,
    'workspace_name', v_ws_name,
    'team_name', v_team_name,
    'assigned_role', v_inv.assigned_role,
    'expires_at', v_inv.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION private.impl_preview_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.impl_preview_invitation(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_invitation(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.impl_preview_invitation(p_token);
$$;

REVOKE ALL ON FUNCTION public.preview_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_invitation(text) TO authenticated, service_role;
