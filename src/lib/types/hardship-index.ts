export type HardshipIndexWindowParam = "7d" | "14d" | "30d" | "all";

export interface HardshipCheckpointDriver {
  checkpoint_id: number;
  checkpoint_name: string;
  score: number;
  closure_rate: number;
  congestion_rate: number;
  volatility_score: number;
}

export interface HardshipCityRow {
  city: string;
  population: number;
  score: number;
  severity: string;
  trend: number;
  confidence: string;
  sample_count: number;
  top_drivers: HardshipCheckpointDriver[];
  experimental_relative_burden: number;
}

export interface HardshipRegionRow {
  region: string;
  score: number;
  population_weighted_score: number;
  worst_city: string;
}

export interface HardshipSummary {
  worst_city: string;
  most_volatile_checkpoint: string;
  highest_closure_checkpoint: string;
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
