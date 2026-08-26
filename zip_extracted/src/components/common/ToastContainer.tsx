import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useCRM();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none">
      {toasts.map(toast => {
        const icon = {
          success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
          error: <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />,
          info: <Info className="w-5 h-5 text-[#D4AF37] shrink-0" />
        }[toast.type];

        const borderColor = {
          success: 'border-emerald-500/30 bg-zinc-900/95',
          error: 'border-rose-500/30 bg-zinc-900/95',
          info: 'border-[#D4AF37]/30 bg-zinc-900/95'
        }[toast.type];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl border ${borderColor} shadow-xl shadow-black/60 flex items-start gap-3 backdrop-blur-md animate-fade-in`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-zinc-100">{toast.title}</h4>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{toast.message}</p>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-zinc-500 hover:text-zinc-300 p-1 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
