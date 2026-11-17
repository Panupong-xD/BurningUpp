import { describe, expect, it } from 'vitest';
import {
  buildTeamObservations,
  canDisplayAggregateAssessment,
  computeSampleAssessmentResult,
  type SampleScoringQuestion,
} from '@/lib/wellbeing';
import {
  createWorkspaceSchema,
  followUpSchema,
  moodCheckinSchema,
  registerSchema,
} from '@/lib/validation';
import { INSUFFICIENT_DATA_MESSAGE } from '@/lib/constants';
import type { TeamWellbeingInsights } from '@/types/database';

const SAMPLE_QUESTIONS: SampleScoringQuestion[] = [
  { id: 'q1', question_order: 1, category: 'energy_exhaustion' },
  { id: 'q2', question_order: 2, category: 'energy_exhaustion' },
  { id: 'q3', question_order: 3, category: 'energy_exhaustion' },
  { id: 'q4', question_order: 4, category: 'workload_balance' },
  { id: 'q5', question_order: 5, category: 'workload_balance' },
  { id: 'q6', question_order: 6, category: 'workload_balance' },
  { id: 'q7', question_order: 7, category: 'work_engagement' },
  { id: 'q8', question_order: 8, category: 'work_engagement' },
  { id: 'q9', question_order: 9, category: 'work_engagement' },
];

describe('Burning Upp — Unit Tests (Scoring, Privacy Safeguards & Validation)', () => {
  it('computes sample burnout assessment scores and summary_level accurately', () => {
    const lowStrainAnswers = {
      q1: 2,
      q2: 2,
      q3: 1,
      q4: 2,
      q5: 2,
      q6: 2,
      q7: 1,
      q8: 2,
      q9: 2,
    };
    const lowResult = computeSampleAssessmentResult(
      SAMPLE_QUESTIONS,
      lowStrainAnswers
    );
    expect(lowResult.overall_score).toBe(1.78);
    expect(lowResult.summary_level).toBe('balanced');
    expect(lowResult.dimension_scores.energy_exhaustion).toBe(1.67);
    expect(lowResult.dimension_scores.workload_balance).toBe(2);

    const highStrainAnswers = {
      q1: 4,
      q2: 5,
      q3: 4,
      q4: 4,
      q5: 4,
      q6: 3,
      q7: 4,
      q8: 4,
      q9: 4,
    };
    const highResult = computeSampleAssessmentResult(
      SAMPLE_QUESTIONS,
      highStrainAnswers
    );
    expect(highResult.overall_score).toBe(4);
    expect(highResult.summary_level).toBe('high_strain');
  });

  it('enforces minimum group size of 5 respondents before displaying aggregate assessment results', () => {
    const under5 = canDisplayAggregateAssessment(4, 5);
    expect(under5.allowed).toBe(false);
    expect(under5.message).toBe(INSUFFICIENT_DATA_MESSAGE);

    const exact5 = canDisplayAggregateAssessment(5, 5);
    expect(exact5.allowed).toBe(true);
    expect(exact5.message).toBeNull();
  });

  it('validates input schemas for registration, workspace creation, mood check-in, and follow-up', () => {
    expect(
      registerSchema.safeParse({
        fullName: 'สมชาย ใจดี',
        email: 'somchai@example.com',
        password: 'password123',
      }).success
    ).toBe(true);

    expect(
      createWorkspaceSchema.safeParse({
        workspaceName: 'Workspace Alpha',
        firstTeamName: 'Team A',
      }).success
    ).toBe(true);

    expect(
      moodCheckinSchema.safeParse({
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        entryDate: '2026-11-17',
        moodLevel: 4,
        factors: ['workload', 'sleep'],
        privateNote: 'บันทึกส่วนตัวของฉัน',
      }).success
    ).toBe(true);

    expect(
      followUpSchema.safeParse({
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        teamId: '550e8400-e29b-41d4-a716-446655440001',
        title: 'ทบทวนภาระงานในทีม',
        status: 'open',
      }).success
    ).toBe(true);
  });

  it('generates contextual observations without labeling individuals or treating missing data as neutral', () => {
    const sampleInsights: TeamWellbeingInsights = {
      period_days: 14,
      start_date: '2026-11-04',
      end_date: '2026-11-17',
      member_count: 6,
      mood: {
        today_checkins: 4,
        period_participants: 5,
        total_checkins: 12,
        participation_rate: 83.3,
        avg_mood: 2.9,
        prev_avg_mood: 3.6,
        distribution: {
          level_1: 1,
          level_2: 3,
          level_3: 5,
          level_4: 2,
          level_5: 1,
        },
        trend: [],
        factor_counts: { workload: 7, sleep: 3 },
      },
      assessment: {
        is_sufficient: false,
        min_required: 5,
        respondent_count: 3,
        member_count: 6,
        completion_rate: 50,
        insufficient_message: INSUFFICIENT_DATA_MESSAGE,
        overall_score: null,
        prev_overall_score: null,
        dimension_scores: null,
        level_distribution: null,
      },
    };

    const obs = buildTeamObservations(sampleInsights);
    expect(obs.some((o) => o.id === 'mood-drop')).toBe(true);
    expect(obs.some((o) => o.id === 'top-factor')).toBe(true);
    expect(obs.some((o) => o.id === 'assessment-insufficient')).toBe(true);
  });
});
