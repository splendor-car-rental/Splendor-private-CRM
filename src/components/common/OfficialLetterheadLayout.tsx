import React, { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Globe, Upload, Image, Eye, RotateCcw } from 'lucide-react';

interface OfficialLetterheadLayoutProps {
  id?: string;
  children: React.ReactNode;
  className?: string;
  showLegalStrip?: boolean;
  documentTitle?: string;
}

export const OfficialLetterheadLayout: React.FC<OfficialLetterheadLayoutProps> = ({
  id,
  children,
  className = '',
  showLegalStrip = true,
  documentTitle
}) => {
  // Check if a custom full-page letterhead background image was uploaded by user
  const [customLetterheadBg, setCustomLetterheadBg] = useState<string | null>(() => {
    return localStorage.getItem('splendor_custom_letterhead_bg') || null;
  });

  const [mode, setMode] = useState<'standard' | 'custom_bg' | 'preprinted'>(() => {
    const saved = localStorage.getItem('splendor_letterhead_mode');
    if (saved === 'custom_bg' || saved === 'preprinted' || saved === 'standard') return saved;
    return 'standard';
  });

  useEffect(() => {
    localStorage.setItem('splendor_letterhead_mode', mode);
  }, [mode]);

  const handleUploadCustomBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCustomLetterheadBg(result);
      localStorage.setItem('splendor_custom_letterhead_bg', result);
      setMode('custom_bg');
    };
    reader.readAsDataURL(file);
  };

  const handleResetBg = () => {
    localStorage.removeItem('splendor_custom_letterhead_bg');
    setCustomLetterheadBg(null);
    setMode('standard');
  };

  return (
    <div className="space-y-3">
      {/* Top Template Selection & Custom Letterhead Upload Toolbar (No-Print) */}
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
              onClick={() => setMode('custom_bg')}
              className={`px-2.5 py-1 rounded-md transition-all font-semibold ${
                mode === 'custom_bg' ? 'bg-[#D4AF37] text-zinc-950 shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              صورة الهيد ليتر المرفقة {customLetterheadBg ? '✓' : ''}
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

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer font-bold transition-all border border-zinc-700">
            <Upload className="w-3.5 h-3.5 text-[#f5d97f]" />
            <span>رفع صورة هيد ليتر أصلية</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadCustomBg}
            />
          </label>

          {customLetterheadBg && (
            <button
              type="button"
              onClick={handleResetBg}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-950/40 text-red-400 hover:bg-red-900/60 border border-red-800/60 font-bold transition-all"
              title="إعادة ضبط واستخدام الهيد ليتر المعتمد"
            >
              <RotateCcw className="w-3 h-3" />
              <span>استعادة الأصلي</span>
            </button>
          )}
        </div>
      </div>

      {/* Printable Master A4 Container */}
      <div 
        id={id}
        className={`a4-document relative w-full max-w-[794px] mx-auto bg-white text-zinc-900 border border-zinc-300 shadow-2xl overflow-hidden font-arabic flex flex-col justify-between h-[1123px] max-h-[1123px] min-h-[1123px] rounded-lg ${className}`}
        style={{ 
          boxSizing: 'border-box',
          backgroundImage: mode === 'custom_bg' && customLetterheadBg ? `url(${customLetterheadBg})` : undefined,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center top'
        }}
      >
        {/* ===================== TOP HEADER ===================== */}
        {mode === 'standard' && (
          <div className="relative w-full overflow-hidden bg-[#0a0a0c] text-white shrink-0">
            {/* Authentic Banner Image */}
            <div className="relative w-full h-[125px] sm:h-[135px] bg-[#0c0c10] overflow-hidden">
              <img 
                src="/proud-of-uae-banner.jpg" 
                alt="Splendor Luxury Letterhead Header" 
                className="w-full h-full object-cover object-center"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/80 flex items-center justify-between px-6 sm:px-8 py-2">
                {/* Left Brand */}
                <div className="text-left drop-shadow-md">
                  <h1 className="text-xl sm:text-2xl font-black tracking-widest text-[#f5d97f] font-serif uppercase leading-none">
                    SPLENDOR
                  </h1>
                  <p className="text-[10px] font-bold tracking-[0.25em] text-white uppercase mt-0.5 font-sans">
                    LUXURY CAR RENTAL
                  </p>
                  <p className="text-[8px] text-amber-200/90 font-serif italic mt-0.5 tracking-wider">
                    Prestige Beyond Limits
                  </p>
                </div>

                {/* Right Brand */}
                <div className="text-right drop-shadow-md font-arabic">
                  <h1 className="text-xl sm:text-2xl font-black text-white leading-none tracking-tight">
                    سـبـلـنـدر
                  </h1>
                  <p className="text-xs font-bold text-zinc-100 mt-0.5">
                    لتأجير السيارات الفارهة
                  </p>
                  <p className="text-[9px] text-[#f5d97f] font-bold mt-0.5">
                    هيبة بلا حدود
                  </p>
                </div>
              </div>
            </div>

            {/* Corporate Crimson & Gold Accent Line */}
            <div className="h-0.5 bg-gradient-to-r from-[#D4AF37] via-[#991b1b] to-[#D4AF37]" />

            {/* Legal strip */}
            {showLegalStrip && (
              <div className="bg-[#6b141a] text-white py-0.5 px-6 text-[9px] font-bold flex items-center justify-between border-b border-[#D4AF37]/50">
                <span>شركة سبلندر لتأجير السيارات ش.ذ.م.م | SPLENDOR CAR RENTAL L.L.C</span>
                <span className="font-mono" dir="ltr">TRN: 104391520400003 | License: 1322610</span>
              </div>
            )}
          </div>
        )}

        {/* Padding placeholder for custom background or preprinted paper */}
        {mode === 'custom_bg' && (
          <div className="h-[155px] w-full shrink-0 pointer-events-none" />
        )}

        {mode === 'preprinted' && (
          <div className="h-[120px] w-full shrink-0 pointer-events-none" />
        )}

        {/* ===================== MIDDLE CONTENT (FITS EXACT SINGLE A4 PAGE) ===================== */}
        <div className={`flex-1 px-6 sm:px-8 py-2 overflow-hidden flex flex-col justify-between ${mode === 'custom_bg' ? 'bg-transparent' : 'bg-white'}`}>
          {children}
        </div>

        {/* Padding placeholder for custom background footer */}
        {mode === 'custom_bg' && (
          <div className="h-[75px] w-full shrink-0 pointer-events-none" />
        )}

        {mode === 'preprinted' && (
          <div className="h-[60px] w-full shrink-0 pointer-events-none" />
        )}

        {/* ===================== BOTTOM FOOTER ===================== */}
        {mode === 'standard' && (
          <div className="w-full bg-[#6b141a] text-white py-1.5 px-6 sm:px-8 border-t-2 border-[#D4AF37] shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1 text-[9px] font-semibold text-center sm:text-right">
              <div className="flex items-center justify-center sm:justify-start gap-1">
                <MapPin className="w-2.5 h-2.5 text-[#f5d97f] shrink-0" />
                <span>دبي، قرية جميرا (JVC)</span>
              </div>

              <div className="flex items-center justify-center sm:justify-start gap-1" dir="ltr">
                <Phone className="w-2.5 h-2.5 text-[#f5d97f] shrink-0" />
                <span className="font-mono">+971 50 511 0410</span>
              </div>

              <div className="flex items-center justify-center sm:justify-start gap-1">
                <Mail className="w-2.5 h-2.5 text-[#f5d97f] shrink-0" />
                <span className="font-mono text-zinc-100">info@splendorcar.ae</span>
              </div>

              <div className="flex items-center justify-center sm:justify-start gap-1" dir="ltr">
                <Globe className="w-2.5 h-2.5 text-[#f5d97f] shrink-0" />
                <span className="font-mono text-zinc-100">www.splendorcar.ae</span>
              </div>
            </div>
            <div className="mt-0.5 pt-0.5 border-t border-white/20 text-center text-[8px] text-[#f5d97f] font-mono">
              SPLENDOR CAR RENTAL L.L.C — ALL RIGHTS RESERVED
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
