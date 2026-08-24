-- Captive portal registration and review queue for TR3000 network clients.
-- Public visitors may only call the narrow registration RPC. Device records
-- remain invisible; authenticated administrators use audited RPCs.

CREATE TABLE public.network_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mac_address text,
  private_ip inet,
  claimed_name text NOT NULL,
  admin_label text,
  relationship text,
  device_label text,
  router_nas_id text,
  access_tier text NOT NULL DEFAULT 'unknown'
    CHECK (access_tier IN ('trusted', 'known', 'guest', 'unknown')),
  access_policy text NOT NULL DEFAULT 'review'
    CHECK (access_policy IN ('review', 'unrestricted', 'limited', 'blocked')),
  desired_download_mbps numeric(10, 2),
  desired_upload_mbps numeric(10, 2),
  router_note text,
  admin_notes text,
  sync_status text NOT NULL DEFAULT 'pending_review'
    CHECK (sync_status IN ('pending_review', 'pending_apply', 'applied', 'error')),
  identifiers_supplied boolean NOT NULL DEFAULT false,
  registration_count integer NOT NULL DEFAULT 1 CHECK (registration_count > 0),
  last_registered_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_devices_mac_format CHECK (
    mac_address IS NULL OR mac_address ~ '^[0-9A-F]{2}(:[0-9A-F]{2}){5}$'
  ),
  CONSTRAINT network_devices_rate_pair CHECK (
    (desired_download_mbps IS NULL AND desired_upload_mbps IS NULL)
    OR (
      desired_download_mbps > 0 AND desired_download_mbps <= 10000
      AND desired_upload_mbps > 0 AND desired_upload_mbps <= 10000
    )
  )
);

CREATE UNIQUE INDEX network_devices_mac_unique_idx
  ON public.network_devices(mac_address)
  WHERE mac_address IS NOT NULL;
CREATE INDEX network_devices_review_queue_idx
  ON public.network_devices(sync_status, last_registered_at DESC);
CREATE INDEX network_devices_private_ip_idx
  ON public.network_devices(private_ip)
  WHERE private_ip IS NOT NULL;

ALTER TABLE public.network_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.network_devices FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.network_devices TO service_role;

CREATE OR REPLACE FUNCTION public.register_network_device(
  p_claimed_name text,
  p_relationship text DEFAULT NULL,
  p_device_label text DEFAULT NULL,
  p_mac_address text DEFAULT NULL,
  p_private_ip text DEFAULT NULL,
  p_router_nas_id text DEFAULT NULL,
  p_privacy_accepted boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_name text := trim(COALESCE(p_claimed_name, ''));
  v_relationship text := NULLIF(trim(COALESCE(p_relationship, '')), '');
  v_device_label text := NULLIF(trim(COALESCE(p_device_label, '')), '');
  v_mac text := NULLIF(upper(replace(trim(COALESCE(p_mac_address, '')), '-', ':')), '');
  v_ip inet;
  v_nas_id text := NULLIF(trim(COALESCE(p_router_nas_id, '')), '');
BEGIN
  IF NOT p_privacy_accepted THEN
    RAISE EXCEPTION 'Privacy acknowledgement is required';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name must be between 1 and 60 characters';
  END IF;
  IF v_relationship IS NOT NULL AND char_length(v_relationship) > 40 THEN
    RAISE EXCEPTION 'Relationship is too long';
  END IF;
  IF v_device_label IS NOT NULL AND char_length(v_device_label) > 60 THEN
    RAISE EXCEPTION 'Device label is too long';
  END IF;
  IF v_nas_id IS NOT NULL AND char_length(v_nas_id) > 80 THEN
    RAISE EXCEPTION 'NAS identifier is too long';
  END IF;
  IF v_mac IS NOT NULL AND v_mac !~ '^[0-9A-F]{2}(:[0-9A-F]{2}){5}$' THEN
    RAISE EXCEPTION 'Invalid MAC address';
  END IF;

  IF NULLIF(trim(COALESCE(p_private_ip, '')), '') IS NOT NULL THEN
    BEGIN
      v_ip := trim(p_private_ip)::inet;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid client IP address';
    END;
    IF family(v_ip) <> 4 OR NOT (
      v_ip << inet '10.0.0.0/8'
      OR v_ip << inet '172.16.0.0/12'
      OR v_ip << inet '192.168.0.0/16'
    ) THEN
      RAISE EXCEPTION 'Only private IPv4 client addresses are accepted';
    END IF;
  END IF;

  IF v_mac IS NULL THEN
    INSERT INTO public.network_devices (
      mac_address, private_ip, claimed_name, relationship, device_label,
      router_nas_id, router_note, identifiers_supplied
    ) VALUES (
      v_mac, v_ip, v_name, v_relationship, v_device_label,
      v_nas_id, v_name, v_mac IS NOT NULL AND v_ip IS NOT NULL
    )
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.network_devices AS existing (
      mac_address, private_ip, claimed_name, relationship, device_label,
      router_nas_id, router_note, identifiers_supplied
    ) VALUES (
      v_mac, v_ip, v_name, v_relationship, v_device_label,
      v_nas_id, v_name, v_ip IS NOT NULL
    )
    ON CONFLICT (mac_address) WHERE mac_address IS NOT NULL
    DO UPDATE SET
      private_ip = COALESCE(EXCLUDED.private_ip, existing.private_ip),
      claimed_name = EXCLUDED.claimed_name,
      relationship = COALESCE(EXCLUDED.relationship, existing.relationship),
      device_label = COALESCE(EXCLUDED.device_label, existing.device_label),
      router_nas_id = COALESCE(EXCLUDED.router_nas_id, existing.router_nas_id),
      router_note = CASE WHEN existing.sync_status = 'pending_review' THEN EXCLUDED.claimed_name ELSE existing.router_note END,
      identifiers_supplied = existing.identifiers_supplied OR EXCLUDED.identifiers_supplied,
      registration_count = existing.registration_count + 1,
      last_registered_at = now(),
      updated_at = now()
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_network_devices()
RETURNS TABLE (
  id uuid,
  mac_address text,
  private_ip text,
  claimed_name text,
  admin_label text,
  relationship text,
  device_label text,
  router_nas_id text,
  access_tier text,
  access_policy text,
  desired_download_mbps numeric,
  desired_upload_mbps numeric,
  router_note text,
  admin_notes text,
  sync_status text,
  identifiers_supplied boolean,
  registration_count integer,
  last_registered_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT d.id, d.mac_address, host(d.private_ip), d.claimed_name, d.admin_label,
    d.relationship, d.device_label, d.router_nas_id, d.access_tier,
    d.access_policy, d.desired_download_mbps, d.desired_upload_mbps,
    d.router_note, d.admin_notes, d.sync_status, d.identifiers_supplied,
    d.registration_count, d.last_registered_at, d.updated_at
  FROM public.network_devices AS d
  WHERE public.is_admin_user()
  ORDER BY
    CASE d.sync_status WHEN 'pending_review' THEN 0 WHEN 'pending_apply' THEN 1 ELSE 2 END,
    d.last_registered_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_network_device(
  p_id uuid,
  p_admin_label text,
  p_access_tier text,
  p_access_policy text,
  p_download_mbps numeric,
  p_upload_mbps numeric,
  p_router_note text,
  p_admin_notes text,
  p_sync_status text DEFAULT 'pending_apply'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_label text := NULLIF(trim(COALESCE(p_admin_label, '')), '');
  v_router_note text := NULLIF(trim(COALESCE(p_router_note, '')), '');
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Forbidden: Admin only';
  END IF;
  IF p_access_tier NOT IN ('trusted', 'known', 'guest', 'unknown') THEN
    RAISE EXCEPTION 'Invalid access tier';
  END IF;
  IF p_access_policy NOT IN ('review', 'unrestricted', 'limited', 'blocked') THEN
    RAISE EXCEPTION 'Invalid access policy';
  END IF;
  IF p_sync_status NOT IN ('pending_review', 'pending_apply', 'applied', 'error') THEN
    RAISE EXCEPTION 'Invalid sync status';
  END IF;
  IF v_label IS NOT NULL AND char_length(v_label) > 60 THEN
    RAISE EXCEPTION 'Admin label is too long';
  END IF;
  IF v_router_note IS NOT NULL AND char_length(v_router_note) > 80 THEN
    RAISE EXCEPTION 'Router note is too long';
  END IF;
  IF p_admin_notes IS NOT NULL AND char_length(p_admin_notes) > 1000 THEN
    RAISE EXCEPTION 'Admin notes are too long';
  END IF;
  IF p_access_policy = 'limited' AND (
    p_download_mbps IS NULL OR p_upload_mbps IS NULL
    OR p_download_mbps <= 0 OR p_download_mbps > 10000
    OR p_upload_mbps <= 0 OR p_upload_mbps > 10000
  ) THEN
    RAISE EXCEPTION 'Limited devices require valid upload and download rates';
  END IF;

  UPDATE public.network_devices
  SET admin_label = v_label,
      access_tier = p_access_tier,
      access_policy = p_access_policy,
      desired_download_mbps = CASE WHEN p_access_policy = 'limited' THEN p_download_mbps ELSE NULL END,
      desired_upload_mbps = CASE WHEN p_access_policy = 'limited' THEN p_upload_mbps ELSE NULL END,
      router_note = COALESCE(v_router_note, v_label, router_note, claimed_name),
      admin_notes = NULLIF(trim(COALESCE(p_admin_notes, '')), ''),
      sync_status = p_sync_status,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Network device not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.register_network_device(text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_network_devices() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_network_device(uuid, text, text, text, numeric, numeric, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_network_device(text, text, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_network_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_network_device(uuid, text, text, text, numeric, numeric, text, text, text) TO authenticated;
