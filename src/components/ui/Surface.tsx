import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export const UI_CARD = 'rounded-3xl border border-stone-200/90 bg-white p-6 shadow-2xs';
export const UI_SUBCARD = 'rounded-2xl border border-stone-200/80 bg-[#FAF8F5]';
export const UI_INPUT = 'mt-1 block w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-700 focus:outline-hidden focus:ring-2 focus:ring-teal-700/15';
export const UI_INPUT_LG = 'mt-1.5 block w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-teal-700 focus:outline-hidden focus:ring-2 focus:ring-teal-700/15';
export const UI_LABEL = 'block text-xs font-medium text-stone-700';
export const UI_LABEL_LG = 'block text-sm font-medium text-stone-700';
export const UI_BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800 disabled:opacity-50';
export const UI_BTN_SECONDARY = 'inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50';

export function StatusBanner({ type, message, className = '' }: { type: 'error' | 'success'; message: string; className?: string }) {
  const err = type === 'error';
  return (
    <div
      role={err ? 'alert' : 'status'}
      className={`flex items-center gap-2.5 rounded-2xl border p-3.5 text-sm ${err ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'} ${className}`}
    >
      {err ? <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />}
      <span>{message}</span>
    </div>
  );
}

export function ProgressBar({ valuePct, color, height = 'h-2', track = 'bg-stone-100' }: { valuePct: number; color?: string; height?: string; track?: string }) {
  return (
    <div className={`${height} w-full overflow-hidden rounded-full ${track}`}>
      <div className="h-full rounded-full transition-all bg-teal-700" style={{ width: `${Math.min(100, Math.max(0, valuePct))}%`, backgroundColor: color }} />
    </div>
  );
}

export function EmptyBox({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">{text}</div>;
}
