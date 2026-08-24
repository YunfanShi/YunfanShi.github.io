import { createClient } from '@/lib/supabase/server';
import {
  normalizeMac,
  normalizeOptionalText,
  normalizePrivateIpv4,
  type NetworkRegistrationPayload,
} from '@/lib/network-access';

const JSON_HEADERS = { 'cache-control': 'no-store' };

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return Response.json({ error: '请求来源无效。' }, { status: 403, headers: JSON_HEADERS });
      }
    } catch {
      return Response.json({ error: '请求来源无效。' }, { status: 403, headers: JSON_HEADERS });
    }
  }

  const rawBody = await request.text();
  if (rawBody.length > 4096) {
    return Response.json({ error: '提交内容过长。' }, { status: 413, headers: JSON_HEADERS });
  }

  let body: NetworkRegistrationPayload;
  try {
    body = JSON.parse(rawBody) as NetworkRegistrationPayload;
  } catch {
    return Response.json({ error: '提交格式无效。' }, { status: 400, headers: JSON_HEADERS });
  }

  const claimedName = normalizeOptionalText(body.claimedName, 60);
  if (!claimedName || !body.privacyAccepted) {
    return Response.json({ error: '请填写称呼并确认信息用途。' }, { status: 400, headers: JSON_HEADERS });
  }
  if (body.website) {
    return Response.json({ registrationId: 'accepted' }, { status: 201, headers: JSON_HEADERS });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('register_network_device', {
    p_claimed_name: claimedName,
    p_relationship: normalizeOptionalText(body.relationship, 40) ?? null,
    p_device_label: normalizeOptionalText(body.deviceLabel, 60) ?? null,
    p_mac_address: normalizeMac(body.clientMac) ?? null,
    p_private_ip: normalizePrivateIpv4(body.clientIp) ?? null,
    p_router_nas_id: normalizeOptionalText(body.routerNasId, 80) ?? null,
    p_privacy_accepted: true,
  });

  if (error) {
    console.error('[NetworkAccess/Register]', error.code, error.message);
    return Response.json({ error: '登记服务暂时不可用，请稍后重试。' }, { status: 503, headers: JSON_HEADERS });
  }

  return Response.json({ registrationId: data }, { status: 201, headers: JSON_HEADERS });
}
