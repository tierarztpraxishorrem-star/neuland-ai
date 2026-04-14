import type { SupabaseClient } from '@supabase/supabase-js';

type EmployeeRow = {
  id: string;
  practice_id: string;
  user_id: string;
  role: string;
  employment_status: string;
  weekly_hours: number | null;
  created_at: string;
};

type PracticeFeatureRow = {
  features: Record<string, unknown> | null;
};

type FeatureCacheEntry = {
  enabled: boolean;
  ts: number;
};

const RATE_LIMIT_MS = 5000;
const FEATURE_CACHE_TTL_MS = 30000;

const rateMap = new Map<string, number>();
const featureCache = new Map<string, FeatureCacheEntry>();

export function isHrActionAllowed(action: 'start' | 'stop', userId: string) {
  const now = Date.now();
  const key = `${action}:${userId}`;
  const lastCall = rateMap.get(key);

  if (lastCall && now - lastCall < RATE_LIMIT_MS) {
    return false;
  }

  rateMap.set(key, now);
  return true;
}

export async function getHrFeatureEnabled(supabase: SupabaseClient, practiceId: string) {
  const now = Date.now();
  const cached = featureCache.get(practiceId);

  if (cached && now - cached.ts < FEATURE_CACHE_TTL_MS) {
    return {
      ok: true,
      enabled: cached.enabled,
    } as const;
  }

  const practiceRes = await supabase
    .from('practices')
    .select('features')
    .eq('id', practiceId)
    .maybeSingle();

  if (practiceRes.error || !practiceRes.data) {
    return {
      ok: false,
      error: practiceRes.error?.message || 'Praxis nicht gefunden.',
    } as const;
  }

  const row = practiceRes.data as PracticeFeatureRow;
  const enabled = Boolean(row.features && typeof row.features === 'object' && row.features['hr_module'] === true);

  featureCache.set(practiceId, {
    enabled,
    ts: now,
  });

  return {
    ok: true,
    enabled,
  } as const;
}

export async function getOrCreateEmployee(supabase: SupabaseClient, practiceId: string, userId: string) {
  const existingRes = await supabase
    .from('employees')
    .select('id, practice_id, user_id, role, employment_status, weekly_hours, created_at')
    .eq('practice_id', practiceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingRes.error) {
    return {
      ok: false,
      error: existingRes.error.message || 'Mitarbeiter konnte nicht geladen werden.',
    } as const;
  }

  if (existingRes.data) {
    return {
      ok: true,
      employee: existingRes.data as EmployeeRow,
    } as const;
  }

  const insertRes = await supabase
    .from('employees')
    .insert({
      practice_id: practiceId,
      user_id: userId,
      role: 'member',
      employment_status: 'active',
    })
    .select('id, practice_id, user_id, role, employment_status, weekly_hours, created_at')
    .single();

  if (!insertRes.error && insertRes.data) {
    return {
      ok: true,
      employee: insertRes.data as EmployeeRow,
    } as const;
  }

  const retryRes = await supabase
    .from('employees')
    .select('id, practice_id, user_id, role, employment_status, weekly_hours, created_at')
    .eq('practice_id', practiceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (retryRes.error || !retryRes.data) {
    return {
      ok: false,
      error: insertRes.error?.message || retryRes.error?.message || 'Mitarbeiter konnte nicht erstellt werden.',
    } as const;
  }

  return {
    ok: true,
    employee: retryRes.data as EmployeeRow,
  } as const;
}