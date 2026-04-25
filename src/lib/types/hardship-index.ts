export type HardshipIndexWindowParam = "7d" | "14d" | "30d" | "all";
export type HardshipSeverity = "low" | "moderate" | "high" | "severe" | null;
export type HardshipConfidence = "low" | "medium" | "high";

export interface HardshipCheckpointDriver {
  checkpoint_id: number;
  checkpoint_name: string;
  score: number;
  sample_count: number;
  closure_rate: number;
  congestion_rate: number;
  volatility_score: number;
  impact_score: number;
}

export interface HardshipCityScoreComponents {
  sample_weighted_checkpoint_score: number | null;
  top_driver_mean_score: number | null;
  peak_checkpoint_score: number | null;
  distressed_checkpoint_ratio: number | null;
  active_checkpoint_count: number | null;
  top_driver_count: number | null;
}

export interface HardshipCityRow {
  city: string;
  population: number | null;
  score: number | null;
  severity: HardshipSeverity;
  trend: number | null;
  confidence: HardshipConfidence;
  sample_count: number;
  active_checkpoint_count: number;
  total_checkpoint_count: number;
  coverage_ratio: number;
  score_components: HardshipCityScoreComponents;
  top_drivers: HardshipCheckpointDriver[];
  experimental_relative_burden: number | null;
}

export interface HardshipRegionScoreComponents {
  city_average_score: number | null;
  population_weighted_score: number | null;
  peak_city_score: number | null;
}

export interface HardshipRegionRow {
  region: string;
  score: number | null;
  population_weighted_score: number | null;
  severity: HardshipSeverity;
  worst_city: string | null;
  city_count: number;
  active_city_count: number;
  score_components: HardshipRegionScoreComponents;
}

export interface HardshipSummary {
  worst_city: string | null;
  most_volatile_checkpoint: string | null;
  highest_closure_checkpoint: string | null;
  total_experimental_relative_burden: number;
}

export interface HardshipIndexPayload {
  generated_at: string;
  window: string;
  window_days: number | null;
  cities: HardshipCityRow[];
  regions: HardshipRegionRow[];
  summary: HardshipSummary;
}
