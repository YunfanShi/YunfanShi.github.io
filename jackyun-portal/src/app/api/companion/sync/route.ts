import { NextRequest, NextResponse } from 'next/server';
import { getBearerContext } from '@/lib/supabase/bearer';
import { getCompanionCategory, isCompanionEnabled, normalizeHostname } from '@/lib/companion';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function error(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  if (!isCompanionEnabled()) return error('Companion is temporarily disabled', 503);
  const context = await getBearerContext(request);
  if (!context) return error('Unauthorized', 401);
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const sinceDay = since.toISOString().slice(0, 10);
  const [activity, devices, settings] = await Promise.all([
    context.supabase.from('companion_activity_daily').select('activity_date, resource_key, hostname, category, active_seconds, visits').eq('user_id', context.user.id).gte('activity_date', sinceDay).order('activity_date'),
    context.supabase.from('companion_devices').select('id, name, platform, extension_version, last_seen_at, revoked_at').eq('user_id', context.user.id).order('last_seen_at', { ascending: false }),
    context.supabase.from('user_settings').select('value').eq('user_id', context.user.id).eq('key', 'companion_preferences').maybeSingle(),
  ]);
  const firstError = activity.error ?? devices.error ?? settings.error;
  if (firstError) return error(firstError.message, 500);
  return NextResponse.json({ ok: true, activity: activity.data ?? [], devices: devices.data ?? [], preferences: settings.data?.value ?? {}, serverTime: new Date().toISOString() });
}

export async function POST(request: NextRequest) {
  if (!isCompanionEnabled()) return error('Companion is temporarily disabled', 503);
  const context = await getBearerContext(request);
  if (!context) return error('Unauthorized', 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return error('Invalid request body', 400);
  const device = body?.device as Record<string, unknown> | undefined;
  if (!device || typeof device.id !== 'string' || !UUID.test(device.id)) return error('Invalid device', 400);
  const deviceId = device.id;
  const existing = await context.supabase.from('companion_devices').select('revoked_at').eq('user_id', context.user.id).eq('id', deviceId).maybeSingle();
  if (existing.error) return error(existing.error.message, 500);
  if (existing.data?.revoked_at) return error('Device has been revoked', 403);

  const deviceRow = {
    id: deviceId,
    user_id: context.user.id,
    name: String(device.name || 'Companion Browser').slice(0, 80),
    platform: ['chrome', 'edge', 'chromium', 'other'].includes(String(device.platform)) ? String(device.platform) : 'chromium',
    browser_version: String(device.browserVersion || '').slice(0, 80) || null,
    extension_version: String(device.extensionVersion || '1.0.0').slice(0, 32),
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const deviceResult = await context.supabase.from('companion_devices').upsert(deviceRow, { onConflict: 'id' });
  if (deviceResult.error) return error(deviceResult.error.message, 500);

  const activities = Array.isArray(body.activities) ? body.activities.slice(0, 200) : [];
  const activityRows = [];
  for (const raw of activities) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const hostname = normalizeHostname(String(item.hostname || ''));
    const category = getCompanionCategory(hostname);
    const activityDate = String(item.activityDate || '');
    const activeSeconds = Math.round(Number(item.activeSeconds));
    const visits = Math.round(Number(item.visits));
    if (!category || !DATE.test(activityDate) || !Number.isFinite(activeSeconds) || !Number.isFinite(visits)) continue;
    activityRows.push({
      user_id: context.user.id,
      device_id: deviceId,
      activity_date: activityDate,
      resource_key: hostname,
      hostname,
      category,
      active_seconds: Math.min(86400, Math.max(0, activeSeconds)),
      visits: Math.min(10000, Math.max(0, visits)),
      updated_at: new Date().toISOString(),
    });
  }
  if (activityRows.length) {
    const result = await context.supabase.from('companion_activity_daily').upsert(activityRows, { onConflict: 'user_id,device_id,activity_date,resource_key' });
    if (result.error) return error(result.error.message, 500);
  }

  const focusSessions = Array.isArray(body.focusSessions) ? body.focusSessions.slice(0, 50) : [];
  const focusRows = focusSessions.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const id = String(item.id || '');
    const duration = Math.round(Number(item.durationSeconds));
    if (!UUID.test(id) || !Number.isFinite(duration) || duration < 60 || duration > 21600) return [];
    return [{ id, user_id: context.user.id, duration_seconds: duration, completed_at: String(item.completedAt || new Date().toISOString()), started_at: item.startedAt ? String(item.startedAt) : null, source: 'companion', device_id: deviceId, resource_key: item.resourceKey ? String(item.resourceKey).slice(0, 160) : null }];
  });
  if (focusRows.length) {
    const result = await context.supabase.from('focus_sessions').upsert(focusRows, { onConflict: 'id' });
    if (result.error) return error(result.error.message, 500);
  }

  const rawPreferences = body.preferences && typeof body.preferences === 'object' ? body.preferences as Record<string, unknown> : null;
  if (rawPreferences) {
    const preferences = {
      enabled: rawPreferences.enabled !== false,
      countAI: rawPreferences.countAI !== false,
      idleSeconds: [30, 60, 120, 300].includes(Number(rawPreferences.idleSeconds)) ? Number(rawPreferences.idleSeconds) : 60,
      goalMinutes: Math.min(1440, Math.max(10, Math.round(Number(rawPreferences.goalMinutes) || 120))),
      retentionDays: [30, 90, 180, 365].includes(Number(rawPreferences.retentionDays)) ? Number(rawPreferences.retentionDays) : 365,
      savePageTitles: rawPreferences.savePageTitles === true,
    };
    const settingResult = await context.supabase.from('user_settings').upsert({ user_id: context.user.id, key: 'companion_preferences', value: preferences, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (settingResult.error) return error(settingResult.error.message, 500);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - preferences.retentionDays);
    const cleanup = await context.supabase.from('companion_activity_daily').delete().eq('user_id', context.user.id).lt('activity_date', cutoff.toISOString().slice(0, 10));
    if (cleanup.error) return error(cleanup.error.message, 500);
  }

  return NextResponse.json({ ok: true, accepted: { activities: activityRows.length, focusSessions: focusRows.length }, serverTime: new Date().toISOString() });
}
