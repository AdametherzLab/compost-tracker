import type { EventEmitter } from "events";

export enum MaterialType {
  Green = "green",
  Brown = "brown",
}

export enum ValidationErrorType {
  InvalidQuantity = "invalid-quantity",
  InvalidCNRatio = "invalid-cn-ratio",
  InvalidTemperature = "invalid-temperature",
  InvalidMoisture = "invalid-moisture",
  MissingRequiredField = "missing-required-field",
}

export interface ValidationError {
  readonly type: ValidationErrorType;
  readonly message: string;
  readonly field?: string;
}

export interface CompostInput {
  readonly id: string;
  readonly timestamp: Date;
  readonly materialType: MaterialType;
  readonly quantity: number; // in kilograms
  readonly cnRatio: number; // carbon-to-nitrogen ratio
  readonly description?: string;
}

export interface CompostPile {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly inputs: readonly CompostInput[];
  readonly temperatureReadings: readonly TemperatureReading[];
  readonly moistureReadings: readonly MoistureReading[];
  readonly turnEvents: readonly TurnEvent[];
}

export interface TemperatureReading {
  readonly timestamp: Date;
  readonly value: number; // in degrees Celsius
  readonly location?: string; // e.g., "center", "north side"
}

export interface MoistureReading {
  readonly timestamp: Date;
  readonly value: number; // percentage, 0-100
  readonly method?: string; // e.g., "squeeze test", "meter"
}

export interface TurnEvent {
  readonly timestamp: Date;
  readonly notes?: string;
}

export interface AdvisorConfig {
  readonly turnTemperatureThreshold: number; // °C, turn when above
  readonly turnIntervalDays: number; // days, turn at least this often
  readonly anaerobicMoistureThreshold: number; // %, above this risks anaerobic
  readonly minTemperature: number; // °C, below this indicates stalled
  readonly maxTemperature: number; // °C, above this may kill microbes
  readonly targetCNRatio: number; // ideal C:N ratio
  readonly cnRatioTolerance: number; // acceptable deviation from target
}

export interface PredictionResult {
  readonly estimatedCompletionDate: Date;
  readonly confidenceScore: number; // 0-1
  readonly factors: readonly string[];
}

export interface PileSummary {
  readonly pileId: string;
  readonly pileName: string;
  readonly currentCNRatio: number;
  readonly currentTemperature: number | null;
  readonly currentMoisture: number | null;
  readonly daysSinceLastTurn: number | null;
  readonly estimatedDaysRemaining: number | null;
}

export interface CompostTrackerEvents {
  pileAdded: (pile: CompostPile) => void;
  pileUpdated: (pile: CompostPile) => void;
  inputLogged: (pileId: string, input: CompostInput) => void;
  temperatureLogged: (pileId: string, reading: TemperatureReading) => void;
  moistureLogged: (pileId: string, reading: MoistureReading) => void;
  pileTurned: (pileId: string, event: TurnEvent) => void;
  advisoryTriggered: (pileId: string, message: string) => void;
}

export interface CompostTrackerEventEmitter extends EventEmitter {
  on<T extends keyof CompostTrackerEvents>(
    event: T,
    listener: CompostTrackerEvents[T]
  ): this;
  emit<T extends keyof CompostTrackerEvents>(
    event: T,
    ...args: Parameters<CompostTrackerEvents[T]>
  ): boolean;
}

export interface CompostTrackerOptions {
  readonly dataDir: string;
  readonly advisorConfig?: Partial<AdvisorConfig>;
  readonly maxPileHistoryDays?: number;
}