import crypto from 'crypto';
import {
  Customer,
  CustomerKycProfile,
  CustomerKycCategory,
  KycDocument,
  KycStatus,
  DocumentCategory
} from '../types';
import { globalStore } from './dataStore';
import { REQUIRED_DOCUMENTS_MAP } from '../config/kycDocuments';

export const DIRECT_LICENSE_RECOGNIZED_COUNTRIES = new Set([
  'AE', 'SA', 'KW', 'QA', 'BH', 'OM',
  'US', 'CA', 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI',
  'AU', 'NZ', 'JP', 'SG', 'KR', 'CN'
]);

export const VALID_KYC_TRANSITIONS: Record<string, KycStatus[]> = {
  UNVERIFIED: ['DOCUMENTS_PENDING', 'UNDER_REVIEW', 'REJECTED'],
  DOCUMENTS_PENDING: ['UNDER_REVIEW', 'REJECTED', 'EXPIRED', 'UNVERIFIED'],
  UNDER_REVIEW: ['VERIFIED', 'REJECTED', 'DOCUMENTS_PENDING'],
  VERIFIED: ['EXPIRED', 'REJECTED', 'UNDER_REVIEW', 'DOCUMENTS_PENDING'],
  REJECTED: ['UNDER_REVIEW', 'DOCUMENTS_PENDING', 'UNVERIFIED'],
  EXPIRED: ['UNDER_REVIEW', 'DOCUMENTS_PENDING', 'VERIFIED']
};

function requireKycTokenSecret(): string {
  const secret = String(process.env.KYC_TOKEN_SECRET || '').trim();
  if (!secret) {
    throw new Error('KYC token signing is not configured.');
  }
  return secret;
}

function safeHexEqual(leftHex: string, rightHex: string): boolean {
  if (!/^[0-9a-f]+$/i.test(leftHex) || !/^[0-9a-f]+$/i.test(rightHex)) return false;
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export class KycEngine {
  public static maskDocumentNumber(category: DocumentCategory, rawNumber: string): string {
    if (!rawNumber) return '—';
    const trimmed = rawNumber.trim();
    if (trimmed.length <= 4) return '****';

    if (category.startsWith('EMIRATES_ID')) {
      const clean = trimmed.replace(/[^0-9]/g, '');
      if (clean.length === 15) {
        return `${clean.slice(0, 3)}-****-****${clean.slice(11, 14)}-${clean.slice(14)}`;
      }
      return `${trimmed.slice(0, 3)}-****-****${trimmed.slice(-3)}`;
    }

    if (category === 'PASSPORT') return `${trimmed.slice(0, 4)}****`;
    const firstPart = trimmed.slice(0, Math.min(3, Math.floor(trimmed.length / 2)));
    const lastPart = trimmed.slice(-Math.min(3, Math.floor(trimmed.length / 2)));
    return `${firstPart}****${lastPart}`;
  }

  public static validateFileSignature(buffer: Buffer): { isValid: boolean; detectedMime?: string; error?: string } {
    if (!buffer || buffer.length < 4) return { isValid: false, error: 'Empty or corrupted file payload.' };
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { isValid: true, detectedMime: 'image/jpeg' };
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { isValid: true, detectedMime: 'image/png' };
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return { isValid: true, detectedMime: 'application/pdf' };
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) return { isValid: true, detectedMime: 'image/webp' };
    return { isValid: false, error: 'Invalid file signature. Only authentic JPEG, PNG, WebP, and PDF documents are accepted.' };
  }

  public static calculateAge(dobIso: string, referenceDateIso: string = new Date().toISOString()): number {
    if (!dobIso) return 0;
    const dob = new Date(dobIso);
    const ref = new Date(referenceDateIso);
    if (!Number.isFinite(dob.getTime()) || !Number.isFinite(ref.getTime())) return 0;
    let age = ref.getUTCFullYear() - dob.getUTCFullYear();
    const monthDelta = ref.getUTCMonth() - dob.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && ref.getUTCDate() < dob.getUTCDate())) age--;
    return Math.max(0, age);
  }

  public static checkDocumentsExpiry(documents: KycDocument[], targetDateIso: string = new Date().toISOString()): {
    hasExpired: boolean;
    expiredCategories: DocumentCategory[];
    expiringWithin30Days: DocumentCategory[];
  } {
    const target = new Date(targetDateIso).getTime();
    const thirtyDaysAhead = target + 30 * 24 * 60 * 60 * 1000;
    const expiredCategories: DocumentCategory[] = [];
    const expiringWithin30Days: DocumentCategory[] = [];

    for (const doc of documents || []) {
      if (doc.status === 'REJECTED' || !doc.expiryDate) continue;
      const expiry = new Date(doc.expiryDate).getTime();
      if (!Number.isFinite(expiry)) continue;
      if (expiry < target) expiredCategories.push(doc.category);
      else if (expiry <= thirtyDaysAhead) expiringWithin30Days.push(doc.category);
    }

    return { hasExpired: expiredCategories.length > 0, expiredCategories, expiringWithin30Days };
  }

  public static getOrCreateKycProfile(customer: Customer): CustomerKycProfile {
    if (customer.kycProfile && Array.isArray(customer.kycProfile.documents)) {
      this.reconcileProfileState(customer.kycProfile, customer);
      return customer.kycProfile;
    }

    let initialCategory: CustomerKycCategory = 'TOURIST';
    const country = String(customer.country || '').toUpperCase();
    const nationality = String(customer.nationality || '').toUpperCase();
    if (country.includes('UAE') || country.includes('EMIRATES') || nationality.includes('EMIRATI') || customer.idType === 'emirates_id') {
      initialCategory = 'UAE_RESIDENT';
    } else if (['SAUDI', 'SA', 'KUWAIT', 'KW', 'QATAR', 'QA', 'BAHRAIN', 'BH', 'OMAN', 'OM'].some(value => country.includes(value) || nationality.includes(value))) {
      initialCategory = 'GCC_NATIONAL';
    }

    const verifiedDob = customer.dateOfBirth ? String(customer.dateOfBirth) : '';
    const newProfile: CustomerKycProfile = {
      customerId: customer.id,
      customerCategory: initialCategory,
      status: customer.status === 'blocklisted' ? 'REJECTED' : 'UNVERIFIED',
      // Never manufacture age evidence. Unknown stays unknown and fails closed.
      dateOfBirth: verifiedDob,
      age: verifiedDob ? this.calculateAge(verifiedDob) : 0,
      isAgeVerified: Boolean(verifiedDob),
      documents: [],
      riskScore: customer.status === 'blocklisted' ? 'BLOCKED' : customer.isVIP ? 'LOW' : 'MEDIUM',
      updatedAt: new Date().toISOString()
    };

    if (customer.idNumber && customer.idExpiryDate) {
      const category: DocumentCategory = initialCategory === 'UAE_RESIDENT' ? 'EMIRATES_ID_FRONT' : 'PASSPORT';
      newProfile.documents.push({
        id: `KYC-DOC-${Date.now()}-1`, customerId: customer.id, category,
        storagePath: `customer-documents/${customer.id}/legacy-id.pdf`,
        fileUrl: `/api/kyc/${customer.id}/documents/${category}`,
        fileName: 'Legacy Customer Identification Document',
        documentNumberMasked: this.maskDocumentNumber(category, customer.idNumber),
        documentNumberRaw: customer.idNumber,
        expiryDate: customer.idExpiryDate,
        issuingCountry: customer.country || 'AE',
        status: 'ACCEPTED',
        uploadedAt: customer.createdAt || new Date().toISOString(),
        verifiedAt: customer.createdAt || new Date().toISOString(),
        verifiedBy: 'SYSTEM_LEGACY_IMPORT',
        verifiedByName: 'System Record'
      });
    }

    if (customer.licenseNumber && customer.licenseExpiryDate) {
      newProfile.documents.push({
        id: `KYC-DOC-${Date.now()}-2`, customerId: customer.id, category: 'DRIVING_LICENSE_FRONT',
        storagePath: `customer-documents/${customer.id}/legacy-license.pdf`,
        fileUrl: `/api/kyc/${customer.id}/documents/DRIVING_LICENSE_FRONT`,
        fileName: 'Legacy Driving License',
        documentNumberMasked: this.maskDocumentNumber('DRIVING_LICENSE_FRONT', customer.licenseNumber),
        documentNumberRaw: customer.licenseNumber,
        expiryDate: customer.licenseExpiryDate,
        issuingCountry: customer.licenseCountry || 'AE',
        status: 'ACCEPTED',
        uploadedAt: customer.createdAt || new Date().toISOString(),
        verifiedAt: customer.createdAt || new Date().toISOString(),
        verifiedBy: 'SYSTEM_LEGACY_IMPORT',
        verifiedByName: 'System Record'
      });
    }

    this.reconcileProfileState(newProfile, customer);
    customer.kycProfile = newProfile;
    customer.kycStatus = newProfile.status;
    customer.kycCustomerCategory = newProfile.customerCategory;
    return newProfile;
  }

  public static reconcileProfileState(profile: CustomerKycProfile, customer: Customer): void {
    if (customer.status === 'blocklisted') {
      profile.status = 'REJECTED';
      profile.riskScore = 'BLOCKED';
      profile.rejectionNotes = 'Customer is on the official SPLENDOR Blacklist.';
      return;
    }

    const { hasExpired } = this.checkDocumentsExpiry(profile.documents || []);
    if (hasExpired && profile.status === 'VERIFIED') {
      profile.status = 'EXPIRED';
      return;
    }

    const required = REQUIRED_DOCUMENTS_MAP[profile.customerCategory] || REQUIRED_DOCUMENTS_MAP.TOURIST;
    const accepted = new Set((profile.documents || []).filter(doc => doc.status === 'ACCEPTED').map(doc => doc.category));
    const uploaded = new Set((profile.documents || []).map(doc => doc.category));
    const allRequiredAccepted = required.every(category => accepted.has(category));
    const hasVerifiedAge = Boolean(profile.isAgeVerified && profile.dateOfBirth && this.calculateAge(profile.dateOfBirth) > 0);

    // VERIFIED is an evidence-bearing state: required documents and age evidence must both exist.
    if (allRequiredAccepted && !hasExpired && hasVerifiedAge) {
      profile.status = 'VERIFIED';
    } else if (required.every(category => uploaded.has(category)) && (profile.documents || []).some(doc => doc.status === 'PENDING')) {
      profile.status = 'UNDER_REVIEW';
    } else if (allRequiredAccepted && !hasVerifiedAge) {
      profile.status = 'UNDER_REVIEW';
    } else if (uploaded.size > 0 && profile.status !== 'REJECTED') {
      profile.status = 'DOCUMENTS_PENDING';
    } else if (profile.status !== 'REJECTED') {
      profile.status = 'UNVERIFIED';
    }
  }

  public static generateIntakeToken(customerId: string, expiresInHours: number = 48): { token: string; expiresAt: string } {
    const secret = requireKycTokenSecret();
    const normalizedCustomerId = String(customerId || '').trim();
    if (!normalizedCustomerId) throw new Error('customerId is required.');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    const payload = `${normalizedCustomerId}|${expiresAt}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return { token: Buffer.from(`${payload}|${hmac}`).toString('base64url'), expiresAt };
  }

  public static verifyIntakeToken(token: string): { isValid: boolean; customerId?: string; error?: string } {
    try {
      const secret = requireKycTokenSecret();
      const decoded = Buffer.from(String(token || ''), 'base64url').toString('utf8');
      const parts = decoded.split('|');
      if (parts.length !== 3) return { isValid: false, error: 'Malformed verification token.' };
      const [customerId, expiresAt, providedHmac] = parts;
      const expectedHmac = crypto.createHmac('sha256', secret).update(`${customerId}|${expiresAt}`).digest('hex');
      if (!safeHexEqual(providedHmac, expectedHmac)) return { isValid: false, error: 'Invalid token signature.' };
      const expiry = new Date(expiresAt).getTime();
      if (!Number.isFinite(expiry) || expiry < Date.now()) return { isValid: false, error: 'Verification token has expired. Please request a new link.' };
      return { isValid: true, customerId };
    } catch (error) {
      if (error instanceof Error && error.message === 'KYC token signing is not configured.') {
        return { isValid: false, error: 'KYC intake verification is unavailable.' };
      }
      return { isValid: false, error: 'Invalid token encoding.' };
    }
  }

  public static evaluateCustomerKycEligibility(
    customerId: string,
    vehicleIdOrCategory?: string,
    targetDateIso: string = new Date().toISOString()
  ): {
    eligible: boolean;
    status: KycStatus;
    reasons: string[];
    isSupercarRestricted: boolean;
    requiresCeoException: boolean;
    customerCategory: CustomerKycCategory;
  } {
    const customer = globalStore.customers.find(item => item.id === customerId);
    if (!customer) return {
      eligible: false, status: 'UNVERIFIED', reasons: ['Customer record not found in system.'],
      isSupercarRestricted: false, requiresCeoException: false, customerCategory: 'TOURIST'
    };

    const profile = this.getOrCreateKycProfile(customer);
    const reasons: string[] = [];
    if (customer.status === 'blocklisted' || profile.riskScore === 'BLOCKED') return {
      eligible: false, status: 'REJECTED', reasons: ['CRITICAL: Customer is on the active SPLENDOR Blocklist.'],
      isSupercarRestricted: true, requiresCeoException: false, customerCategory: profile.customerCategory
    };

    if (profile.status !== 'VERIFIED') reasons.push(`Customer KYC status is ${profile.status}. Full verification is required before active deployment.`);
    const { hasExpired, expiredCategories } = this.checkDocumentsExpiry(profile.documents || [], targetDateIso);
    if (hasExpired) reasons.push(`Expired mandatory documents detected: ${expiredCategories.join(', ')}.`);

    const required = REQUIRED_DOCUMENTS_MAP[profile.customerCategory] || REQUIRED_DOCUMENTS_MAP.TOURIST;
    const accepted = new Set((profile.documents || []).filter(doc => doc.status === 'ACCEPTED').map(doc => doc.category));
    const missing = required.filter(category => !accepted.has(category));
    if (missing.length) reasons.push(`Missing approved documents: ${missing.join(', ')}.`);

    let isSupercar = false;
    if (vehicleIdOrCategory) {
      const vehicle = globalStore.vehicles.find(item => item.id === vehicleIdOrCategory);
      const category = String(vehicle ? vehicle.category : vehicleIdOrCategory).toLowerCase();
      isSupercar = ['supercar', 'hypercar', 'ultra_luxury_sport'].includes(category);
    }

    const dob = String(profile.dateOfBirth || customer.dateOfBirth || '');
    const hasVerifiedAge = Boolean(profile.isAgeVerified && dob);
    const age = hasVerifiedAge ? this.calculateAge(dob, targetDateIso) : 0;
    let isSupercarRestricted = false;
    let requiresCeoException = false;
    if (!hasVerifiedAge) {
      reasons.push('Customer date of birth has not been verified. Age eligibility cannot be established.');
    } else if (age < 21) {
      reasons.push(`Customer age (${age} yrs) is below the configured minimum rental age.`);
    } else if (isSupercar && age < 25 && !profile.ceoExceptionGranted) {
      isSupercarRestricted = true;
      requiresCeoException = true;
      reasons.push(`Supercar category age policy is not satisfied for this customer (Current age: ${age} yrs). CEO Executive Exception required.`);
    }

    return {
      eligible: reasons.length === 0,
      status: profile.status,
      reasons,
      isSupercarRestricted,
      requiresCeoException,
      customerCategory: profile.customerCategory
    };
  }

  public static getWhatsAppKycNotification(
    event: 'REQUIRED' | 'DOCS_RECEIVED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED',
    customer: Customer,
    intakeUrl?: string,
    reason?: string
  ): { textEn: string; textAr: string } {
    const name = customer.fullName || 'VIP Client';
    switch (event) {
      case 'REQUIRED': return {
        textEn: `Dear ${name}, welcome to SPLENDOR Private Luxury. To complete your bespoke reservation, please upload your verification credentials securely here: ${intakeUrl || 'https://splendor-rental.ae/kyc'}`,
        textAr: `عزيزنا ${name}، مرحباً بك في سبلندر لتأجير السيارات الفارهة. لاستكمال حجزك المعتمد، يرجى رفع وثائق إثبات الهوية بأمان عبر الرابط: ${intakeUrl || 'https://splendor-rental.ae/kyc'}`
      };
      case 'DOCS_RECEIVED': return {
        textEn: `Dear ${name}, we have received your identification documents. Our VIP Concierge team is reviewing them now.`,
        textAr: `عزيزنا ${name}، تم استلام وثائقك بنجاح وجاري تدقيقها حالياً من قبل فريق الكونسيرج التنفيذي.`
      };
      case 'VERIFIED': return {
        textEn: `Dear ${name}, your SPLENDOR VIP identity has been successfully VERIFIED. Your luxury fleet booking is now confirmed.`,
        textAr: `عزيزنا ${name}، تم اعتماد وتوثيق هويتك بنجاح لدى سبلندر الفارهة. حجزك الآن جاهز للتسليم.`
      };
      case 'REJECTED': return {
        textEn: `Dear ${name}, your verification could not be completed. Reason: ${reason || 'Document mismatch'}. Please contact your concierge manager.`,
        textAr: `عزيزنا ${name}، تعذر اعتماد وثائق الهوية. السبب: ${reason || 'عدم وضوح الوثائق'}. يرجى التواصل مع مسؤول الخدمة.`
      };
      case 'EXPIRED': return {
        textEn: `Dear ${name}, your identification credentials on file have expired. Please provide updated documents to maintain active VIP privileges.`,
        textAr: `عزيزنا ${name}، لقد انتهت صلاحية إحدى وثائقك المسجلة. يرجى تزويدنا بالوثائق المحدثة لضمان استمرار خدماتك الفارهة.`
      };
    }
  }
}
