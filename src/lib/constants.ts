export interface MoodLevelMeta {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  subtitle: string;
  emoji: string;
  color: string;
  bgClass: string;
  borderClass: string;
  activeClass: string;
  textClass: string;
}

export const MOOD_LEVELS: MoodLevelMeta[] = [
  {
    level: 1,
    label: 'แย่มาก',
    subtitle: 'เหนื่อยล้าหรือหนักใจมาก',
    emoji: '🌧️',
    color: '#E11D48',
    bgClass: 'bg-rose-50/80',
    borderClass: 'border-rose-200 hover:border-rose-300',
    activeClass: 'bg-rose-50 border-rose-500 ring-2 ring-rose-500/20',
    textClass: 'text-rose-700',
  },
  {
    level: 2,
    label: 'ไม่ค่อยดี',
    subtitle: 'รู้สึกตึงเครียดหรืออ่อนล้า',
    emoji: '🌥️',
    color: '#EA580C',
    bgClass: 'bg-orange-50/80',
    borderClass: 'border-orange-200 hover:border-orange-300',
    activeClass: 'bg-orange-50 border-orange-500 ring-2 ring-orange-500/20',
    textClass: 'text-orange-700',
  },
  {
    level: 3,
    label: 'เฉยๆ',
    subtitle: 'ผ่านไปได้ตามปกติ',
    emoji: '⛅',
    color: '#D97706',
    bgClass: 'bg-amber-50/80',
    borderClass: 'border-amber-200 hover:border-amber-300',
    activeClass: 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20',
    textClass: 'text-amber-700',
  },
  {
    level: 4,
    label: 'ดี',
    subtitle: 'มีพลังและทำงานได้ราบรื่น',
    emoji: '🌤️',
    color: '#0D9488',
    bgClass: 'bg-teal-50/80',
    borderClass: 'border-teal-200 hover:border-teal-300',
    activeClass: 'bg-teal-50 border-teal-600 ring-2 ring-teal-600/20',
    textClass: 'text-teal-700',
  },
  {
    level: 5,
    label: 'ดีมาก',
    subtitle: 'สดชื่น มีพลังใจเต็มเปี่ยม',
    emoji: '☀️',
    color: '#059669',
    bgClass: 'bg-emerald-50/80',
    borderClass: 'border-emerald-200 hover:border-emerald-300',
    activeClass: 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-600/20',
    textClass: 'text-emerald-700',
  },
];

export const MOOD_LEVEL_MAP: Record<number, MoodLevelMeta> = Object.fromEntries(
  MOOD_LEVELS.map((m) => [m.level, m])
);

export interface MoodFactorMeta {
  key: 'workload' | 'sleep' | 'rest' | 'environment' | 'personal';
  label: string;
  description: string;
}

export const MOOD_FACTORS: MoodFactorMeta[] = [
  {
    key: 'workload',
    label: 'ภาระงาน',
    description: 'ปริมาณงานหรือความเร่งด่วน',
  },
  {
    key: 'sleep',
    label: 'การนอนหลับ',
    description: 'คุณภาพและชั่วโมงการนอน',
  },
  {
    key: 'rest',
    label: 'การพักผ่อน',
    description: 'เวลาพักระหว่างวันหรือหลังเลิกงาน',
  },
  {
    key: 'environment',
    label: 'สภาพแวดล้อมการทำงาน',
    description: 'บรรยากาศและการประสานงานในทีม',
  },
  {
    key: 'personal',
    label: 'ปัจจัยส่วนตัว',
    description: 'เรื่องทั่วไปนอกเหนือจากงาน',
  },
];

export const MOOD_FACTOR_MAP: Record<string, MoodFactorMeta> = Object.fromEntries(
  MOOD_FACTORS.map((f) => [f.key, f])
);

export const ASSESSMENT_BANDS = {
  balanced: {
    key: 'balanced',
    label: 'สมดุลดี',
    description:
      'คะแนนจากการสำรวจเบื้องต้นสะท้อนว่าพลังงานและความสมดุลในการทำงานอยู่ในเกณฑ์ปกติ',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    barColor: '#059669',
  },
  moderate_strain: {
    key: 'moderate_strain',
    label: 'เริ่มมีความเหนื่อยล้าสะสม',
    description:
      'พบสัญญาณความตึงเครียดหรือความอ่อนล้าในบางด้าน แนะนำให้จัดสรรเวลาพักผ่อนและทบทวนลำดับความสำคัญของงาน',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    barColor: '#D97706',
  },
  high_strain: {
    key: 'high_strain',
    label: 'มีความเหนื่อยล้าสูง',
    description:
      'พบความเหนื่อยล้าสะสมในระดับสูงจากคำตอบเบื้องต้น แนะนำให้พักฟื้นพลังงานและพูดคุยเพื่อปรับสมดุลภาระงาน',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    barColor: '#E11D48',
  },
} as const;

export const DIMENSION_LABELS: Record<string, string> = {
  energy_exhaustion: 'พลังงานและความเหนื่อยล้า',
  workload_balance: 'ภาระงานและเวลาพักผ่อน',
  work_engagement: 'แรงจูงใจและความหมายของงาน',
};

export const FOLLOW_UP_STATUS_META = {
  open: {
    key: 'open',
    label: 'รอดำเนินการ',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  in_progress: {
    key: 'in_progress',
    label: 'กำลังดำเนินการ',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  done: {
    key: 'done',
    label: 'เสร็จสิ้น',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
} as const;

export const FOLLOW_UP_SUGGESTIONS = [
  {
    title: 'ทบทวนและเกลี่ยภาระงานในทีม',
    description: 'ตรวจสอบงานเร่งด่วนที่ค้างอยู่และช่วยจัดลำดับความสำคัญร่วมกับสมาชิกในทีม',
  },
  {
    title: 'จัดพูดคุยแลกเปลี่ยนในทีม (Team Check-in)',
    description: 'เปิดพื้นที่รับฟังอุปสรรคในการทำงานและสิ่งที่ทีมต้องการการสนับสนุนเพิ่มเติม',
  },
  {
    title: 'แบ่งปันแนวทางดูแลสุขภาพและการพักผ่อน',
    description: 'ส่งเสริมการพักเบรกระหว่างวันและเคารพเวลาหลังเลิกงานของสมาชิก',
  },
  {
    title: 'ปรับลดการประชุมที่ไม่จำเป็น',
    description: 'จัดช่วงเวลาโฟกัสงาน (Focus Time) ให้สมาชิกทำงานได้อย่างต่อเนื่อง',
  },
];

export const INSUFFICIENT_DATA_MESSAGE = 'ข้อมูลยังไม่เพียงพอสำหรับแสดงผล';
export const MIN_ASSESSMENT_RESPONDENTS = 5;
