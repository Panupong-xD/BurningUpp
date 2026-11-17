import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Burning Upp — ดูแลใจและสมดุลการทำงานของทีมอย่างเข้าใจ',
  description:
    'แพลตฟอร์มติดตามอารมณ์รายวัน สำรวจสัญญาณความเหนื่อยล้า และสรุปแนวโน้มสุขภาวะระดับทีมอย่างปลอดภัยและเคารพความเป็นส่วนตัว',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body
        style={{
          fontFamily: "'Noto Sans Thai', 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
        }}
        className="min-h-screen bg-[#FAF8F5] text-stone-900 selection:bg-teal-100 selection:text-teal-900"
      >
        {children}
      </body>
    </html>
  );
}
