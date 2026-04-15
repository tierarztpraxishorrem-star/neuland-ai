import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../lib/server/hrUtils';

type PatchBody = {
  status?: string;
  note?: string;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId, userId, role } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as PatchBody;

    if (!body.status || !['approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'Status muss "approved" oder "rejected" sein.' }, { status: 400 });
    }

    // Load the absence to find its employee
    const { data: absence } = await supabase
      .from('absences')
      .select('id, employee_id, status')
      .eq('id', id)
      .eq('practice_id', practiceId)
      .single();

    if (!absence) return NextResponse.json({ error: 'Abwesenheit nicht gefunden.' }, { status: 404 });

    // Get current employee for reviewer tracking
    const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!employeeRes.ok) return NextResponse.json({ error: employeeRes.error }, { status: 500 });

    // Check permission: must be admin/owner OR group_admin in a shared group
    const isPracticeAdmin = role === 'owner' || role === 'admin';

    if (!isPracticeAdmin) {
      // Check if current user is group_admin in any group that contains the absence's employee
      const { data: targetGroups } = await supabase
        .from('employee_group_members')
        .select('group_id')
        .eq('employee_id', absence.employee_id);

      const targetGroupIds = (targetGroups || []).map((g: { group_id: string }) => g.group_id);

      if (targetGroupIds.length === 0) {
        return NextResponse.json({ error: 'Keine Berechtigung für diese Aktion.' }, { status: 403 });
      }

      const { data: myAdminGroups } = await supabase
        .from('employee_group_members')
        .select('group_id')
        .eq('employee_id', employeeRes.employee.id)
        .eq('role', 'group_admin')
        .in('group_id', targetGroupIds);

      if (!myAdminGroups || myAdminGroups.length === 0) {
        return NextResponse.json({ error: 'Keine Berechtigung für diese Gruppe.' }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from('absences')
      .update({
        status: body.status,
        reviewed_by: employeeRes.employee.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select('id, employee_id, type, starts_on, ends_on, note, status, reviewed_by, reviewed_at, created_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Fehler beim Aktualisieren.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, absence: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/[id]] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId, userId, role } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!employeeRes.ok) return NextResponse.json({ error: employeeRes.error }, { status: 500 });

    // Load absence
    const { data: absence } = await supabase
      .from('absences')
      .select('id, employee_id, status')
      .eq('id', id)
      .eq('practice_id', practiceId)
      .single();

    if (!absence) return NextResponse.json({ error: 'Abwesenheit nicht gefunden.' }, { status: 404 });

    const isOwner = absence.employee_id === employeeRes.employee.id;
    const isPracticeAdmin = role === 'owner' || role === 'admin';

    // Own pending: can delete
    if (isOwner && absence.status === 'pending') {
      const { error } = await supabase.from('absences').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // Admin or group_admin can delete/cancel
    if (isPracticeAdmin) {
      const { error } = await supabase.from('absences').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // Check group_admin permission
    const { data: targetGroups } = await supabase
      .from('employee_group_members')
      .select('group_id')
      .eq('employee_id', absence.employee_id);

    const targetGroupIds = (targetGroups || []).map((g: { group_id: string }) => g.group_id);

    const { data: myAdminGroups } = await supabase
      .from('employee_group_members')
      .select('group_id')
      .eq('employee_id', employeeRes.employee.id)
      .eq('role', 'group_admin')
      .in('group_id', targetGroupIds.length > 0 ? targetGroupIds : ['__none__']);

    if (myAdminGroups && myAdminGroups.length > 0) {
      const { error } = await supabase.from('absences').delete().eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Keine Berechtigung zum Löschen.' }, { status: 403 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/[id]] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
