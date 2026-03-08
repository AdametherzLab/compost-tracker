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

    const errors4 = manager.addInput({
      pileId: pile.id,
      materialType: MaterialType.Brown,
      quantity: 5,
      cnRatio: 1500,
    });
    expect(errors4).toBeArrayOfSize(1);
    expect(errors4[0].type).toBe(ValidationErrorType.InvalidCNRatio);
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
      "High temperature (70°C) detected"
    );
  });
});
