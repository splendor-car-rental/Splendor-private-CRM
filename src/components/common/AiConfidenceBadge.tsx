import React from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface AiConfidenceBadgeProps {
  type?: 'ai_suggestion' | 'confirmed_data';
  confidence?: number;
  score?: number;
  label?: string;
  className?: string;
}

export const AiConfidenceBadge: React.FC<AiConfidenceBadgeProps> = ({
  type = 'ai_suggestion',
  confidence,
  score,
  label,
  className = ''
}) => {
  const { language } = useLanguage();
  const effectiveConfidence = score ?? confidence ?? 95;

  if (type === 'confirmed_data') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 ${className}`}
        title={language === 'ar' ? 'بيانات مؤكدة ومعتمدة من النظام الرسمي' : 'Confirmed official ledger record'}
      >
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
        <span>{label || (language === 'ar' ? 'سجل نظام معتمد' : 'System Record')}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/40 ${className}`}
      title={language === 'ar' ? `اقتراح ذكاء اصطناعي بنسبة ثقة ${effectiveConfidence}% (يتطلب مراجعة بشرية)` : `AI heuristic suggestion with ${effectiveConfidence}% confidence score (requires human sign-off)`}
    >
      <Sparkles className="w-3 h-3 text-[#D4AF37] animate-pulse" />
      <span>{label || (language === 'ar' ? `اقتراح ذكي (${effectiveConfidence}%)` : `AI Suggested (${effectiveConfidence}%)`)}</span>
    </span>
  );
};
