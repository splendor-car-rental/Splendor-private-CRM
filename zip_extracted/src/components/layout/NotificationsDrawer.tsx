import React from 'react';
import { X, Check, Bell, AlertTriangle, AlertCircle, Info, Calendar, FileText } from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const { notifications, setActiveView } = useCRM();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="fixed inset-y-0 right-0 max-w-md w-full bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col z-10 animate-fade-in">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="font-semibold text-zinc-100 font-display">
              {language === 'ar' ? 'مركز التنبيهات والمهام الحرجة' : 'Executive Alerts & Tasks'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              {language === 'ar' ? 'لا توجد تنبيهات معلقة حالياً' : 'No pending alerts'}
            </div>
          ) : (
            notifications.map(notif => {
              const icon = {
                critical: <AlertCircle className="w-5 h-5 text-rose-400" />,
                important: <AlertTriangle className="w-5 h-5 text-amber-400" />,
                routine: <Info className="w-5 h-5 text-sky-400" />
              }[notif.priority];

              const borderColor = {
                critical: 'border-rose-500/30 bg-rose-950/10',
                important: 'border-amber-500/30 bg-amber-950/10',
                routine: 'border-zinc-800 bg-zinc-900/40'
              }[notif.priority];

              return (
                <div
                  key={notif.id}
                  className={`p-4 rounded-xl border ${borderColor} transition-all space-y-2`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">{icon}</div>
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-200">{notif.title}</h4>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{notif.message}</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {notif.targetView && (
                      <button
                        onClick={() => {
                          setActiveView(notif.targetView!);
                          onClose();
                        }}
                        className="text-[#f5d97f] hover:underline font-medium"
                      >
                        {language === 'ar' ? 'عرض السجل ←' : 'Inspect Record →'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
