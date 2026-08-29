import React, { useState, useEffect } from 'react';
import { 
  Shield, CheckCircle2, AlertTriangle, Clock, XCircle, 
  UploadCloud, Link2, Copy, Check, Eye, AlertCircle, 
  Sparkles, UserCheck, FileText, ChevronRight, Award, Lock
} from 'lucide-react';
import { Customer, CustomerKycProfile, CustomerKycCategory, KycDocument, DocumentCategory, KycStatus } from '../../types';
import { Badge } from './Badge';
import { Modal } from './Modal';
import { REQUIRED_DOCUMENTS_MAP } from '../../server/kycEngine';
import { formatDate } from '../../lib/dateFormat';

interface KycManagerCardProps {
  customer: Customer;
  currentUserId?: string;
  currentUserRole?: string;
  currentUserName?: string;
  onUpdateSuccess?: () => void;
  showToast?: (title: string, message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

const DOCUMENT_LABELS: Record<DocumentCategory, { en: string; ar: string }> = {
  EMIRATES_ID_FRONT: { en: 'Emirates ID (Front)', ar: 'الهوية الإماراتية (الوجه الأمامي)' },
  EMIRATES_ID_BACK: { en: 'Emirates ID (Back)', ar: 'الهوية الإماراتية (الوجه الخلفي)' },
  PASSPORT: { en: 'Passport (Bio Page)', ar: 'جواز السفر (صفحة البيانات)' },
  VISA_ENTRY_STAMP: { en: 'UAE Entry Visa / Stamp', ar: 'تأشيرة الدخول / ختم الإقامة' },
  DRIVING_LICENSE_FRONT: { en: 'Driving License (Front)', ar: 'رخصة القيادة (الوجه الأمامي)' },
  DRIVING_LICENSE_BACK: { en: 'Driving License (Back)', ar: 'رخصة القيادة (الوجه الخلفي)' },
  INTL_DRIVING_PERMIT: { en: 'International Driving Permit', ar: 'رخصة القيادة الدولية (IDP)' }
};

export const KycManagerCard: React.FC<KycManagerCardProps> = ({
  customer,
  currentUserId = 'USR-001',
  currentUserRole = 'operations',
  currentUserName = 'Staff Executive',
  onUpdateSuccess,
  showToast
}) => {
  const [profile, setProfile] = useState<CustomerKycProfile | null>(customer.kycProfile || null);
  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] = useState<any>(null);

  // Link Generation State
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);

  // Document Review Modal
  const [selectedDoc, setSelectedDoc] = useState<KycDocument | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [docExpiryDate, setDocExpiryDate] = useState('');
  const [docIssuingCountry, setDocIssuingCountry] = useState('AE');
  const [reviewActionLoading, setReviewActionLoading] = useState(false);

  // CEO Exception Modal
  const [ceoModalOpen, setCeoModalOpen] = useState(false);
  const [ceoReason, setCeoReason] = useState('');
  const [ceoLoading, setCeoLoading] = useState(false);

  // Category change
  const [selectedCategory, setSelectedCategory] = useState<CustomerKycCategory>(
    profile?.customerCategory || customer.kycCustomerCategory || 'UAE_RESIDENT'
  );

  // Fetch KYC details
  const fetchKycProfile = async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/kyc/${customer.id}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
        setEligibility(data.eligibility);
        if (data.profile?.customerCategory) {
          setSelectedCategory(data.profile.customerCategory);
        }
      }
    } catch (err) {
      console.error('Failed to fetch KYC profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKycProfile();
  }, [customer.id]);

  const handleGenerateLink = async () => {
    setLinkLoading(true);
    try {
      const res = await fetch('/api/kyc/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          expiresInHours: 48
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGeneratedLink(data.intakeUrl);
        setProfile(data.profile);
        if (showToast) showToast('Upload Link Ready', 'Secure KYC link generated successfully.', 'success');
      } else {
        if (showToast) showToast('Error', data.error || 'Failed to generate link', 'error');
      }
    } catch (err: any) {
      if (showToast) showToast('Network Error', err.message, 'error');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
    if (showToast) showToast('Copied', 'KYC portal link copied to clipboard.', 'info');
  };

  const handleOpenDocReview = (doc: KycDocument) => {
    setSelectedDoc(doc);
    setDocExpiryDate(doc.expiryDate || '');
    setDocIssuingCountry(doc.issuingCountry || 'AE');
    setRejectionReason(doc.rejectionReason || '');
    setReviewModalOpen(true);
  };

  const handleVerifyDocument = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedDoc) return;
    if (action === 'REJECT' && !rejectionReason.trim()) {
      if (showToast) showToast('Reason Required', 'Please specify a reason for rejecting this document.', 'warning');
      return;
    }

    setReviewActionLoading(true);
    try {
      const res = await fetch('/api/kyc/verify-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          documentId: selectedDoc.id,
          action,
          rejectionReason: action === 'REJECT' ? rejectionReason : undefined,
          expiryDate: docExpiryDate || undefined,
          issuingCountry: docIssuingCountry || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProfile(data.profile);
        setReviewModalOpen(false);
        if (showToast) showToast('Document Verified', `Document marked as ${action === 'APPROVE' ? 'ACCEPTED' : 'REJECTED'}.`, 'success');
        fetchKycProfile();
        if (onUpdateSuccess) onUpdateSuccess();
      } else {
        if (showToast) showToast('Error', data.error || 'Failed to update document status', 'error');
      }
    } catch (err: any) {
      if (showToast) showToast('Error', err.message, 'error');
    } finally {
      setReviewActionLoading(false);
    }
  };

  const handleUpdateCategory = async (newCategory: CustomerKycCategory) => {
    setSelectedCategory(newCategory);
    try {
      const res = await fetch('/api/kyc/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          customerCategory: newCategory
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProfile(data.profile);
        fetchKycProfile();
        if (showToast) showToast('Category Updated', `Customer KYC category updated to ${newCategory}.`, 'info');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGrantCeoException = async () => {
    if (!ceoReason.trim()) {
      if (showToast) showToast('Justification Required', 'Please provide an executive justification.', 'warning');
      return;
    }
    setCeoLoading(true);
    try {
      const res = await fetch('/api/kyc/grant-ceo-exception', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          reason: ceoReason
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setProfile(data.profile);
        setCeoModalOpen(false);
        if (showToast) showToast('CEO Exception Granted', 'VIP driver age exception approved for supercars.', 'success');
        fetchKycProfile();
        if (onUpdateSuccess) onUpdateSuccess();
      } else {
        if (showToast) showToast('Error', data.error || 'Failed to grant exception', 'error');
      }
    } catch (err: any) {
      if (showToast) showToast('Error', err.message, 'error');
    } finally {
      setCeoLoading(false);
    }
  };

  const status = profile?.status || customer.kycStatus || 'UNVERIFIED';
  const requiredCategories = REQUIRED_DOCUMENTS_MAP[selectedCategory] || REQUIRED_DOCUMENTS_MAP.UAE_RESIDENT;
  const isCeo = currentUserRole === 'ceo';

  const getStatusBadge = (st: KycStatus) => {
    switch (st) {
      case 'VERIFIED':
        return <Badge variant="emerald" size="md">VERIFIED (100% COMPLIANT)</Badge>;
      case 'UNDER_REVIEW':
        return <Badge variant="gold" size="md">UNDER REVIEW</Badge>;
      case 'DOCUMENTS_PENDING':
        return <Badge variant="sky" size="md">DOCUMENTS PENDING</Badge>;
      case 'EXPIRED':
        return <Badge variant="rose" size="md">EXPIRED CREDENTIALS</Badge>;
      case 'REJECTED':
        return <Badge variant="rose" size="md">REJECTED / BLOCKED</Badge>;
      case 'UNVERIFIED':
      default:
        return <Badge variant="zinc" size="md">UNVERIFIED</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Status, Category & Quick Actions */}
      <div className="p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">KYC Status:</span>
            {getStatusBadge(status)}
            {profile?.riskScore === 'BLOCKED' && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-950 border border-rose-800 text-rose-300">
                BLOCKED ON BLACKLIST
              </span>
            )}
            {profile?.ceoExceptionGranted && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950/80 border border-amber-700/60 text-amber-300 flex items-center gap-1">
                <Award className="w-3 h-3 text-amber-400" />
                CEO SUPERCARS APPROVED
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400">
            Jurisdiction Profile: <strong className="text-zinc-200">{selectedCategory.replace('_', ' ')}</strong> • Age:{' '}
            <strong className="text-zinc-200">{profile?.age || '25+'} yrs</strong>
          </p>
        </div>

        {/* Category Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400 font-medium whitespace-nowrap">Profile Type:</label>
          <select
            value={selectedCategory}
            onChange={(e) => handleUpdateCategory(e.target.value as CustomerKycCategory)}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-medium text-zinc-200 focus:outline-none focus:border-[#D4AF37]"
          >
            <option value="UAE_RESIDENT">UAE Resident</option>
            <option value="GCC_NATIONAL">GCC National</option>
            <option value="TOURIST">International Tourist</option>
          </select>

          <button
            onClick={handleGenerateLink}
            disabled={linkLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4AF37] text-zinc-950 text-xs font-bold hover:bg-[#c49f27] transition-all shadow-md shadow-[#D4AF37]/20"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>{linkLoading ? 'Generating...' : 'Intake Link'}</span>
          </button>

          {isCeo && (
            <button
              onClick={() => setCeoModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-700 text-amber-300 text-xs font-semibold hover:bg-amber-900/60 transition-all"
            >
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>CEO Waiver</span>
            </button>
          )}
        </div>
      </div>

      {/* Intake Link Drawer if generated */}
      {generatedLink && (
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-[#D4AF37]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#f5d97f] flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              Secure 48-Hour Customer Self-Upload Link:
            </p>
            <p className="text-xs font-mono text-zinc-300 break-all select-all bg-zinc-950 p-2 rounded-lg border border-zinc-800">
              {generatedLink}
            </p>
          </div>
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs font-semibold hover:bg-zinc-700 transition-all whitespace-nowrap"
          >
            {linkCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{linkCopied ? 'Copied!' : 'Copy Link'}</span>
          </button>
        </div>
      )}

      {/* Eligibility Invariant Warnings */}
      {eligibility && !eligibility.eligible && (
        <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-800/60 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Rental Deployment Guard Active (Customer Ineligible for Active Contract)</span>
          </div>
          <ul className="text-xs text-rose-300/90 space-y-1 list-disc list-inside">
            {eligibility.reasons.map((r: string, idx: number) => (
              <li key={idx}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Required Documents Matrix */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#D4AF37]" />
          <span>Mandatory Verification Documents Matrix ({selectedCategory.replace('_', ' ')})</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {requiredCategories.map((cat) => {
            const doc = profile?.documents?.find((d) => d.category === cat);
            const isAccepted = doc?.status === 'ACCEPTED';
            const isPending = doc?.status === 'PENDING';
            const isRejected = doc?.status === 'REJECTED';
            const isMissing = !doc;

            return (
              <div
                key={cat}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                  isAccepted
                    ? 'bg-zinc-950/70 border-emerald-900/50'
                    : isPending
                    ? 'bg-zinc-950/70 border-amber-800/60'
                    : isRejected
                    ? 'bg-zinc-950/70 border-rose-900/60'
                    : 'bg-zinc-950/40 border-zinc-800/80 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-100">{DOCUMENT_LABELS[cat]?.en || cat}</p>
                      {isAccepted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {isPending && <Clock className="w-4 h-4 text-amber-400 animate-pulse" />}
                      {isRejected && <XCircle className="w-4 h-4 text-rose-400" />}
                    </div>
                    <p className="text-[11px] text-zinc-400">{DOCUMENT_LABELS[cat]?.ar || ''}</p>
                  </div>

                  <div>
                    {isAccepted && <Badge variant="emerald" size="sm">APPROVED</Badge>}
                    {isPending && <Badge variant="gold" size="sm">NEEDS REVIEW</Badge>}
                    {isRejected && <Badge variant="rose" size="sm">REJECTED</Badge>}
                    {isMissing && <Badge variant="zinc" size="sm">MISSING</Badge>}
                  </div>
                </div>

                {/* Document details if uploaded */}
                {doc ? (
                  <div className="pt-2 border-t border-zinc-800/50 text-xs text-zinc-400 space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Doc Number:</span>
                      <span className="font-mono text-zinc-200 font-semibold">{doc.documentNumberMasked}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Expires:</span>
                      <span className="text-zinc-200">{formatDate(doc.expiryDate)}</span>
                    </div>
                    {doc.verifiedByName && (
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span>Reviewed By:</span>
                        <span>{doc.verifiedByName}</span>
                      </div>
                    )}
                    {doc.rejectionReason && (
                      <div className="text-[11px] text-rose-400 bg-rose-950/30 p-1.5 rounded-lg border border-rose-900/40">
                        Reason: {doc.rejectionReason}
                      </div>
                    )}

                    <div className="pt-2 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenDocReview(doc)}
                        className="px-3 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Inspect & Review</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-zinc-800/50 text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>Awaiting customer upload</span>
                    <button
                      onClick={handleGenerateLink}
                      className="text-[#f5d97f] hover:underline flex items-center gap-1"
                    >
                      <span>Request</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Review & Verification Modal */}
      {reviewModalOpen && selectedDoc && (
        <Modal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          title={`Review KYC Document — ${DOCUMENT_LABELS[selectedDoc.category]?.en || selectedDoc.category}`}
          maxWidth="lg"
        >
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-zinc-300">File Name: {selectedDoc.fileName}</p>
                <p className="text-[11px] font-mono text-zinc-400">Masked ID: {selectedDoc.documentNumberMasked}</p>
              </div>
              <Badge variant={selectedDoc.status === 'ACCEPTED' ? 'emerald' : selectedDoc.status === 'PENDING' ? 'gold' : 'rose'}>
                {selectedDoc.status}
              </Badge>
            </div>

            {/* Document preview container */}
            <div className="w-full h-64 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-center p-4 text-center space-y-2">
              <FileText className="w-12 h-12 text-[#D4AF37]" />
              <p className="text-sm font-semibold text-zinc-200">{selectedDoc.fileName}</p>
              <p className="text-xs text-zinc-400">
                Encrypted storage path: <span className="font-mono text-zinc-400">{selectedDoc.storagePath}</span>
              </p>
              <span className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-emerald-400 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>Verified Clean Magic Bytes Signature ({selectedDoc.fileType || 'image/jpeg'})</span>
              </span>
            </div>

            {/* Document metadata fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-400">Document Expiry Date</label>
                <input
                  type="date"
                  value={docExpiryDate}
                  onChange={(e) => setDocExpiryDate(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-400">Issuing Country</label>
                <input
                  type="text"
                  value={docIssuingCountry}
                  onChange={(e) => setDocIssuingCountry(e.target.value)}
                  className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            {/* Rejection reason if needed */}
            <div>
              <label className="text-xs font-semibold text-zinc-400">Rejection Reason (If rejecting)</label>
              <textarea
                rows={2}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Expired document, blurry photo, name mismatch..."
                className="w-full mt-1 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-700"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={reviewActionLoading}
                  onClick={() => handleVerifyDocument('REJECT')}
                  className="px-4 py-2 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-bold hover:bg-rose-900 transition-all"
                >
                  Reject Document
                </button>
                <button
                  type="button"
                  disabled={reviewActionLoading}
                  onClick={() => handleVerifyDocument('APPROVE')}
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-zinc-950 text-xs font-bold hover:bg-emerald-500 transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve & Verify</span>
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* CEO Supercar Waiver Modal */}
      {ceoModalOpen && (
        <Modal
          isOpen={ceoModalOpen}
          onClose={() => setCeoModalOpen(false)}
          title="CEO Executive Supercar Age Exception Waiver"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-700/60 text-xs text-amber-300 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                <span>Executive Authority Discretion</span>
              </p>
              <p>
                Granting this waiver authorizes drivers between 21 and 24 years old to operate Hypercars & Supercars (Ferrari, Lamborghini, McLaren, Rolls-Royce).
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-400">Executive Justification / Reason *</label>
              <textarea
                rows={3}
                value={ceoReason}
                onChange={(e) => setCeoReason(e.target.value)}
                placeholder="e.g. VIP Royal Family member, corporate sponsor guarantee, increased 20,000 AED security deposit verified..."
                className="w-full mt-1 p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setCeoModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={ceoLoading}
                onClick={handleGrantCeoException}
                className="px-4 py-2 rounded-xl bg-[#D4AF37] text-zinc-950 text-xs font-bold hover:bg-[#c49f27]"
              >
                {ceoLoading ? 'Granting...' : 'Approve CEO Waiver'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
