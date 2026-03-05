import * as path from "path";
import * as fs from "fs";
import type {
  AdvisorConfig,
  CompostPile,
  PredictionResult,
  TemperatureReading,
  MoistureReading,
  TurnEvent,
} from "./types.js";

export interface AdvisorAnalysis {
  shouldTurn: boolean;
  turnReason: string | null;
  isAnaerobicRisk: boolean;
  anaerobicReason: string | null;
  isStalled: boolean;
  stallReason: string | null;
  currentCNRatio: number;
  cnRatioStatus: "optimal" | "low" | "high";
  prediction: PredictionResult | null;
}

export interface DegreeDayAccumulator {
  totalDegreeDays: number;
  daysCount: number;
  averageDailyTemp: number;
}

export class CompostAdvisor {
  private readonly config: AdvisorConfig;

  constructor(config: Partial<AdvisorConfig> = {}) {
    this.config = {
      turnTemperatureThreshold: 65,
      turnIntervalDays: 3,
      anaerobicMoistureThreshold: 70,
      minTemperature: 40,
      maxTemperature: 75,
      targetCNRatio: 30,
      cnRatioTolerance: 10,
      ...config,
    };
  }

  public analyzePile(pile: CompostPile): AdvisorAnalysis {
    const currentTemp = this.getLatestTemperature(pile);
    const currentMoisture = this.getLatestMoisture(pile);
    const daysSinceLastTurn = this.getDaysSinceLastTurn(pile);
    const currentCNRatio = this.calculateCurrentCNRatio(pile);

    const shouldTurn = this.shouldTurnPile(pile, currentTemp, daysSinceLastTurn);
    const isAnaerobicRisk = this.isAnaerobicRisk(currentTemp, currentMoisture);
    const isStalled = this.isPileStalled(pile, currentTemp);
    const cnRatioStatus = this.assessCNRatio(currentCNRatio);
    const prediction = this.predictCompletion(pile);

    return {
      shouldTurn: shouldTurn.shouldTurn,
      turnReason: shouldTurn.reason,
      isAnaerobicRisk: isAnaerobicRisk.isRisk,
      anaerobicReason: isAnaerobicRisk.reason,
      isStalled: isStalled.isStalled,
      stallReason: isStalled.reason,
      currentCNRatio,
      cnRatioStatus,
      prediction,
    };
  }

  private getLatestTemperature(pile: CompostPile): number | null {
    if (pile.temperatureReadings.length === 0) return null;
    const sorted = [...pile.temperatureReadings].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    return sorted[0].value;
  }

  private getLatestMoisture(pile: CompostPile): number | null {
    if (pile.moistureReadings.length === 0) return null;
    const sorted = [...pile.moistureReadings].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    return sorted[0].value;
  }

  private getDaysSinceLastTurn(pile: CompostPile): number | null {
    if (pile.turnEvents.length === 0) return null;
    const sorted = [...pile.turnEvents].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
    const lastTurn = sorted[0].timestamp;
    const now = new Date();
    const diffMs = now.getTime() - lastTurn.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private calculateCurrentCNRatio(pile: CompostPile): number {
    if (pile.inputs.length === 0) return this.config.targetCNRatio;

    let totalCarbon = 0;
    let totalNitrogen = 0;

    for (const input of pile.inputs) {
      const carbon = input.quantity * input.cnRatio;
      const nitrogen = input.quantity;
      totalCarbon += carbon;
      totalNitrogen += nitrogen;
    }

    if (totalNitrogen === 0) return this.config.targetCNRatio;
    return totalCarbon / totalNitrogen;
  }

  private shouldTurnPile(
    pile: CompostPile,
    currentTemp: number | null,
    daysSinceLastTurn: number | null
  ): { shouldTurn: boolean; reason: string | null } {
    const reasons: string[] = [];

    if (currentTemp !== null && currentTemp > this.config.turnTemperatureThreshold) {
      reasons.push(`Temperature (${currentTemp}°C) exceeds threshold (${this.config.turnTemperatureThreshold}°C)`);
    }

    if (daysSinceLastTurn !== null && daysSinceLastTurn >= this.config.turnIntervalDays) {
      reasons.push(`${daysSinceLastTurn} days since last turn exceeds interval (${this.config.turnIntervalDays} days)`);
    }

    if (this.detectTemperaturePlateau(pile)) {
      reasons.push("Temperature plateau detected");
    }

    return {
      shouldTurn: reasons.length > 0,
      reason: reasons.length > 0 ? reasons.join("; ") : null,
    };
  }

  private detectTemperaturePlateau(pile: CompostPile): boolean {
    if (pile.temperatureReadings.length < 5) return false;

    const sorted = [...pile.temperatureReadings].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    const recent = sorted.slice(-5);
    const values = recent.map(r => r.value);

    const smoothed = this.exponentialSmoothing(values, 0.3);
    const trend = this.calculateTrend(smoothed);

    return Math.abs(trend) < 0.5;
  }

  private exponentialSmoothing(data: number[], alpha: number): number[] {
    if (data.length === 0) return [];
    const smoothed: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      smoothed.push(alpha * data[i] + (1 - alpha) * smoothed[i - 1]);
    }
    return smoothed;
  }

  private calculateTrend(data: number[]): number {
    if (data.length < 2) return 0;
    const n = data.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  private isAnaerobicRisk(
    currentTemp: number | null,
    currentMoisture: number | null
  ): { isRisk: boolean; reason: string | null } {
    if (currentMoisture === null || currentTemp === null) {
      return { isRisk: false, reason: null };
    }

    if (
      currentMoisture > this.config.anaerobicMoistureThreshold &&
      currentTemp < this.config.minTemperature + 10
    ) {
      return {
        isRisk: true,
        reason: `High moisture (${currentMoisture}%) with low temperature (${currentTemp}°C) indicates anaerobic risk`,
      };
    }

    return { isRisk: false, reason: null };
  }

  private isPileStalled(
    pile: CompostPile,
    currentTemp: number | null
  ): { isStalled: boolean; reason: string | null } {
    if (currentTemp === null) {
      return { isStalled: false, reason: null };
    }

    if (currentTemp < this.config.minTemperature) {
      return {
        isStalled: true,
        reason: `Temperature (${currentTemp}°C) below minimum threshold (${this.config.minTemperature}°C)`,
      };
    }

    const degreeDays = this.calculateDegreeDays(pile);
    if (degreeDays.daysCount >= 7 && degreeDays.averageDailyTemp < this.config.minTemperature + 5) {
      return {
        isStalled: true,
        reason: `Low average temperature (${degreeDays.averageDailyTemp.toFixed(1)}°C) over ${degreeDays.daysCount} days`,
      };
    }

    return { isStalled: false, reason: null };
  }

  private assessCNRatio(ratio: number): "optimal" | "low" | "high" {
    const target = this.config.targetCNRatio;
    const tolerance = this.config.cnRatioTolerance;
    const lowerBound = target - tolerance;
    const upperBound = target + tolerance;

    if (ratio < lowerBound) return "low";
    if (ratio > upperBound) return "high";
    return "optimal";
  }

  private predictCompletion(pile: CompostPile): PredictionResult | null {
    const degreeDays = this.calculateDegreeDays(pile);
    if (degreeDays.daysCount < 3) return null;

    const requiredDegreeDays = 2000;
    const remainingDegreeDays = Math.max(0, requiredDegreeDays - degreeDays.totalDegreeDays);

    let estimatedDaysRemaining: number;
    let confidenceScore: number;
    const factors: string[] = [];

    if (degreeDays.averageDailyTemp > 55) {
      estimatedDaysRemaining = remainingDegreeDays / 40;
      confidenceScore = 0.8;
      factors.push("High temperature activity");
    } else if (degreeDays.averageDailyTemp > 45) {
      estimatedDaysRemaining = remainingDegreeDays / 30;
      confidenceScore = 0.7;
      factors.push("Moderate temperature activity");
    } else {
      estimatedDaysRemaining = remainingDegreeDays / 20;
      confidenceScore = 0.5;
      factors.push("Low temperature activity");
    }

    const cnStatus = this.assessCNRatio(this.calculateCurrentCNRatio(pile));
    if (cnStatus === "optimal") {
      confidenceScore *= 1.1;
      factors.push("Optimal C:N ratio");
    } else {
      confidenceScore *= 0.9;
      factors.push(`Suboptimal C:N ratio (${cnStatus})`);
    }

    const now = new Date();
    const completionDate = new Date(now.getTime() + estimatedDaysRemaining * 24 * 60 * 60 * 1000);

    return {
      estimatedCompletionDate: completionDate,
      confidenceScore: Math.min(1, Math.max(0, confidenceScore)),
      factors,
    };
  }

  private calculateDegreeDays(pile: CompostPile): DegreeDayAccumulator {
    if (pile.temperatureReadings.length === 0) {
      return { totalDegreeDays: 0, daysCount: 0, averageDailyTemp: 0 };
    }

    const sorted = [...pile.temperatureReadings].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const dailyTemps = new Map<string, number[]>();
    for (const reading of sorted) {
      const date = reading.timestamp.toISOString().split("T")[0];
      if (!dailyTemps.has(date)) {
        dailyTemps.set(date, []);
      }
      dailyTemps.get(date)!.push(reading.value);
    }

    let totalDegreeDays = 0;
    const dailyAverages: number[] = [];

    for (const [_, temps] of dailyTemps) {
      const avg = temps.reduce((sum, t) => sum + t, 0) / temps.length;
      dailyAverages.push(avg);
      const degreeDays = Math.max(0, avg - 10);
      totalDegreeDays += degreeDays;
    }

    const averageDailyTemp = dailyAverages.length > 0
      ? dailyAverages.reduce((sum, t) => sum + t, 0) / dailyAverages.length
      : 0;

    return {
      totalDegreeDays,
      daysCount: dailyTemps.size,
      averageDailyTemp,
    };
  }

  public getConfig(): AdvisorConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AdvisorConfig>): void {
    Object.assign(this.config, newConfig);
  }
}