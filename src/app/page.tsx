import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Logo } from '@/components/ui/Logo';
import { MoodIllustration } from '@/components/ui/MoodIcon';
import {
  ArrowRight,
  CheckCircle2,
  HeartHandshake,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-[#FAF8F5]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Logo size="md" />
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800"
              >
                เข้าสู่พื้นที่ทำงานของคุณ
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl px-3.5 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-200/60"
                >
                  เข้าสู่ระบบ
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800"
                >
                  เริ่มต้นใช้งาน
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 md:pt-20 md:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50/80 px-3.5 py-1.5 text-xs font-semibold text-teal-800">
                <Sparkles className="h-3.5 w-3.5 text-teal-700" />
                แพลตฟอร์มดูแลสุขภาวะและสมดุลการทำงานของทีม
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl md:text-5xl leading-[1.2]">
                เข้าใจความรู้สึกของทีม{' '}
                <span className="text-teal-700">ก่อนที่ไฟในการทำงานจะมอดลง</span>
              </h1>

              <p className="max-w-2xl text-base sm:text-lg text-stone-600 leading-relaxed">
                Burning Upp ช่วยให้สมาชิกบันทึกอารมณ์ประจำวันได้ใน 15 วินาที
                ทำแบบสำรวจความเหนื่อยล้าเป็นระยะ และช่วยให้หัวหน้าทีมเห็นแนวโน้มภาพรวมของทีมอย่างปลอดภัย
                โดยไม่ต้องพึ่งพาฟอร์มหรือตารางคำนวณที่กระจัดกระจาย
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <Link
                  href={user ? '/app' : '/register'}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-700 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-teal-800"
                >
                  {user ? 'ไปที่แดชบอร์ด' : 'สร้างพื้นที่ทำงานสำหรับทีมของคุณ'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={user ? '/onboarding' : '/login'}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-6 py-3.5 text-base font-medium text-stone-700 transition hover:bg-stone-50"
                >
                  เข้าร่วมทีมด้วยรหัสคำเชิญ
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-xs text-stone-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-teal-700 shrink-0" />
                  <span>เช็กอินอารมณ์ง่ายใน 10–20 วินาที</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-teal-700 shrink-0" />
                  <span>บันทึกส่วนตัวเห็นเฉพาะตัวสมาชิกเอง</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-teal-700 shrink-0" />
                  <span>สรุปผลทีมเมื่อมีผู้ตอบตั้งแต่ 5 คนขึ้นไป</span>
                </div>
              </div>
            </div>

            {/* Interactive Preview Card */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm sm:p-7 space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <span className="text-xs font-medium text-teal-700">
                      ตัวอย่างหน้าเช็กอินรายวัน
                    </span>
                    <h2 className="text-lg font-bold text-stone-900 mt-0.5">
                      วันนี้คุณรู้สึกอย่างไร?
                    </h2>
                  </div>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                    ใช้เวลา ~15 วินาที
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {([1, 2, 3, 4, 5] as const).map((lvl) => {
                    const labels = ['แย่มาก', 'ไม่ค่อยดี', 'เฉยๆ', 'ดี', 'ดีมาก'];
                    const isSelected = lvl === 4;
                    return (
                      <div
                        key={lvl}
                        className={`flex flex-col items-center gap-2 rounded-2xl border p-2.5 text-center transition ${
                          isSelected
                            ? 'border-teal-600 bg-teal-50/70 ring-2 ring-teal-600/15'
                            : 'border-stone-200/80 bg-stone-50/40'
                        }`}
                      >
                        <MoodIllustration level={lvl} className="h-9 w-9" />
                        <span className="text-xs font-semibold text-stone-800">
                          {labels[lvl - 1]}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl bg-[#FAF8F5] p-4 border border-stone-200/70 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                    <Lock className="h-3.5 w-3.5 text-teal-700" />
                    ออกแบบโดยให้ความสำคัญกับความไว้วางใจ
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    หัวหน้าทีมจะเห็นเฉพาะแนวโน้มภาพรวมของทีมเพื่อนำไปจัดกิจกรรมสนับสนุน
                    โดยไม่สามารถเปิดอ่านบันทึกส่วนตัวหรือคำตอบรายข้อของสมาชิกได้
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Three Simple Pillars */}
        <section className="border-t border-stone-200/80 bg-white py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold text-stone-900 sm:text-3xl">
                ครบทุกเรื่องสำคัญในการดูแลทีม โดยไม่ซับซ้อน
              </h2>
              <p className="mt-2 text-sm sm:text-base text-stone-600">
                ออกแบบให้ทั้งหัวหน้าทีมและสมาชิกใช้งานได้ทันทีโดยไม่ต้องมีพื้นฐานทางเทคนิค
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5] p-6 space-y-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                  <HeartHandshake className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-stone-900">
                  1. บันทึกอารมณ์และสำรวจตนเอง
                </h3>
                <p className="text-sm text-stone-600 leading-relaxed">
                  สมาชิกบันทึกอารมณ์ประจำวัน 5 ระดับ เลือกปัจจัยที่เกี่ยวข้องได้ตามต้องการ
                  และดูปฏิทินแนวโน้มอารมณ์ส่วนตัวได้ทุกเมื่อบนมือถือและคอมพิวเตอร์
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5] p-6 space-y-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-stone-900">
                  2. ปกป้องความเป็นส่วนตัวจริง
                </h3>
                <p className="text-sm text-stone-600 leading-relaxed">
                  แยกพื้นที่ทำงานแต่ละแห่งออกจากกันอย่างเด็ดขาดด้วย Row Level Security
                  และแสดงผลสรุปแบบประเมินระดับทีมเมื่อมีผู้ตอบตั้งแต่ 5 คนขึ้นไปเท่านั้น
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5] p-6 space-y-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Users className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-stone-900">
                  3. แนวโน้มทีมและการติดตามผล
                </h3>
                <p className="text-sm text-stone-600 leading-relaxed">
                  หัวหน้าทีมเห็นแนวโน้มอารมณ์ของทีม สัดส่วนการมีส่วนร่วม
                  และสามารถบันทึกกิจกรรมดูแลสนับสนุนทีมพร้อมออกรายงานสรุปได้อย่างเป็นระบบ
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200/80 bg-[#FAF8F5] py-8">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 text-xs text-stone-500">
          <Logo size="sm" />
          <p>
            ข้อมูลในระบบใช้เพื่อส่งเสริมการดูแลสุขภาวะในการทำงานเบื้องต้นเท่านั้น ไม่ใช่การวินิจฉัยทางการแพทย์
          </p>
        </div>
      </footer>
    </div>
  );
}
