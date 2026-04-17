import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../../../lib/server/hrUtils';
import { isAdminRole } from '../../../../../../lib/hr/permissions';
import { randomBytes } from 'crypto';

/**
 * POST: Einladungslink für einen Mitarbeiter generieren
 * Der MA muss existieren aber noch keine user_id haben.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: employeeId } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;

    if (!isAdminRole(role)) return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    // Check employee exists and has no user_id
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, user_id, first_name, last_name, invite_token, invite_email')
      .eq('id', employeeId)
      .eq('practice_id', practiceId)
      .single();

    if (empError || !employee) {
      return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 });
    }

    if (employee.user_id) {
      return NextResponse.json({ error: 'Mitarbeiter hat bereits einen Account.' }, { status: 400 });
    }

    // Generate or reuse token
    let token = employee.invite_token;
    if (!token) {
      token = `HR-${randomBytes(16).toString('hex')}`;
    }

    // Optional: set invite email from request body
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const inviteEmail = typeof body.email === 'string' ? body.email.toLowerCase().trim() : employee.invite_email;

    const { error: updateError } = await supabase
      .from('employees')
      .update({
        invite_token: token,
        invite_email: inviteEmail || null,
        invited_at: new Date().toISOString(),
      })
      .eq('id', employeeId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Build invite URL
    const baseUrl = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || '';
    const inviteUrl = `${baseUrl}/onboarding?invite=${token}`;

    return NextResponse.json({
      ok: true,
      invite_token: token,
      invite_url: inviteUrl,
      invite_email: inviteEmail,
      employee_name: [employee.first_name, employee.last_name].filter(Boolean).join(' '),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/employees/[id]/invite] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
