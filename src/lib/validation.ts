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
    .min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
    .max(72, 'รหัสผ่านยาวเกินไป'),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
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

export const joinInvitationSchema = z.object({
  token: z
    .string()
    .trim()
    .min(6, 'กรุณาระบุรหัสคำเชิญให้ครบถ้วน')
    .max(64, 'รหัสคำเชิญไม่ถูกต้อง'),
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
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal('')),
  status: z.enum(['open', 'in_progress', 'done']).default('open'),
});
