import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw, Check, PenTool } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface DigitalSignaturePadProps {
  label: string;
  sublabel?: string;
  onSave: (signatureDataUrl: string) => void;
  initialDataUrl?: string;
  readOnly?: boolean;
}

export const DigitalSignaturePad: React.FC<DigitalSignaturePadProps> = ({
  label,
  sublabel,
  onSave,
  initialDataUrl,
  readOnly = false
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(!!initialDataUrl);
  const [savedData, setSavedData] = useState<string | null>(initialDataUrl || null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas internal resolution
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#f5d97f'; // Gold ink
    ctx.lineWidth = 2.5;

    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = initialDataUrl;
    }
  }, [initialDataUrl]);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    const { x, y } = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readOnly) return;
    const { x, y } = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing || readOnly) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      setSavedData(dataUrl);
      onSave(dataUrl);
    }
  };

  const clearSignature = () => {
    if (readOnly) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
    setSavedData(null);
    onSave('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
            <PenTool className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{label}</span>
          </label>
          {sublabel && <p className="text-[10px] text-zinc-500">{sublabel}</p>}
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={clearSignature}
            disabled={!hasDrawn}
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-rose-400 disabled:opacity-30 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{isAr ? 'مسح التوقيع' : 'Clear'}</span>
          </button>
        )}
      </div>

      <div className="relative w-full h-32 rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-inner flex flex-col justify-between p-2">
        {/* Signature Line guide */}
        <div className="absolute inset-x-6 bottom-7 border-b border-dashed border-zinc-800 pointer-events-none" />
        
        {/* Watermark instruction if empty */}
        {!hasDrawn && !savedData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[11px] text-zinc-600 font-mono">
            {isAr ? 'وقع هنا بالإصبع أو القلم الرقمي...' : 'Sign here using touch or mouse...'}
          </div>
        )}

        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={`w-full h-full touch-none ${readOnly ? 'cursor-not-allowed opacity-90' : 'cursor-crosshair'}`}
        />

        <div className="flex items-center justify-between text-[9px] text-zinc-600 px-2 pointer-events-none">
          <span>{isAr ? 'شهادة التوقيع الرقمي الآمن (AES-256)' : 'Encrypted Digital Signature'}</span>
          {hasDrawn && (
            <span className="text-emerald-400 flex items-center gap-0.5">
              <Check className="w-2.5 h-2.5" /> {isAr ? 'تم حفظ التوقيع' : 'Signature Captured'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
