import React, { useState, useEffect } from 'react';
import { 
  Shield, CheckCircle2, AlertTriangle, UploadCloud, 
  FileText, Lock, Check, ChevronRight, Car, Sparkles, AlertCircle
} from 'lucide-react';
import { DocumentCategory } from '../../types';
import { Badge } from '../common/Badge';
import { DayMonthYearDateInput } from '../common/DayMonthYearDateInput';

const DOCUMENT_OPTIONS: { category: DocumentCategory; titleEn: string; titleAr: string; descEn: string; descAr: string }[] = [
  {
    category: 'EMIRATES_ID_FRONT',
    titleEn: 'Emirates ID (Front)',
    titleAr: 'الهوية الإماراتية (الوجه الأمامي)',
    descEn: 'Clear photo of the front side showing full name and photo.',
    descAr: 'صورة واضحة للوجه الأمامي مع إظهار الاسم والصورة بوضوح.'
  },
  {
    category: 'EMIRATES_ID_BACK',
    titleEn: 'Emirates ID (Back)',
    titleAr: 'الهوية الإماراتية (الوجه الخلفي)',
    descEn: 'Clear photo of the back side showing card number and barcode.',
    descAr: 'صورة واضحة للوجه الخلفي مع إظهار الباركود وتاريخ الانتهاء.'
  },
  {
    category: 'PASSPORT',
    titleEn: 'Passport (Bio Page)',
    titleAr: 'جواز السفر (صفحة البيانات)',
    descEn: 'High-resolution photo of the main identification page.',
    descAr: 'صورة عالية الدقة لصفحة البيانات الأساسية للجواز.'
  },
  {
    category: 'VISA_ENTRY_STAMP',
    titleEn: 'UAE Entry Visa / Stamp',
    titleAr: 'تأشيرة الدخول / ختم الإقامة',
    descEn: 'Valid tourist visa or entry stamp page for international visitors.',
    descAr: 'تأشيرة السياحة أو ختم الدخول للدولة للزوار الدوليين.'
  },
  {
    category: 'DRIVING_LICENSE_FRONT',
    titleEn: 'Driving License (Front)',
    titleAr: 'رخصة القيادة (الوجه الأمامي)',
    descEn: 'Valid driving license issued in UAE, GCC, or recognized country.',
    descAr: 'رخصة قيادة سارية المفعول من دولة الإمارات أو دول مجلس التعاون أو دولية.'
  },
  {
    category: 'DRIVING_LICENSE_BACK',
    titleEn: 'Driving License (Back)',
    titleAr: 'رخصة القيادة (الوجه الخلفي)',
    descEn: 'Back side of driving license showing vehicle categories.',
    descAr: 'الوجه الخلفي لرخصة القيادة موضحاً فئات المركبات المصرح بها.'
  }
];

export const PublicKycPortalView: React.FC = () => {
  const [token, setToken] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('EMIRATES_ID_FRONT');
  const [documentNumber, setDocumentNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [issuingCountry, setIssuingCountry] = useState('AE');
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileType, setFileType] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);

  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') || '';
    setToken(t);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File size exceeds maximum limit of 10MB.');
      return;
    }

    setFileName(file.name);
    setFileType(file.type);
    setFileSize(file.size);

    const reader = new FileReader();
    reader.onload = () => {
      setFileBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setErrorMessage('Verification token is missing or expired. Please use the link sent via WhatsApp.');
      return;
    }
    if (!fileBase64) {
      setErrorMessage('Please select a document file to upload.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/public/kyc/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          category: selectedCategory,
          fileName,
          fileType,
          dataBase64: fileBase64,
          documentNumber,
          expiryDate,
          issuingCountry
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUploadSuccess(true);
        setUploadedDocs((prev) => [...prev, selectedCategory]);
        setFileBase64(null);
        setFileName('');
        setDocumentNumber('');
      } else {
        setErrorMessage(data.error || 'Failed to upload document. Please check the file and try again.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred while uploading.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-2xl space-y-6">
        {/* VIP Luxury Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-[#D4AF37] to-[#997d26] p-0.5 shadow-xl shadow-[#D4AF37]/20">
            <div className="w-full h-full bg-zinc-950 rounded-[22px] flex items-center justify-center">
              <Shield className="w-8 h-8 text-[#f5d97f]" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-zinc-100 tracking-tight">
            SPLENDOR PRIVATE LUXURY
          </h1>
          <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold">
            Identity Verification & Concierge Security
          </p>
        </div>

        {/* Upload Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/90 border border-zinc-800 shadow-2xl backdrop-blur-xl space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-zinc-100">Upload Verification Credentials</h2>
            <p className="text-xs text-zinc-400">
              Please provide authentic identity documents to finalize your luxury fleet reservation.
            </p>
          </div>

          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {uploadSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800 text-xs text-emerald-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="font-bold">Document Uploaded Successfully!</p>
                  <p className="text-[11px] text-emerald-400/90">Our VIP Concierge has received the document.</p>
                </div>
              </div>
              <button
                onClick={() => setUploadSuccess(false)}
                className="px-3 py-1 rounded-xl bg-emerald-900/60 border border-emerald-700 text-xs font-semibold hover:bg-emerald-800"
              >
                Upload Next
              </button>
            </div>
          )}

          <form onSubmit={handleUploadSubmit} className="space-y-5">
            {/* Category Selector */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                1. Select Document Category *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
                {DOCUMENT_OPTIONS.map((opt) => {
                  const isUploaded = uploadedDocs.includes(opt.category);
                  const isSelected = selectedCategory === opt.category;

                  return (
                    <div
                      key={opt.category}
                      onClick={() => {
                        setSelectedCategory(opt.category);
                        setUploadSuccess(false);
                      }}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start justify-between ${
                        isSelected
                          ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-zinc-100 shadow-md shadow-[#D4AF37]/10'
                          : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-zinc-200">{opt.titleEn}</p>
                        <p className="text-[11px] text-zinc-400">{opt.titleAr}</p>
                      </div>
                      {isUploaded ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Done
                        </span>
                      ) : isSelected ? (
                        <div className="w-2 h-2 rounded-full bg-[#D4AF37] mt-1" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Document Number & Expiry */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-400">Document Number / ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 784-1990-1234567-1 or A12345678"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <DayMonthYearDateInput
                  label="Expiry Date (Optional)"
                  value={expiryDate}
                  onChange={setExpiryDate}
                  isAr={false}
                />
              </div>
            </div>

            {/* File Upload Drop Area */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                2. Upload High-Resolution Photo / PDF *
              </label>
              <div className="mt-2 relative">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div
                  className={`p-6 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center space-y-2 ${
                    fileBase64
                      ? 'border-[#D4AF37] bg-[#D4AF37]/5'
                      : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
                  }`}
                >
                  <UploadCloud className={`w-8 h-8 ${fileBase64 ? 'text-[#D4AF37]' : 'text-zinc-500'}`} />
                  {fileBase64 ? (
                    <div>
                      <p className="text-xs font-bold text-zinc-200">{fileName}</p>
                      <p className="text-[11px] text-zinc-400">{(fileSize / 1024).toFixed(1)} KB • Ready to submit</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-zinc-300">Click or Drag & Drop Document</p>
                      <p className="text-[11px] text-zinc-500">Supports JPEG, PNG, WebP, PDF (Max 10MB)</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Privacy & Encryption Note */}
            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-400 flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>
                Protected by 256-bit AES encryption & UAE Data Privacy Compliance. Documents are stored in isolated sovereign storage.
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={uploading || !fileBase64}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#D4AF37] to-[#997d26] text-zinc-950 text-sm font-bold shadow-lg shadow-[#D4AF37]/20 hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>Encrypting & Uploading...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Submit Document for Verification</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
