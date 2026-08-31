import { UserRole } from '../types';

export const ROLE_RANK: Record<UserRole, number> = {
  ceo: 0,
  admin: 1,
  operations: 2,
  sales: 2,
  fleet: 2,
  finance: 2
};

export const ALL_ROLES: UserRole[] = ['ceo', 'admin', 'operations', 'sales', 'fleet', 'finance'];

export function assignableRoles(role: UserRole): UserRole[] {
  const myRank = ROLE_RANK[role];
  return ALL_ROLES.filter(r => ROLE_RANK[r] >= myRank);
}

export type ViewKey =
  | 'dashboard' | 'customers' | 'leads' | 'fleet' | 'quotations' | 'reservations'
  | 'contracts' | 'finance' | 'reconciliation' | 'tolls' | 'notification-center'
  | 'tasks' | 'ai-studio' | 'test-suite' | 'settings' | 'procurement' | 'security'
  | 'inspections' | 'whatsapp-inbox' | 'lease-to-own' | 'corporate-documents';

const ALL_VIEWS: ViewKey[] = [
  'dashboard', 'customers', 'leads', 'fleet', 'quotations', 'reservations', 'contracts',
  'finance', 'reconciliation', 'tolls', 'notification-center', 'tasks', 'ai-studio',
  'test-suite', 'settings', 'procurement', 'security', 'inspections', 'whatsapp-inbox',
  'lease-to-own', 'corporate-documents'
];

export const ROLE_VIEWS: Record<UserRole, ViewKey[]> = {
  ceo: ALL_VIEWS,
  admin: ALL_VIEWS,
  operations: ['dashboard', 'fleet', 'contracts', 'reservations', 'tasks', 'customers', 'tolls', 'procurement', 'security', 'inspections', 'whatsapp-inbox', 'lease-to-own', 'corporate-documents'],
  sales: ['dashboard', 'leads', 'quotations', 'reservations', 'customers', 'tolls', 'whatsapp-inbox', 'lease-to-own', 'corporate-documents'],
  fleet: ['dashboard', 'fleet', 'contracts', 'tolls', 'procurement', 'inspections', 'corporate-documents'],
  finance: ['dashboard', 'finance', 'reconciliation', 'customers', 'tolls', 'procurement', 'lease-to-own', 'corporate-documents']
};

const VIEW_ALIASES: Record<string, ViewKey> = {
  'bank-reconciliation': 'reconciliation',
  'ai-intelligence': 'ai-studio',
  'tests': 'test-suite'
};

export function normalizeViewKey(view: string): ViewKey {
  return (VIEW_ALIASES[view] || view) as ViewKey;
}

export function canAccessView(role: UserRole, view: string): boolean {
  const key = normalizeViewKey(view);
  return ROLE_VIEWS[role]?.includes(key) ?? false;
}

export const TOLL_PRICING_EDIT_ROLES: UserRole[] = ['ceo', 'admin', 'finance', 'sales'];

export function canEditTollPricing(role: UserRole): boolean {
  return TOLL_PRICING_EDIT_ROLES.includes(role);
}
