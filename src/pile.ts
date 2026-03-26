import { EventEmitter } from "events";
import { 
  MaterialType, 
  MaterialCNRatios, 
  ValidationError, 
  ValidationErrorType,
  CompostPile,
  CompostInput,
  CustomMaterial,
  TemperatureReading,
  MoistureReading,
  TurnEvent
} from './types.js';

export interface PileState {
  id: string;
  name: string;
  currentCNRatio: number;
  totalQuantity: number;
  inputs: CompostInput[];
  lastTemperature: number | null;
  lastMoisture: number | null;
  daysSinceLastTurn: number | null;
}

export interface AddInputOptions {
  readonly pileId: string;
  readonly materialType: MaterialType | string;
  readonly quantity: number;
  readonly cnRatio?: number;
  readonly description?: string;
  /** Required when using a custom material type not in MaterialType enum */
  readonly customMaterial?: CustomMaterial;
}

export interface AddReadingOptions {
  pileId: string;
  type: 'temperature' | 'moisture';
  value: number;
  depth?: number;
}

export interface TurnPileOptions {
  pileId: string;
  notes?: string;
}

/** Manages compost piles, inputs, readings, and turn events. */
export class CompostPileManager extends EventEmitter {
  private piles: Map<string, CompostPile> = new Map();
  private readonly defaultTargetCNRatio: number;

  constructor(options: { targetCNRatio?: number } = {}) {
    super();
    this.defaultTargetCNRatio = options.targetCNRatio ?? 30;
  }

  /** Creates a new compost pile and returns it. */
  createPile(name: string, options?: Partial<CompostPile>): CompostPile {
    const pile: CompostPile = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date(),
      inputs: [],
      temperatureReadings: [],
      moistureReadings: [],
      turnEvents: [],
      targetCNRatio: this.defaultTargetCNRatio,
      ...options
    };
    
    this.piles.set(pile.id, pile);
    this.emit('pileCreated', { pile });
    return pile;
  }

  /** Retrieves a pile by ID. */
  getPile(id: string): CompostPile | undefined {
    return this.piles.get(id);
  }

  /** Gets current state summary of a pile. */
  getPileState(pileId: string): PileState | null {
    const pile = this.piles.get(pileId);
    if (!pile) return null;

    const lastTemp = pile.temperatureReadings.length > 0 
      ? [...pile.temperatureReadings].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0].value
      : null;

    const lastMoisture = pile.moistureReadings.length > 0
      ? [...pile.moistureReadings].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0].value
      : null;

    const daysSinceLastTurn = pile.turnEvents.length > 0
      ? Math.floor((Date.now() - [...pile.turnEvents].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0].timestamp.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const currentCNRatio = this.calculateCurrentCNRatio(pile);

    return {
      id: pile.id,
      name: pile.name,
      currentCNRatio,
      totalQuantity: pile.inputs.reduce((sum, input) => sum + input.quantity, 0),
      inputs: pile.inputs,
      lastTemperature: lastTemp,
      lastMoisture: lastMoisture,
      daysSinceLastTurn: daysSinceLastTurn
    };
  }

  /** Adds a material input to a pile. Supports predefined and custom materials. Returns validation errors (empty on success). */
  addInput(options: AddInputOptions): ValidationError[] {
    const errors: ValidationError[] = [];
    
    const pile = this.piles.get(options.pileId);
    if (!pile) {
      errors.push({
        type: ValidationErrorType.PileNotFound,
        message: `Pile with id ${options.pileId} not found`,
        field: 'pileId'
      });
      return errors;
    }

    if (options.quantity <= 0) {
      errors.push({
        type: ValidationErrorType.InvalidQuantity,
        message: 'Quantity must be greater than 0',
        field: 'quantity'
      });
    }

    let materialConfig: { min: number; max: number; default: number } | undefined;
    let isCustom = false;
    
    if (options.customMaterial) {
      materialConfig = options.customMaterial.cnRatio;
      isCustom = true;
    } else if (Object.values(MaterialType).includes(options.materialType as MaterialType)) {
      materialConfig = MaterialCNRatios[options.materialType as MaterialType];
    } else {
      errors.push({
        type: ValidationErrorType.InvalidMaterialType,
        message: `Unknown material type: ${options.materialType}. Use predefined MaterialType or provide customMaterial definition.`,
        field: 'materialType'
      });
      return errors;
    }

    if (!materialConfig) {
      errors.push({
        type: ValidationErrorType.InvalidMaterialType,
        message: `Configuration not found for material type: ${options.materialType}`,
        field: 'materialType'
      });
      return errors;
    }

    const cnRatio = options.cnRatio ?? materialConfig.default;

    if (cnRatio < materialConfig.min || cnRatio > materialConfig.max) {
      errors.push({
        type: ValidationErrorType.InvalidCNRatio,
        message: `C:N ratio for ${options.materialType} must be between ${materialConfig.min} and ${materialConfig.max}, got ${cnRatio}`,
        field: 'cnRatio',
      });
    }

    if (errors.length > 0) {
      return errors;
    }

    const input: CompostInput = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      materialType: options.materialType,
      quantity: options.quantity,
      cnRatio: cnRatio,
      description: options.description,
      customMaterial: isCustom ? options.customMaterial : undefined
    };

    pile.inputs.push(input);
    this.emit('inputAdded', { pileId: options.pileId, input });
    
    return [];
  }

  /** Adds a temperature or moisture reading to a pile. */
  addReading(options: AddReadingOptions): ValidationError[] {
    const errors: ValidationError[] = [];
    const pile = this.piles.get(options.pileId);
    
    if (!pile) {
      errors.push({
        type: ValidationErrorType.PileNotFound,
        message: `Pile with id ${options.pileId} not found`,
        field: 'pileId'
      });
      return errors;
    }

    const reading = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      value: options.value,
      ...(options.depth && { depth: options.depth })
    };

    if (options.type === 'temperature') {
      pile.temperatureReadings.push(reading as TemperatureReading);
      this.emit('readingAdded', { pileId: options.pileId, reading, type: 'temperature' });
    } else {
      pile.moistureReadings.push(reading as MoistureReading);
      this.emit('readingAdded', { pileId: options.pileId, reading, type: 'moisture' });
    }

    return [];
  }

  /** Records a pile turning event. */
  turnPile(options: TurnPileOptions): ValidationError[] {
    const errors: ValidationError[] = [];
    const pile = this.piles.get(options.pileId);
    
    if (!pile) {
      errors.push({
        type: ValidationErrorType.PileNotFound,
        message: `Pile with id ${options.pileId} not found`,
        field: 'pileId'
      });
      return errors;
    }

    const event: TurnEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      notes: options.notes
    };

    pile.turnEvents.push(event);
    this.emit('pileTurned', { pileId: options.pileId, event });
    
    return [];
  }

  private calculateCurrentCNRatio(pile: CompostPile): number {
    if (pile.inputs.length === 0) return pile.targetCNRatio;

    let totalCarbon = 0;
    let totalNitrogen = 0;

    for (const input of pile.inputs) {
      const carbon = input.quantity * input.cnRatio;
      const nitrogen = input.quantity;
      totalCarbon += carbon;
      totalNitrogen += nitrogen;
    }

    if (totalNitrogen === 0) return pile.targetCNRatio;
    return totalCarbon / totalNitrogen;
  }
}
