import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, requestIdFrom } from '@/lib/api-response';

const OPERATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4_000;

export async function POST(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError(requestId, 'Unauthorized', 401, 'UNAUTHORIZED');

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return apiError(requestId, 'Request body too large', 413, 'PAYLOAD_TOO_LARGE');
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || JSON.stringify(body).length > MAX_BODY_BYTES) {
    return apiError(requestId, 'Invalid request body', 400, 'INVALID_BODY');
  }

  const operationId = String(body.operationId ?? '');
  const focusTaskId = String(body.focusTaskId ?? '');
  const studyTaskId = String(body.studyTaskId ?? '');
  const durationSeconds = Number(body.durationSeconds);
  const plannedSeconds = Number(body.plannedSeconds ?? durationSeconds);
  const startedAt = new Date(String(body.startedAt ?? ''));
  const completedAt = new Date(String(body.completedAt ?? ''));
  const now = Date.now();

  if (
    !OPERATION_ID.test(operationId)
    || !UUID.test(focusTaskId)
    || !UUID.test(studyTaskId)
    || !Number.isInteger(durationSeconds)
    || durationSeconds < 60
    || durationSeconds > 21_600
    || !Number.isInteger(plannedSeconds)
    || plannedSeconds < 60
    || plannedSeconds > 21_600
    || !Number.isFinite(startedAt.getTime())
    || !Number.isFinite(completedAt.getTime())
    || completedAt.getTime() < startedAt.getTime()
    || completedAt.getTime() > now + 300_000
    || startedAt.getTime() < now - 86_400_000
  ) {
    return apiError(requestId, 'Invalid focus session', 400, 'INVALID_SESSION');
  }

  const [{ data: studyTask }, { data: focusTask }] = await Promise.all([
    supabase.from('study_tasks').select('id').eq('id', studyTaskId).eq('user_id', user.id).maybeSingle(),
    supabase.from('focus_tasks').select('id, study_task_id').eq('id', focusTaskId).eq('user_id', user.id).maybeSingle(),
  ]);
  if (!studyTask || !focusTask || focusTask.study_task_id !== studyTask.id) {
    return apiError(requestId, 'Focus task not found', 404, 'NOT_FOUND');
  }

  const { data: session, error } = await supabase
    .from('focus_sessions')
    .upsert({
      user_id: user.id,
      task_id: focusTask.id,
      study_task_id: studyTask.id,
      client_operation_id: operationId,
      source: 'portal',
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_seconds: durationSeconds,
      planned_seconds: plannedSeconds,
      outcome: 'completed',
    }, { onConflict: 'user_id,client_operation_id' })
    .select('id')
    .single();

  if (error || !session) {
    return apiError(requestId, 'Unable to save focus session', 500, 'SESSION_WRITE_FAILED');
  }
  return NextResponse.json({ ok: true, sessionId: session.id, requestId });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
