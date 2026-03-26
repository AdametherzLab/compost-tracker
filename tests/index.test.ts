import { describe, it, expect, beforeEach } from "bun:test";
import { CompostPileManager, MaterialType, ValidationErrorType } from "../src/index.js";
import { CompostAdvisor } from "../src/advisor.js";

describe("CompostPileManager", () => {
  let manager: CompostPileManager;

  beforeEach(() => {
    manager = new CompostPileManager();
  });

  it("should add materials with C:N ratio and type", () => {
    const pile = manager.createPile("Test Pile");
    const errors1 = manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.GrassClippings,
      quantity: 10,
    });
    expect(errors1).toBeArrayOfSize(0);

    const errors2 = manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.DryLeaves,
      quantity: 20,
      cnRatio: 50,
    });
    expect(errors2).toBeArrayOfSize(0);

    const state = manager.getPileState(pile.id);
    expect(state?.currentCNRatio).toBeCloseTo(40);
  });

  it("should reject invalid C:N ratios for predefined materials", () => {
    const pile = manager.createPile("Test Pile");
    const errors = manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.GrassClippings,
      quantity: 10,
      cnRatio: 100,
    });
    
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe(ValidationErrorType.InvalidCNRatio);
  });

  describe("Custom Material Definitions", () => {
    it("should add custom material with specific C:N ratio", () => {
      const pile = manager.createPile("Custom Materials Pile");
      const customMaterial = {
        name: "Coffee Chaff",
        cnRatio: { min: 15, max: 25, default: 20 },
        category: "brown" as const
      };
      
      const errors = manager.addInput({
        pileId: pile.id,
        materialType: "coffee_chaff",
        quantity: 10,
        cnRatio: 20,
        customMaterial
      });
      
      expect(errors).toBeArrayOfSize(0);
      
      const state = manager.getPileState(pile.id);
      expect(state?.inputs).toHaveLength(1);
      expect(state?.inputs[0].customMaterial?.name).toBe("Coffee Chaff");
      expect(state?.currentCNRatio).toBe(20);
    });

    it("should validate custom material C:N ratio against custom ranges", () => {
      const pile = manager.createPile("Test Pile");
      const customMaterial = {
        name: "Sawdust",
        cnRatio: { min: 200, max: 600, default: 400 },
        category: "brown" as const
      };
      
      const errors1 = manager.addInput({
        pileId: pile.id,
        materialType: "custom_sawdust",
        quantity: 5,
        cnRatio: 300,
        customMaterial
      });
      expect(errors1).toBeArrayOfSize(0);
      
      const errors2 = manager.addInput({
        pileId: pile.id,
        materialType: "custom_sawdust",
        quantity: 5,
        cnRatio: 700,
        customMaterial
      });
      expect(errors2).toHaveLength(1);
      expect(errors2[0].type).toBe(ValidationErrorType.InvalidCNRatio);
      expect(errors2[0].message).toContain("600");
      
      const errors3 = manager.addInput({
        pileId: pile.id,
        materialType: "custom_sawdust",
        quantity: 5,
        cnRatio: 100,
        customMaterial
      });
      expect(errors3).toHaveLength(1);
      expect(errors3[0].type).toBe(ValidationErrorType.InvalidCNRatio);
    });

    it("should calculate C:N ratio correctly with mixed predefined and custom materials", () => {
      const pile = manager.createPile("Mixed Pile");
      
      manager.addInput({
        pileId: pile.id,
        materialType: MaterialType.GrassClippings,
        quantity: 10,
      });
      
      const customMaterial = {
        name: "Cardboard",
        cnRatio: { min: 80, max: 120, default: 100 },
        category: "brown" as const
      };
      
      manager.addInput({
        pileId: pile.id,
        materialType: "cardboard",
        quantity: 5,
        cnRatio: 100,
        customMaterial
      });
      
      const state = manager.getPileState(pile.id);
      expect(state?.currentCNRatio).toBeCloseTo(46.67, 1);
      expect(state?.inputs).toHaveLength(2);
    });

    it("should reject unknown material types without custom definition", () => {
      const pile = manager.createPile("Test Pile");
      
      const errors = manager.addInput({
        pileId: pile.id,
        materialType: "unknown_material",
        quantity: 10,
        cnRatio: 30
      });
      
      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe(ValidationErrorType.InvalidMaterialType);
    });

    it("should use default C:N ratio from custom material when not specified", () => {
      const pile = manager.createPile("Test Pile");
      const customMaterial = {
        name: "Rice Hulls",
        cnRatio: { min: 70, max: 90, default: 80 },
        category: "brown" as const
      };
      
      const errors = manager.addInput({
        pileId: pile.id,
        materialType: "rice_hulls",
        quantity: 10,
        customMaterial
      });
      
      expect(errors).toBeArrayOfSize(0);
      const state = manager.getPileState(pile.id);
      expect(state?.currentCNRatio).toBe(80);
    });
  });

  describe("Readings and Turn Events", () => {
    it("should add temperature readings", () => {
      const pile = manager.createPile("Test Pile");
      const errors = manager.addReading({
        pileId: pile.id,
        type: "temperature",
        value: 55,
        depth: 30
      });
      expect(errors).toBeArrayOfSize(0);
      
      const state = manager.getPileState(pile.id);
      expect(state?.lastTemperature).toBe(55);
    });

    it("should add moisture readings", () => {
      const pile = manager.createPile("Test Pile");
      const errors = manager.addReading({
        pileId: pile.id,
        type: "moisture",
        value: 50
      });
      expect(errors).toBeArrayOfSize(0);
      
      const state = manager.getPileState(pile.id);
      expect(state?.lastMoisture).toBe(50);
    });

    it("should record turn events", () => {
      const pile = manager.createPile("Test Pile");
      const errors = manager.turnPile({
        pileId: pile.id,
        notes: "Turned with pitchfork"
      });
      expect(errors).toBeArrayOfSize(0);
      
      const raw = manager.getPile(pile.id);
      expect(raw?.turnEvents).toHaveLength(1);
      expect(raw?.turnEvents[0].notes).toBe("Turned with pitchfork");
    });

    it("should return errors for non-existent pile", () => {
      const errors = manager.addReading({
        pileId: "nonexistent",
        type: "temperature",
        value: 50
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].type).toBe(ValidationErrorType.PileNotFound);
    });
  });
});

describe("CompostAdvisor", () => {
  it("should detect high C:N ratio", () => {
    const advisor = new CompostAdvisor({ targetCNRatio: 30, cnRatioTolerance: 10 });
    const pile = createTestPile([
      { quantity: 5, cnRatio: 400 }
    ]);
    const analysis = advisor.analyzePile(pile);
    expect(analysis.cnRatioStatus).toBe("high");
    expect(analysis.currentCNRatio).toBe(400);
  });

  it("should detect optimal C:N ratio", () => {
    const advisor = new CompostAdvisor({ targetCNRatio: 30, cnRatioTolerance: 10 });
    const pile = createTestPile([
      { quantity: 10, cnRatio: 20 },
      { quantity: 10, cnRatio: 40 }
    ]);
    const analysis = advisor.analyzePile(pile);
    expect(analysis.cnRatioStatus).toBe("optimal");
    expect(analysis.currentCNRatio).toBe(30);
  });

  it("should flag anaerobic risk with high moisture and low temp", () => {
    const advisor = new CompostAdvisor({
      anaerobicMoistureThreshold: 70,
      minTemperature: 40
    });
    const pile = createTestPile([], [
      { value: 35 }  // below minTemp + 10 = 50
    ], [
      { value: 80 }  // above threshold 70
    ]);
    const analysis = advisor.analyzePile(pile);
    expect(analysis.isAnaerobicRisk).toBe(true);
    expect(analysis.anaerobicReason).toContain("anaerobic");
  });

  it("should recommend turning when temperature exceeds threshold", () => {
    const advisor = new CompostAdvisor({ turnTemperatureThreshold: 65 });
    const pile = createTestPile([], [
      { value: 70 }
    ]);
    const analysis = advisor.analyzePile(pile);
    expect(analysis.shouldTurn).toBe(true);
    expect(analysis.turnReason).toContain("Temperature");
  });

  it("should detect stalled pile with low temperature", () => {
    const advisor = new CompostAdvisor({ minTemperature: 40 });
    const pile = createTestPile([], [
      { value: 25 }
    ]);
    const analysis = advisor.analyzePile(pile);
    expect(analysis.isStalled).toBe(true);
    expect(analysis.stallReason).toContain("below minimum");
  });

  it("should return null prediction with insufficient data", () => {
    const advisor = new CompostAdvisor();
    const pile = createTestPile([
      { quantity: 10, cnRatio: 30 }
    ], [
      { value: 55 }
    ]);
    const analysis = advisor.analyzePile(pile);
    expect(analysis.prediction).toBeNull();
  });

  it("should update config", () => {
    const advisor = new CompostAdvisor({ targetCNRatio: 30 });
    expect(advisor.getConfig().targetCNRatio).toBe(30);
    advisor.updateConfig({ targetCNRatio: 25 });
    expect(advisor.getConfig().targetCNRatio).toBe(25);
  });
});

function createTestPile(
  inputs: Array<{ quantity: number; cnRatio: number }> = [],
  temps: Array<{ value: number }> = [],
  moistures: Array<{ value: number }> = []
) {
  const now = new Date();
  return {
    id: "test-pile",
    name: "Test",
    createdAt: now,
    inputs: inputs.map((inp, i) => ({
      id: `input-${i}`,
      timestamp: now,
      materialType: "test" as any,
      quantity: inp.quantity,
      cnRatio: inp.cnRatio
    })),
    temperatureReadings: temps.map((t, i) => ({
      id: `temp-${i}`,
      timestamp: now,
      value: t.value
    })),
    moistureReadings: moistures.map((m, i) => ({
      id: `moist-${i}`,
      timestamp: now,
      value: m.value
    })),
    turnEvents: [],
    targetCNRatio: 30
  };
}
