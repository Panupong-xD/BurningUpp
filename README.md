# Burning Upp — Workplace Mental Well-being & Burnout Monitoring SaaS

**Burning Upp** คือเว็บแอปพลิเคชัน Multi-tenant SaaS สำหรับติดตามสุขภาวะทางใจและสมดุลการทำงานของทีม ผ่านการบันทึกอารมณ์ประจำวัน (Daily Mood Check-in) แบบสำรวจสัญญาณความเหนื่อยล้าเป็นระยะ (Periodic Burnout Assessment) และการสรุปแนวโน้มระดับทีมอย่างปลอดภัย

---

## หลักการออกแบบสำคัญ (Core Principles)

1. **Workspace เป็นขอบเขตการแยกข้อมูลหลัก (Primary Tenant Boundary)**:
   - แต่ละพื้นที่ทำงาน (`workspaces`) มีทีม สมาชิก บันทึกอารมณ์ แบบสำรวจ รายงาน และรายการติดตามผลแยกขาดจากกันด้วย PostgreSQL Row Level Security (RLS)
   - ผู้ใช้ 1 คนสามารถเข้าร่วมได้หลายพื้นที่ทำงาน และมีบทบาทต่างกันในแต่ละพื้นที่ทำงานได้ (`owner`, `leader`, `member`)
2. **คุ้มครองความเป็นส่วนตัวของสมาชิกอย่างแท้จริง**:
   - บันทึกข้อความส่วนตัว (`mood_entries.private_note`) และคำตอบรายข้อ (`assessment_responses`, `assessment_answers`, `assessment_results`) ถูกจำกัดสิทธิ์ด้วย RLS ให้เฉพาะเจ้าของข้อมูลเท่านั้นที่อ่านได้
   - หัวหน้าทีมจะเห็นผลสรุปแบบประเมินระดับทีมเมื่อมีผู้ตอบอย่างน้อย **5 คนขึ้นไป** (`min_group_size >= 5`) เท่านั้น หากมีผู้ตอบไม่ถึงเกณฑ์ ระบบจะแสดงข้อความ `"ข้อมูลยังไม่เพียงพอสำหรับแสดงผล"`
   - วันที่ไม่ได้เช็กอินอารมณ์จะไม่ถูกตีความเป็นอารมณ์เฉยๆ/ปกติ (Missing entries are never treated as neutral)
3. **ความซื่อตรงของแบบประเมิน (Assessment Integrity)**:
   - ใช้ชุดคำถามตัวอย่างที่ระบุอย่างชัดเจนว่าไม่ใช่เครื่องมือวัดทางคลินิกและไม่ใช่การวินิจฉัยทางการแพทย์

---

## โครงสร้างระบบ (Tech Stack)

- **Frontend / Full-stack Framework**: Next.js 15 (App Router), React 19, TypeScript
- **Styling & UI**: Tailwind CSS v4, Lucide Icons, Custom SVG Mood Illustrations (`Plus Jakarta Sans` + `Noto Sans Thai`)
- **Backend & Database**: Supabase (Authentication, PostgreSQL 17, Row Level Security, Private Security Definer Helpers)
- **Validation & Testing**: Zod, Vitest (Unit Tests + Live Supabase Multi-Tenant & RLS Integration Tests)

---

## การเริ่มต้นใช้งาน (Getting Started)

1. คัดลอกไฟล์ `.env.example` เป็น `.env.local` และระบุค่าเชื่อมต่อ Supabase:
   ```bash
   cp .env.example .env.local
   ```
2. ติดตั้งแพ็กเกจ:
   ```bash
   npm install
   ```
3. รันเซิร์ฟเวอร์สำหรับพัฒนา:
   ```bash
   npm run dev
   ```
4. รันการตรวจสอบคุณภาพและชุดทดสอบ:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
