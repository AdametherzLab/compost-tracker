export type { CompostTrackerEventEmitter, CompostTrackerEvents, CompostTrackerOptions } from "./types.js";
export type { PileState, AddInputOptions, AddReadingOptions, TurnPileOptions } from "./pile.js";
export type { AdvisorAnalysis, DegreeDayAccumulator } from "./advisor.js";

export { MaterialType, ValidationErrorType } from "./types.js";
export type { 
  ValidationError, 
  CompostInput, 
  CompostPile, 
  TemperatureReading, 
  MoistureReading, 
  TurnEvent, 
  AdvisorConfig, 
  PredictionResult, 
  PileSummary,
  CustomMaterial 
} from "./types.js";

export { CompostPileManager } from "./pile.js";
export { CompostAdvisor } from "./advisor.js";
