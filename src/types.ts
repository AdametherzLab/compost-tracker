import type { EventEmitter } from "events";

export enum MaterialType {
  GrassClippings = "grass_clippings,
  VegetableScraps =vegetable_scraps,
  FruitWaste =fruit_waste,
  CoffeeGrounds =coffee_grounds,
  FreshManure =fresh_manure,
  DryLeaves =dry_leaves,
  Straw =straw,
  Sawdust =sawdust,
  ShreddedPaper =shredded_paper,
  WoodChips =wood_chips,
}

export const MaterialCNRatios: Record<MaterialType, { min: number; max: number; default: number }> = {
  [MaterialType.GrassClippings]: { min: 15, max: 25, default: 20 },
  [MaterialType.VegetableScraps]: { min: 12, max: 20, default: 15 },
  [MaterialType.FruitWaste]: { min: 25, max: 40, default: 35 },
  [MaterialType.CoffeeGrounds]: { min: 20, max: 25, default: 20 },
  [MaterialType.FreshManure]: { min: 10, max: 20, default: 15 },
  [MaterialType.DryLeaves]: { min: 40, max: 80, default: 60 },
  [MaterialType.Straw]: { min: 50, max: 100, default: 75 },
  [MaterialType.Sawdust]: { min: 200, max: 600, default: 400 },
  [MaterialType.ShreddedPaper]: { min: 150, max: 200, default: 175 },
  [MaterialType.WoodChips]: { min: 400, max: 700, default: 600 },
};

// Rest of file remains the same
