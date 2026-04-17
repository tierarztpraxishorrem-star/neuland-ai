import type { SupabaseClient } from '@supabase/supabase-js';

type EmployeeRow = {
  id: string;
  practice_id: string;
  user_id: string;
  role: string;
  employment_status: string;
  weekly_hours: number | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  personnel_number: string | null;
  department: string | null;
  position_title: string | null;
  location_id: string | null;
  contract_type: string | null;
  created_at: string;
};

// Base columns selected in all employee queries
const EMPLOYEE_BASE_COLUMNS = 'id, practice_id, user_id, role, employment_status, weekly_hours, display_name, first_name, last_name, personnel_number, department, position_title, location_id, contract_type, created_at';

// All columns including sensitive fields (admin only)
const EMPLOYEE_ALL_COLUMNS = `${EMPLOYEE_BASE_COLUMNS}, birth_name, date_of_birth, birth_place, birth_country, gender, nationality, marital_status, phone, email_private, address_street, address_number, address_zip, address_city, contract_start, contract_end, probation_end, weekly_hours_target, work_days_per_week, vacation_days_per_year, iban, bic, tax_id, tax_class, social_security_number, health_insurance, confession, supervisor_id`;

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
  // 1. Prüfe ob User bereits mit einem MA verknüpft ist
  const existingRes = await supabase
    .from('employees')
    .select(EMPLOYEE_BASE_COLUMNS)
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

  // 2. Versuche per E-Mail einen bestehenden MA-Datensatz zu verknüpfen
  //    (Admin hat MA angelegt + E-Mail hinterlegt, User registriert sich mit dieser E-Mail)
  const userRes = await supabase.auth.getUser();
  const userEmail = userRes.data.user?.email;

  if (userEmail) {
    const { data: linkedId } = await supabase.rpc('link_employee_by_email', {
      p_practice_id: practiceId,
      p_user_id: userId,
      p_email: userEmail,
    });

    if (linkedId) {
      // Erfolgreich verknüpft – MA-Datensatz laden
      const { data: linked } = await supabase
        .from('employees')
        .select(EMPLOYEE_BASE_COLUMNS)
        .eq('id', linkedId)
        .single();

      if (linked) {
        return { ok: true, employee: linked as EmployeeRow } as const;
      }
    }
  }

  // 3. Kein bestehender Datensatz – neuen anlegen
  const insertRes = await supabase
    .from('employees')
    .insert({
      practice_id: practiceId,
      user_id: userId,
      role: 'member',
      employment_status: 'active',
    })
    .select(EMPLOYEE_BASE_COLUMNS)
    .single();

  if (!insertRes.error && insertRes.data) {
    return {
      ok: true,
      employee: insertRes.data as EmployeeRow,
    } as const;
  }

  const retryRes = await supabase
    .from('employees')
    .select(EMPLOYEE_BASE_COLUMNS)
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