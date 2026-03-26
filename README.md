# Compost Tracker

Track compost pile C:N ratios, temperature, moisture, turn schedules, and predict completion time.

## Installation

bash
bun add compost-tracker


## Usage


import { CompostPileManager, CompostAdvisor, MaterialType } from "compost-tracker";

// Create a manager and a pile
const manager = new CompostPileManager({ targetCNRatio: 30 });
const pile = manager.createPile("Backyard Bin");

// Add predefined materials
manager.addInput({
  pileId: pile.id,
  materialType: MaterialType.GrassClippings,
  quantity: 10,
});

manager.addInput({
  pileId: pile.id,
  materialType: MaterialType.DryLeaves,
  quantity: 20,
  cnRatio: 50,
});

// Add custom materials
manager.addInput({
  pileId: pile.id,
  materialType: "coffee_chaff",
  quantity: 5,
  cnRatio: 20,
  customMaterial: {
    name: "Coffee Chaff",
    cnRatio: { min: 15, max: 25, default: 20 },
    category: "brown",
  },
});

// Record temperature and moisture
manager.addReading({ pileId: pile.id, type: "temperature", value: 55, depth: 30 });
manager.addReading({ pileId: pile.id, type: "moisture", value: 50 });

// Record a turn
manager.turnPile({ pileId: pile.id, notes: "Turned with pitchfork" });

// Check pile state
const state = manager.getPileState(pile.id);
console.log(`C:N Ratio: ${state?.currentCNRatio}`);
console.log(`Temperature: ${state?.lastTemperature}°C`);

// Get advisor recommendations
const advisor = new CompostAdvisor({ targetCNRatio: 30 });
const raw = manager.getPile(pile.id)!;
const analysis = advisor.analyzePile(raw);
console.log(`Should turn: ${analysis.shouldTurn}`);
console.log(`C:N status: ${analysis.cnRatioStatus}`);
console.log(`Anaerobic risk: ${analysis.isAnaerobicRisk}`);


## Predefined Materials

| Material | C:N Range | Default |
|---|---|---|
| GrassClippings | 15–25 | 20 |
| VegetableScraps | 12–20 | 15 |
| FruitWaste | 25–40 | 35 |
| CoffeeGrounds | 20–25 | 20 |
| FreshManure | 10–20 | 15 |
| DryLeaves | 40–80 | 60 |
| Straw | 50–100 | 75 |
| Sawdust | 200–600 | 400 |
| ShreddedPaper | 150–200 | 175 |
| WoodChips | 400–700 | 600 |

## Custom Materials

Pass a `customMaterial` definition with any string `materialType` to extend beyond the predefined list:


manager.addInput({
  pileId: pile.id,
  materialType: "rice_hulls",
  quantity: 10,
  customMaterial: {
    name: "Rice Hulls",
    cnRatio: { min: 70, max: 90, default: 80 },
    category: "brown",
  },
});


## Advisor

`CompostAdvisor` analyzes pile health and returns:
- **shouldTurn** — whether the pile needs turning (temperature threshold, interval, plateau detection)
- **isAnaerobicRisk** — high moisture + low temperature warning
- **isStalled** — temperature below minimum threshold
- **cnRatioStatus** — "optimal", "low", or "high" relative to target
- **prediction** — estimated completion date based on degree-day accumulation

## API

### CompostPileManager

- `createPile(name, options?)` — create a new pile
- `getPile(id)` — retrieve pile by ID
- `getPileState(pileId)` — get current state summary
- `addInput(options)` — add material input (returns validation errors)
- `addReading(options)` — add temperature or moisture reading
- `turnPile(options)` — record a turn event

### CompostAdvisor

- `analyzePile(pile)` — full health analysis
- `getConfig()` — current configuration
- `updateConfig(partial)` — update configuration

## License

MIT
