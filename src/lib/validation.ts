import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกชื่อ-นามสกุลหรือชื่อที่ใช้แสดง')
    .max(100, 'ชื่อต้องไม่เกิน 100 ตัวอักษร'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z
    .string()
    .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .max(72, 'รหัสผ่านยาวเกินไป'),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน').max(72, 'รหัสผ่านยาวเกินไป'),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('รูปแบบอีเมลไม่ถูกต้อง'),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร')
      .max(72, 'รหัสผ่านยาวเกินไป'),
    confirmPassword: z.string().min(1, 'กรุณายืนยันรหัสผ่านใหม่'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
    path: ['confirmPassword'],
  });

export const createWorkspaceSchema = z.object({
  workspaceName: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุชื่อพื้นที่ทำงาน')
    .max(120, 'ชื่อพื้นที่ทำงานต้องไม่เกิน 120 ตัวอักษร'),
  firstTeamName: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุชื่อทีมแรก')
    .max(120, 'ชื่อทีมต้องไม่เกิน 120 ตัวอักษร'),
  organizationName: z
    .string()
    .trim()
    .max(120, 'ชื่อองค์กรต้องไม่เกิน 120 ตัวอักษร')
    .optional()
    .or(z.literal('')),
});

export const teamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุชื่อทีม')
    .max(120, 'ชื่อทีมต้องไม่เกิน 120 ตัวอักษร'),
  description: z
    .string()
    .trim()
    .max(400, 'คำอธิบายทีมต้องไม่เกิน 400 ตัวอักษร')
    .default(''),
});

export const invitationCreateSchema = z.object({
  teamId: z.string().uuid('กรุณาเลือกทีมที่ถูกต้อง'),
  assignedRole: z.enum(['member', 'leader']),
  invitedEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('รูปแบบอีเมลไม่ถูกต้อง')
    .max(254, 'อีเมลยาวเกินไป')
    .optional()
    .or(z.literal('')),
});

export const workspaceSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุชื่อพื้นที่ทำงาน')
    .max(120, 'ชื่อพื้นที่ทำงานต้องไม่เกิน 120 ตัวอักษร'),
  organizationName: z
    .string()
    .trim()
    .max(120, 'ชื่อองค์กรต้องไม่เกิน 120 ตัวอักษร')
    .optional()
    .or(z.literal('')),
  minGroupSize: z
    .number()
    .int('จำนวนผู้ตอบขั้นต่ำต้องเป็นจำนวนเต็ม')
    .min(5, 'เกณฑ์ขั้นต่ำต้องไม่น้อยกว่า 5 คน')
    .max(50, 'เกณฑ์ขั้นต่ำต้องไม่เกิน 50 คน'),
});

export const profileUpdateSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกชื่อ-นามสกุลหรือชื่อที่ใช้แสดง')
    .max(100, 'ชื่อต้องไม่เกิน 100 ตัวอักษร'),
  consentMoodSharing: z.boolean(),
});

export const campaignSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุชื่อรอบการสำรวจ')
    .max(160, 'ชื่อรอบการสำรวจต้องไม่เกิน 160 ตัวอักษร'),
  teamId: z.string().uuid('กรุณาเลือกทีม').nullable().optional(),
});

export const joinInvitationSchema = z.object({
  token: z
    .string()
    .trim()
    .min(6, 'กรุณาระบุรหัสคำเชิญให้ครบถ้วน')
    .max(64, 'รหัสคำเชิญไม่ถูกต้อง')
    .regex(/^[A-Za-z0-9_-]+$/, 'รหัสคำเชิญมีอักขระที่ไม่ถูกต้อง'),
});

export const moodCheckinSchema = z.object({
  workspaceId: z.string().uuid('รหัสพื้นที่ทำงานไม่ถูกต้อง'),
  teamId: z.string().uuid().nullable().optional(),
  entryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง'),
  moodLevel: z
    .number()
    .int()
    .min(1, 'กรุณาเลือกระดับอารมณ์ 1 ถึง 5')
    .max(5, 'กรุณาเลือกระดับอารมณ์ 1 ถึง 5'),
  factors: z
    .array(z.enum(['workload', 'sleep', 'rest', 'environment', 'personal']))
    .max(5, 'เลือกปัจจัยได้ไม่เกิน 5 ข้อ')
    .default([]),
  workloadLevel: z.number().int().min(1).max(5).nullable().optional(),
  sleepLevel: z.number().int().min(1).max(5).nullable().optional(),
  restLevel: z.number().int().min(1).max(5).nullable().optional(),
  environmentLevel: z.number().int().min(1).max(5).nullable().optional(),
  personalLevel: z.number().int().min(1).max(5).nullable().optional(),
  privateNote: z
    .string()
    .max(2000, 'บันทึกส่วนตัวต้องไม่เกิน 2,000 ตัวอักษร')
    .default(''),
});

export const followUpSchema = z.object({
  workspaceId: z.string().uuid(),
  teamId: z.string().uuid('กรุณาเลือกทีม'),
  title: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุหัวข้อการติดตามผล')
    .max(160, 'หัวข้อต้องไม่เกิน 160 ตัวอักษร'),
  description: z
    .string()
    .trim()
    .max(1000, 'รายละเอียดต้องไม่เกิน 1,000 ตัวอักษร')
    .default(''),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง')
    .nullable()
    .optional()
    .or(z.literal('')),
  status: z.enum(['open', 'in_progress', 'done']).default('open'),
});

export function extractInviteToken(raw: string): string {
  let clean = raw.trim();
  if (!clean) return '';
  if (clean.includes('/join/')) {
    const seg = clean.split('/join/').pop()?.split(/[?#]/)[0] || '';
    try {
      clean = decodeURIComponent(seg);
    } catch {
      clean = seg;
    }
  } else if (clean.includes('invite=')) {
    try {
      const parsedUrl = new URL(
        clean.startsWith('http') ? clean : `https://local.invalid/${clean.replace(/^\/+/, '')}`
      );
      clean = parsedUrl.searchParams.get('invite') || clean;
    } catch {
      // Fall back to raw value
    }
  }
  return clean.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64).toUpperCase();
}
