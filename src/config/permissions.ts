import { UserRole } from '../types';

/**
 * Role hierarchy used for two things:
 *  1. Delegation limits -- when a CEO/Admin creates or edits a staff account,
 *     they can only grant a role at their own rank or below (never a role
 *     that outranks themselves).
 *  2. As a fallback ordering concept elsewhere in the UI if needed.
 *
 * Lower number = more authority. CEO and Admin are both "full access"
 * (rank 0/1), the four operational roles are peers at rank 2.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  ceo: 0,
  admin: 1,
  operations: 2,
  sales: 2,
  fleet: 2,
  finance: 2
};

export const ALL_ROLES: UserRole[] = ['ceo', 'admin', 'operations', 'sales', 'fleet', 'finance'];

/** Roles a user holding `role` is allowed to grant to someone else. */
export function assignableRoles(role: UserRole): UserRole[] {
  const myRank = ROLE_RANK[role];
  return ALL_ROLES.filter(r => ROLE_RANK[r] >= myRank);
}

/** Canonical view identifiers used by activeView in CRMContext/App.tsx. */
export type ViewKey =
  | 'dashboard'
  | 'customers'
  | 'leads'
  | 'fleet'
  | 'quotations'
  | 'reservations'
  | 'contracts'
  | 'finance'
  | 'reconciliation'
  | 'tolls'
  | 'notification-center'
  | 'tasks'
  | 'ai-studio'
  | 'test-suite'
  | 'settings'
  | 'procurement'
  | 'security'
  | 'inspections'
  | 'whatsapp-inbox'
  | 'lease-to-own'
  | 'corporate-documents';

const ALL_VIEWS: ViewKey[] = [
  'dashboard', 'customers', 'leads', 'fleet', 'quotations', 'reservations',
  'contracts', 'finance', 'reconciliation', 'tolls', 'notification-center', 'tasks',
  'ai-studio', 'test-suite', 'settings', 'procurement', 'security', 'inspections',
  'whatsapp-inbox', 'lease-to-own', 'corporate-documents'
];

/**
 * Which screens each role can reach. CEO and Admin see everything. Operational
 * roles remain scoped to their existing modules; Corporate Documents is added
 * as the document-production surface and is still protected server-side by
 * the document-type role matrix in api/index.ts.
 */
export const ROLE_VIEWS: Record<UserRole, ViewKey[]> = {
  ceo: ALL_VIEWS,
  admin: ALL_VIEWS,
  operations: ['dashboard', 'fleet', 'contracts', 'reservations', 'tasks', 'customers', 'tolls', 'procurement', 'security', 'inspections', 'whatsapp-inbox', 'lease-to-own', 'corporate-documents'],
  sales: ['dashboard', 'leads', 'quotations', 'reservations', 'customers', 'tolls', 'whatsapp-inbox', 'lease-to-own', 'corporate-documents'],
  fleet: ['dashboard', 'fleet', 'contracts', 'tolls', 'procurement', 'inspections', 'corporate-documents'],
  finance: ['dashboard', 'finance', 'reconciliation', 'customers', 'tolls', 'procurement', 'lease-to-own', 'corporate-documents']
};

/** Historical/alternate ids for the same screen. */
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

/** Roles allowed to edit default Salik/Darb/Parking rates and overrides. */
export const TOLL_PRICING_EDIT_ROLES: UserRole[] = ['ceo', 'admin', 'finance', 'sales'];

export function canEditTollPricing(role: UserRole): boolean {
  return TOLL_PRICING_EDIT_ROLES.includes(role);
}
