import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_REGISTRATION_CONFIG } from '../../../../lib/registrationConfig';

type RegistrationSettingsRow = {
  registration_title: string | null;
  registration_subtitle: string | null;
  require_first_name: boolean | null;
  require_last_name: boolean | null;
  require_terms: boolean | null;
  require_privacy: boolean | null;
  allow_product_updates: boolean | null;
  min_password_length: number | null;
  require_uppercase: boolean | null;
  require_lowercase: boolean | null;
  require_digit: boolean | null;
  require_special_char: boolean | null;
  terms_label: string | null;
  privacy_label: string | null;
  product_updates_label: string | null;
};

const getSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon);
};

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(DEFAULT_REGISTRATION_CONFIG);
    }

    const { data, error } = await supabase
      .from('registration_form_settings')
      .select(
        'registration_title, registration_subtitle, require_first_name, require_last_name, require_terms, require_privacy, allow_product_updates, min_password_length, require_uppercase, require_lowercase, require_digit, require_special_char, terms_label, privacy_label, product_updates_label',
      )
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(DEFAULT_REGISTRATION_CONFIG);
    }

    const row = data as RegistrationSettingsRow;

    return NextResponse.json({
      registrationTitle: row.registration_title ?? DEFAULT_REGISTRATION_CONFIG.registrationTitle,
      registrationSubtitle: row.registration_subtitle ?? DEFAULT_REGISTRATION_CONFIG.registrationSubtitle,
      requireFirstName: row.require_first_name ?? DEFAULT_REGISTRATION_CONFIG.requireFirstName,
      requireLastName: row.require_last_name ?? DEFAULT_REGISTRATION_CONFIG.requireLastName,
      requireTerms: row.require_terms ?? DEFAULT_REGISTRATION_CONFIG.requireTerms,
      requirePrivacy: row.require_privacy ?? DEFAULT_REGISTRATION_CONFIG.requirePrivacy,
      allowProductUpdates: row.allow_product_updates ?? DEFAULT_REGISTRATION_CONFIG.allowProductUpdates,
      minPasswordLength: row.min_password_length ?? DEFAULT_REGISTRATION_CONFIG.minPasswordLength,
      requireUppercase: row.require_uppercase ?? DEFAULT_REGISTRATION_CONFIG.requireUppercase,
      requireLowercase: row.require_lowercase ?? DEFAULT_REGISTRATION_CONFIG.requireLowercase,
      requireDigit: row.require_digit ?? DEFAULT_REGISTRATION_CONFIG.requireDigit,
      requireSpecialChar: row.require_special_char ?? DEFAULT_REGISTRATION_CONFIG.requireSpecialChar,
      termsLabel: row.terms_label ?? DEFAULT_REGISTRATION_CONFIG.termsLabel,
      privacyLabel: row.privacy_label ?? DEFAULT_REGISTRATION_CONFIG.privacyLabel,
      productUpdatesLabel: row.product_updates_label ?? DEFAULT_REGISTRATION_CONFIG.productUpdatesLabel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/auth/registration-config] Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
