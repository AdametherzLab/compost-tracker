import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  CompostPileManager,
  CompostAdvisor,
  MaterialType,
  ValidationErrorType,
  type CompostPile,
  type CompostInput,
  type TemperatureReading,
  type MoistureReading,
  type TurnEvent,
  type AdvisorAnalysis,
  type PileState,
} from "../src/index";

describe("CompostPileManager", () => {
  let manager: CompostPileManager;
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = path.join(os.tmpdir(), `compost-test-${Date.now()}`);
    manager = new CompostPileManager({ dataDir: testDataDir });
  });

  afterEach(() => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it("should create a new pile with correct properties", () => {
    const pile = manager.createPile("Backyard Pile");
    expect(pile.id).toBeString();
    expect(pile.name).toBe("Backyard Pile");
    expect(pile.createdAt).toBeInstanceOf(Date);
    expect(pile.inputs).toBeArrayOfSize(0);
    expect(pile.temperatureReadings).toBeArrayOfSize(0);
    expect(pile.moistureReadings).toBeArrayOfSize(0);
    expect(pile.turnEvents).toBeArrayOfSize(0);
  });

  it("should retrieve a pile by id", () => {
    const pile = manager.createPile("Test Pile");
    const retrieved = manager.getPile(pile.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(pile.id);
    expect(retrieved?.name).toBe("Test Pile");
  });

  it("should return undefined for non-existent pile", () => {
    const retrieved = manager.getPile("non-existent-id");
    expect(retrieved).toBeUndefined();
  });

  it("should list all piles", () => {
    const pile1 = manager.createPile("Pile 1");
    const pile2 = manager.createPile("Pile 2");
    const allPiles = manager.getAllPiles();
    expect(allPiles).toBeArrayOfSize(2);
    expect(allPiles.map(p => p.id)).toContain(pile1.id);
    expect(allPiles.map(p => p.id)).toContain(pile2.id);
  });

  it("should add green and brown inputs and calculate C:N ratio correctly", () => {
    const pile = manager.createPile("Test Pile");
    const errors1 = manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.Green,
      quantity: 10,
      cnRatio: 15,
      description: "Grass clippings",
    });
    expect(errors1).toBeArrayOfSize(0);

    const errors2 = manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.Brown,
      quantity: 20,
      cnRatio: 50,
      description: "Dry leaves",
    });
    expect(errors2).toBeArrayOfSize(0);

    const state = manager.getPileState(pile.id);
    expect(state).toBeDefined();
    expect(state?.currentCNRatio).toBeCloseTo(28.49, 2);
  });

  it("should validate input parameters and return appropriate errors", () => {
    const pile = manager.createPile("Test Pile");
    const errors1 = manager.addInput({
      pileId: "invalid-id",
      materialType: MaterialType.Green,
      quantity: 5,
      cnRatio: 20,
    });
    expect(errors1).toBeArrayOfSize(1);
    expect(errors1[0].type).toBe(ValidationErrorType.MissingRequiredField);

    const errors2 = manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.Green,
      quantity: 0,
      cnRatio: 20,
    });
    expect(errors2).toBeArrayOfSize(1);
    expect(errors2[0].type).toBe(ValidationErrorType.InvalidQuantity);

    const errors3 = manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.Brown,
      quantity: 5,
      cnRatio: -5,
    });
    expect(errors3).toBeArrayOfSize(1);
    expect(errors3[0].type).toBe(ValidationErrorType.InvalidCNRatio);
  });

  it("should record temperature and moisture readings with validation", () => {
    const pile = manager.createPile("Test Pile");
    const tempErrors = manager.addTemperatureReading({
      pileId: pile.id,
      value: 65.5,
      location: "center",
    });
    expect(tempErrors).toBeArrayOfSize(0);

    const invalidTempErrors = manager.addTemperatureReading({
      pileId: pile.id,
      value: 150,
    });
    expect(invalidTempErrors).toBeArrayOfSize(1);
    expect(invalidTempErrors[0].type).toBe(ValidationErrorType.InvalidTemperature);

    const moistureErrors = manager.addMoistureReading({
      pileId: pile.id,
      value: 55.5,
      method: "squeeze test",
    });
    expect(moistureErrors).toBeArrayOfSize(0);

    const invalidMoistureErrors = manager.addMoistureReading({
      pileId: pile.id,
      value: 110,
    });
    expect(invalidMoistureErrors).toBeArrayOfSize(1);
    expect(invalidMoistureErrors[0].type).toBe(ValidationErrorType.InvalidMoisture);
  });

  it("should record turn events", () => {
    const pile = manager.createPile("Test Pile");
    const turnErrors = manager.turnPile({
      pileId: pile.id,
      notes: "First turn",
    });
    expect(turnErrors).toBeArrayOfSize(0);

    const updatedPile = manager.getPile(pile.id);
    expect(updatedPile?.turnEvents).toBeArrayOfSize(1);
    expect(updatedPile?.turnEvents[0].notes).toBe("First turn");
  });

  it("should validate turn pile operations", () => {
    const errors = manager.turnPile({
      pileId: "invalid-id",
      notes: "Test",
    });
    expect(errors).toBeArrayOfSize(1);
    expect(errors[0].type).toBe(ValidationErrorType.MissingRequiredField);
  });

  it("should calculate days since last turn correctly", () => {
    const pile = manager.createPile("Test Pile");
    
    const stateBefore = manager.getPileState(pile.id);
    expect(stateBefore?.daysSinceLastTurn).toBeNull();

    manager.turnPile({ pileId: pile.id });
    
    const stateAfter = manager.getPileState(pile.id);
    expect(stateAfter?.daysSinceLastTurn).toBe(0);
  });

  it("should emit advisory events when thresholds are exceeded", () => {
    const pile = manager.createPile("Test Pile");
    const emitter = manager.getEventEmitter();
    const advisoryMessages: string[] = [];
    emitter.on("advisoryTriggered", (pileId, message) => {
      advisoryMessages.push(message);
    });

    manager.addTemperatureReading({
      pileId: pile.id,
      value: 70,
    });
    expect(advisoryMessages).toContain(
      "Temperature 70°C exceeds turn threshold of 65°C"
    );

    manager.addMoistureReading({
      pileId: pile.id,
      value: 75,
    });
    expect(advisoryMessages).toContain(
      "Moisture 75% exceeds anaerobic threshold of 70%"
    );

    manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.Green,
      quantity: 10,
      cnRatio: 10,
    });
    expect(advisoryMessages).toContain(
      "C:N ratio 10.0 is outside target range 30 ± 10"
    );
  });

  it("should persist piles to disk and reload", () => {
    const pile = manager.createPile("Persistent Pile");
    manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.Green,
      quantity: 5,
      cnRatio: 20,
    });

    const newManager = new CompostPileManager({ dataDir: testDataDir });
    const loadedPile = newManager.getPile(pile.id);
    expect(loadedPile).toBeDefined();
    expect(loadedPile?.name).toBe("Persistent Pile");
    expect(loadedPile?.inputs).toBeArrayOfSize(1);
  });

  it("should emit events on pile creation and updates", () => {
    const emitter = manager.getEventEmitter();
    const events: string[] = [];
    
    emitter.on("pileAdded", () => events.push("pileAdded"));
    emitter.on("pileUpdated", () => events.push("pileUpdated"));
    emitter.on("inputLogged", () => events.push("inputLogged"));

    const pile = manager.createPile("Event Test");
    expect(events).toContain("pileAdded");

    manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.Green,
      quantity: 1,
      cnRatio: 20,
    });
    expect(events).toContain("inputLogged");
    expect(events).toContain("pileUpdated");
  });

  it("should handle empty piles in state calculation", () => {
    const pile = manager.createPile("Empty Pile");
    const state = manager.getPileState(pile.id);
    expect(state?.currentTemperature).toBeNull();
    expect(state?.currentMoisture).toBeNull();
    expect(state?.daysSinceLastTurn).toBeNull();
    expect(state?.currentCNRatio).toBe(30);
  });

  it("should reject negative temperature values", () => {
    const pile = manager.createPile("Test Pile");
    const errors = manager.addTemperatureReading({
      pileId: pile.id,
      value: -30,
    });
    expect(errors).toBeArrayOfSize(1);
    expect(errors[0].type).toBe(ValidationErrorType.InvalidTemperature);
  });

  it("should reject negative moisture values", () => {
    const pile = manager.createPile("Test Pile");
    const errors = manager.addMoistureReading({
      pileId: pile.id,
      value: -10,
    });
    expect(errors).toBeArrayOfSize(1);
    expect(errors[0].type).toBe(ValidationErrorType.InvalidMoisture);
  });
});

describe("CompostAdvisor", () => {
  let advisor: CompostAdvisor;
  let testPile: CompostPile;

  beforeEach(() => {
    advisor = new CompostAdvisor();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    testPile = {
      id: "test-pile",
      name: "Test Pile",
      createdAt: twoDaysAgo,
      inputs: [
        {
          id: "input-1",
          timestamp: twoDaysAgo,
          materialType: MaterialType.Green,
          quantity: 10,
          cnRatio: 15,
          description: "Grass",
        },
        {
          id: "input-2",
          timestamp: twoDaysAgo,
          materialType: MaterialType.Brown,
          quantity: 20,
          cnRatio: 50,
          description: "Leaves",
        },
      ],
      temperatureReadings: [
        { timestamp: twoDaysAgo, value: 55, location: "center" },
        { timestamp: yesterday, value: 60, location: "center" },
        { timestamp: now, value: 65, location: "center" },
      ],
      moistureReadings: [
        { timestamp: yesterday, value: 50, method: "meter" },
        { timestamp: now, value: 55, method: "meter" },
      ],
      turnEvents: [
        { timestamp: twoDaysAgo, notes: "Initial turn" },
      ],
    };
  });

  it("should analyze pile and recommend turning when temperature threshold exceeded", () => {
    const hotPile: CompostPile = {
      ...testPile,
      temperatureReadings: [
        ...testPile.temperatureReadings,
        { timestamp: new Date(), value: 70, location: "center" },
      ],
    };

    const analysis = advisor.analyzePile(hotPile);
    expect(analysis.shouldTurn).toBe(true);
    expect(analysis.turnReason).toContain("70°C");
    expect(analysis.currentTemperature).toBe(70);
  });

  it("should analyze pile and recommend turning when interval exceeded", () => {
    const oldTurnPile: CompostPile = {
      ...testPile,
      turnEvents: [
        { timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), notes: "Old turn" },
      ],
    };

    const analysis = advisor.analyzePile(oldTurnPile);
    expect(analysis.shouldTurn).toBe(true);
    expect(analysis.turnReason).toContain("days since last turn");
  });

  it("should detect anaerobic risk from high moisture and low temperature", () => {
    const anaerobicPile: CompostPile = {
      ...testPile,
      temperatureReadings: [
        { timestamp: new Date(), value: 45, location: "center" },
      ],
      moistureReadings: [
        { timestamp: new Date(), value: 75, method: "meter" },
      ],
    };

    const analysis = advisor.analyzePile(anaerobicPile);
    expect(analysis.isAnaerobicRisk).toBe(true);
    expect(analysis.anaerobicReason).toContain("High moisture");
  });

  it("should not detect anaerobic risk when temperature is high", () => {
    const activePile: CompostPile = {
      ...testPile,
      temperatureReadings: [
        { timestamp: new Date(), value: 65, location: "center" },
      ],
      moistureReadings: [
        { timestamp: new Date(), value: 75, method: "meter" },
      ],
    };

    const analysis = advisor.analyzePile(activePile);
    expect(analysis.isAnaerobicRisk).toBe(false);
  });

  it("should detect stalled pile from low temperature", () => {
    const stalledPile: CompostPile = {
      ...testPile,
      temperatureReadings: [
        { timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), value: 35 },
        { timestamp: new Date(), value: 35 },
      ],
    };

    const analysis = advisor.analyzePile(stalledPile);
    expect(analysis.isStalled).toBe(true);
    expect(analysis.stallReason).toContain("below minimum");
  });

  it("should assess C:N ratio as optimal when within tolerance", () => {
    const optimalPile: CompostPile = {
      ...testPile,
      inputs: [
        { id: "1", timestamp: new Date(), materialType: MaterialType.Green, quantity: 10, cnRatio: 30 },
      ],
    };

    const analysis = advisor.analyzePile(optimalPile);
    expect(analysis.cnRatioStatus).toBe("optimal");
    expect(analysis.currentCNRatio).toBe(30);
  });

  it("should assess C:N ratio as low when below target", () => {
    const lowCNPile: CompostPile = {
      ...testPile,
      inputs: [
        { id: "1", timestamp: new Date(), materialType: MaterialType.Green, quantity: 10, cnRatio: 15 },
      ],
    };

    const analysis = advisor.analyzePile(lowCNPile);
    expect(analysis.cnRatioStatus).toBe("low");
  });

  it("should assess C:N ratio as high when above target", () => {
    const highCNPile: CompostPile = {
      ...testPile,
      inputs: [
        { id: "1", timestamp: new Date(), materialType: MaterialType.Brown, quantity: 10, cnRatio: 60 },
      ],
    };

    const analysis = advisor.analyzePile(highCNPile);
    expect(analysis.cnRatioStatus).toBe("high");
  });

  it("should handle empty piles gracefully", () => {
    const emptyPile: CompostPile = {
      id: "empty",
      name: "Empty",
      createdAt: new Date(),
      inputs: [],
      temperatureReadings: [],
      moistureReadings: [],
      turnEvents: [],
    };

    const analysis = advisor.analyzePile(emptyPile);
    expect(analysis.currentCNRatio).toBe(30);
    expect(analysis.currentTemperature).toBeNull();
    expect(analysis.currentMoisture).toBeNull();
    expect(analysis.shouldTurn).toBe(false);
    expect(analysis.isStalled).toBe(false);
  });

  it("should predict completion for active piles", () => {
    const activePile: CompostPile = {
      ...testPile,
      temperatureReadings: Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(Date.now() - (9 - i) * 24 * 60 * 60 * 1000),
        value: 55 + i * 2,
      })),
    };

    const analysis = advisor.analyzePile(activePile);
    expect(analysis.prediction).toBeDefined();
    if (analysis.prediction) {
      expect(analysis.prediction.estimatedCompletionDate).toBeInstanceOf(Date);
      expect(analysis.prediction.confidenceScore).toBeGreaterThan(0);
      expect(analysis.prediction.confidenceScore).toBeLessThanOrEqual(1);
      expect(analysis.prediction.factors).toBeArray();
    }
  });

  it("should detect temperature plateau", () => {
    const plateauPile: CompostPile = {
      ...testPile,
      temperatureReadings: Array.from({ length: 5 }, (_, i) => ({
        timestamp: new Date(Date.now() - (4 - i) * 60 * 60 * 1000),
        value: 60,
      })),
    };

    const analysis = advisor.analyzePile(plateauPile);
    expect(analysis.shouldTurn).toBe(true);
    expect(analysis.turnReason).toContain("plateau");
  });

  it("should accept custom configuration", () => {
    const customAdvisor = new CompostAdvisor({
      turnTemperatureThreshold: 55,
      targetCNRatio: 25,
    });

    const warmPile: CompostPile = {
      ...testPile,
      temperatureReadings: [
        { timestamp: new Date(), value: 60 },
      ],
    };

    const analysis = customAdvisor.analyzePile(warmPile);
    expect(analysis.shouldTurn).toBe(true);
    expect(analysis.turnReason).toContain("60°C");
  });

  it("should calculate degree days correctly", () => {
    const activePile: CompostPile = {
      ...testPile,
      temperatureReadings: [
        { timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), value: 50 },
        { timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), value: 55 },
        { timestamp: new Date(), value: 60 },
      ],
    };

    const analysis = advisor.analyzePile(activePile);
    expect(analysis.prediction).toBeDefined();
  });
});

describe("Integration", () => {
  let manager: CompostPileManager;
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = path.join(os.tmpdir(), `compost-integration-${Date.now()}`);
    manager = new CompostPileManager({ dataDir: testDataDir });
  });

  afterEach(() => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it("should complete full workflow from creation to analysis", () => {
    const pile = manager.createPile("Integration Test");
    
    manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.Brown,
      quantity: 50,
      cnRatio: 60,
      description: "Autumn leaves",
    });

    manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.Green,
      quantity: 25,
      cnRatio: 15,
      description: "Grass clippings",
    });

    manager.addTemperatureReading({ pileId: pile.id, value: 45 });
    manager.addMoistureReading({ pileId: pile.id, value: 50 });
    manager.turnPile({ pileId: pile.id, notes: "Initial mix" });

    const state = manager.getPileState(pile.id);
    expect(state).toBeDefined();
    expect(state?.currentCNRatio).toBeCloseTo(45, 0);
    expect(state?.currentTemperature).toBe(45);
    expect(state?.currentMoisture).toBe(50);
    expect(state?.daysSinceLastTurn).toBe(0);

    const advisor = new CompostAdvisor();
    const fullPile = manager.getPile(pile.id)!;
    const analysis = advisor.analyzePile(fullPile);
    
    expect(analysis.cnRatioStatus).toBe("high");
    expect(analysis.isStalled).toBe(false);
  });

  it("should handle multiple piles independently", () => {
    const pile1 = manager.createPile("Pile 1");
    const pile2 = manager.createPile("Pile 2");

    manager.addInput({ pileId: pile1.id, materialType: MaterialType.Green, quantity: 10, cnRatio: 20 });
    manager.addInput({ pileId: pile2.id, materialType: MaterialType.Brown, quantity: 10, cnRatio: 50 });

    const state1 = manager.getPileState(pile1.id);
    const state2 = manager.getPileState(pile2.id);

    expect(state1?.currentCNRatio).toBe(20);
    expect(state2?.currentCNRatio).toBe(50);
  });
});
