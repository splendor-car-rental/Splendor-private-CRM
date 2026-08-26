import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  trend?: {
    value: string;
    positive?: boolean;
    neutral?: boolean;
  };
  icon?: React.ReactNode;
  accent?: 'gold' | 'emerald' | 'sky' | 'rose' | 'purple';
  onClick?: () => void;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subValue,
  trend,
  icon,
  accent = 'gold',
  onClick
}) => {
  const accentGlow = {
    gold: 'hover:border-[#D4AF37]/40',
    emerald: 'hover:border-emerald-500/40',
    sky: 'hover:border-sky-500/40',
    rose: 'hover:border-rose-500/40',
    purple: 'hover:border-purple-500/40'
  }[accent];

  const iconBg = {
    gold: 'bg-[#D4AF37]/10 text-[#f5d97f] border border-[#D4AF37]/30',
    emerald: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
    sky: 'bg-sky-500/10 text-sky-300 border border-sky-500/30',
    rose: 'bg-rose-500/10 text-rose-300 border border-rose-500/30',
    purple: 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
  }[accent];

  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 backdrop-blur-md transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:bg-zinc-900/95 transform hover:-translate-y-0.5' : ''
      } ${accentGlow}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-zinc-400 font-medium">{title}</p>
          <h3 className="mt-2 text-2xl lg:text-3xl font-display font-semibold text-zinc-100 tracking-tight">
            {value}
          </h3>
          {subValue && (
            <p className="mt-1 text-xs text-zinc-400">{subValue}</p>
          )}
        </div>
        {icon && (
          <div className={`p-3 rounded-xl shrink-0 ${iconBg}`}>
            {icon}
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center gap-1.5 text-xs">
          {trend.neutral ? (
            <Minus className="w-3.5 h-3.5 text-zinc-400" />
          ) : trend.positive ? (
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
          )}
          <span
            className={`font-medium ${
              trend.neutral
                ? 'text-zinc-400'
                : trend.positive
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {trend.value}
          </span>
          <span className="text-zinc-400">vs last month</span>
        </div>
      )}
    </div>
  );
};
