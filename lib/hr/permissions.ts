export type GlobalRole = 'employee' | 'group_admin' | 'admin' | 'member';
export type GroupRole = 'member' | 'group_admin';

export type EmployeeWithRole = {
  id: string;
  role: GlobalRole;
  groupMemberships: { groupId: string; role: GroupRole }[];
};

export function isAdmin(employee: EmployeeWithRole): boolean {
  return employee.role === 'admin';
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
