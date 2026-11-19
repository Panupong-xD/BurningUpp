import {
  INSUFFICIENT_DATA_MESSAGE,
  MIN_ASSESSMENT_RESPONDENTS,
  MOOD_FACTOR_MAP,
  MOOD_LEVEL_MAP,
} from './constants';
import type { TeamWellbeingInsights } from '@/types/database';

export interface SampleScoringQuestion {
  id: string;
  question_order: number;
  category: 'energy_exhaustion' | 'workload_balance' | 'work_engagement';
}

export interface ComputedSampleAssessment {
  overall_score: number;
  dimension_scores: {
    energy_exhaustion: number;
    workload_balance: number;
    work_engagement: number;
  };
  summary_level: 'balanced' | 'moderate_strain' | 'high_strain';
}

/**
 * Computes sample (non-clinical) burnout assessment scores from user answers.
 * Scale is 1.00 to 5.00 where 1 = lowest strain and 5 = highest strain.
 */
export function computeSampleAssessmentResult(
  questions: SampleScoringQuestion[],
  answers: Record<string, number>
): ComputedSampleAssessment {
  if (questions.length === 0) {
    throw new Error('ไม่พบชุดคำถามสำหรับคำนวณผล');
  }

  let totalSum = 0;
  let energySum = 0;
  let energyCount = 0;
  let workloadSum = 0;
  let workloadCount = 0;
  let engageSum = 0;
  let engageCount = 0;

  for (const q of questions) {
    const val = answers[q.id] ?? answers[String(q.question_order)];
    if (typeof val !== 'number' || val < 1 || val > 5) {
      throw new Error(`กรุณาตอบคำถามข้อที่ ${q.question_order} ให้ครบถ้วน`);
    }

    totalSum += val;
    if (q.category === 'energy_exhaustion') {
      energySum += val;
      energyCount += 1;
    } else if (q.category === 'workload_balance') {
      workloadSum += val;
      workloadCount += 1;
    } else if (q.category === 'work_engagement') {
      engageSum += val;
      engageCount += 1;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const overall_score = round2(totalSum / questions.length);

  const summary_level: 'balanced' | 'moderate_strain' | 'high_strain' =
    overall_score < 2.4
      ? 'balanced'
      : overall_score < 3.5
      ? 'moderate_strain'
      : 'high_strain';

  return {
    overall_score,
    dimension_scores: {
      energy_exhaustion: energyCount > 0 ? round2(energySum / energyCount) : 0,
      workload_balance:
        workloadCount > 0 ? round2(workloadSum / workloadCount) : 0,
      work_engagement: engageCount > 0 ? round2(engageSum / engageCount) : 0,
    },
    summary_level,
  };
}

/**
 * Enforces the minimum group size privacy rule (>= 5 respondents).
 */
export function canDisplayAggregateAssessment(
  respondentCount: number,
  workspaceMinGroupSize: number = MIN_ASSESSMENT_RESPONDENTS
): { allowed: boolean; minRequired: number; message: string | null } {
  const minRequired = Math.max(
    MIN_ASSESSMENT_RESPONDENTS,
    workspaceMinGroupSize || MIN_ASSESSMENT_RESPONDENTS
  );
  if (respondentCount < minRequired) {
    return {
      allowed: false,
      minRequired,
      message: INSUFFICIENT_DATA_MESSAGE,
    };
  }
  return {
    allowed: true,
    minRequired,
    message: null,
  };
}

export interface LeaderActionableInsight {
  id: string;
  tone: 'info' | 'positive' | 'attention';
  title: string;
  description: string;
}

/**
 * Generates contextual, non-diagnostic team observations from real aggregate data.
 * Never labels individual members as high-risk or evaluates employee performance.
 */
export function buildTeamObservations(
  insights: TeamWellbeingInsights
): LeaderActionableInsight[] {
  const items: LeaderActionableInsight[] = [];

  // 1. Mood trend comparison
  if (insights.mood.avg_mood !== null) {
    const moodMeta =
      MOOD_LEVEL_MAP[Math.round(insights.mood.avg_mood)] ?? MOOD_LEVEL_MAP[3];

    if (insights.mood.prev_avg_mood !== null) {
      const diff =
        Math.round((insights.mood.avg_mood - insights.mood.prev_avg_mood) * 100) /
        100;
      if (diff <= -0.3) {
        items.push({
          id: 'mood-drop',
          tone: 'attention',
          title: 'แนวโน้มอารมณ์ของทีมลดลงเมื่อเทียบกับช่วงก่อนหน้า',
          description: `ค่าเฉลี่ยอารมณ์ของทีมอยู่ที่ ${insights.mood.avg_mood.toFixed(
            2
          )} / 5 (${moodMeta.label}) ลดลง ${Math.abs(diff).toFixed(
            2
          )} คะแนนจากช่วงก่อนหน้า แนะนำให้เปิดพื้นที่รับฟังภาระงานหรืออุปสรรคในการทำงานของทีม`,
        });
      } else if (diff >= 0.3) {
        items.push({
          id: 'mood-rise',
          tone: 'positive',
          title: 'แนวโน้มอารมณ์ของทีมปรับตัวดีขึ้นจากช่วงก่อนหน้า',
          description: `ค่าเฉลี่ยอารมณ์ของทีมอยู่ที่ ${insights.mood.avg_mood.toFixed(
            2
          )} / 5 เพิ่มขึ้น +${diff.toFixed(
            2
          )} คะแนนเมื่อเทียบกับช่วงก่อนหน้า`,
        });
      } else {
        items.push({
          id: 'mood-stable',
          tone: 'info',
          title: 'แนวโน้มอารมณ์ของทีมอยู่ในระดับใกล้เคียงกับช่วงก่อนหน้า',
          description: `ค่าเฉลี่ยอารมณ์ของทีมอยู่ที่ ${insights.mood.avg_mood.toFixed(
            2
          )} / 5 (${moodMeta.label}) โดยมีความต่อเนื่องสม่ำเสมอ`,
        });
      }
    } else {
      items.push({
        id: 'mood-current',
        tone: insights.mood.avg_mood < 2.8 ? 'attention' : 'info',
        title: `ภาพรวมอารมณ์ของทีมอยู่ในระดับ "${moodMeta.label}" (${insights.mood.avg_mood.toFixed(
          2
        )} / 5)`,
        description: `คำนวณจากการเช็กอินทั้งหมด ${insights.mood.total_checkins} ครั้ง ในช่วง ${insights.period_days} วันที่ผ่านมา`,
      });
    }
  } else {
    items.push({
      id: 'mood-empty',
      tone: 'info',
      title: 'ยังไม่มีการบันทึกอารมณ์ในช่วงเวลานี้',
      description:
        'ระบบจะไม่นับวันที่ไม่มีการเช็กอินเป็นอารมณ์ปกติ แนะนำให้เชิญชวนสมาชิกบันทึกอารมณ์สั้นๆ ประจำวัน',
    });
  }

  // 2. Top reported workplace factor
  const factorEntries = Object.entries(insights.mood.factor_counts || {}).sort(
    (a, b) => b[1] - a[1]
  );
  if (factorEntries.length > 0 && factorEntries[0][1] > 0) {
    const [topKey, topCount] = factorEntries[0];
    const factorLabel = MOOD_FACTOR_MAP[topKey]?.label ?? topKey;
    items.push({
      id: 'top-factor',
      tone: 'info',
      title: `ปัจจัยที่สมาชิกเลือกบ่อยที่สุดคือ "${factorLabel}"`,
      description: `ถูกระบุทั้งหมด ${topCount} ครั้งในการเช็กอินช่วงนี้ สามารถใช้เป็นหัวข้อเริ่มต้นในการพูดคุยดูแลทีม`,
    });
  }

  // 3. Assessment participation & privacy threshold
  if (!insights.assessment.is_sufficient) {
    const remaining = Math.max(
      0,
      insights.assessment.min_required - insights.assessment.respondent_count
    );
    items.push({
      id: 'assessment-insufficient',
      tone: 'info',
      title: 'ต้องการผู้ทำแบบประเมินเพิ่มก่อนแสดงผลสรุประดับทีม',
      description: `ขณะนี้มีผู้ส่งแบบประเมินแล้ว ${insights.assessment.respondent_count} คน ต้องมีอย่างน้อย ${insights.assessment.min_required} คน (ขาดอีก ${remaining} คน) เพื่อคุ้มครองความเป็นส่วนตัวของสมาชิก`,
    });
  } else if (insights.assessment.overall_score !== null) {
    if (insights.assessment.overall_score >= 3.5) {
      items.push({
        id: 'assessment-high-strain',
        tone: 'attention',
        title: 'ผลสำรวจระดับทีมสะท้อนความเหนื่อยล้าสะสมค่อนข้างสูง',
        description: `คะแนนเฉลี่ยความเหนื่อยล้าของทีมอยู่ที่ ${insights.assessment.overall_score.toFixed(
          2
        )} / 5 แนะนำให้ทบทวนภาระงานและวางกิจกรรมดูแลทีมในเมนูการติดตามผล`,
      });
    } else if (insights.assessment.overall_score >= 2.4) {
      items.push({
        id: 'assessment-moderate-strain',
        tone: 'info',
        title: 'ผลสำรวจระดับทีมพบความตึงเครียดปานกลาง',
        description: `คะแนนเฉลี่ยอยู่ที่ ${insights.assessment.overall_score.toFixed(
          2
        )} / 5 ควรติดตามสมดุลภาระงานและเวลาพักผ่อนอย่างต่อเนื่อง`,
      });
    } else {
      items.push({
        id: 'assessment-balanced',
        tone: 'positive',
        title: 'ผลสำรวจระดับทีมอยู่ในเกณฑ์สมดุลดี',
        description: `คะแนนเฉลี่ยความเหนื่อยล้าอยู่ที่ ${insights.assessment.overall_score.toFixed(
          2
        )} / 5 จากผู้ตอบแบบประเมิน ${insights.assessment.respondent_count} คน`,
      });
    }
  }

  return items;
}

function parseDateSafe(dateStr: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // Anchor date-only strings to noon Bangkok time to avoid off-by-one UTC shifts
    const d = new Date(`${dateStr}T12:00:00+07:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatThaiDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = parseDateSafe(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  });
}

export function formatThaiShortDate(dateStr: string): string {
  const d = parseDateSafe(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Bangkok',
  });
}

export function getBangkokIsoDateOffset(daysOffset: number = 0): string {
  const now = new Date();
  const offsetMs = 7 * 60 * 60 * 1000; // Asia/Bangkok UTC+7
  const bangkok = new Date(now.getTime() + offsetMs + daysOffset * 86400000);
  return bangkok.toISOString().slice(0, 10);
}

export function getTodayIsoDate(): string {
  return getBangkokIsoDateOffset(0);
}
