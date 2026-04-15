import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../../../../lib/server/hrUtils';

type AddMemberBody = {
  employee_id?: string;
  role?: string;
};

export async function GET(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    // Verify group belongs to practice
    const { data: group } = await supabase
      .from('employee_groups')
      .select('id')
      .eq('id', groupId)
      .eq('practice_id', practiceId)
      .single();

    if (!group) return NextResponse.json({ error: 'Gruppe nicht gefunden.' }, { status: 404 });

    const { data: members, error } = await supabase
      .from('employee_group_members')
      .select('employee_id, role')
      .eq('group_id', groupId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with employee display_name
    const employeeIds = (members || []).map((m: { employee_id: string }) => m.employee_id);
    let employees: { id: string; display_name: string | null; user_id: string }[] = [];
    if (employeeIds.length > 0) {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, display_name, user_id')
        .in('id', employeeIds);
      employees = (emps || []) as typeof employees;
    }

    const empMap = new Map(employees.map((e) => [e.id, e]));

    const result = (members || []).map((m: { employee_id: string; role: string }) => {
      const emp = empMap.get(m.employee_id);
      return {
        employee_id: m.employee_id,
        role: m.role,
        display_name: emp?.display_name || emp?.user_id?.slice(0, 8) + '…' || m.employee_id.slice(0, 8),
      };
    });

    return NextResponse.json({ ok: true, members: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/groups/[groupId]/members] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as AddMemberBody;

    if (!body.employee_id) {
      return NextResponse.json({ error: 'Mitarbeiter-ID ist erforderlich.' }, { status: 400 });
    }

    const memberRole = body.role === 'group_admin' ? 'group_admin' : 'member';

    const { error } = await supabase
      .from('employee_group_members')
      .insert({
        employee_id: body.employee_id,
        group_id: groupId,
        role: memberRole,
      });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Mitarbeiter ist bereits in dieser Gruppe.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/groups/[groupId]/members] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as AddMemberBody;

    if (!body.employee_id) {
      return NextResponse.json({ error: 'Mitarbeiter-ID ist erforderlich.' }, { status: 400 });
    }

    const memberRole = body.role === 'group_admin' ? 'group_admin' : 'member';

    // Verify group belongs to practice
    const { data: group } = await supabase
      .from('employee_groups')
      .select('id')
      .eq('id', groupId)
      .eq('practice_id', practiceId)
      .single();
    if (!group) return NextResponse.json({ error: 'Gruppe nicht gefunden.' }, { status: 404 });

    const { error } = await supabase
      .from('employee_group_members')
      .update({ role: memberRole })
      .eq('employee_id', body.employee_id)
      .eq('group_id', groupId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/groups/[groupId]/members] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul deaktiviert.' }, { status: 403 });

    const url = new URL(req.url);
    const employeeId = url.searchParams.get('employee_id');
    if (!employeeId) {
      return NextResponse.json({ error: 'employee_id Query-Parameter erforderlich.' }, { status: 400 });
    }

    // Verify group belongs to practice
    const { data: group } = await supabase
      .from('employee_groups')
      .select('id')
      .eq('id', groupId)
      .eq('practice_id', practiceId)
      .single();
    if (!group) return NextResponse.json({ error: 'Gruppe nicht gefunden.' }, { status: 404 });

    const { error } = await supabase
      .from('employee_group_members')
      .delete()
      .eq('employee_id', employeeId)
      .eq('group_id', groupId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/vacation/groups/[groupId]/members] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
