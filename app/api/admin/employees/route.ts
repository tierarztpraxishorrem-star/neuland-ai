import { NextRequest, NextResponse } from "next/server";
import {
  getUserPractice,
  getServiceSupabaseClient,
} from "@/lib/server/getUserPractice";

type EmployeeRow = {
  id: string;
  user_id: string;
  role: string;
  employment_status: string;
  weekly_hours: number | null;
  display_name: string | null;
  created_at: string;
};

/**
 * GET /api/admin/employees
 * Lists all employees for the practice with auth user emails.
 */
export async function GET(req: NextRequest) {
  const auth = await getUserPractice(req, { allowedRoles: ["owner", "admin"] });
  if (!auth.ok) return auth.response;
  const { practiceId } = auth.context;

  const service = getServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Server-Konfiguration fehlt." }, { status: 500 });
  }

  // Get employees
  const { data: employees, error } = await service
    .from("employees")
    .select("id, user_id, role, employment_status, weekly_hours, display_name, created_at")
    .eq("practice_id", practiceId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get membership roles
  const { data: memberships } = await service
    .from("practice_memberships")
    .select("user_id, role")
    .eq("practice_id", practiceId);

  const membershipMap = new Map<string, string>();
  for (const m of memberships || []) {
    membershipMap.set(m.user_id, m.role);
  }

  // Get auth emails + user metadata
  const userMap = new Map<string, { email: string; full_name: string | null }>();
  let page = 1;
  const perPage = 200;
  while (true) {
    const listed = await service.auth.admin.listUsers({ page, perPage });
    if (listed.error) break;
    const users = listed.data?.users || [];
    for (const u of users) {
      const meta = (u.user_metadata || {}) as Record<string, string>;
      userMap.set(u.id, {
        email: u.email || "",
        full_name: meta.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(" ") || null,
      });
    }
    if (users.length < perPage) break;
    page += 1;
  }

  const result = (employees || []).map((emp: EmployeeRow) => {
    const auth = userMap.get(emp.user_id);
    return {
      ...emp,
      email: auth?.email || "",
      auth_full_name: auth?.full_name || null,
      membership_role: membershipMap.get(emp.user_id) || "member",
    };
  });

  return NextResponse.json({ employees: result });
}

/**
 * PATCH /api/admin/employees
 * Update an employee profile.
 * Body: { employee_id, display_name?, weekly_hours?, employment_status?, role? }
 */
export async function PATCH(req: NextRequest) {
  const auth = await getUserPractice(req, { allowedRoles: ["owner", "admin"] });
  if (!auth.ok) return auth.response;
  const { practiceId } = auth.context;

  const service = getServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Server-Konfiguration fehlt." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const employeeId = String(body.employee_id || "").trim();
  if (!employeeId) {
    return NextResponse.json({ error: "employee_id fehlt." }, { status: 400 });
  }

  // Verify employee belongs to practice
  const { data: existing } = await service
    .from("employees")
    .select("id, practice_id, user_id")
    .eq("id", employeeId)
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Mitarbeiter nicht gefunden." }, { status: 404 });
  }

  // Build update object
  const update: Record<string, unknown> = {};
  if (body.display_name !== undefined) {
    update.display_name = body.display_name ? String(body.display_name).trim() : null;
  }
  if (body.weekly_hours !== undefined) {
    const hours = body.weekly_hours === null ? null : Number(body.weekly_hours);
    if (hours !== null && (isNaN(hours) || hours < 0 || hours > 168)) {
      return NextResponse.json({ error: "Ungültige Wochenstunden (0–168)." }, { status: 400 });
    }
    update.weekly_hours = hours;
  }
  if (body.employment_status !== undefined) {
    if (!["active", "inactive", "suspended"].includes(body.employment_status)) {
      return NextResponse.json({ error: "Ungültiger Status." }, { status: 400 });
    }
    update.employment_status = body.employment_status;
  }
  if (body.role !== undefined) {
    if (!["member", "admin"].includes(body.role)) {
      return NextResponse.json({ error: "Ungültige Rolle." }, { status: 400 });
    }
    update.role = body.role;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Keine Änderungen angegeben." }, { status: 400 });
  }

  const { error } = await service
    .from("employees")
    .update(update)
    .eq("id", employeeId)
    .eq("practice_id", practiceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
