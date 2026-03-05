import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
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
        { timestamp: twoDaysAgo, value: 60 },
        { timestamp: yesterday, value: 65 },
        { timestamp: now, value: 68 },
      ],
      turnEvents: [
        { timestamp: twoDaysAgo, notes: "Initial turn" },
      ],
    };
  });

  it("should analyze pile and provide turn recommendations", () => {
    const analysis = advisor.analyzePile(testPile);
    expect(analysis.shouldTurn).toBeBoolean();
    expect(analysis.turnReason).toBeString();
    expect(analysis.currentCNRatio).toBeCloseTo(38.33, 2);
    expect(["optimal", "low", "high"]).toContain(analysis.cnRatioStatus);
  });

  it("should detect anaerobic risk conditions", () => {
    const highMoisturePile: CompostPile = {
      ...testPile,
      moistureReadings: [
        { timestamp: new Date(), value: 75 },
      ],
      temperatureReadings: [
        { timestamp: new Date(), value: 35 },
      ],
    };
    const analysis = advisor.analyzePile(highMoisturePile);
    expect(analysis.isAnaerobicRisk).toBeBoolean();
    if (analysis.isAnaerobicRisk) {
      expect(analysis.anaerobicReason).toBeString();
      expect(analysis.anaerobicReason).toContain("High moisture");
    }
  });

  it("should detect stalled pile conditions", () => {
    const lowTempPile: CompostPile = {
      ...testPile,
      temperatureReadings: [
        { timestamp: new Date(), value: 35 },
      ],
    };
    const analysis = advisor.analyzePile(lowTempPile);
    expect(analysis.isStalled).toBeBoolean();
    if (analysis.isStalled) {
      expect(analysis.stallReason).toBeString();
      expect(analysis.stallReason).toContain("Temperature");
    }
  });

  it("should provide completion prediction with sufficient data", () => {
    const analysis = advisor.analyzePile(testPile);
    expect(analysis.prediction).toBeDefined();
    if (analysis.prediction) {
      expect(analysis.prediction.estimatedCompletionDate).toBeInstanceOf(Date);
      expect(analysis.prediction.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(analysis.prediction.confidenceScore).toBeLessThanOrEqual(1);
      expect(analysis.prediction.factors).toBeArray();
    }
  });

  it("should handle piles with insufficient data gracefully", () => {
    const emptyPile: CompostPile = {
      id: "empty",
      name: "Empty Pile",
      createdAt: new Date(),
      inputs: [],
      temperatureReadings: [],
      moistureReadings: [],
      turnEvents: [],
    };
    const analysis = advisor.analyzePile(emptyPile);
    expect(analysis.currentCNRatio).toBe(30);
    expect(analysis.prediction).toBeNull();
    expect(analysis.isAnaerobicRisk).toBeFalse();
    expect(analysis.isStalled).toBeFalse();
  });

  it("should allow configuration updates", () => {
    const customAdvisor = new CompostAdvisor({
      turnTemperatureThreshold: 70,
      anaerobicMoistureThreshold: 75,
    });
    const config = customAdvisor.getConfig();
    expect(config.turnTemperatureThreshold).toBe(70);
    expect(config.anaerobicMoistureThreshold).toBe(75);

    customAdvisor.updateConfig({ turnIntervalDays: 5 });
    const updatedConfig = customAdvisor.getConfig();
    expect(updatedConfig.turnIntervalDays).toBe(5);
  });
});