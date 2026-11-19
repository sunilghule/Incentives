import { Injectable, inject } from '@angular/core';
import { DynamicEntryDoc } from '../db/schemas';
import { Employee } from '../models/employee.model';
import { IncentiveScheme } from '../models/incentive-scheme.model';
import { IncentiveCalculation } from '../models/incentive.model';
import {
  IncentiveCalculationContext, IncentiveSale, NewIncentiveCalculationService
} from './new-incentive-calculation.service';

@Injectable({ providedIn: 'root' })
export class IncentiveCalculationService {
  private readonly engine = inject(NewIncentiveCalculationService);

  calculate(
    employee: Employee,
    month: string,
    scheme: IncentiveScheme,
    sales: readonly IncentiveSale[],
    accessories?: readonly DynamicEntryDoc[],
    employees?: readonly Employee[],
    context?: IncentiveCalculationContext
  ): IncentiveCalculation {
    return this.engine.calculate(employee, month, scheme, sales, accessories, employees, context);
  }
}

