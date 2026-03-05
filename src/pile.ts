import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { EventEmitter } from "events";
import type {
  CompostPile,
  CompostInput,
  TemperatureReading,
  MoistureReading,
  TurnEvent,
  MaterialType,
  ValidationError,
  AdvisorConfig,
  CompostTrackerEvents,
  CompostTrackerEventEmitter,
} from "./types";

export interface PileState {
  readonly pile: CompostPile;
  readonly currentCNRatio: number;
  readonly currentTemperature: number | null;
  readonly currentMoisture: number | null;
  readonly daysSinceLastTurn: number | null;
}

export interface AddInputOptions {
  readonly pileId: string;
  readonly materialType: MaterialType;
  readonly quantity: number;
  readonly cnRatio: number;
  readonly description?: string;
}

export interface AddReadingOptions {
  readonly pileId: string;
  readonly value: number;
  readonly timestamp?: Date;
  readonly location?: string;
  readonly method?: string;
}

export interface TurnPileOptions {
  readonly pileId: string;
  readonly notes?: string;
  readonly timestamp?: Date;
}

enum ValidationErrorType {
  InvalidQuantity = "invalid-quantity",
  InvalidCNRatio = "invalid-cn-ratio",
  InvalidTemperature = "invalid-temperature",
  InvalidMoisture = "invalid-moisture",
  MissingRequiredField = "missing-required-field",
}

export class CompostPileManager {
  private readonly piles = new Map<string, CompostPile>();
  private readonly emitter: CompostTrackerEventEmitter;
  private readonly dataDir: string;
  private readonly advisorConfig: AdvisorConfig;
  private readonly maxHistoryDays: number;

  constructor(options: {
    dataDir: string;
    advisorConfig?: Partial<AdvisorConfig>;
    maxPileHistoryDays?: number;
  }) {
    this.dataDir = options.dataDir;
    this.maxHistoryDays = options.maxPileHistoryDays ?? 365;
    this.advisorConfig = {
      turnTemperatureThreshold: 65,
      turnIntervalDays: 7,
      anaerobicMoistureThreshold: 70,
      minTemperature: 20,
      maxTemperature: 80,
      targetCNRatio: 30,
      cnRatioTolerance: 10,
      ...options.advisorConfig,
    };
    this.emitter = new EventEmitter() as CompostTrackerEventEmitter;
    this.ensureDataDir();
    this.loadPiles();
  }

  getEventEmitter(): CompostTrackerEventEmitter {
    return this.emitter;
  }

  createPile(name: string): CompostPile {
    const id = crypto.randomUUID();
    const now = new Date();
    const pile: CompostPile = {
      id,
      name,
      createdAt: now,
      inputs: [],
      temperatureReadings: [],
      moistureReadings: [],
      turnEvents: [],
    };

    this.piles.set(id, pile);
    this.savePile(pile);
    this.emitter.emit("pileAdded", pile);
    return pile;
  }

  getPile(pileId: string): CompostPile | undefined {
    return this.piles.get(pileId);
  }

  getAllPiles(): CompostPile[] {
    return Array.from(this.piles.values());
  }

  getPileState(pileId: string): PileState | undefined {
    const pile = this.piles.get(pileId);
    if (!pile) return undefined;

    const currentCNRatio = this.calculateCurrentCNRatio(pile);
    const currentTemperature = this.getLatestTemperature(pile);
    const currentMoisture = this.getLatestMoisture(pile);
    const daysSinceLastTurn = this.getDaysSinceLastTurn(pile);

    return {
      pile,
      currentCNRatio,
      currentTemperature,
      currentMoisture,
      daysSinceLastTurn,
    };
  }

  addInput(options: AddInputOptions): ValidationError[] {
    const errors: ValidationError[] = [];
    const pile = this.piles.get(options.pileId);
    if (!pile) {
      errors.push({
        type: ValidationErrorType.MissingRequiredField,
        message: `Pile with ID ${options.pileId} not found`,
        field: "pileId",
      });
      return errors;
    }

    if (options.quantity <= 0) {
      errors.push({
        type: ValidationErrorType.InvalidQuantity,
        message: `Quantity must be positive, got ${options.quantity}`,
        field: "quantity",
      });
    }

    if (options.cnRatio <= 0) {
      errors.push({
        type: ValidationErrorType.InvalidCNRatio,
        message: `C:N ratio must be positive, got ${options.cnRatio}`,
        field: "cnRatio",
      });
    }

    if (errors.length > 0) return errors;

    const input: CompostInput = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      materialType: options.materialType,
      quantity: options.quantity,
      cnRatio: options.cnRatio,
      description: options.description,
    };

    const updatedPile: CompostPile = {
      ...pile,
      inputs: [...pile.inputs, input],
    };

    this.piles.set(pile.id, updatedPile);
    this.savePile(updatedPile);
    this.emitter.emit("inputLogged", pile.id, input);
    this.emitter.emit("pileUpdated", updatedPile);
    this.checkAdvisories(updatedPile);
    return [];
  }

  addTemperatureReading(options: AddReadingOptions): ValidationError[] {
    const errors: ValidationError[] = [];
    const pile = this.piles.get(options.pileId);
    if (!pile) {
      errors.push({
        type: ValidationErrorType.MissingRequiredField,
        message: `Pile with ID ${options.pileId} not found`,
        field: "pileId",
      });
      return errors;
    }

    if (options.value < -20 || options.value > 100) {
      errors.push({
        type: ValidationErrorType.InvalidTemperature,
        message: `Temperature must be between -20°C and 100°C, got ${options.value}`,
        field: "value",
      });
    }

    if (errors.length > 0) return errors;

    const reading: TemperatureReading = {
      timestamp: options.timestamp ?? new Date(),
      value: options.value,
      location: options.location,
    };

    const updatedPile: CompostPile = {
      ...pile,
      temperatureReadings: [...pile.temperatureReadings, reading],
    };

    this.piles.set(pile.id, updatedPile);
    this.savePile(updatedPile);
    this.emitter.emit("temperatureLogged", pile.id, reading);
    this.emitter.emit("pileUpdated", updatedPile);
    this.checkAdvisories(updatedPile);
    return [];
  }

  addMoistureReading(options: AddReadingOptions): ValidationError[] {
    const errors: ValidationError[] = [];
    const pile = this.piles.get(options.pileId);
    if (!pile) {
      errors.push({
        type: ValidationErrorType.MissingRequiredField,
        message: `Pile with ID ${options.pileId} not found`,
        field: "pileId",
      });
      return errors;
    }

    if (options.value < 0 || options.value > 100) {
      errors.push({
        type: ValidationErrorType.InvalidMoisture,
        message: `Moisture must be between 0% and 100%, got ${options.value}`,
        field: "value",
      });
    }

    if (errors.length > 0) return errors;

    const reading: MoistureReading = {
      timestamp: options.timestamp ?? new Date(),
      value: options.value,
      method: options.method,
    };

    const updatedPile: CompostPile = {
      ...pile,
      moistureReadings: [...pile.moistureReadings, reading],
    };

    this.piles.set(pile.id, updatedPile);
    this.savePile(updatedPile);
    this.emitter.emit("moistureLogged", pile.id, reading);
    this.emitter.emit("pileUpdated", updatedPile);
    this.checkAdvisories(updatedPile);
    return [];
  }

  turnPile(options: TurnPileOptions): ValidationError[] {
    const errors: ValidationError[] = [];
    const pile = this.piles.get(options.pileId);
    if (!pile) {
      errors.push({
        type: ValidationErrorType.MissingRequiredField,
        message: `Pile with ID ${options.pileId} not found`,
        field: "pileId",
      });
      return errors;
    }

    const event: TurnEvent = {
      timestamp: options.timestamp ?? new Date(),
      notes: options.notes,
    };

    const updatedPile: CompostPile = {
      ...pile,
      turnEvents: [...pile.turnEvents, event],
    };

    this.piles.set(pile.id, updatedPile);
    this.savePile(updatedPile);
    this.emitter.emit("pileTurned", pile.id, event);
    this.emitter.emit("pileUpdated", updatedPile);
    return [];
  }

  private calculateCurrentCNRatio(pile: CompostPile): number {
    if (pile.inputs.length === 0) return 0;

    let totalCarbon = 0;
    let totalNitrogen = 0;

    for (const input of pile.inputs) {
      const carbon = input.quantity * (input.cnRatio / (input.cnRatio + 1));
      const nitrogen = input.quantity / (input.cnRatio + 1);
      totalCarbon += carbon;
      totalNitrogen += nitrogen;
    }

    return totalNitrogen > 0 ? totalCarbon / totalNitrogen : 0;
  }

  private getLatestTemperature(pile: CompostPile): number | null {
    if (pile.temperatureReadings.length === 0) return null;
    const sorted = [...pile.temperatureReadings].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    return sorted[0].value;
  }

  private getLatestMoisture(pile: CompostPile): number | null {
    if (pile.moistureReadings.length === 0) return null;
    const sorted = [...pile.moistureReadings].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    return sorted[0].value;
  }

  private getDaysSinceLastTurn(pile: CompostPile): number | null {
    if (pile.turnEvents.length === 0) return null;
    const sorted = [...pile.turnEvents].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    const lastTurn = sorted[0].timestamp;
    const now = new Date();
    const diffMs = now.getTime() - lastTurn.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private checkAdvisories(pile: CompostPile): void {
    const state = this.getPileState(pile.id);
    if (!state) return;

    const { currentTemperature, currentMoisture, currentCNRatio, daysSinceLastTurn } = state;

    if (currentTemperature !== null) {
      if (currentTemperature > this.advisorConfig.turnTemperatureThreshold) {
        this.emitter.emit(
          "advisoryTriggered",
          pile.id,
          `Temperature ${currentTemperature}°C exceeds turn threshold of ${this.advisorConfig.turnTemperatureThreshold}°C`
        );
      }
      if (currentTemperature < this.advisorConfig.minTemperature) {
        this.emitter.emit(
          "advisoryTriggered",
          pile.id,
          `Temperature ${currentTemperature}°C below minimum of ${this.advisorConfig.minTemperature}°C - pile may be stalled`
        );
      }
      if (currentTemperature > this.advisorConfig.maxTemperature) {
        this.emitter.emit(
          "advisoryTriggered",
          pile.id,
          `Temperature ${currentTemperature}°C exceeds maximum of ${this.advisorConfig.maxTemperature}°C - may kill microbes`
        );
      }
    }

    if (currentMoisture !== null && currentMoisture > this.advisorConfig.anaerobicMoistureThreshold) {
      this.emitter.emit(
        "advisoryTriggered",
        pile.id,
        `Moisture ${currentMoisture}% exceeds anaerobic threshold of ${this.advisorConfig.anaerobicMoistureThreshold}%`
      );
    }

    const target = this.advisorConfig.targetCNRatio;
    const tolerance = this.advisorConfig.cnRatioTolerance;
    if (Math.abs(currentCNRatio - target) > tolerance) {
      this.emitter.emit(
        "advisoryTriggered",
        pile.id,
        `C:N ratio ${currentCNRatio.toFixed(1)} is outside target range ${target} ± ${tolerance}`
      );
    }

    if (daysSinceLastTurn !== null && daysSinceLastTurn > this.advisorConfig.turnIntervalDays) {
      this.emitter.emit(
        "advisoryTriggered",
        pile.id,
        `Last turn was ${daysSinceLastTurn} days ago, exceeding interval of ${this.advisorConfig.turnIntervalDays} days`
      );
    }
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private getPileFilePath(pileId: string): string {
    return path.join(this.dataDir, `pile-${pileId}.json`);
  }

  private savePile(pile: CompostPile): void {
    const filePath = this.getPileFilePath(pile.id);
    const data = JSON.stringify(pile, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
    fs.writeFileSync(filePath, data, "utf-8");
  }

  private loadPiles(): void {
    if (!fs.existsSync(this.dataDir)) return;

    const files = fs.readdirSync(this.dataDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.maxHistoryDays);

    for (const file of files) {
      if (!file.startsWith("pile-") || !file.endsWith(".json")) continue;

      try {
        const filePath = path.join(this.dataDir, file);
        const data = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(data, (key, value) => {
          if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
            return new Date(value);
          }
          return value;
        }) as CompostPile;

        if (parsed.createdAt < cutoffDate) {
          fs.unlinkSync(filePath);
          continue;
        }

        this.piles.set(parsed.id, parsed);
      } catch {
        // Skip corrupted files
      }
    }
  }
}