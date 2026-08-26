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
  const accentBorder = {
    gold: 'hover:border-[#D4AF37]/40',
    emerald: 'hover:border-emerald-500/40',
    sky: 'hover:border-sky-500/40',
    rose: 'hover:border-rose-500/40',
    purple: 'hover:border-purple-500/40'
  }[accent];

  const iconColor = {
    gold: 'text-[#D4AF37]',
    emerald: 'text-emerald-400',
    sky: 'text-sky-400',
    rose: 'text-rose-400',
    purple: 'text-purple-400'
  }[accent];

  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 shadow-lg shadow-black/40 backdrop-blur-md transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:bg-zinc-900 hover:-translate-y-0.5' : ''
      } ${accentBorder}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold truncate">{title}</p>
          <h3 className="mt-2 text-2xl lg:text-3xl font-display font-bold text-zinc-100 tracking-tight font-mono">
            {value}
          </h3>
          {subValue && (
            <p className="mt-1 text-xs text-zinc-400 truncate">{subValue}</p>
          )}
        </div>
        {icon && (
          <div className={`p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 shrink-0 ${iconColor}`}>
            {icon}
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-3.5 pt-3 border-t border-zinc-800/70 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            {trend.neutral ? (
              <Minus className="w-3.5 h-3.5 text-zinc-500" />
            ) : trend.positive ? (
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span
              className={`font-semibold font-mono ${
                trend.neutral
                  ? 'text-zinc-400'
                  : trend.positive
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {trend.value}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500">Live Telemetry</span>
        </div>
      )}
    </div>
  );
};
