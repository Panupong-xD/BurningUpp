import React from 'react';

export function MoodIllustration({
  level,
  className = 'h-10 w-10',
}: {
  level: 1 | 2 | 3 | 4 | 5;
  className?: string;
}) {
  switch (level) {
    case 1:
      // Very Bad - Gentle rain cloud with empathetic face
      return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="#FFE4E6" />
          <circle cx="24" cy="24" r="19" stroke="#FDA4AF" strokeWidth="1.5" />
          <path d="M16 20c1.2-1.5 3.5-1.5 4.5 0" stroke="#9F1239" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M27.5 20c1.2-1.5 3.5-1.5 4.5 0" stroke="#9F1239" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M17.5 31c2-3 11-3 13 0" stroke="#9F1239" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M33 25c0 1.5-1.2 2.7-2 2.7s-2-1.2-2-2.7c0-1.2 2-3.5 2-3.5s2 2.3 2 3.5Z" fill="#FB7185" />
        </svg>
      );
    case 2:
      // Bad - Tired / Low energy face
      return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="#FFEDD5" />
          <circle cx="24" cy="24" r="19" stroke="#FDBA74" strokeWidth="1.5" />
          <circle cx="18" cy="21" r="2" fill="#9A3412" />
          <circle cx="30" cy="21" r="2" fill="#9A3412" />
          <path d="M15.5 17.5l4.5 1" stroke="#9A3412" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M32.5 17.5l-4.5 1" stroke="#9A3412" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18.5 30.5c2.2-2 8.8-2 11 0" stroke="#9A3412" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
      );
    case 3:
      // Neutral - Calm balanced face
      return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="#FEF3C7" />
          <circle cx="24" cy="24" r="19" stroke="#FCD34D" strokeWidth="1.5" />
          <circle cx="18" cy="21" r="2.2" fill="#92400E" />
          <circle cx="30" cy="21" r="2.2" fill="#92400E" />
          <path d="M18.5 29.5h11" stroke="#92400E" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case 4:
      // Good - Warm gentle smile
      return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="#CCFBF1" />
          <circle cx="24" cy="24" r="19" stroke="#5EEAD4" strokeWidth="1.5" />
          <circle cx="18" cy="20.5" r="2.2" fill="#115E59" />
          <circle cx="30" cy="20.5" r="2.2" fill="#115E59" />
          <path d="M17.5 28c2.2 3.2 10.8 3.2 13 0" stroke="#115E59" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case 5:
      // Very Good - Radiant joyful smile with sparkles
      return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="#D1FAE5" />
          <circle cx="24" cy="24" r="19" stroke="#6EE7B7" strokeWidth="1.5" />
          <path d="M15.5 21c1-2 3.5-2 4.5 0" stroke="#065F46" strokeWidth="2.3" strokeLinecap="round" />
          <path d="M28 21c1-2 3.5-2 4.5 0" stroke="#065F46" strokeWidth="2.3" strokeLinecap="round" />
          <path d="M16.5 27.5c2.5 4.5 12.5 4.5 15 0" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="13.5" cy="25" r="2" fill="#34D399" opacity="0.5" />
          <circle cx="34.5" cy="25" r="2" fill="#34D399" opacity="0.5" />
        </svg>
      );
  }
}
