import { UserRole } from '../types/index.js';

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
  | 'contracts' | 'finance' | 'tax-filing' | 'reconciliation' | 'tolls' | 'notification-center'
  | 'tasks' | 'ai-studio' | 'test-suite' | 'settings' | 'procurement'
  | 'purchase-orders' | 'security' | 'inspections' | 'whatsapp-inbox'
  | 'lease-to-own' | 'vip-tiers' | 'fleet-acquisition-roi' | 'live-radar'
  | 'operations-control-room' | 'corporate-branches' | 'corporate-documents'
  | 'executive-dashboard' | 'corrections-center';

const ALL_VIEWS: ViewKey[] = [
  'dashboard', 'customers', 'leads', 'fleet', 'quotations', 'reservations',
  'contracts', 'finance', 'tax-filing', 'reconciliation', 'tolls', 'notification-center', 'tasks',
  'ai-studio', 'test-suite', 'settings', 'procurement', 'purchase-orders', 'security',
  'inspections', 'whatsapp-inbox', 'lease-to-own', 'vip-tiers', 'fleet-acquisition-roi',
  'live-radar', 'operations-control-room', 'corporate-branches', 'corporate-documents',
  'executive-dashboard', 'corrections-center'
];

export const ROLE_VIEWS: Record<UserRole, ViewKey[]> = {
  ceo: ALL_VIEWS,
  admin: ALL_VIEWS,
  operations: ['dashboard', 'fleet', 'contracts', 'reservations', 'tasks', 'customers', 'tolls', 'procurement', 'purchase-orders', 'security', 'inspections', 'whatsapp-inbox', 'lease-to-own', 'vip-tiers', 'live-radar', 'operations-control-room', 'corporate-documents'],
  sales: ['dashboard', 'leads', 'quotations', 'reservations', 'customers', 'tolls', 'whatsapp-inbox', 'lease-to-own', 'vip-tiers', 'corporate-branches', 'corporate-documents'],
  fleet: ['dashboard', 'fleet', 'contracts', 'tolls', 'procurement', 'purchase-orders', 'inspections', 'live-radar', 'fleet-acquisition-roi', 'operations-control-room', 'corporate-documents'],
  finance: ['dashboard', 'finance', 'tax-filing', 'reconciliation', 'customers', 'tolls', 'procurement', 'purchase-orders', 'lease-to-own', 'fleet-acquisition-roi', 'vip-tiers', 'corporate-branches', 'corporate-documents']
};

const VIEW_ALIASES: Record<string, ViewKey> = {
  'bank-reconciliation': 'reconciliation',
  'ai-intelligence': 'ai-studio',
  'tests': 'test-suite',
  'telematics-radar': 'live-radar',
  'roi-simulator': 'fleet-acquisition-roi',
  'control-room': 'operations-control-room',
  'corporate-portal': 'corporate-branches',
  'lpo': 'purchase-orders',
  'supply-orders': 'purchase-orders'
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
