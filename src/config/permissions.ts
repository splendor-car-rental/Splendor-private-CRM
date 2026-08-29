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

/**
 * Roles a user holding `role` is allowed to grant to someone else: their own
 * rank or a lower-authority rank. A CEO can grant anything (including
 * another CEO/Admin account); an Admin can grant Admin or any operational
 * role, but never CEO; an operational role cannot create staff at all (the
 * "create staff" UI itself is only reachable by CEO/Admin -- see
 * AddStaffModal -- this is a second, server-enforced line of defense).
 */
export function assignableRoles(role: UserRole): UserRole[] {
  const myRank = ROLE_RANK[role];
  return ALL_ROLES.filter(r => ROLE_RANK[r] >= myRank);
}

/**
 * Canonical view identifiers as used by activeView in CRMContext/App.tsx.
 * Some views are reachable under more than one historical id (aliases),
 * normalized by canAccessView() below.
 */
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
  | 'whatsapp-inbox';

const ALL_VIEWS: ViewKey[] = [
  'dashboard', 'customers', 'leads', 'fleet', 'quotations', 'reservations',
  'contracts', 'finance', 'reconciliation', 'tolls', 'notification-center', 'tasks', 'ai-studio', 'test-suite', 'settings',
  'procurement', 'security', 'inspections', 'whatsapp-inbox'
];

/**
 * Which screens each role can reach. CEO and Admin see everything. The
 * operational roles are scoped to the modules relevant to their job --
 * confirmed with the business owner:
 *  - Operations: fleet, contracts, reservations, tasks, customer records
 *  - Sales: leads, quotations, reservations, customer records
 *  - Fleet: fleet & maintenance, contract handover/return
 *  - Finance: invoicing/accounting, bank reconciliation, customer records
 *  - Tolls & Parking (Salik/Darb/parking logging + pricing) is reachable by
 *    everyone who can already touch fleet movements or money: Operations,
 *    Fleet, Finance, and Sales (Sales also because pricing/discount edits
 *    were explicitly given to Admin/Finance/Sales -- see
 *    TOLL_PRICING_EDIT_ROLES above). Only Admin/Finance/Sales (+CEO) can
 *    actually change rates/discounts there; Operations/Fleet can log entries
 *    but the rate fields stay locked to the current default for them.
 */
export const ROLE_VIEWS: Record<UserRole, ViewKey[]> = {
  ceo: ALL_VIEWS,
  admin: ALL_VIEWS,
  operations: ['dashboard', 'fleet', 'contracts', 'reservations', 'tasks', 'customers', 'tolls', 'procurement', 'security', 'inspections', 'whatsapp-inbox'],
  sales: ['dashboard', 'leads', 'quotations', 'reservations', 'customers', 'tolls', 'whatsapp-inbox'],
  fleet: ['dashboard', 'fleet', 'contracts', 'tolls', 'procurement', 'inspections'],
  finance: ['dashboard', 'finance', 'reconciliation', 'customers', 'tolls', 'procurement']
};

/** Historical/alternate ids for the same screen, used in a few nav call sites. */
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

/**
 * Roles allowed to change the default Salik/Darb/Parking rates (Settings >
 * Tolls & Parking > Pricing) and to override the actual-cost / customer
 * billing-rate / discount fields on an individual toll transaction, instead
 * of using the current default rate. Confirmed with the business owner:
 * Admin/CEO plus Finance and Sales (the departments that actually set or
 * negotiate pricing) -- Operations and Fleet can still log manual toll/
 * parking entries, but the rate fields are read-only/locked to the current
 * default for them.
 */
export const TOLL_PRICING_EDIT_ROLES: UserRole[] = ['ceo', 'admin', 'finance', 'sales'];

export function canEditTollPricing(role: UserRole): boolean {
  return TOLL_PRICING_EDIT_ROLES.includes(role);
}
