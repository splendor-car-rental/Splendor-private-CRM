import React from 'react';

interface SplendorLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  showText?: boolean;
}

export const SplendorLogo: React.FC<SplendorLogoProps> = ({
  size = 'md',
  className = '',
  showText = false
}) => {
  let dimension = 48;
  if (typeof size === 'number') {
    dimension = size;
  } else {
    switch (size) {
      case 'xs':
        dimension = 28;
        break;
      case 'sm':
        dimension = 36;
        break;
      case 'md':
        dimension = 48;
        break;
      case 'lg':
        dimension = 72;
        break;
      case 'xl':
        dimension = 120;
        break;
    }
  }

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <svg
        width={dimension}
        height={dimension}
        viewBox="0 0 500 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-[0_4px_12px_rgba(212,175,55,0.35)] select-none"
      >
        <defs>
          {/* Gold Gradients */}
          <linearGradient id="goldOuterBorder" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F9E297" />
            <stop offset="25%" stopColor="#D4AF37" />
            <stop offset="50%" stopColor="#8C6D1F" />
            <stop offset="75%" stopColor="#FDF0CD" />
            <stop offset="100%" stopColor="#AA771C" />
          </linearGradient>

          <linearGradient id="goldMetallic" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="15%" stopColor="#F5D97F" />
            <stop offset="45%" stopColor="#D4AF37" />
            <stop offset="70%" stopColor="#99701C" />
            <stop offset="90%" stopColor="#F8E5A7" />
            <stop offset="100%" stopColor="#684A0A" />
          </linearGradient>

          <linearGradient id="goldRimGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7A5612" />
            <stop offset="30%" stopColor="#F3DC8C" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="70%" stopColor="#FFF1BE" />
            <stop offset="100%" stopColor="#825C15" />
          </linearGradient>

          <radialGradient id="darkBackground" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#141416" />
            <stop offset="60%" stopColor="#0A0A0C" />
            <stop offset="100%" stopColor="#020202" />
          </radialGradient>

          {/* UAE Flag Gradient for SCR ribbon */}
          <linearGradient id="uaeFlag" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00732F" />
            <stop offset="33%" stopColor="#FFFFFF" />
            <stop offset="66%" stopColor="#000000" />
            <stop offset="100%" stopColor="#FF0000" />
          </linearGradient>

          <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Circular Ring (Thick Gold Rim) */}
        <circle cx="250" cy="250" r="242" stroke="url(#goldOuterBorder)" strokeWidth="12" fill="url(#darkBackground)" />
        <circle cx="250" cy="250" r="232" stroke="url(#goldRimGradient)" strokeWidth="3" />
        <circle cx="250" cy="250" r="226" stroke="#5A4010" strokeWidth="1.5" strokeDasharray="3 3" />

        {/* Inner Border Ring */}
        <circle cx="250" cy="250" r="220" stroke="url(#goldOuterBorder)" strokeWidth="2.5" />

        {/* Top Logo Monogram: SCR */}
        <g id="SCR_TOP_MONOGRAM">
          {/* UAE Ribbon accent on the S */}
          <path
            d="M 125 155 Q 155 130 190 148 Q 165 170 125 155 Z"
            fill="url(#uaeFlag)"
            opacity="0.9"
          />
          {/* Bold SCR Metallic Letters */}
          <text
            x="250"
            y="145"
            textAnchor="middle"
            fontFamily="'Cinzel', 'Trajan Pro', 'Playfair Display', Georgia, serif"
            fontSize="52"
            fontWeight="900"
            letterSpacing="8"
            fill="url(#goldMetallic)"
            filter="url(#goldGlow)"
          >
            SCR
          </text>
        </g>

        {/* Main Central Brand Name: SPLENDOR */}
        <g id="SPLENDOR_MAIN_BRAND">
          {/* S P L E N D */}
          <text
            x="70"
            y="235"
            fontFamily="'Cinzel', 'Playfair Display', 'Bodoni MT', Georgia, serif"
            fontSize="46"
            fontWeight="900"
            letterSpacing="2"
            fill="url(#goldMetallic)"
          >
            SPLEND
          </text>

          {/* Custom O with Brabus / G-Wagon Luxury Car Silhouette */}
          <g transform="translate(370, 216)">
            {/* Outer Gold Ring of O */}
            <circle cx="0" cy="0" r="32" stroke="url(#goldOuterBorder)" strokeWidth="5" fill="#000000" />
            <circle cx="0" cy="0" r="26" stroke="#99701C" strokeWidth="1" />

            {/* G-Wagon Body & Silhouette */}
            {/* Windshield & Roof rack */}
            <rect x="-18" y="-18" width="36" height="5" rx="1.5" fill="url(#goldMetallic)" />
            <path d="M -16 -13 L -19 -2 L 19 -2 L 16 -13 Z" fill="#1A1A1A" stroke="url(#goldMetallic)" strokeWidth="1" />
            
            {/* Hood & Main Body */}
            <rect x="-21" y="-2" width="42" height="16" rx="2" fill="#0F0F12" stroke="url(#goldMetallic)" strokeWidth="1.2" />
            
            {/* Grille & Bullbar */}
            <rect x="-13" y="1" width="26" height="9" rx="1" fill="#050505" stroke="url(#goldMetallic)" strokeWidth="0.8" />
            <circle cx="0" cy="5.5" r="3" fill="#000000" stroke="url(#goldMetallic)" strokeWidth="0.8" />
            <text x="0" y="7" textAnchor="middle" fontSize="4" fontWeight="bold" fill="#D4AF37">B</text>
            
            {/* Headlights (Twin circular gold lights) */}
            <circle cx="-16" cy="5" r="3.5" fill="#FFF8DC" stroke="url(#goldOuterBorder)" strokeWidth="1" />
            <circle cx="16" cy="5" r="3.5" fill="#FFF8DC" stroke="url(#goldOuterBorder)" strokeWidth="1" />
            
            {/* DUBAI Plate */}
            <rect x="-9" y="10" width="18" height="3.5" rx="0.5" fill="#D4AF37" />
            <text x="0" y="12.8" textAnchor="middle" fontSize="3" fontWeight="bold" fill="#000000" fontFamily="monospace">DUBAI</text>
          </g>

          {/* Letter R */}
          <text
            x="425"
            y="235"
            fontFamily="'Cinzel', 'Playfair Display', 'Bodoni MT', Georgia, serif"
            fontSize="46"
            fontWeight="900"
            letterSpacing="2"
            fill="url(#goldMetallic)"
          >
            R
          </text>
        </g>

        {/* Subtitle: C A R   R E N T A L */}
        <text
          x="250"
          y="278"
          textAnchor="middle"
          fontFamily="'Montserrat', 'Cinzel', sans-serif"
          fontSize="22"
          fontWeight="700"
          letterSpacing="14"
          fill="url(#goldMetallic)"
        >
          CAR RENTAL
        </text>

        {/* Slogans Row: PRESTIGE BEYOND LIMITS / هيبة بلا حدود */}
        <g id="SLOGANS_DIVIDER">
          {/* Slogan English */}
          <text
            x="142"
            y="318"
            textAnchor="middle"
            fontFamily="'Montserrat', sans-serif"
            fontSize="12.5"
            fontWeight="700"
            letterSpacing="2"
            fill="#EAD28B"
          >
            PRESTIGE BEYOND LIMITS
          </text>

          {/* Center Gold Diamond Divider */}
          <polygon points="250,311 254,316 250,321 246,316" fill="url(#goldMetallic)" />

          {/* Slogan Arabic */}
          <text
            x="360"
            y="318"
            textAnchor="middle"
            fontFamily="'Tajawal', 'Cairo', sans-serif"
            fontSize="15"
            fontWeight="800"
            letterSpacing="3"
            fill="#EAD28B"
          >
            هيبة بلا حدود
          </text>

          {/* Horizontal Golden Accent Lines */}
          <line x1="45" y1="334" x2="455" y2="334" stroke="url(#goldOuterBorder)" strokeWidth="1.2" />
        </g>

        {/* Bottom 4 Luxury Pillars (Trust, Luxury, Performance, Excellence) */}
        <g id="FOUR_PILLARS" transform="translate(0, 345)">
          {/* Vertical Separator Lines */}
          <line x1="145" y1="5" x2="145" y2="75" stroke="#684A0A" strokeWidth="1" />
          <line x1="250" y1="5" x2="250" y2="75" stroke="#684A0A" strokeWidth="1" />
          <line x1="355" y1="5" x2="355" y2="75" stroke="#684A0A" strokeWidth="1" />

          {/* 1. TRUST (Shield & Check) */}
          <g transform="translate(95, 25)">
            <path
              d="M 0 -15 L 14 -10 C 14 5 5 15 0 18 C -5 15 -14 5 -14 -10 Z"
              stroke="url(#goldMetallic)"
              strokeWidth="2.5"
              fill="none"
            />
            <path d="M -5 -2 L -1 3 L 6 -6" stroke="url(#goldMetallic)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <text x="0" y="32" textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="1" fill="url(#goldMetallic)" fontFamily="'Montserrat', sans-serif">
              TRUST
            </text>
          </g>

          {/* 2. LUXURY (Crown) */}
          <g transform="translate(200, 24)">
            {/* Crown with Pearls */}
            <path
              d="M -16 12 L 16 12 L 18 -6 L 8 4 L 0 -12 L -8 4 L -18 -6 Z"
              stroke="url(#goldMetallic)"
              strokeWidth="2"
              fill="none"
            />
            <circle cx="-18" cy="-8" r="2" fill="url(#goldOuterBorder)" />
            <circle cx="-8" cy="2" r="1.5" fill="url(#goldOuterBorder)" />
            <circle cx="0" cy="-14" r="2.5" fill="url(#goldOuterBorder)" />
            <circle cx="8" cy="2" r="1.5" fill="url(#goldOuterBorder)" />
            <circle cx="18" cy="-8" r="2" fill="url(#goldOuterBorder)" />
            <text x="0" y="33" textAnchor="middle" fontSize="11" fontWeight="800" letterSpacing="1" fill="url(#goldMetallic)" fontFamily="'Montserrat', sans-serif">
              LUXURY
            </text>
          </g>

          {/* 3. PERFORMANCE (Speedometer) */}
          <g transform="translate(305, 25)">
            <circle cx="0" cy="0" r="14" stroke="url(#goldMetallic)" strokeWidth="2" fill="none" />
            <path d="M -10 6 A 12 12 0 1 1 10 6" stroke="url(#goldOuterBorder)" strokeWidth="1.5" strokeDasharray="2 2" fill="none" />
            <line x1="0" y1="0" x2="6" y2="-7" stroke="#FF4D4D" strokeWidth="2" strokeLinecap="round" />
            <circle cx="0" cy="0" r="2.5" fill="url(#goldMetallic)" />
            <text x="0" y="32" textAnchor="middle" fontSize="9.5" fontWeight="800" letterSpacing="0.8" fill="url(#goldMetallic)" fontFamily="'Montserrat', sans-serif">
              PERFORMANCE
            </text>
          </g>

          {/* 4. EXCELLENCE (Faceted Diamond) */}
          <g transform="translate(410, 25)">
            <polygon
              points="-14,-8 14,-8 20,0 0,16 -20,0"
              stroke="url(#goldMetallic)"
              strokeWidth="2"
              fill="none"
            />
            <polyline points="-14,-8 -7,0 0,16 7,0 14,-8" stroke="url(#goldOuterBorder)" strokeWidth="1.2" fill="none" />
            <polyline points="-20,0 20,0" stroke="url(#goldOuterBorder)" strokeWidth="1.2" />
            <polyline points="-7,0 7,0" stroke="url(#goldOuterBorder)" strokeWidth="1.2" />
            <text x="0" y="32" textAnchor="middle" fontSize="9.5" fontWeight="800" letterSpacing="0.8" fill="url(#goldMetallic)" fontFamily="'Montserrat', sans-serif">
              EXCELLENCE
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
};
