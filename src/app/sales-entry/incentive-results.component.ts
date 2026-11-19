import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { IncentiveService } from '../core/services/incentive.service';
import { IncentiveCalculation } from '../core/models/incentive.model';

@Component({
    selector: 'app-incentive-results',
    imports: [ReactiveFormsModule, CurrencyPipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <section class="border rounded p-3 mt-3" aria-labelledby="calculationHeading">
      <h6 id="calculationHeading">Incentive calculation — {{ month() }}</h6>
      <p class="small text-muted">Uses saved rows and the saved monthly scheme. Unsaved edits are excluded.
        Demo rules are examples, not an approved payout policy.</p>
      <div class="d-flex gap-2 flex-wrap align-items-end">
        <div>
          <label for="calculationEmployee" class="form-label">Employee</label>
          <select id="calculationEmployee" class="form-select form-select-sm" [formControl]="employee">
            <option value="">All employees</option>
            @for (person of employees(); track person.id) {
              <option [value]="person.id">{{ person.name }}</option>
            }
          </select>
        </div>
        <button type="button" class="btn btn-sm btn-success" (click)="calculate()">Calculate saved data</button>
      </div>
      @if (message()) { <p class="mt-2 mb-0" role="status">{{ message() }}</p> }
      @if (results().length) {
        <div class="overflow-auto mt-3" style="max-height: 22rem">
          @for (result of results(); track result.employeeId) {
            <details class="border-bottom py-2">
              <summary>{{ result.employeeName }} — {{ result.totalIncentive | currency:'INR' }}
                ({{ result.totalAchieved }} achieved)</summary>
              <div class="table-responsive">
                <table class="table table-sm">
                  <caption class="visually-hidden">Rule breakdown for {{ result.employeeName }}</caption>
                  <thead><tr><th scope="col">Rule</th><th scope="col">Amount</th><th scope="col">Details</th></tr></thead>
                  <tbody>
                    @for (item of result.schemeBreakdown; track $index) {
                      <tr><td>{{ item.schemeName }}</td><td>{{ item.amount | currency:'INR' }}</td><td>{{ item.details }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              @for (warning of result.warnings; track $index) {
                <p class="small text-danger mb-1">{{ warning }}</p>
              }
            </details>
          }
        </div>
      }
    </section>
  `
})
export class IncentiveResultsComponent {
    readonly month = input.required<string>();
    private readonly incentives = inject(IncentiveService);
    readonly employee = new FormControl('', { nonNullable: true });
    readonly results = signal<IncentiveCalculation[]>([]);
    readonly message = signal('');
    private readonly savedData = toSignal(combineLatest([
        this.incentives.employees$, this.incentives.salesEntries$,
        this.incentives.schemes$, this.incentives.accessories$
    ]));
    private readonly selectedEmployee = toSignal(this.employee.valueChanges);
    readonly employees = computed(() => this.savedData()?.[0] ?? []);

    constructor() {
        effect(() => {
            this.month();
            this.savedData();
            this.selectedEmployee();
            this.results.set([]);
            this.message.set('');
        });
    }

    calculate(): void {
        const employeeId = this.employee.value;
        const result = employeeId
            ? this.incentives.calculateIncentive(employeeId, this.month())
            : this.incentives.calculateMonthlyIncentives(this.month());
        const results = Array.isArray(result) ? result : [];
        if (result && !Array.isArray(result)) results.push(result);
        this.results.set(results);
        this.message.set(result === null ? 'Save a scheme for this month and select a valid employee first.'
            : `${this.results().length} employee result(s).`);
    }
}