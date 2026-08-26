import React from 'react';

export type BadgeVariant = 
  | 'gold' 
  | 'emerald' 
  | 'sky' 
  | 'amber' 
  | 'rose' 
  | 'purple' 
  | 'zinc' 
  | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  icon,
  size = 'md',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 font-medium tracking-wide',
    md: 'text-xs px-2.5 py-1 font-medium tracking-wide',
    lg: 'text-sm px-3 py-1.5 font-medium'
  }[size];

  const variantClasses = {
    gold: 'bg-[#D4AF37]/15 text-[#f5d97f] border border-[#D4AF37]/40 shadow-sm shadow-[#D4AF37]/10',
    emerald: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    sky: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
    purple: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
    zinc: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
    neutral: 'bg-zinc-900/80 text-zinc-400 border border-zinc-800'
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full uppercase transition-all duration-150 ${sizeClasses} ${variantClasses} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
};
