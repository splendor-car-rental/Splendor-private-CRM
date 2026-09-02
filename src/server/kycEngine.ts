import crypto from 'crypto';
import {
  Customer,
  CustomerKycProfile,
  CustomerKycCategory,
  KycDocument,
  KycStatus,
  DocumentCategory,
  Vehicle
} from '../types';
import { globalStore } from './dataStore';

// ----------------------------------------------------
// 1. REQUIRED DOCUMENTS SPECIFICATION
// ----------------------------------------------------
export const REQUIRED_DOCUMENTS_MAP: Record<CustomerKycCategory, DocumentCategory[]> = {
  UAE_RESIDENT: [
    'EMIRATES_ID_FRONT',
    'EMIRATES_ID_BACK',
    'DRIVING_LICENSE_FRONT',
    'DRIVING_LICENSE_BACK'
  ],
  GCC_NATIONAL: [
    'PASSPORT',
    'DRIVING_LICENSE_FRONT',
    'DRIVING_LICENSE_BACK'
  ],
  TOURIST: [
    'PASSPORT',
    'VISA_ENTRY_STAMP',
    'DRIVING_LICENSE_FRONT'
  ]
};

// Countries with direct license recognition in UAE (no IDP required for tourists)
export const DIRECT_LICENSE_RECOGNIZED_COUNTRIES = new Set([
  'AE', 'SA', 'KW', 'QA', 'BH', 'OM',
  'US', 'CA', 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI',
  'AU', 'NZ', 'JP', 'SG', 'KR', 'CN'
]);

// ----------------------------------------------------
// 2. STATE MACHINE TRANSITIONS
// ----------------------------------------------------
export const VALID_KYC_TRANSITIONS: Record<string, KycStatus[]> = {
  UNVERIFIED: ['DOCUMENTS_PENDING', 'UNDER_REVIEW', 'REJECTED'],
  DOCUMENTS_PENDING: ['UNDER_REVIEW', 'REJECTED', 'EXPIRED', 'UNVERIFIED'],
  UNDER_REVIEW: ['VERIFIED', 'REJECTED', 'DOCUMENTS_PENDING'],
  VERIFIED: ['EXPIRED', 'REJECTED', 'UNDER_REVIEW', 'DOCUMENTS_PENDING'],
  REJECTED: ['UNDER_REVIEW', 'DOCUMENTS_PENDING', 'UNVERIFIED'],
  EXPIRED: ['UNDER_REVIEW', 'DOCUMENTS_PENDING', 'VERIFIED']
};

export class KycEngine {
  private static TOKEN_SECRET = process.env.KYC_TOKEN_SECRET || 'splendor-luxury-kyc-secret-key-2026';

  // ----------------------------------------------------
  // PII MASKING
  // ----------------------------------------------------
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

    if (category === 'PASSPORT') {
      return `${trimmed.slice(0, 4)}****`;
    }

    const firstPart = trimmed.slice(0, Math.min(3, Math.floor(trimmed.length / 2)));
    const lastPart = trimmed.slice(-Math.min(3, Math.floor(trimmed.length / 2)));
    return `${firstPart}****${lastPart}`;
  }

  // ----------------------------------------------------
  // MAGIC BYTES & FILE SIGNATURE VALIDATION
  // ----------------------------------------------------
  public static validateFileSignature(buffer: Buffer): { isValid: boolean; detectedMime?: string; error?: string } {
    if (!buffer || buffer.length < 4) {
      return { isValid: false, error: 'Empty or corrupted file payload.' };
    }

    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { isValid: true, detectedMime: 'image/jpeg' };
    }

    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return { isValid: true, detectedMime: 'image/png' };
    }

    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return { isValid: true, detectedMime: 'application/pdf' };
    }

    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return { isValid: true, detectedMime: 'image/webp' };
    }

    return {
      isValid: false,
      error: 'Invalid file signature. Only authentic JPEG, PNG, WebP, and PDF documents are accepted.'
    };
  }

  // ----------------------------------------------------
  // AGE CALCULATION
  // ----------------------------------------------------
  public static calculateAge(dobIso: string, referenceDateIso: string = new Date().toISOString()): number {
    if (!dobIso) return 0;
    const dob = new Date(dobIso);
    const ref = new Date(referenceDateIso);
    if (isNaN(dob.getTime())) return 0;

    let age = ref.getFullYear() - dob.getFullYear();
    const m = ref.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) {
      age--;
    }
    return Math.max(0, age);
  }

  // ----------------------------------------------------
  // EXPIRY AUDIT
  // ----------------------------------------------------
  public static checkDocumentsExpiry(documents: KycDocument[], targetDateIso: string = new Date().toISOString()): {
    hasExpired: boolean;
    expiredCategories: DocumentCategory[];
    expiringWithin30Days: DocumentCategory[];
  } {
    const target = new Date(targetDateIso).getTime();
    const thirtyDaysAhead = target + (30 * 24 * 60 * 60 * 1000);

    const expiredCategories: DocumentCategory[] = [];
    const expiringWithin30Days: DocumentCategory[] = [];

    for (const doc of documents) {
      if (doc.status !== 'REJECTED' && doc.expiryDate) {
        const exp = new Date(doc.expiryDate).getTime();
        if (!isNaN(exp)) {
          if (exp < target) {
            expiredCategories.push(doc.category);
          } else if (exp <= thirtyDaysAhead) {
            expiringWithin30Days.push(doc.category);
          }
        }
      }
    }

    return { hasExpired, expiredCategories, expiringWithin30Days };
  }

  // ----------------------------------------------------
  // GET OR INITIALIZE KYC PROFILE
  // ----------------------------------------------------
  public static getOrCreateKycProfile(customer: Customer): CustomerKycProfile {
    if (customer.kycProfile && customer.kycProfile.documents) {
      this.reconcileProfileState(customer.kycProfile, customer);
      return customer.kycProfile;
    }

    let initialCategory: CustomerKycCategory = 'TOURIST';
    const cCountry = (customer.country || '').toUpperCase();
    const cNat = (customer.nationality || '').toUpperCase();

    if (cCountry.includes('UAE') || cCountry.includes('EMIRATES') || cNat.includes('EMIRATI') || customer.idType === 'emirates_id') {
      initialCategory = 'UAE_RESIDENT';
    } else if (['SAUDI', 'SA', 'KUWAIT', 'KW', 'QATAR', 'QA', 'BAHRAIN', 'BH', 'OMAN', 'OM'].some(g => cCountry.includes(g) || cNat.includes(g))) {
      initialCategory = 'GCC_NATIONAL';
    }

    const initialStatus: KycStatus = customer.status === 'blocklisted' ? 'REJECTED' : 'UNVERIFIED';
    const verifiedDob = customer.dateOfBirth ? String(customer.dateOfBirth) : '';

    // IMPORTANT: never manufacture a DOB/age. The previous implementation
    // silently substituted 1995-01-01 and marked isAgeVerified=true, which
    // could make an unknown-age customer appear eligible for handover.
    const newProfile: CustomerKycProfile = {
      customerId: customer.id,
      customerCategory: initialCategory,
      status: initialStatus,
      dateOfBirth: verifiedDob,
      age: verifiedDob ? this.calculateAge(verifiedDob) : 0,
      isAgeVerified: Boolean(verifiedDob),
      documents: [],
      riskScore: customer.status === 'blocklisted' ? 'BLOCKED' : customer.isVIP ? 'LOW' : 'MEDIUM',
      updatedAt: new Date().toISOString()
    };

    if (customer.idNumber && customer.idExpiryDate) {
      const docCat: DocumentCategory = initialCategory === 'UAE_RESIDENT' ? 'EMIRATES_ID_FRONT' : 'PASSPORT';
      newProfile.documents.push({
        id: `KYC-DOC-${Date.now()}-1`,
        customerId: customer.id,
        category: docCat,
        storagePath: `customer-documents/${customer.id}/legacy-id.pdf`,
        fileUrl: `/api/kyc/${customer.id}/documents/${docCat}`,
        fileName: 'Legacy Customer Identification Document',
        documentNumberMasked: this.maskDocumentNumber(docCat, customer.idNumber),
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
        id: `KYC-DOC-${Date.now()}-2`,
        customerId: customer.id,
        category: 'DRIVING_LICENSE_FRONT',
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

  // ----------------------------------------------------
  // RECONCILE PROFILE STATE AUTOMATICALLY
  // ----------------------------------------------------
  public static reconcileProfileState(profile: CustomerKycProfile, customer: Customer) {
    if (customer.status === 'blocklisted') {
      profile.status = 'REJECTED';
      profile.riskScore = 'BLOCKED';
      profile.rejectionNotes = 'Customer is on the official SPLENDOR Blacklist.';
      return;
    }

    const { hasExpired } = this.checkDocumentsExpiry(profile.documents);
    if (hasExpired && profile.status === 'VERIFIED') {
      profile.status = 'EXPIRED';
      return;
    }

    const requiredCats = REQUIRED_DOCUMENTS_MAP[profile.customerCategory] || REQUIRED_DOCUMENTS_MAP.TOURIST;
    const acceptedCats = new Set(
      profile.documents
        .filter(d => d.status === 'ACCEPTED')
        .map(d => d.category)
    );

    const allRequiredAccepted = requiredCats.every(cat => acceptedCats.has(cat));

    if (allRequiredAccepted && !hasExpired) {
      profile.status = 'VERIFIED';
    } else {
      const uploadedCats = new Set(profile.documents.map(d => d.category));
      const hasAllUploaded = requiredCats.every(cat => uploadedCats.has(cat));

      if (hasAllUploaded && profile.documents.some(d => d.status === 'PENDING')) {
        profile.status = 'UNDER_REVIEW';
      } else if (uploadedCats.size > 0 && profile.status !== 'REJECTED') {
        profile.status = 'DOCUMENTS_PENDING';
      }
    }
  }

  // ----------------------------------------------------
  // TOKEN-BASED INTAKE PORTAL LINK GENERATOR
  // ----------------------------------------------------
  public static generateIntakeToken(customerId: string, expiresInHours: number = 48): { token: string; expiresAt: string } {
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    const payload = `${customerId}|${expiresAt}`;
    const hmac = crypto.createHmac('sha256', this.TOKEN_SECRET).update(payload).digest('hex');
    const token = Buffer.from(`${payload}|${hmac}`).toString('base64url');
    return { token, expiresAt };
  }

  public static verifyIntakeToken(token: string): { isValid: boolean; customerId?: string; error?: string } {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const parts = decoded.split('|');
      if (parts.length !== 3) return { isValid: false, error: 'Malformed verification token.' };

      const [customerId, expiresAt, providedHmac] = parts;
      const expectedHmac = crypto.createHmac('sha256', this.TOKEN_SECRET).update(`${customerId}|${expiresAt}`).digest('hex');

      if (providedHmac !== expectedHmac) {
        return { isValid: false, error: 'Invalid token signature.' };
      }

      if (new Date(expiresAt).getTime() < Date.now()) {
        return { isValid: false, error: 'Verification token has expired. Please request a new link.' };
      }

      return { isValid: true, customerId };
    } catch (e: any) {
      return { isValid: false, error: 'Invalid token encoding.' };
    }
  }

  // ----------------------------------------------------
  // ELIGIBILITY EVALUATION ENGINE
  // ----------------------------------------------------
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
    const customer = globalStore.customers.find(c => c.id === customerId);
    if (!customer) {
      return {
        eligible: false,
        status: 'UNVERIFIED',
        reasons: ['Customer record not found in system.'],
        isSupercarRestricted: false,
        requiresCeoException: false,
        customerCategory: 'TOURIST'
      };
    }

    const profile = this.getOrCreateKycProfile(customer);
    const reasons: string[] = [];

    if (customer.status === 'blocklisted' || profile.riskScore === 'BLOCKED') {
      return {
        eligible: false,
        status: 'REJECTED',
        reasons: ['CRITICAL: Customer is on the active SPLENDOR Blocklist.'],
        isSupercarRestricted: true,
        requiresCeoException: false,
        customerCategory: profile.customerCategory
      };
    }

    if (profile.status !== 'VERIFIED') {
      reasons.push(`Customer KYC status is ${profile.status}. Full verification is required before active deployment.`);
    }

    const { hasExpired, expiredCategories } = this.checkDocumentsExpiry(profile.documents, targetDateIso);
    if (hasExpired) {
      reasons.push(`Expired mandatory documents detected: ${expiredCategories.join(', ')}.`);
    }

    const requiredCats = REQUIRED_DOCUMENTS_MAP[profile.customerCategory] || REQUIRED_DOCUMENTS_MAP.TOURIST;
    const acceptedCats = new Set(
      profile.documents
        .filter(d => d.status === 'ACCEPTED')
        .map(d => d.category)
    );
    const missingCats = requiredCats.filter(cat => !acceptedCats.has(cat));
    if (missingCats.length > 0) {
      reasons.push(`Missing approved documents: ${missingCats.join(', ')}.`);
    }

    let isSupercar = false;
    if (vehicleIdOrCategory) {
      const vehicle = globalStore.vehicles.find(v => v.id === vehicleIdOrCategory);
      const cat = vehicle ? vehicle.category : vehicleIdOrCategory;
      isSupercar = ['supercar', 'hypercar', 'ultra_luxury_sport'].includes(cat.toLowerCase());
    }

    const dob = profile.dateOfBirth || customer.dateOfBirth || '';
    const hasVerifiedAge = Boolean(profile.isAgeVerified && dob);
    const age = hasVerifiedAge ? this.calculateAge(dob, targetDateIso) : 0;
    let isSupercarRestricted = false;
    let requiresCeoException = false;

    if (!hasVerifiedAge) {
      reasons.push('Customer date of birth has not been verified. Age eligibility cannot be established.');
    } else if (age < 21) {
      reasons.push(`Customer age (${age} yrs) is below the minimum legal luxury rental age (21 yrs).`);
    } else if (isSupercar && age < 25 && !profile.ceoExceptionGranted) {
      isSupercarRestricted = true;
      requiresCeoException = true;
      reasons.push(`Supercar category requires driver age >= 25 yrs (Current age: ${age} yrs). CEO Executive Exception required.`);
    }

    const eligible = reasons.length === 0;

    return {
      eligible,
      status: profile.status,
      reasons,
      isSupercarRestricted,
      requiresCeoException,
      customerCategory: profile.customerCategory
    };
  }

  // ----------------------------------------------------
  // WHATSAPP NOTIFICATION MESSAGE GENERATORS
  // ----------------------------------------------------
  public static getWhatsAppKycNotification(
    event: 'REQUIRED' | 'DOCS_RECEIVED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED',
    customer: Customer,
    intakeUrl?: string,
    reason?: string
  ): { textEn: string; textAr: string } {
    const name = customer.fullName || 'VIP Client';

    switch (event) {
      case 'REQUIRED':
        return {
          textEn: `Dear ${name}, welcome to SPLENDOR Private Luxury. To complete your bespoke reservation, please upload your verification credentials securely here: ${intakeUrl || 'https://splendor-rental.ae/kyc'}`,
          textAr: `عزيزنا ${name}، مرحباً بك في سبلندر لتأجير السيارات الفارهة. لاستكمال حجزك المعتمد، يرجى رفع وثائق إثبات الهوية بأمان عبر الرابط: ${intakeUrl || 'https://splendor-rental.ae/kyc'}`
        };
      case 'DOCS_RECEIVED':
        return {
          textEn: `Dear ${name}, we have received your identification documents. Our VIP Concierge team is reviewing them now.`,
          textAr: `عزيزنا ${name}، تم استلام وثائقك بنجاح وجاري تدقيقها حالياً من قبل فريق الكونسيرج التنفيذي.`
        };
      case 'VERIFIED':
        return {
          textEn: `Dear ${name}, your SPLENDOR VIP identity has been successfully VERIFIED. Your luxury fleet booking is now confirmed.`,
          textAr: `عزيزنا ${name}، تم اعتماد وتوثيق هويتك بنجاح لدى سبلندر الفارهة. حجزك الآن جاهز للتسليم.`
        };
      case 'REJECTED':
        return {
          textEn: `Dear ${name}, your verification could not be completed. Reason: ${reason || 'Document mismatch'}. Please contact your concierge manager.`,
          textAr: `عزيزنا ${name}، تعذر اعتماد وثائق الهوية. السبب: ${reason || 'عدم وضوح الوثائق'}. يرجى التواصل مع مسؤول الخدمة.`
        };
      case 'EXPIRED':
        return {
          textEn: `Dear ${name}, your identification credentials on file have expired. Please provide updated documents to maintain active VIP privileges.`,
          textAr: `عزيزنا ${name}، لقد انتهت صلاحية إحدى وثائقك المسجلة. يرجى تزويدنا بالوثائق المحدثة لضمان استمرار خدماتك الفارهة.`
        };
    }
  }
}
