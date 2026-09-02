import type { UserRole } from '../types';
import type { TaxPermission } from '../tax/types';

export const ALL_TAX_PERMISSIONS: TaxPermission[] = [
  'tax.view',
  'tax.prepare',
  'tax.review',
  'tax.approve',
  'tax.profile.manage',
  'tax.sources.manage',
  'tax.rules.propose',
  'tax.rules.accept',
  'tax.period.lock',
  'tax.evidence.manage'
];

export const DEFAULT_TAX_PERMISSIONS_BY_ROLE: Record<UserRole, TaxPermission[]> = {
  ceo: ALL_TAX_PERMISSIONS,
  admin: ALL_TAX_PERMISSIONS,
  finance: ['tax.view', 'tax.prepare', 'tax.evidence.manage'],
  operations: [],
  sales: [],
  fleet: []
};

export function resolveTaxPermissions(role: UserRole, explicitPermissions?: TaxPermission[]): TaxPermission[] {
  if (Array.isArray(explicitPermissions)) {
    return Array.from(new Set(explicitPermissions.filter(permission => ALL_TAX_PERMISSIONS.includes(permission))));
  }
  return DEFAULT_TAX_PERMISSIONS_BY_ROLE[role] || [];
}

export function canTax(role: UserRole, permission: TaxPermission, explicitPermissions?: TaxPermission[]): boolean {
  return resolveTaxPermissions(role, explicitPermissions).includes(permission);
}

/**
 * Internal application permissions never substitute for UAE tax-professional
 * validation. Professional validation is evidence attached to a tax rule,
 * not an application role that can be granted by an administrator.
 */
export function canRepresentProfessionalTaxValidation(_role: UserRole): false {
  return false;
}
