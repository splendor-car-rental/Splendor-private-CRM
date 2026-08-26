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
    sm: 'text-[10px] px-2 py-0.5 font-medium tracking-wider',
    md: 'text-[11px] px-2.5 py-1 font-medium tracking-wide',
    lg: 'text-xs px-3 py-1.5 font-medium tracking-wide'
  }[size];

  const variantClasses = {
    gold: 'bg-[#D4AF37]/10 text-[#f5d97f] border border-[#D4AF37]/30 shadow-sm shadow-[#D4AF37]/5',
    emerald: 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/25',
    sky: 'bg-sky-950/40 text-sky-300 border border-sky-500/25',
    amber: 'bg-amber-950/40 text-amber-300 border border-amber-500/25',
    rose: 'bg-rose-950/40 text-rose-300 border border-rose-500/25',
    purple: 'bg-purple-950/40 text-purple-300 border border-purple-500/25',
    zinc: 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/60',
    neutral: 'bg-zinc-900/90 text-zinc-400 border border-zinc-800'
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono uppercase transition-all duration-150 ${sizeClasses} ${variantClasses} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </span>
  );
};
