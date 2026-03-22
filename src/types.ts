import type { EventEmitter } from "events";

export enum MaterialType {
  GrassClippings = "grass_clippings",
  VegetableScraps = "vegetable_scraps",
  FruitWaste = "fruit_waste",
  CoffeeGrounds = "coffee_grounds",
  FreshManure = "fresh_manure",
  DryLeaves = "dry_leaves",
  Straw = "straw",
  Sawdust = "sawdust",
  ShreddedPaper = "shredded_paper",
  WoodChips = "wood_chips",
}

export const MaterialCNRatios: Record<MaterialType, { min: number; max: number; default: number }> = {
  [MaterialType.GrassClippings]: { min: 15, max: 25, default: 20 },
  [MaterialType.VegetableScraps]: { min: 12, max: 20, default: 15 },
  [MaterialType.FruitWaste]: { min: 25, max: 40, default: 35 },
  [MaterialType.CoffeeGrounds]: { min: 20, max: 25, default: 20 },
  [MaterialType.FreshManure]: { min: 10, max: 20, default: 15 },
  [MaterialType.DryLeaves]: { min: 40, max: 80, default: 60 },
  [MaterialType.Straw]: { min: 50, max: 100, default: 75 },
  [MaterialType.Sawdust]: { min: 200, max: 600, default: 400 },
  [MaterialType.ShreddedPaper]: { min: 150, max: 200, default: 175 },
  [MaterialType.WoodChips]: { min: 400, max: 700, default: 600 },
};

/**
 * Defines a custom compostable material with specific C:N ratio constraints.
 * Allows users to extend beyond the predefined MaterialType list.
 */
export interface CustomMaterial {
  /** Display name for the custom material */
  name: string;
  /** C:N ratio constraints for this material */
  cnRatio: {
    min: number;
    max: number;
    default: number;
  };
  /** Category for general classification */
  category: 'green' | 'brown' | 'other';
}

export interface CompostInput {
  id: string;
  timestamp: Date;
  materialType: MaterialType | string;
  quantity: number;
  cnRatio: number;
  description?: string;
  /** Stored definition if this is a custom material */
  customMaterial?: CustomMaterial;
}

export interface CompostPile {
  id: string;
  name: string;
  createdAt: Date;
  inputs: CompostInput[];
  temperatureReadings: TemperatureReading[];
  moistureReadings: MoistureReading[];
  turnEvents: TurnEvent[];
  targetCNRatio: number;
}

export interface TemperatureReading {
  id: string;
  timestamp: Date;
  value: number;
  depth?: number;
}

export interface MoistureReading {
  id: string;
  timestamp: Date;
  value: number;
}

export interface TurnEvent {
  id: string;
  timestamp: Date;
  notes?: string;
}

export enum ValidationErrorType {
  InvalidCNRatio = "invalid_cn_ratio",
  InvalidQuantity = "invalid_quantity",
  PileNotFound = "pile_not_found",
  InvalidMaterialType = "invalid_material_type",
}

export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  field: string;
}

export interface AdvisorConfig {
  turnTemperatureThreshold: number;
  turnIntervalDays: number;
  anaerobicMoistureThreshold: number;
  minTemperature: number;
  maxTemperature: number;
  targetCNRatio: number;
  cnRatioTolerance: number;
}

export interface PredictionResult {
  estimatedCompletionDate: Date;
  confidenceScore: number;
  factors: string[];
}

export interface PileSummary {
  id: string;
  name: string;
  currentCNRatio: number;
  lastTemperature: number | null;
  lastMoisture: number | null;
  daysActive: number;
}

export interface CompostTrackerEvents {
  inputAdded: { pileId: string; input: CompostInput };
  readingAdded: { pileId: string; reading: TemperatureReading | MoistureReading };
  pileTurned: { pileId: string; event: TurnEvent };
}

export interface CompostTrackerOptions {
  targetCNRatio?: number;
  idealMoistureRange?: { min: number; max: number };
  idealTemperatureRange?: { min: number; max: number };
}

export type CompostTrackerEventEmitter = EventEmitter;
