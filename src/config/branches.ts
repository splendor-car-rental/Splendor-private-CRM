/**
 * Splendor's own internal branch/location network -- the fixed list a
 * corporate account or reservation is assigned TO. Single source of truth
 * shared by every screen that lets staff pick a Splendor branch, so it
 * can't drift into two different lists.
 */
export interface SplendorBranch {
  id: string;
  nameEn: string;
  nameAr: string;
  code: string;
}

export const SOVEREIGN_BRANCHES: SplendorBranch[] = [
  { id: 'DXB_BB', nameEn: 'Dubai Flagship • Business Bay', nameAr: 'الفرع الرئيسي • الخليج التجاري', code: 'DXB-01' }
];
