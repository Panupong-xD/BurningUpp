import React from 'react';

export function Logo({
  size = 'md',
  showSubtitle = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}) {
  const iconBoxSize =
    size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  const titleSize =
    size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <div className="inline-flex items-center gap-2.5">
      <div
        className={`${iconBoxSize} flex items-center justify-center rounded-xl bg-teal-700 text-white shadow-xs`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3c.5 3.5 3.5 5.5 3.5 9a5.5 5.5 0 1 1-11 0c0-2.5 1.5-4.5 3-6 .5 1.5 1.5 2.5 2.5 2.5 1 0 2-2 2-5.5Z" />
          <path d="M12 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
        </svg>
      </div>
      <div>
        <span className={`${titleSize} font-bold tracking-tight text-stone-900`}>
          Burning <span className="text-teal-700">Upp</span>
        </span>
        {showSubtitle && (
          <p className="text-xs text-stone-500">ดูแลใจและสมดุลของทีม</p>
        )}
      </div>
    </div>
  );
}
