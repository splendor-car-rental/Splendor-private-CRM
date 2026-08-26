import React, { useState } from 'react';
import { 
  Sparkles, Bot, Send, User, MessageSquare, 
  Car, ShieldCheck, Zap, ArrowRight, RefreshCw, Copy, Check
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';

export const AIStudioView: React.FC = () => {
  const { language, t } = useLanguage();
  const { customers, vehicles, queryAI, generateCustomerAISummary } = useCRM();

  const [activeTab, setActiveTab] = useState<'chat' | 'customer_summary' | 'proposal_drafter'>('chat');
  
  // Chat state
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; time: string }>>([
    {
      role: 'assistant',
      text: 'Greetings. I am your Splendor AI Executive Copilot. You can ask me anything about luxury fleet availability, VIP customer intelligence, bank reconciliation discrepancies, or revenue forecasting.',
      time: 'Just now'
    }
  ]);

  // Customer Summary state
  const [selectedCustId, setSelectedCustId] = useState(customers[0]?.id || '');
  const [custSummaryLoading, setCustSummaryLoading] = useState(false);
  const [custSummaryResult, setCustSummaryResult] = useState<any>(null);

  // Proposal Drafter state
  const [draftCustId, setDraftCustId] = useState(customers[0]?.id || '');
  const [draftVehId, setDraftVehId] = useState(vehicles[0]?.id || '');
  const [draftTone, setDraftTone] = useState<'ultra_vip' | 'formal' | 'friendly'>('ultra_vip');
  const [draftLang, setDraftLang] = useState<'en' | 'ar'>('en');
  const [draftResult, setDraftResult] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatPrompt.trim() || chatLoading) return;

    const userText = chatPrompt;
    setChatPrompt('');
    setChatMessages(prev => [...prev, { role: 'user', text: userText, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setChatLoading(true);

    try {
      const res = await queryAI(userText, language);
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        text: res.text || 'Analysis completed successfully.', 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        text: 'Apologies, I encountered an issue retrieving the analysis. Please check your query or verify system metrics.', 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleGenerateCustSummary = async () => {
    if (!selectedCustId) return;
    setCustSummaryLoading(true);
    try {
      const res = await generateCustomerAISummary(selectedCustId, language);
      setCustSummaryResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setCustSummaryLoading(false);
    }
  };

  const handleGenerateDraft = async () => {
    setDraftLoading(true);
    const cust = customers.find(c => c.id === draftCustId);
    const veh = vehicles.find(v => v.id === draftVehId);

    const prompt = `Write a bespoke luxury ${draftTone.replace('_', ' ')} car rental proposal message in ${draftLang === 'ar' ? 'Arabic' : 'English'} for VIP client ${cust?.fullName || 'VIP'} for the vehicle ${veh?.make} ${veh?.model} (${veh?.dailyRate} AED/day). Mention 200 km daily allowance, complimentary delivery to client location, and Splendor concierge service.`;

    try {
      const res = await queryAI(prompt, draftLang);
      setDraftResult(res.text);
    } catch (err) {
      setDraftResult('Error generating proposal draft.');
    } finally {
      setDraftLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(draftResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-zinc-100 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[#f5d97f]" />
            <span>{language === 'ar' ? 'استوديو الذكاء الاصطناعي والمساعد التنفيذي' : 'Gemini AI Executive Copilot'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {language === 'ar' ? 'تحليل سلوك العملاء، التنبؤ بالمخاطر، استعلامات البيانات باللغة الطبيعية، وصياغة عروض الـ VIP' : 'Natural language business intelligence, predictive VIP risk profiling & bespoke proposal generator'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'chat' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Executive Copilot Chat
        </button>
        <button
          onClick={() => setActiveTab('customer_summary')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'customer_summary' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          VIP Profile & Risk Synthesis
        </button>
        <button
          onClick={() => setActiveTab('proposal_drafter')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'proposal_drafter' ? 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Bilingual VIP Proposal Drafter
        </button>
      </div>

      {/* Tab 1: Chat */}
      {activeTab === 'chat' && (
        <div className="p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 shadow-2xl flex flex-col h-[580px]">
          {/* Messages list */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 text-xs ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#8c701d] flex items-center justify-center text-zinc-950 font-bold flex-shrink-0 shadow-md">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`p-4 rounded-2xl max-w-xl space-y-1 ${
                    msg.role === 'user'
                      ? 'bg-[#D4AF37] text-zinc-950 font-medium ml-12'
                      : 'bg-zinc-950/90 border border-zinc-800 text-zinc-200 mr-12'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  <span className={`text-[10px] block text-end ${msg.role === 'user' ? 'text-zinc-800' : 'text-zinc-500'}`}>
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center text-[#f5d97f]">
                  <Sparkles className="w-4 h-4 animate-spin" />
                </div>
                <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 animate-pulse">
                  Splendor AI is querying CRM ledger and analyzing metrics...
                </div>
              </div>
            )}
          </div>

          {/* Quick Prompts strip */}
          <div className="py-3 border-t border-zinc-800 flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] uppercase font-bold text-zinc-500 flex-shrink-0">Quick Queries:</span>
            {[
              'Give me a summary of current fleet revenue',
              'Which customers have outstanding deposit balances?',
              'What is our highest earning supercar model?',
              'Draft an executive health report for today'
            ].map(qp => (
              <button
                key={qp}
                onClick={() => setChatPrompt(qp)}
                className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 hover:text-[#f5d97f] hover:border-[#D4AF37]/30 whitespace-nowrap transition-all"
              >
                {qp}
              </button>
            ))}
          </div>

          {/* Input form */}
          <form onSubmit={handleSendChat} className="flex items-center gap-2">
            <input
              type="text"
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              placeholder="Ask anything about fleet, VIP accounts, revenue, or contracts..."
              className="flex-1 px-4 py-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]/50"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatPrompt.trim()}
              className="px-5 py-2.5 rounded-2xl bg-[#D4AF37] text-zinc-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span>Ask AI</span>
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: VIP Profile & Risk Synthesis */}
      {activeTab === 'customer_summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">Select VIP Profile</h3>
            <div>
              <label className="block text-zinc-400 text-xs mb-1">Customer Account</label>
              <select
                value={selectedCustId}
                onChange={(e) => setSelectedCustId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.fullName} ({(c.tier || '').toUpperCase()})</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleGenerateCustSummary}
              disabled={custSummaryLoading}
              className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold text-xs shadow-md hover:brightness-110 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className={`w-4 h-4 ${custSummaryLoading ? 'animate-spin' : ''}`} />
              <span>{custSummaryLoading ? 'Synthesizing Profile...' : 'Generate AI Risk & VIP Synthesis'}</span>
            </button>
          </div>

          <div className="lg:col-span-8 p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">AI Executive Intelligence Output</h3>
            {custSummaryResult ? (
              <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <span className="font-bold text-zinc-100 text-sm">Customer Risk & Preferences Dossier</span>
                  <span className="font-mono text-emerald-400 font-bold">Confidence: {Math.round(custSummaryResult.confidence)}%</span>
                </div>
                <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {custSummaryResult.summary}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-2xl">
                Select a client and click "Generate AI Risk & VIP Synthesis" to produce executive insights.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Proposal Drafter */}
      {activeTab === 'proposal_drafter' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">Proposal Settings</h3>
            <div>
              <label className="block text-zinc-400 mb-1">Target Customer</label>
              <select
                value={draftCustId}
                onChange={(e) => setDraftCustId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.fullName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">Vehicle</label>
              <select
                value={draftVehId}
                onChange={(e) => setDraftVehId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
              >
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.make} {v.model}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 mb-1">Tone</label>
                <select
                  value={draftTone}
                  onChange={(e) => setDraftTone(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
                >
                  <option value="ultra_vip">Ultra-VIP Concierge</option>
                  <option value="formal">Formal Corporate</option>
                  <option value="friendly">Direct & Modern</option>
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Language</label>
                <select
                  value={draftLang}
                  onChange={(e) => setDraftLang(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
                >
                  <option value="en">English</option>
                  <option value="ar">العربية (Arabic)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateDraft}
              disabled={draftLoading}
              className="w-full py-2.5 rounded-xl bg-[#D4AF37] text-zinc-950 font-bold text-xs shadow-md hover:brightness-110 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className={`w-4 h-4 ${draftLoading ? 'animate-spin' : ''}`} />
              <span>{draftLoading ? 'Drafting Proposal...' : 'Draft Luxury Proposal'}</span>
            </button>
          </div>

          <div className="lg:col-span-8 p-6 rounded-3xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">Generated Message Output</h3>
              {draftResult && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#f5d97f]" />}
                  <span>{copied ? 'Copied' : 'Copy Message'}</span>
                </button>
              )}
            </div>

            {draftResult ? (
              <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans">
                {draftResult}
              </div>
            ) : (
              <div className="p-12 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-2xl">
                Click "Draft Luxury Proposal" to generate ready-to-send WhatsApp or Email copy.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
