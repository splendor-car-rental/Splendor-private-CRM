import React, { useState, useEffect } from 'react';

interface OfficialLetterheadLayoutProps {
  id?: string;
  children: React.ReactNode;
  className?: string;
  showLegalStrip?: boolean;
  documentTitle?: string;
}

// The approved corporate header/footer (src/server/assets/ltoLetterheadAsset.ts's
// server-side twin -- same source PDF, served here as static files instead of
// inline base64 so the client bundle doesn't carry them) is immutable content:
// never redrawn, rewritten, or replaced by a user-supplied image (Issue #41).
// A prior version of this component let a user upload an arbitrary image to
// stand in for the letterhead ("custom_bg" mode) -- removed, since that let
// any user with UI access override the approved corporate identity on an
// official document. The only remaining alternate mode, "preprinted", never
// substitutes different content: it just leaves blank space because the
// physical paper stock already carries the letterhead pre-printed.
export const OfficialLetterheadLayout: React.FC<OfficialLetterheadLayoutProps> = ({
  id,
  children,
  className = '',
  showLegalStrip = true,
  documentTitle
}) => {
  const [mode, setMode] = useState<'standard' | 'preprinted'>(() => {
    const saved = localStorage.getItem('splendor_letterhead_mode');
    return saved === 'preprinted' ? 'preprinted' : 'standard';
  });

  useEffect(() => {
    localStorage.setItem('splendor_letterhead_mode', mode);
  }, [mode]);

  return (
    <div className="space-y-3">
      {/* Template Selection Toolbar (No-Print) */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs no-print flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#f5d97f]">نموذج الهيد ليتر:</span>
          <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800 gap-1">
            <button
              type="button"
              onClick={() => setMode('standard')}
              className={`px-2.5 py-1 rounded-md transition-all font-semibold ${
                mode === 'standard' ? 'bg-[#D4AF37] text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              النموذج الرسمي المعتمد
            </button>
            <button
              type="button"
              onClick={() => setMode('preprinted')}
              className={`px-2.5 py-1 rounded-md transition-all font-semibold ${
                mode === 'preprinted' ? 'bg-[#D4AF37] text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="لطباعة محتوى المستند فقط على أوراق الشركة المطبوعة مسبقاً داخل الطابعة"
            >
              ورق مروس مسبقاً (محتوى فقط)
            </button>
          </div>
        </div>
      </div>

      {/* Printable Master A4 Container */}
      <div
        id={id}
        className={`a4-document relative w-full max-w-[794px] mx-auto bg-white text-zinc-900 border border-zinc-300 shadow-2xl overflow-hidden font-arabic flex flex-col justify-between h-[1123px] max-h-[1123px] min-h-[1123px] rounded-lg ${className}`}
        style={{ boxSizing: 'border-box' }}
      >
        {/* ===================== TOP HEADER ===================== */}
        {mode === 'standard' && (
          <div className="relative w-full overflow-hidden shrink-0">
            {/* The approved corporate header banner, verbatim -- never redrawn */}
            <img
              src="/splendor-letterhead-header.jpg"
              alt="Splendor Car Rental -- Official Letterhead Header"
              className="w-full h-auto block"
            />

            {/* Legal strip -- supplementary disclosure text below the approved
                image, not part of it and never substituting for it */}
            {showLegalStrip && (
              <div className="bg-[#6b141a] text-white py-0.5 px-6 text-[9px] font-bold flex items-center justify-between border-b border-[#D4AF37]/50">
                <span>شركة سبلندر لتأجير السيارات ش.ذ.م.م | SPLENDOR CAR RENTAL L.L.C</span>
                <span className="font-mono" dir="ltr">TRN: 104391520400003 | License: 1322610</span>
              </div>
            )}
          </div>
        )}

        {mode === 'preprinted' && (
          <div className="h-[120px] w-full shrink-0 pointer-events-none" />
        )}

        {/* ===================== MIDDLE CONTENT (FITS EXACT SINGLE A4 PAGE) ===================== */}
        <div className="flex-1 px-6 sm:px-8 py-2 overflow-hidden flex flex-col justify-between bg-white">
          {children}
        </div>

        {mode === 'preprinted' && (
          <div className="h-[60px] w-full shrink-0 pointer-events-none" />
        )}

        {/* ===================== BOTTOM FOOTER ===================== */}
        {mode === 'standard' && (
          <img
            src="/splendor-letterhead-footer.png"
            alt="Splendor Car Rental -- Official Letterhead Footer"
            className="w-full h-auto block shrink-0"
          />
        )}
      </div>
    </div>
  );
};
