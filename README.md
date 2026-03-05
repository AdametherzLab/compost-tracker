# 🍂 Compost Tracker

Track your compost pile's journey from kitchen scraps to black gold! Log temperature, moisture, C:N ratios, get turn reminders, and predict completion time. Perfect for backyard composters, community gardens, and sustainability enthusiasts.

## 🚀 Quick Start

```bash
# Install with Bun (recommended)
bun add compost-tracker

# Or with npm
npm install compost-tracker
```

```typescript
// REMOVED external import: import { CompostPileManager, CompostAdvisor, MaterialType } from "compost-tracker";

// Create your compost pile
const pile = new CompostPileManager("Backyard Bin", {
  targetCNRatio: 30,
  idealMoistureRange: { min: 40, max: 60 },
  idealTemperatureRange: { min: 54, max: 65 }
});

// Add some materials
pile.addInput({
  name: "Kitchen scraps",
  materialType: MaterialType.GREEN,
  carbonNitrogenRatio: 15,
  weightKg: 2,
  moisturePercent: 70
});

pile.addInput({
  name: "Shredded leaves",
  materialType: MaterialType.BROWN,
  carbonNitrogenRatio: 60,
  weightKg: 4,
  moisturePercent: 20
});

// Log today's temperature
pile.addReading({
  type: "temperature",
  valueCelsius: 62,
  depthCm: 30
});

// Get advice from the compost advisor
const advisor = new CompostAdvisor();
const analysis = advisor.analyzePile(pile.getState());

console.log(`Current C:N ratio: ${analysis.currentCNRatio.toFixed(1)}`);
console.log(`Moisture status: ${analysis.moistureStatus}`);
console.log(`Next turn recommended: ${analysis.nextTurnRecommended ? "Yes" : "No"}`);
```

## 📖 API Reference

### Core Classes

#### `CompostPileManager`
**Constructor:**
```typescript
new CompostPileManager(name: string, options?: CompostTrackerOptions)
```

**Key Methods:**
- `addInput(options: AddInputOptions): CompostInput` – Add green/brown materials
- `addReading(options: AddReadingOptions): TemperatureReading | MoistureReading` – Log temperature or moisture
- `turnPile(options?: TurnPileOptions): TurnEvent` – Record a pile turning event
- `getState(): PileState` – Get current pile state
- `getSummary(): PileSummary` – Get summary statistics

#### `CompostAdvisor`
**Key Methods:**
- `analyzePile(pile: PileState): AdvisorAnalysis` – Analyze pile health and progress
- `predictCompletion(pile: PileState, config?: AdvisorConfig): PredictionResult` – Predict when pile will be ready
- `calculateDegreeDays(pile: PileState): DegreeDayAccumulator` – Calculate thermal accumulation

### Key Types

#### `MaterialType` (Enum)
- `GREEN` – High nitrogen materials (food scraps, grass clippings)
- `BROWN` – High carbon materials (leaves, straw, cardboard)

#### `PileState`
- `inputs: CompostInput[]` – All added materials
- `temperatureReadings: TemperatureReading[]` – Temperature history
- `moistureReadings: MoistureReading[]` – Moisture history
- `turnEvents: TurnEvent[]` – Turning history
- `createdAt: Date` – Pile creation timestamp

#### `AdvisorAnalysis`
Analysis results including:
- `currentCNRatio: number` – Current carbon-to-nitrogen ratio
- `moistureStatus: "too_dry" | "ideal" | "too_wet" | "anaerobic_risk"`
- `temperatureStatus: "too_cold" | "ideal" | "too_hot"`
- `nextTurnRecommended: boolean` – Whether turning is advised
- `daysSinceLastTurn: number` – Days since last turning

## 🧪 Examples

### Monitor Pile Health
```typescript
const pile = new CompostPileManager("Winter Compost");

// Add weekly readings
pile.addReading({ type: "temperature", valueCelsius: 45 });
pile.addReading({ type: "moisture", valuePercent: 55 });

const state = pile.getState();
const advisor = new CompostAdvisor();
const analysis = advisor.analyzePile(state);

if (analysis.moistureStatus === "too_dry") {
  console.log("💧 Time to water the pile!");
}

if (analysis.temperatureStatus === "too_cold") {
  console.log("❄️ Pile needs more greens or insulation!");
}
```

### Track Material Inputs
```typescript
// Create a balanced pile
pile.addInput({
  name: "Coffee grounds",
  materialType: MaterialType.GREEN,
  carbonNitrogenRatio: 20,
  weightKg: 1
});

pile.addInput({
  name: "Shredded newspaper",
  materialType: MaterialType.BROWN,
  carbonNitrogenRatio: 175,
  weightKg: 2
});

const summary = pile.getSummary();
console.log(`Total weight: ${summary.totalWeightKg} kg`);
console.log(`Green:Brown ratio: ${summary.greenBrownRatio.toFixed(2)}`);
```

### Predict Completion
```typescript
const prediction = advisor.predictCompletion(pile.getState(), {
  targetDegradation: 0.9, // 90% decomposed
  climateZone: "temperate"
});

console.log(`Expected completion: ${prediction.estimatedCompletionDate.toLocaleDateString()}`);
console.log(`Confidence: ${prediction.confidence}%`);
```

## 🤝 Contributing

Found a bug? Have a feature idea? We'd love your help!

1. Fork the repository
2. Create a feature branch (`git checkout -b cool-new-feature`)
3. Make your changes
4. Run tests (`bun test`)
5. Submit a pull request

Check the issues tab for good first contributions and current priorities. Let's make composting more accessible together! 🌱

## 📄 License

MIT © AdametherzLab

---

*Happy composting! May your piles be hot, your ratios balanced, and your garden abundant.* 🌻