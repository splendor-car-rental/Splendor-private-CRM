import React, { useMemo, useState } from 'react';
import {
  BellRing, MessageCircle, Users2, Radio, Send, RefreshCw, CheckCircle2,
  XCircle, Clock3, AlertTriangle, ChevronDown, Search, PlugZap, Plug
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { NOTIFICATION_EVENTS, NOTIFICATION_CATEGORY_LABELS, CUSTOMER_NOTIFICATION_EVENTS } from '../../config/notificationEvents';
import { NotificationCategory } from '../../types';
import { formatTime } from '../../lib/dateFormat';

/**
 * Luxury dark-mode / glassmorphism control panel: deep charcoal base,
 * frosted glass panels (backdrop-blur-xl + translucent zinc + white/10
 * borders), ambient glow on active/critical states, smooth transitions
 * throughout -- per the business owner's design spec. Admin/CEO only (see
 * ROLE_VIEWS in src/config/permissions.ts).
 */
export const NotificationWhatsAppCenterView: React.FC = () => {
  const { language } = useLanguage();
  const { staffDirectory } = useAuth();
  const {
    notificationEventConfigs, customerNotificationConfigs, customReminders,
    whatsappMessageLog, whatsappStatus, updateNotificationConfig,
    updateCustomerNotificationConfig, sendCustomReminder, runNotificationChecksNow
  } = useCRM();

  const isAr = language === 'ar';
  const [runningChecks, setRunningChecks] = useState(false);
  const [openStaffPicker, setOpenStaffPicker] = useState<string | null>(null);

  const categories: NotificationCategory[] = ['customer', 'contract', 'fleet', 'financial', 'tolls', 'system'];
  const eventsByCategory = useMemo(() => {
    const map: Record<string, typeof NOTIFICATION_EVENTS> = {};
    categories.forEach(cat => { map[cat] = NOTIFICATION_EVENTS.filter(e => e.category === cat); });
    return map;
  }, []);

  const configFor = (eventKey: string) => notificationEventConfigs.find(c => c.eventKey === eventKey);
  const customerConfigFor = (eventKey: string) => customerNotificationConfigs.find(c => c.eventKey === eventKey);

  const handleRunChecks = async () => {
    setRunningChecks(true);
    try {
      await runNotificationChecksNow();
    } finally {
      setRunningChecks(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16 -m-4 sm:-m-6 p-4 sm:p-6 bg-zinc-950 min-h-full rounded-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.15)]">
              <BellRing className="w-5 h-5 text-[#f5d97f]" />
            </span>
            {isAr ? 'مركز الإشعارات والواتساب' : 'Notification & WhatsApp Control Center'}
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            {isAr ? 'تحكم شامل في كل تنبيهات النظام وتوجيهها عبر واتساب' : 'Full control over every system alert and its WhatsApp routing'}
          </p>
        </div>
        <button
          onClick={handleRunChecks}
          disabled={runningChecks}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 text-zinc-200 text-xs font-semibold hover:bg-zinc-800/70 hover:border-[#D4AF37]/30 transition-all duration-300 ease-in-out disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-[#D4AF37] ${runningChecks ? 'animate-spin' : ''}`} />
          {isAr ? 'تشغيل الفحص التلقائي الآن' : 'Run Automated Checks Now'}
        </button>
      </div>

      {/* WhatsApp Connection Status */}
      <div className={`rounded-3xl backdrop-blur-xl border p-5 transition-all duration-300 ease-in-out ${
        whatsappStatus.configured
          ? 'bg-emerald-500/5 border-emerald-500/25 shadow-[0_0_30px_rgba(16,185,129,0.08)]'
          : 'bg-amber-500/5 border-amber-500/25 shadow-[0_0_30px_rgba(245,158,11,0.08)]'
      }`}>
        <div className="flex items-start gap-3.5">
          <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${whatsappStatus.configured ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-amber-500/15 border border-amber-500/30'}`}>
            {whatsappStatus.configured ? <PlugZap className="w-5 h-5 text-emerald-400" /> : <Plug className="w-5 h-5 text-amber-400" />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              {whatsappStatus.configured
                ? (isAr ? 'واتساب بزنس API متصل' : 'WhatsApp Business API Connected')
                : (isAr ? 'واتساب بزنس API غير متصل بعد' : 'WhatsApp Business API Not Connected Yet')}
            </p>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              {whatsappStatus.configured
                ? (isAr ? `جاهز للإرسال. أرقام المجموعة العامة المُعرَّفة: ${whatsappStatus.groupRecipientCount}` : `Ready to send. General group recipients configured: ${whatsappStatus.groupRecipientCount}`)
                : (isAr
                    ? 'كل الإعدادات هنا تُحفظ وتعمل بشكل كامل، لكن الإرسال الفعلي لن يبدأ إلا بعد إضافة بيانات حساب واتساب بزنس API كمتغيرات بيئة على Vercel: WHATSAPP_ACCESS_TOKEN و WHATSAPP_PHONE_NUMBER_ID (واختيارياً WHATSAPP_GROUP_RECIPIENTS كأرقام هواتف مفصولة بفاصلة تمثل "المجموعة العامة").'
                    : 'Everything here saves and works fully, but real sending won\'t start until WhatsApp Business API credentials are added as Vercel environment variables: WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID (optionally WHATSAPP_GROUP_RECIPIENTS -- comma-separated phone numbers standing in for "the general group").')}
            </p>
          </div>
        </div>
      </div>

      {/* Staff/Group Event Toggles by Category */}
      <div className="space-y-4">
        {categories.map(cat => (
          <CategoryPanel
            key={cat}
            category={cat}
            events={eventsByCategory[cat]}
            configFor={configFor}
            updateNotificationConfig={updateNotificationConfig}
            staffDirectory={staffDirectory}
            openStaffPicker={openStaffPicker}
            setOpenStaffPicker={setOpenStaffPicker}
            isAr={isAr}
          />
        ))}
      </div>

      {/* Customer-Facing Notifications */}
      <div className="rounded-3xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden transition-all duration-300 ease-in-out">
        <div className="p-4 border-b border-white/10 flex items-center gap-2.5">
          <MessageCircle className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-white">{isAr ? 'رسائل واتساب المرسلة للعميل مباشرة' : 'Direct-to-Customer WhatsApp Messages'}</h3>
        </div>
        <div className="divide-y divide-white/5">
          {CUSTOMER_NOTIFICATION_EVENTS.map(ev => {
            const cfg = customerConfigFor(ev.key);
            const enabled = cfg?.enabled ?? true;
            return (
              <div key={ev.key} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-zinc-200">{isAr ? ev.labelAr : ev.labelEn}</p>
                  {ev.automated && <p className="text-[10px] text-zinc-500 mt-0.5">{isAr ? 'تلقائي (فحص دوري)' : 'Automated (background sweep)'}</p>}
                </div>
                <ToggleSwitch checked={enabled} onChange={(v) => updateCustomerNotificationConfig(ev.key, v)} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Reminder Composer + Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CustomReminderComposer staffDirectory={staffDirectory} sendCustomReminder={sendCustomReminder} isAr={isAr} />
        <MessageLogPanel log={whatsappMessageLog} isAr={isAr} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; glow?: boolean }> = ({ checked, onChange, glow }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative w-11 h-6 rounded-full transition-all duration-300 ease-in-out shrink-0 ${
      checked ? `bg-[#D4AF37] ${glow ? 'shadow-[0_0_12px_rgba(212,175,55,0.5)]' : ''}` : 'bg-zinc-700'
    }`}
  >
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ease-in-out ${checked ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);

// ---------------------------------------------------------------------------

const CategoryPanel: React.FC<{
  category: NotificationCategory;
  events: typeof NOTIFICATION_EVENTS;
  configFor: (key: string) => any;
  updateNotificationConfig: (key: string, data: any) => Promise<any>;
  staffDirectory: any[];
  openStaffPicker: string | null;
  setOpenStaffPicker: (v: string | null) => void;
  isAr: boolean;
}> = ({ category, events, configFor, updateNotificationConfig, staffDirectory, openStaffPicker, setOpenStaffPicker, isAr }) => {
  const [collapsed, setCollapsed] = useState(false);
  const catLabel = NOTIFICATION_CATEGORY_LABELS[category];

  return (
    <div className="rounded-3xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden transition-all duration-300 ease-in-out">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-all duration-300 ease-in-out"
      >
        <h3 className="text-sm font-bold text-white">{isAr ? catLabel.ar : catLabel.en}</h3>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ease-in-out ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      {!collapsed && (
        <div className="divide-y divide-white/5 border-t border-white/5">
          {events.map(ev => {
            const cfg = configFor(ev.key) || { enabled: true, broadcastToGroup: false, staffRecipientIds: [] };
            const staffCount = (cfg.staffRecipientIds || []).length;
            return (
              <div key={ev.key} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-200">{isAr ? ev.labelAr : ev.labelEn}</p>
                  {ev.automated && <p className="text-[10px] text-zinc-500 mt-0.5">{isAr ? 'تلقائي (فحص دوري)' : 'Automated (background sweep)'}</p>}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                    {isAr ? 'تفعيل' : 'Enable'}
                    <ToggleSwitch checked={cfg.enabled} onChange={(v) => updateNotificationConfig(ev.key, { enabled: v })} glow />
                  </label>
                  <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                    <Radio className="w-3 h-3" />
                    {isAr ? 'المجموعة العامة' : 'Group'}
                    <ToggleSwitch checked={cfg.broadcastToGroup} onChange={(v) => updateNotificationConfig(ev.key, { broadcastToGroup: v })} />
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setOpenStaffPicker(openStaffPicker === ev.key ? null : ev.key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all duration-300 ease-in-out ${
                        staffCount > 0 ? 'bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#f5d97f]' : 'bg-zinc-950/50 border-white/10 text-zinc-400 hover:border-white/20'
                      }`}
                    >
                      <Users2 className="w-3.5 h-3.5" /> {staffCount > 0 ? staffCount : (isAr ? 'موظفون' : 'Staff')}
                    </button>
                    {openStaffPicker === ev.key && (
                      <StaffPickerPopover
                        staffDirectory={staffDirectory}
                        selectedIds={cfg.staffRecipientIds || []}
                        onChange={(ids) => updateNotificationConfig(ev.key, { staffRecipientIds: ids })}
                        onClose={() => setOpenStaffPicker(null)}
                        isAr={isAr}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const StaffPickerPopover: React.FC<{
  staffDirectory: any[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
  isAr: boolean;
}> = ({ staffDirectory, selectedIds, onChange, onClose, isAr }) => {
  const [search, setSearch] = useState('');
  const filtered = staffDirectory.filter(s => (s.name || '').toLowerCase().includes(search.toLowerCase()));

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute end-0 top-full mt-2 w-64 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl z-50 p-2.5 animate-fade-in">
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute top-1/2 -translate-y-1/2 start-2.5" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث عن موظف...' : 'Search staff...'}
            className="w-full ps-8 pe-2 py-1.5 rounded-lg bg-zinc-950 border border-white/10 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/50"
          />
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-[11px] text-zinc-500 text-center py-3">{isAr ? 'لا يوجد موظفون' : 'No staff found'}</p>
          ) : filtered.map(s => (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all duration-200 ${
                selectedIds.includes(s.id) ? 'bg-[#D4AF37]/15 text-[#f5d97f]' : 'text-zinc-300 hover:bg-white/5'
              }`}
            >
              <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${selectedIds.includes(s.id) ? 'bg-[#D4AF37] border-[#D4AF37]' : 'border-zinc-600'}`}>
                {selectedIds.includes(s.id) && <CheckCircle2 className="w-3 h-3 text-zinc-950" />}
              </span>
              <span className="truncate flex-1 text-start">{s.name}</span>
              {!s.phone && <span className="text-[9px] text-rose-400 shrink-0">{isAr ? 'بدون رقم' : 'no phone'}</span>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------

const CustomReminderComposer: React.FC<{
  staffDirectory: any[];
  sendCustomReminder: (data: any) => Promise<any>;
  isAr: boolean;
}> = ({ staffDirectory, sendCustomReminder, isAr }) => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [broadcastToGroup, setBroadcastToGroup] = useState(false);
  const [staffRecipientIds, setStaffRecipientIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      await sendCustomReminder({ title, message, broadcastToGroup, staffRecipientIds });
      setTitle('');
      setMessage('');
      setBroadcastToGroup(false);
      setStaffRecipientIds([]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-3xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-xl p-5 space-y-3.5 transition-all duration-300 ease-in-out">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Send className="w-4 h-4 text-[#D4AF37]" /> {isAr ? 'إنشاء تذكير مخصص' : 'Custom Reminder Composer'}
      </h3>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={isAr ? 'العنوان' : 'Title'}
        className="w-full px-3 py-2 rounded-xl bg-zinc-950/70 border border-white/10 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-300 ease-in-out"
      />
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder={isAr ? 'نص الرسالة...' : 'Message text...'}
        rows={3}
        className="w-full px-3 py-2 rounded-xl bg-zinc-950/70 border border-white/10 text-zinc-100 text-xs focus:outline-none focus:border-[#D4AF37]/50 resize-none transition-all duration-300 ease-in-out"
      />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-[11px] text-zinc-400 font-semibold">
          <ToggleSwitch checked={broadcastToGroup} onChange={setBroadcastToGroup} />
          {isAr ? 'المجموعة العامة' : 'General Group'}
        </label>
        <div className="relative">
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all duration-300 ease-in-out ${
              staffRecipientIds.length > 0 ? 'bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#f5d97f]' : 'bg-zinc-950/50 border-white/10 text-zinc-400'
            }`}
          >
            <Users2 className="w-3.5 h-3.5" /> {staffRecipientIds.length > 0 ? `${staffRecipientIds.length} ${isAr ? 'موظف' : 'staff'}` : (isAr ? 'اختر موظفين' : 'Pick Staff')}
          </button>
          {pickerOpen && (
            <StaffPickerPopover
              staffDirectory={staffDirectory}
              selectedIds={staffRecipientIds}
              onChange={setStaffRecipientIds}
              onClose={() => setPickerOpen(false)}
              isAr={isAr}
            />
          )}
        </div>
      </div>
      <button
        onClick={handleSend}
        disabled={sending || !title.trim() || !message.trim() || (!broadcastToGroup && staffRecipientIds.length === 0)}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow-md shadow-[#D4AF37]/20 hover:brightness-110 active:scale-[0.99] transition-all duration-300 ease-in-out disabled:opacity-50"
      >
        {sending ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'إرسال التذكير' : 'Send Reminder')}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------

const MessageLogPanel: React.FC<{ log: any[]; isAr: boolean }> = ({ log, isAr }) => (
  <div className="rounded-3xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden transition-all duration-300 ease-in-out">
    <div className="p-4 border-b border-white/10 flex items-center gap-2.5">
      <Clock3 className="w-4 h-4 text-sky-400" />
      <h3 className="text-sm font-bold text-white">{isAr ? 'سجل نشاط واتساب' : 'WhatsApp Activity Log'}</h3>
    </div>
    <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
      {log.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-8">{isAr ? 'لا يوجد نشاط بعد' : 'No activity yet'}</p>
      ) : log.slice(0, 40).map(entry => (
        <div key={entry.id} className="p-3 flex items-start gap-2.5">
          {entry.status === 'sent' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : entry.status === 'not_configured' ? (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-zinc-200 truncate">{entry.recipientLabel}</p>
            <p className="text-[10px] text-zinc-500 truncate">{entry.message}</p>
            {entry.errorMessage && <p className="text-[10px] text-rose-400 mt-0.5">{entry.errorMessage}</p>}
          </div>
          <span className="text-[9px] text-zinc-600 shrink-0">{formatTime(entry.createdAt)}</span>
        </div>
      ))}
    </div>
  </div>
);
