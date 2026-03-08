import { MaterialType, MaterialCNRatios, ... } from './types';

export interface AddInputOptions {
  readonly pileId: string;
  readonly materialType: MaterialType;
  readonly quantity: number;
  readonly cnRatio?: number;
  readonly description?: string;
}

// Update validation in addInput method
addInput(options: AddInputOptions): ValidationError[] {
  const materialConfig = MaterialCNRatios[options.materialType];
  const cnRatio = options.cnRatio ?? materialConfig.default;

  if (cnRatio < materialConfig.min || cnRatio > materialConfig.max) {
    errors.push({
      type: ValidationErrorType.InvalidCNRatio,
      message: `C:N ratio for ${options.materialType} must be between ${materialConfig.min} and ${materialConfig.max}, got ${cnRatio}`,
      field: 'cnRatio',
    });
  }

  // Rest of addInput method
}