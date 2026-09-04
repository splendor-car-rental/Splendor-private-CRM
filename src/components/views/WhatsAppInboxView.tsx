import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Bot, UserCog, Send, RefreshCw, Loader2, Search, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCRM } from '../../context/CRMContext';
import { Badge } from '../common/Badge';
import { formatTime } from '../../lib/dateFormat';
import type { WhatsAppConversation, WhatsAppConversationMessage, WhatsAppConversationState, WhatsAppConversationPriority } from '../../types';

/**
 * WhatsApp Unified Inbox -- Human Concierge (Splendor Master Rule Set,
 * Module 13). Reads/writes the real whatsapp_conversations collection the
 * bot (src/server/whatsappConversation.ts) maintains -- this is a view onto
 * the SAME state the bot uses, not a separate chat app: taking over here
 * flips the same `botActive` flag the bot itself checks on the next inbound
 * message, and a manual reply here uses the same sendWhatsAppMessage() the
 * bot uses.
 */

const STATE_LABELS: Record<WhatsAppConversationState, { en: string; ar: string }> = {
  NEW: { en: 'New', ar: 'جديد' },
  BROWSING: { en: 'Browsing', ar: 'يتصفح' },
  VEHICLE_SELECTED: { en: 'Vehicle Selected', ar: 'تم اختيار سيارة' },
  DATES_PENDING: { en: 'Dates Pending', ar: 'بانتظار التواريخ' },
  LOCATION_PENDING: { en: 'Location Pending', ar: 'بانتظار الموقع' },
  RESERVATION_CONFIRM: { en: 'Confirming', ar: 'تأكيد الحجز' },
  RESERVATION_CREATED: { en: 'Reservation Created', ar: 'تم إنشاء الحجز' },
  HUMAN_ASSISTANCE: { en: 'Needs Human', ar: 'يحتاج موظف' },
  CLOSED: { en: 'Closed', ar: 'مغلق' }
};

const PRIORITY_VARIANT: Record<WhatsAppConversationPriority, 'zinc' | 'amber' | 'rose'> = {
  normal: 'zinc', high: 'amber', vip: 'rose'
};

export const WhatsAppInboxView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { staffDirectory } = useAuth();
  const { showToast } = useCRM();

  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<'all' | 'needs_human' | 'unread'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [thread, setThread] = useState<(WhatsAppConversation & { messages: WhatsAppConversationMessage[] }) | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await apiFetch('/api/whatsapp/conversations');
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `${res.status}`);
      setConversations(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch (e: any) {
      console.error('Failed to load WhatsApp conversations', e);
      setLoadError(e?.message || (isAr ? 'تعذر تحميل المحادثات' : 'Failed to load conversations'));
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const loadThread = useCallback(async (phone: string) => {
    setThreadLoading(true);
    try {
      const res = await apiFetch(`/api/whatsapp/conversations/${phone}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `${res.status}`);
      setThread(data);
      setConversations(prev => prev.map(c => c.phone === phone ? { ...c, unread: false } : c));
    } catch (e: any) {
      console.error('Failed to load conversation thread', e);
      showToast(isAr ? 'تعذر تحميل المحادثة' : 'Failed to load conversation', e?.message || '', 'error');
    } finally {
      setThreadLoading(false);
    }
  }, [isAr, showToast]);

  useEffect(() => {
    apiFetch('/api/whatsapp/status').then(res => res.json()).then(data => setConfigured(!!data?.configured)).catch(() => setConfigured(null));
  }, []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    const interval = setInterval(() => {
      loadList();
      if (selectedPhone) loadThread(selectedPhone);
    }, 15000);
    return () => clearInterval(interval);
  }, [loadList, loadThread, selectedPhone]);

  useEffect(() => { if (selectedPhone) loadThread(selectedPhone); }, [selectedPhone, loadThread]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread?.messages?.length]);

  const needsHumanCount = conversations.filter(c => c.state === 'HUMAN_ASSISTANCE').length;
  const unreadCount = conversations.filter(c => c.unread).length;

  const filtered = conversations
    .filter(c => {
      if (filter === 'needs_human') return c.state === 'HUMAN_ASSISTANCE';
      if (filter === 'unread') return c.unread;
      return true;
    })
    .filter(c => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.trim().toLowerCase();
      return (c.customerName || '').toLowerCase().includes(term) || c.phone.toLowerCase().includes(term);
    });

  const handleHandoff = async (botActive: boolean) => {
    if (!thread) return;
    try {
      const res = await apiFetch(`/api/whatsapp/conversations/${thread.phone}/handoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botActive })
      });
      if (!res.ok) throw new Error((await res.json())?.error);
      showToast(isAr ? 'تم' : 'Done', botActive ? (isAr ? 'تم إعادة المحادثة للأتمتة' : 'Returned to automation') : (isAr ? 'تم تولي المحادثة' : 'Conversation taken over'), 'success');
      loadThread(thread.phone);
    } catch (e: any) {
      showToast(isAr ? 'فشل' : 'Failed', e?.message || '', 'error');
    }
  };

  const handleAssign = async (employeeId: string, employeeName: string) => {
    if (!thread) return;
    try {
      const res = await apiFetch(`/api/whatsapp/conversations/${thread.phone}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, employeeName })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      loadThread(thread.phone);
      loadList();
    } catch (e: any) {
      console.error(e);
      showToast(isAr ? 'تعذر تعيين الموظف' : 'Failed to assign', e?.message || '', 'error');
    }
  };

  const handlePriority = async (priority: WhatsAppConversationPriority) => {
    if (!thread) return;
    try {
      const res = await apiFetch(`/api/whatsapp/conversations/${thread.phone}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error);
      loadThread(thread.phone);
      loadList();
    } catch (e: any) {
      console.error(e);
      showToast(isAr ? 'تعذر تغيير الأولوية' : 'Failed to change priority', e?.message || '', 'error');
    }
  };

  const handleSendReply = async () => {
    if (!thread || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch(`/api/whatsapp/conversations/${thread.phone}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: replyText.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to send reply.');
      setReplyText('');
      loadThread(thread.phone);
    } catch (e: any) {
      showToast(isAr ? 'فشل الإرسال' : 'Send failed', e?.message || '', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-bold text-zinc-100 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-400" />
            {isAr ? 'صندوق واتساب الموحد' : 'WhatsApp Unified Inbox'}
          </h2>
          <p className="text-xs text-zinc-500 mt-1">{isAr ? 'محادثات العملاء عبر واتساب، مرتبطة مباشرة بسجلات العميل والحجز' : 'Customer WhatsApp conversations, linked directly to the customer and reservation record'}</p>
        </div>
        <button onClick={() => { loadList(); if (selectedPhone) loadThread(selectedPhone); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium">
          <RefreshCw className="w-3.5 h-3.5" /> {isAr ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {configured === false && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{isAr ? 'حساب واتساب غير مفعّل بعد على هذا الخادم (المفاتيح غير مُعدّة) -- المحادثات الظاهرة أدناه تاريخية، والإرسال والاستقبال الحقيقي لن يعملا حتى يتم إعداد بيانات اعتماد واتساب بيزنس.' : "WhatsApp is not yet activated on this server (credentials not configured) -- conversations below are historical, and real send/receive won't work until WhatsApp Business credentials are set."}</span>
        </div>
      )}

      {loadError && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{isAr ? `تعذر تحميل المحادثات: ${loadError}` : `Failed to load conversations: ${loadError}`}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Conversation list */}
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col overflow-hidden">
          <div className="p-2.5 border-b border-zinc-800 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-600 absolute top-1/2 -translate-y-1/2 start-2.5" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={isAr ? 'بحث بالاسم أو الرقم...' : 'Search by name or number...'}
                className="w-full ps-8 pe-2.5 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800 text-zinc-200 text-[11px] placeholder:text-zinc-600"
              />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'needs_human', 'unread'] as const).map(f => {
                const count = f === 'needs_human' ? needsHumanCount : f === 'unread' ? unreadCount : conversations.length;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide ${filter === f ? 'bg-[#D4AF37] text-zinc-950' : 'bg-zinc-950/60 text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {(f === 'all' ? (isAr ? 'الكل' : 'All') : f === 'needs_human' ? (isAr ? 'يحتاج موظف' : 'Needs Human') : (isAr ? 'غير مقروء' : 'Unread'))} ({count})
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
            {loading ? (
              <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-600" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-8">{searchTerm.trim() ? (isAr ? 'لا توجد نتائج مطابقة' : 'No matching results') : (isAr ? 'لا توجد محادثات' : 'No conversations')}</p>
            ) : filtered.map(c => (
              <button
                key={c.phone}
                onClick={() => setSelectedPhone(c.phone)}
                className={`w-full text-start p-3 hover:bg-zinc-800/40 transition-colors ${selectedPhone === c.phone ? 'bg-zinc-800/60' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-zinc-100 truncate flex items-center gap-1.5">
                    {c.unread && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                    {c.customerName || c.phone}
                  </p>
                  <span className="text-[9px] text-zinc-600 shrink-0">{c.lastInboundAt ? formatTime(c.lastInboundAt) : ''}</span>
                </div>
                <p className="text-[10px] text-zinc-500 truncate mt-0.5">{c.lastMessagePreview || '—'}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Badge variant={c.state === 'HUMAN_ASSISTANCE' ? 'rose' : c.botActive ? 'sky' : 'amber'} size="sm">
                    {isAr ? STATE_LABELS[c.state]?.ar : STATE_LABELS[c.state]?.en}
                  </Badge>
                  {c.priority !== 'normal' && <Badge variant={PRIORITY_VARIANT[c.priority]} size="sm">{c.priority.toUpperCase()}</Badge>}
                  {!c.botActive && <Badge variant="zinc" size="sm"><UserCog className="w-2.5 h-2.5" /></Badge>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col overflow-hidden">
          {!thread ? (
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs">
              {isAr ? 'اختر محادثة لعرضها' : 'Select a conversation to view it'}
            </div>
          ) : threadLoading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-600" /></div>
          ) : (
            <>
              <div className="p-4 border-b border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-bold text-zinc-100">{thread.customerName || thread.phone}</p>
                    <p className="text-[10px] text-zinc-500">
                      +{thread.phone} {thread.customerId ? `· ${thread.customerId}` : ''} {thread.lastReservationId ? `· ${thread.lastReservationId}` : ''}
                      {thread.customerMatchStatus === 'ambiguous_review' && (
                        <span className="text-rose-400 ms-1">{isAr ? '(تطابق غير مؤكد - يحتاج مراجعة)' : '(ambiguous match - needs review)'}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {thread.botActive ? (
                      <button onClick={() => handleHandoff(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-semibold">
                        <UserCog className="w-3.5 h-3.5" /> {isAr ? 'تولي المحادثة' : 'Take Over'}
                      </button>
                    ) : (
                      <button onClick={() => handleHandoff(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 text-[11px] font-semibold">
                        <Bot className="w-3.5 h-3.5" /> {isAr ? 'إعادة للأتمتة' : 'Return to Bot'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={thread.state === 'HUMAN_ASSISTANCE' ? 'rose' : 'sky'} size="sm">{isAr ? STATE_LABELS[thread.state]?.ar : STATE_LABELS[thread.state]?.en}</Badge>
                  <select
                    value={thread.priority}
                    onChange={e => handlePriority(e.target.value as WhatsAppConversationPriority)}
                    className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-[10px]"
                  >
                    <option value="normal">{isAr ? 'عادي' : 'Normal'}</option>
                    <option value="high">{isAr ? 'مرتفع' : 'High'}</option>
                    <option value="vip">VIP</option>
                  </select>
                  <select
                    value={thread.assignedEmployeeId || ''}
                    onChange={e => { const s = staffDirectory.find((x: any) => x.id === e.target.value); handleAssign(e.target.value, s?.name || ''); }}
                    className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-[10px]"
                  >
                    <option value="">{isAr ? '-- غير معين --' : '-- Unassigned --'}</option>
                    {staffDirectory.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {thread.messages.map(m => (
                  <div key={m.id} className={`flex ${m.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs whitespace-pre-wrap ${m.direction === 'inbound' ? 'bg-zinc-800 text-zinc-100' : 'bg-[#D4AF37]/15 border border-[#D4AF37]/25 text-zinc-100'}`}>
                      <p>{m.body}</p>
                      <p className="text-[9px] text-zinc-500 mt-1">{m.sentByName || (m.direction === 'inbound' ? (isAr ? 'العميل' : 'Customer') : '')} · {formatTime(m.timestamp)}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t border-zinc-800">
                {thread.botActive ? (
                  <p className="text-[11px] text-zinc-500 flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> {isAr ? 'البوت نشط حالياً. اضغط "تولي المحادثة" لإرسال رد يدوي.' : 'The bot is currently active. Click "Take Over" to send a manual reply.'}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !sending) handleSendReply(); }}
                      placeholder={isAr ? 'اكتب رداً...' : 'Type a reply...'}
                      className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs"
                    />
                    <button onClick={handleSendReply} disabled={sending || !replyText.trim()} className="p-2.5 rounded-xl bg-[#D4AF37] text-zinc-950 disabled:opacity-50">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
