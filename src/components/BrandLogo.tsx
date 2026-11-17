import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export default function BrandLogo({ size = 32, className = '' }: BrandLogoProps) {
  return (
    <div
      className={`relative inline-flex items-center justify-center flex-none select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 512 512"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-md"
      >
        <defs>
          <radialGradient id="logoBgGrad" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stop-color="#262626" />
            <stop offset="100%" stop-color="#121212" />
          </radialGradient>

          <linearGradient id="logoClockGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FDE047" />
            <stop offset="45%" stop-color="#FACC15" />
            <stop offset="100%" stop-color="#F59E0B" />
          </linearGradient>

          <linearGradient id="logoBadgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#22C55E" />
            <stop offset="100%" stop-color="#16A34A" />
          </linearGradient>

          <filter id="logoShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="5" stdDeviation="4" flood-color="#000000" flood-opacity="0.6" />
          </filter>
        </defs>

        {/* Base Rounded Frame */}
        <rect x="20" y="20" width="472" height="472" rx="104" fill="url(#logoBgGrad)" stroke="#2D2D2D" stroke-width="8" />

        {/* Viewfinder Aperture Circle */}
        <circle cx="256" cy="256" r="195" fill="none" stroke="#222222" stroke-width="4" stroke-dasharray="8 8" />

        {/* Timemark Camera Corner Brackets (Thick Amber Yellow) */}
        <g stroke="#FACC15" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M 68,136 L 68,92 Q 68,68 92,68 L 136,68" />
          <path d="M 376,68 L 420,68 Q 444,68 444,92 L 444,136" />
          <path d="M 68,376 L 68,420 Q 68,444 92,444 L 136,444" />
          <path d="M 376,444 L 420,444 Q 444,444 444,420 L 444,376" />
        </g>

        {/* Central Camera Lens / Clock Face */}
        <circle cx="256" cy="256" r="140" fill="url(#logoClockGrad)" stroke="#78350F" stroke-width="9" />
        <circle cx="256" cy="256" r="128" fill="none" stroke="#FDE047" stroke-width="3" opacity="0.8" />

        {/* 12, 3, 6, 9 Clock Ticks */}
        <rect x="251" y="132" width="10" height="18" rx="5" fill="#78350F" />
        <rect x="368" y="251" width="18" height="10" rx="5" fill="#78350F" />
        <rect x="251" y="362" width="10" height="18" rx="5" fill="#78350F" />
        <rect x="126" y="251" width="18" height="10" rx="5" fill="#78350F" />

        {/* Cheek Blushes */}
        <ellipse cx="185" cy="258" rx="16" ry="10" fill="#EF4444" opacity="0.4" />
        <ellipse cx="327" cy="258" rx="16" ry="10" fill="#EF4444" opacity="0.4" />

        {/* Left Eye: Cheeky Wink */}
        <path d="M 190,214 Q 212,192 234,214" stroke="#18181B" stroke-width="12" stroke-linecap="round" fill="none" />

        {/* Right Eye: Wide Sly Eye */}
        <ellipse cx="298" cy="208" rx="18" ry="20" fill="#FFFFFF" stroke="#18181B" stroke-width="6" />
        <circle cx="303" cy="208" r="10" fill="#18181B" />
        <circle cx="306" cy="204" r="3.5" fill="#FFFFFF" />

        {/* Clock Hands / Cheeky gesture */}
        <line x1="256" y1="256" x2="198" y2="238" stroke="#18181B" stroke-width="11" stroke-linecap="round" />
        <line x1="256" y1="256" x2="310" y2="248" stroke="#18181B" stroke-width="9" stroke-linecap="round" />
        <circle cx="256" cy="256" r="11" fill="#18181B" stroke="#FACC15" stroke-width="2" />

        {/* Cheeky Smirk Grin Mouth */}
        <path d="M 216,288 Q 256,334 296,294 Q 306,282 312,274" stroke="#18181B" stroke-width="12" stroke-linecap="round" fill="none" />
        <path d="M 314,270 Q 320,276 322,284" stroke="#18181B" stroke-width="7" stroke-linecap="round" fill="none" />

        {/* Satirical Crooked "100% REAL" Verification Badge */}
        <g transform="translate(362, 138) rotate(13)" filter="url(#logoShadow)">
          <rect x="-82" y="-23" width="164" height="46" rx="14" fill="url(#logoBadgeGrad)" stroke="#FFFFFF" stroke-width="4" />
          <circle cx="-54" cy="0" r="13" fill="#FFFFFF" />
          <path d="M -60,0 L -56,4 L -48,-4" stroke="#16A34A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          <text x="-34" y="7" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="20" fill="#FFFFFF" letter-spacing="0.5">
            100% REAL
          </text>
        </g>
      </svg>
    </div>
  );
}
