import type {
  MapCheckpoint,
  NormalizedCheckpointForecast,
  NormalizedCheckpointPrediction,
  NormalizedCheckpointTravelWindow,
  NormalizedRoutes,
  RoutePoint,
  UserLocation,
} from "@/lib/types/map";

export type NaturalLanguageIntentKind = "route" | "checkpoint";

export type NaturalLanguageCheckpointDirection =
  | "entering"
  | "leaving"
  | "both"
  | "unknown";

export interface NaturalLanguageIntentEntities {
  checkpointId: string | null;
  originCity: string | null;
  destinationCity: string | null;
  checkpointName: string | null;
  checkpointDirection: NaturalLanguageCheckpointDirection;
  wantsSimulation: boolean;
  sourceHint: string | null;
}

export interface ParsedNaturalLanguageIntent {
  kind: NaturalLanguageIntentKind;
  confidence: number;
  time: string | null;
  entities: NaturalLanguageIntentEntities;
  needsClarification: boolean;
}

export interface RouteSimulationWindow {
  label: string;
  departAt: string;
  offsetMinutes: number;
  routes: NormalizedRoutes;
}

export interface NaturalLanguageRouteResolution {
  origin: RoutePoint;
  destination: RoutePoint;
  originLabel: string;
  destinationLabel: string;
  departAt: string | null;
  route: NormalizedRoutes;
  simulations: RouteSimulationWindow[];
}

export interface NaturalLanguageCheckpointPrediction {
  checkpoint: MapCheckpoint;
  request: {
    checkpointId: string;
    targetDateTime: string | null;
    statusType: "entering" | "leaving";
  };
  prediction: NormalizedCheckpointPrediction["prediction"];
}

export interface NaturalLanguageCheckpointTravelWindow {
  checkpoint: MapCheckpoint;
  request: {
    checkpointId: string;
    asOf: string | null;
  };
  travelWindow: NormalizedCheckpointTravelWindow;
}

export interface NaturalLanguageCheckpointResolution {
  checkpoint: MapCheckpoint;
  mode: "predict" | "forecast" | "travel-window" | "status";
  targetDateTime: string | null;
  referenceTime: string | null;
  currentStatusLabel: string;
  predictions: NaturalLanguageCheckpointPrediction[];
  forecast: NormalizedCheckpointForecast | null;
  travelWindow: NormalizedCheckpointTravelWindow | null;
}

export interface NaturalLanguageRouteExecution {
  kind: "route";
  prompt: string;
  parse: ParsedNaturalLanguageIntent;
  resolution: NaturalLanguageRouteResolution;
}

export interface NaturalLanguageCheckpointExecution {
  kind: "checkpoint";
  prompt: string;
  parse: ParsedNaturalLanguageIntent;
  resolution: NaturalLanguageCheckpointResolution;
}

export interface NaturalLanguageClarification {
  kind: "clarification";
  prompt: string;
  parse: ParsedNaturalLanguageIntent;
  message: string;
}

export interface NaturalLanguageFailure {
  kind: "error";
  prompt: string;
  message: string;
}

export type NaturalLanguageExecution =
  | NaturalLanguageRouteExecution
  | NaturalLanguageCheckpointExecution
  | NaturalLanguageClarification
  | NaturalLanguageFailure;

export interface NaturalLanguageRequestInput {
  text: string;
  currentLocation: UserLocation | null;
}
