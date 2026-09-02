export type TaxDomain = 'VAT' | 'CORPORATE_TAX';

export type TaxSourceAuthority =
  | 'FTA'
  | 'MOF'
  | 'UAE_LEGISLATION'
  | 'OTHER_OFFICIAL_UAE';

export type TaxSourceStatus =
  | 'proposed'
  | 'validated'
  | 'accepted'
  | 'superseded'
  | 'deprecated';

export type TaxRuleStatus =
  | 'proposed'
  | 'professional_review_required'
  | 'validated'
  | 'accepted'
  | 'superseded'
  | 'deprecated';

export type TaxPeriodStatus =
  | 'open'
  | 'preparing'
  | 'review'
  | 'approved'
  | 'locked'
  | 'filed'
  | 'filed_reconciled';

export type TaxDeadlineBasis =
  | 'EMARATAX_CONFIRMED'
  | 'OFFICIAL_SOURCE'
  | 'SPECIAL_OFFICIAL_NOTICE';

export type TaxPermission =
  | 'tax.view'
  | 'tax.prepare'
  | 'tax.review'
  | 'tax.approve'
  | 'tax.profile.manage'
  | 'tax.sources.manage'
  | 'tax.rules.propose'
  | 'tax.rules.accept'
  | 'tax.period.lock'
  | 'tax.evidence.manage';

export interface TaxMasterProfile {
  id: 'splendor';
  legalEntityName: string;
  legalEntityNameAr?: string;
  vatRegistrationStatus: 'not_configured' | 'registered' | 'not_registered' | 'under_review';
  vatTrn?: string;
  vatRegistrationDate?: string;
  vatTaxPeriodDescription?: string;
  corporateTaxRegistrationStatus: 'not_configured' | 'registered' | 'not_registered' | 'under_review';
  corporateTaxTrn?: string;
  corporateTaxRegistrationDate?: string;
  financialYearStart?: string;
  financialYearEnd?: string;
  accountingStandard?: string;
  vatTaxGroupStatus: 'unknown' | 'not_member' | 'member';
  corporateTaxGroupStatus: 'unknown' | 'not_member' | 'member';
  emirate?: string;
  notes?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  verificationStatus: 'unverified' | 'internally_verified' | 'professionally_validated';
  verifiedBy?: string;
  verifiedAt?: string;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string;
}

export interface TaxOfficialSource {
  id: string;
  domain: TaxDomain | 'TAX_PROCEDURES' | 'E_INVOICING' | 'CROSS_DOMAIN';
  authority: TaxSourceAuthority;
  officialTitle: string;
  lawDecisionGuideNumber?: string;
  officialUrl: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  versionRevision?: string;
  applicablePeriod?: string;
  topics: string[];
  supersedesSourceIds?: string[];
  supersededBySourceId?: string;
  interpretationRequired: boolean;
  status: TaxSourceStatus;
  retrievedAt: string;
  sourceLanguage?: 'ar' | 'en' | 'bilingual';
  notes?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  validatedBy?: string;
  validatedByName?: string;
  validatedAt?: string;
  validationReason?: string;
  updatedAt: string;
}

export interface TaxProfessionalValidation {
  validatorName: string;
  validatorOrganization?: string;
  validatorCapacity: 'UAE_TAX_PROFESSIONAL';
  validationReference?: string;
  validationEvidenceDocumentId?: string;
  scope: string;
  validatedAt: string;
  validThrough?: string;
  qualificationsOrLimitations?: string;
  notes?: string;
}

export interface TaxRuleVersion {
  id: string;
  domain: TaxDomain | 'TAX_PROCEDURES' | 'E_INVOICING';
  code: string;
  version: string;
  title: string;
  description: string;
  status: TaxRuleStatus;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceIds: string[];
  interpretationRequired: boolean;
  implementationScope?: string;
  supersedesRuleId?: string;
  supersededByRuleId?: string;
  proposedBy: string;
  proposedByName: string;
  proposedAt: string;
  professionalValidation?: TaxProfessionalValidation;
  professionalValidationRecordedBy?: string;
  professionalValidationRecordedByName?: string;
  professionalValidationRecordedAt?: string;
  acceptedBy?: string;
  acceptedByName?: string;
  acceptedAt?: string;
  updatedAt: string;
}

export interface TaxPeriod {
  id: string;
  domain: TaxDomain;
  periodStart: string;
  periodEnd: string;
  filingDeadline: string;
  deadlineBasis: TaxDeadlineBasis;
  deadlineSourceId: string;
  deadlineEvidenceReference?: string;
  deadlineEvidenceDocumentId?: string;
  taxProfileVersionUpdatedAt: string;
  status: TaxPeriodStatus;
  ruleVersionIds: string[];
  preparationStartedBy?: string;
  preparationStartedByName?: string;
  preparationStartedAt?: string;
  preparedBy?: string;
  preparedByName?: string;
  preparedAt?: string;
  reviewStatus?: 'pending' | 'passed' | 'changes_requested';
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
  lockedSnapshotHash?: string;
  filedAt?: string;
  filingReference?: string;
  filingEvidenceDocumentIds?: string[];
  paymentReference?: string;
  paymentEvidenceDocumentIds?: string[];
  reconciliationDifferenceAed?: number;
  blockingExceptionCount: number;
  filingReadiness: 'NOT_READY_FOR_FILING' | 'BLOCKED' | 'READY_FOR_REVIEW' | 'READY_FOR_FILING';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxAuditEvent {
  id: string;
  entityType: 'TaxMasterProfile' | 'TaxOfficialSource' | 'TaxRuleVersion' | 'TaxPeriod';
  entityId: string;
  action: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  reason?: string;
  previousValue?: unknown;
  newValue?: unknown;
  timestamp: string;
}
