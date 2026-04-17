export type GlobalRole = 'employee' | 'group_admin' | 'groupleader' | 'admin' | 'member';
export type GroupRole = 'member' | 'group_admin';
export type MembershipRole = 'owner' | 'admin' | 'groupleader' | 'member';

export type EmployeeWithRole = {
  id: string;
  role: GlobalRole;
  groupMemberships: { groupId: string; role: GroupRole }[];
};

// Sensible Felder, die nur für Admins sichtbar sind
export const SENSITIVE_FIELDS = [
  'iban', 'bic', 'tax_id', 'tax_class',
  'social_security_number', 'health_insurance', 'confession',
] as const;

// Felder, die Mitarbeiter selbst bearbeiten dürfen
export const SELF_EDITABLE_FIELDS = [
  'phone', 'email_private', 'address_street', 'address_number',
  'address_zip', 'address_city', 'marital_status',
] as const;

export function isAdmin(employee: EmployeeWithRole): boolean {
  return employee.role === 'admin';
}

export function isGroupleader(employee: EmployeeWithRole): boolean {
  return employee.role === 'groupleader' || employee.role === 'group_admin';
}

export function isManager(employee: EmployeeWithRole): boolean {
  return isAdmin(employee) || isGroupleader(employee);
}

export function canApproveInGroup(employee: EmployeeWithRole, groupId: string): boolean {
  if (employee.role === 'admin') return true;
  return employee.groupMemberships.some(
    (m) => m.groupId === groupId && m.role === 'group_admin'
  );
}

export function canManageGroup(employee: EmployeeWithRole, groupId: string): boolean {
  return canApproveInGroup(employee, groupId);
}

export function getManagedGroupIds(employee: EmployeeWithRole): string[] {
  if (employee.role === 'admin') return ['*'];
  return employee.groupMemberships
    .filter((m) => m.role === 'group_admin')
    .map((m) => m.groupId);
}

export function canViewSensitiveFields(role: MembershipRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function canEditEmployee(viewerRole: MembershipRole, isOwnProfile: boolean): boolean {
  if (viewerRole === 'owner' || viewerRole === 'admin') return true;
  if (viewerRole === 'groupleader') return true; // limited fields enforced in API
  return isOwnProfile; // self-edit limited fields
}

export function isAdminRole(role: MembershipRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function isManagerRole(role: MembershipRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'groupleader';
}

/**
 * Strip sensitive fields from an employee record based on the viewer's role
 */
export function filterEmployeeFields<T extends Record<string, unknown>>(
  employee: T,
  viewerRole: MembershipRole
): T {
  if (canViewSensitiveFields(viewerRole)) return employee;

  const filtered = { ...employee };
  for (const field of SENSITIVE_FIELDS) {
    if (field in filtered) {
      (filtered as Record<string, unknown>)[field] = undefined;
    }
  }
  return filtered;
}
