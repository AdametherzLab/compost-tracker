import { describe, it, expect, beforeEach } from "bun:test";
import { CompostPileManager, MaterialType, ValidationErrorType } from "../src/index.js";

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
});
