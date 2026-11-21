// ============================================
// ENUMS
// ============================================

import { EmployeeRole } from "./employee.model";

export enum TargetType {
  UNIT_BASED = 'Unit Based', // based on number of cars sold
  VALUE_BASED = 'Value Based' // based on total sales value
}

export enum CarType {
  ELECTRIC = 'Electric',
  ICE = 'ICE' // Internal Combustion Engine
}

export enum SchemeType {
  VOLUME_BASED = 'Volume Based',
  MODEL_BONUS = 'Model Bonus',
  TARGET_ACHIEVEMENT = 'Target Achievement',
  LOCATION_BASED = 'Location Based',
  ACCESSORIES = 'Accessories',
  DISCOUNT_BASED = 'Discount Based',
  STOCK_REDUCTION = 'Stock Reduction',
  GM_TARGET = 'GM Target'
}

export enum PeriodType {
  MONTHLY = 'Monthly',
  CUSTOM = 'Custom Duration'
}

// ============================================
// MAIN INCENTIVE SCHEME
// ============================================

export interface IncentiveScheme {
  id?: string;
  name: string;
  month: string; // YYYY-MM format
  startDate?: Date; // for custom duration
  endDate?: Date; // for custom duration
  createdDate?: Date;
  updatedDate?: Date;
  locations?: string[]; // <-- at scheme level
  schemes: SubScheme[];
}

// ============================================
// SUB-SCHEME BASE
// ============================================

export interface SubScheme {
  id?: string;
  type: SchemeType;
  name: string;
  priority: number; // execution order (lower = earlier)
  // location?: string; // <-- removed from sub-scheme

  // Type-specific configurations
  volumeConfig?: VolumeSchemeConfig;
  modelBonusConfig?: ModelBonusConfig;
  targetAchievementConfig?: TargetAchievementConfig;
  locationConfig?: LocationTargetConfig;
  accessoriesConfig?: AccessoriesConfig;
  discountConfig?: DiscountIncentiveConfig;
  stockReductionConfig?: StockReductionConfig;
  gmTargetConfig?: GMTargetConfig;

  // Optional persisted form fields (older forms copy these outside the config).
  carModels?: string[];
  carTypes?: string[];
  modelBonusTiers?: ModelBonus[];
  stockReductionTiers?: StockReductionTier[];
  accessoryTiers?: AccessoryTier[];
  gmTargetTiers?: GMTargetTier[];
}

// ============================================
// 1. VOLUME-BASED SCHEME
// ============================================

export interface VolumeSchemeConfig {
  tiers: VolumeTier[];
  carModels?: string[];
  selectors?: VolumeModelSelector[];
  carTypes?: string[];
  carModel?: string; // optional: specific model
  carType?: CarType; // optional: specific type
  applyStockDifferential?: boolean;
  modelTabs?: VolumeModelTab[];
}

export interface VolumeModelSelector {
  model?: string;
  productId?: string;
  variant?: string;
  fuelType?: string;
  engine?: string;
  transmission?: string;
}

export interface VolumeModelTab {
  carModels: string[];
  selectors?: VolumeModelSelector[];
  carTypes?: string[];
  applyStockDifferential?: boolean;
  tiers: VolumeTier[];
}

export interface VolumeTier {
  slab?: string;
  rank?: string | EmployeeRole;
  minVolume: number;
  maxVolume: number;
  incentiveAmount: number; // for stock cars
  incentiveAmountNonStock?: number; // for non-stock cars
  description?: string;
}

// ============================================
// 2. MODEL BONUS SCHEME
// ============================================

export interface ModelBonusConfig {
  bonuses: ModelBonus[];
}

export interface ModelBonus {
  slab?: string;
  rank?: string; // optional: specific rank (empty = all ranks)
  carModels?: string[]; // optional: specific car models (empty array = all models)
  numberOfCars: number; // number of cars to be sold
  fixedIncentiveAmount: number; // fixed incentive amount per achievement
  description?: string;
}

// ============================================
// 3. TARGET ACHIEVEMENT BONUS
// ============================================

export type TargetAchievementCategory = 'Finance' | 'Extended Warranty';

export interface TargetAchievementTier {
  slab?: string;
  category: TargetAchievementCategory;
  rank?: string | EmployeeRole;
  requiredAchievementPercent: number;
  bonusAmount: number;
  perCarValue: boolean;
}

export interface TargetAchievementConfig {
  tiers?: TargetAchievementTier[];
  // Legacy single-tier fields remain readable for existing schemes.
  requiredAchievementPercent: number;
  bonusAmount: number;
  bonusPercent?: number;
  applyToRanks?: EmployeeRole[];
}

// ============================================
// 4. LOCATION-BASED TARGETS
// ============================================

export interface LocationTargetConfig {
  locationTargets: LocationTarget[];
}

export interface LocationTarget {
  slab?: string;
  location: string;
  rank?: string | EmployeeRole;
  targetUnits: number;
  targetPercent?: number;
  targetValue?: number;
  bonusAmount: number;
  description?: string;
}

// ============================================
// 5. ACCESSORIES INCENTIVE
// ============================================

export interface AccessoriesConfig {
  tiers: AccessoryTier[];
}

export interface AccessoryTier {
  slab?: string;
  rank?: string; // optional: specific rank (empty = all ranks)
  amount: number; // accessory sales amount
  incentiveAmount?: number; // fixed incentive for the selected slab
  incentivePercent?: number; // percentage of amount as incentive
  description?: string;
}

// ============================================
// 6. DISCOUNT-BASED INCENTIVE
// ============================================

export interface DiscountIncentiveConfig {
  tiers: DiscountTier[];
  applyTo?: 'add' | 'deduct'; // whether to add or deduct from total
}

export interface DiscountTier {
  minDiscountPercent: number;
  maxDiscountPercent: number;
  incentiveAmount?: number; // flat amount
  incentivePercent?: number; // percentage adjustment
  isDeduction?: boolean; // true if this reduces incentive
  description?: string;
}

// ============================================
// 7. STOCK REDUCTION SCHEME
// ============================================

export interface StockReductionConfig {
  tiers: StockReductionTier[];
}

export interface StockReductionTier {
  slab?: string;
  rank?: string; // optional: specific rank (empty = all ranks)
  minStockDays: number; // minimum stock aging in days
  maxStockDays: number; // maximum stock aging in days
  saleTarget: number; // number of units to sell
  incentiveAmount: number; // incentive for this tier
  description?: string;
}

// ============================================
// 8. GM TARGET SCHEME
// ============================================

export interface GMTargetConfig {
  tiers: GMTargetTier[];
}

export interface GMTargetTier {
  carModels?: string[]; // optional: specific car models
  numberOfCars: number; // number of cars sold target
  additionalDiscountPercent: number; // additional discount percentage
  description?: string;
}

// ============================================
// LEGACY SUPPORT (for backward compatibility)
// ============================================

export interface IncentiveRule {
  id?: string;
  carModel: string;
  manufacturingYear: number;
  employeeRank: EmployeeRole;
  targetType: TargetType;
  monthlyTarget: number;
  slabs: IncentiveSlab[];
}

export interface IncentiveSlab {
  minTarget: number;
  maxTarget: number;
  achievementPercent: number;
  carIncentivePercent: number;
  accessoryIncentivePercent: number;
  flatBonus?: number;
}

export interface VolumeIncentive {
  minVolume: number;
  maxVolume: number;
  employeeRank: EmployeeRole;
  incentiveAmount: number;
  incentiveAmountNonStock?: number;
  applyStockDifferential?: boolean;
  carModel?: string;
  carType?: CarType;
  description?: string;
}

// ============================================
// METADATA
// ============================================

export interface SchemeMetadata {
  schemeId: string;
  month: string;
  totalRules: number;
  applicableModels: string[];
  applicableYears: number[];
}