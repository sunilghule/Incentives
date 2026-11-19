export interface IncentiveCalculation {
  employeeId: string;
  employeeName: string;
  month: string;
  totalTarget: number;
  totalAchieved: number;
  achievementPercent: number;

  // Scheme-specific incentives (calculated in sequence)
  volumeIncentive?: number;
  modelBonusIncentive?: number;
  targetAchievementBonus?: number;
  locationBonus?: number;
  accessoriesIncentive?: number;
  discountIncentive?: number; // can be negative (deduction)
  stockReductionIncentive?: number;
  warnings?: string[];
  // Legacy support
  carIncentive?: number;
  accessoryIncentive?: number;
  flatBonus?: number;
  volumeBonus?: number;
  totalIncentive: number;
  breakdown: IncentiveBreakdown[];
  schemeBreakdown?: SchemeBreakdown[]; // new detailed breakdown
}

export interface IncentiveBreakdown {
  carModel: string;
  year: number;
  sales: number;
  carValue: number;
  accessoryValue: number;
  carIncentive: number;
  accessoryIncentive: number;
  flatBonus?: number;
}

export interface SchemeBreakdown {
  schemeName: string;
  schemeType: string;
  amount: number;
  details?: string;
  priority: number;
}