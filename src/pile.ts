import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  MaterialType,
  ValidationErrorType,
  type CompostPile,
  type CompostInput,
  type TemperatureReading,
  type MoistureReading,
  type TurnEvent,
  type AdvisorConfig,
  type CompostTrackerEvents,
  type CompostTrackerEventEmitter,
  type ValidationError,
} from './types';

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
    this.emitter.emit('pileAdded', pile);
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
        field: 'pileId',
      });
      return errors;
    }

    if (options.quantity <= 0) {
      errors.push({
        type: ValidationErrorType.InvalidQuantity,
        message: `Quantity must be positive, got ${options.quantity}`,
        field: 'quantity',
      });
    }

    if (options.cnRatio <= 0) {
      errors.push({
        type: ValidationErrorType.InvalidCNRatio,
        message: `C:N ratio must be positive, got ${options.cnRatio}`,
        field: 'cnRatio',
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
    this.emitter.emit('inputLogged', pile.id, input);
    this.emitter.emit('pileUpdated', updatedPile);
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
        field: 'pileId',
      });
      return errors;
    }

    if (options.value < -20 || options.value > 100) {
      errors.push({
        type: ValidationErrorType.InvalidTemperature,
        message: `Temperature must be between -20°C and 100°C, got ${options.value}°C`,
        field: 'value',
      });
    }

    if (errors.length > 0) return errors;

    const reading: TemperatureReading = {
      timestamp: new Date(),
      value: options.value,
      location: options.location,
    };

    const updatedPile: CompostPile = {
      ...pile,
      temperatureReadings: [...pile.temperatureReadings, reading],
    };

    this.piles.set(pile.id, updatedPile);
    this.savePile(updatedPile);
    this.emitter.emit('temperatureLogged', pile.id, reading);
    this.emitter.emit('pileUpdated', updatedPile);
    this.checkAdvisories(updatedPile);
    return [];
  }

  private ensureDataDir() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
    } catch (err) {
      console.error(`Failed to create data directory: ${this.dataDir}`, err);
    }
  }

  private loadPiles() {
    try {
      const files = fs.readdirSync(this.dataDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(this.dataDir, file);
        
        try {
          const data = fs.readFileSync(filePath, 'utf8');
          const pile = JSON.parse(data, (key, value) => {
            if (key === 'createdAt' || key === 'timestamp') return new Date(value);
            return value;
          });
          this.piles.set(pile.id, pile);
        } catch (err) {
          console.error(`Error loading pile from ${filePath}:`, err);
        }
      }
    } catch (err) {
      console.error(`Error reading data directory ${this.dataDir}:`, err);
    }
  }

  private savePile(pile: CompostPile) {
    const filePath = path.join(this.dataDir, `${pile.id}.json`);
    try {
      const data = JSON.stringify(pile, null, 2);
      fs.writeFileSync(filePath, data, 'utf8');
    } catch (err) {
      console.error(`Failed to save pile ${pile.id} to ${filePath}:`, err);
    }
  }

  private calculateCurrentCNRatio(pile: CompostPile): number {
    if (pile.inputs.length === 0) return this.advisorConfig.targetCNRatio;

    let totalCarbon = 0;
    let totalNitrogen = 0;

    for (const input of pile.inputs) {
      const carbon = input.quantity * input.cnRatio;
      const nitrogen = input.quantity;
      totalCarbon += carbon;
      totalNitrogen += nitrogen;
    }

    if (totalNitrogen === 0) return this.advisorConfig.targetCNRatio;
    return totalCarbon / totalNitrogen;
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

  private checkAdvisories(pile: CompostPile) {
    // Existing implementation
  }
}
