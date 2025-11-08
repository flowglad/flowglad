export type UsageMeterSlug = 'fast_generations' | 'hd_video_minutes';

export type PlanUsageTotals = Record<UsageMeterSlug, number>;

export const PLAN_USAGE_TOTALS: Record<string, PlanUsageTotals> = {
  free: {
    fast_generations: 0,
    hd_video_minutes: 0,
  },
  basic_monthly: {
    fast_generations: 200,
    hd_video_minutes: 0,
  },
  basic_yearly: {
    fast_generations: 200,
    hd_video_minutes: 0,
  },
  standard_monthly: {
    fast_generations: 360,
    hd_video_minutes: 30,
  },
  standard_yearly: {
    fast_generations: 360,
    hd_video_minutes: 30,
  },
  pro_monthly: {
    fast_generations: 750,
    hd_video_minutes: 60,
  },
  pro_yearly: {
    fast_generations: 750,
    hd_video_minutes: 60,
  },
  mega_monthly: {
    fast_generations: 900,
    hd_video_minutes: 120,
  },
  mega_yearly: {
    fast_generations: 900,
    hd_video_minutes: 120,
  },
};

export function getUsageTotalForPlan(
  planSlug: string,
  usageMeterSlug: UsageMeterSlug
): number {
  const totals = PLAN_USAGE_TOTALS[planSlug];
  return totals ? (totals[usageMeterSlug] ?? 0) : 0;
}
