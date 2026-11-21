
import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule, FormArray, AbstractControl } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { IncentiveService } from '../core/services/incentive.service';
import { IncentiveCalculation } from '../core/models/incentive.model';
import { CarType } from '../core/models/incentive-scheme.model';
import { SalesEntry } from './sales-entry.model';
import { Employee, EmployeeRole } from '../core/models/employee.model';
import { LOCATIONS } from '../core/db/seed-data';
import { ExcelImportHelper } from '../shared/helper/excel-import-helper';
import { getPreviousMonth } from '../shared/helper/date-helper';
import { ConfirmModalComponent } from '../shared/confirmation.message/confirm-modal.component';
import {
  EmployeeFilterComponent, EmployeeFilterModel, applyEmployeeDefaults, createEmployeeFilter, matchesEmployeeFilter
} from '../shared/employee-filter/employee-filter.component';
import { EmployeeService } from '../services/employee.service';
import { DatabaseService } from '../core/db/database.service';
import { MonthlyEntryStore } from '../core/db/monthly-entry-store';
import { SalesDoc } from '../core/db/schemas';
import { IncentiveResultsComponent } from './incentive-results.component';

@Component({
  selector: 'app-sales-entry',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ConfirmModalComponent, EmployeeFilterComponent, IncentiveResultsComponent],
  templateUrl: './sales-entry.component.html',
  styleUrls: ['./sales-entry.component.scss']
})
export class SalesEntryComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  employees: Employee[] = [];
  managers: Employee[] = [];
  teamLeads: Employee[] = [];

  carModels: string[] = [
    'Swift',
    'Baleno',
    'Brezza',
    'Ertiga',
    'Fronx',
    'Grand Vitara',
    'Jimny',
    'Dzire'
  ];

  carTypes = Object.values(CarType);

  readonly locations = LOCATIONS;

  manufacturingYears: number[] = [];

  salesHistory: SalesEntry[] = [];

  selectedEmployee?: Employee;

  selectedMonth: string = getPreviousMonth();

  selectedEmployeeForCalculation: string = '';

  incentiveResult: IncentiveCalculation | null = null;

  hasScheme: boolean = false;

  private readonly destroy$ = new Subject<void>();

  @ViewChildren('vehicleSalesRow') salesRows!: QueryList<ElementRef<HTMLTableRowElement>>;

  @ViewChild('salesTableContainer') salesTableContainer?: ElementRef<HTMLDivElement>;

  editingIndex: number | null = null;

  pendingRemoveIndex: number | null = null;

  filter: EmployeeFilterModel = createEmployeeFilter();

  private isNewRow = false;

  private editSnapshot: Partial<Record<string, unknown>> | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly incentiveService: IncentiveService,
    private readonly employeeService: EmployeeService,
    private readonly database: DatabaseService,
    private readonly changeDetectorRef: ChangeDetectorRef
  ) { }

  private readonly store = new MonthlyEntryStore<SalesDoc>(() => this.database.db.sales);

  get salesEntries(): FormArray {
    return this.form.get(
      'salesEntries'
    ) as FormArray;
  }

  ngOnInit(): void {
    this.initForm();
    this.onMonthChange();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  initForm(): void {
    this.form = this.fb.group({
      salesEntries: this.fb.array([])
    });
    this.editingIndex = null;
    this.isNewRow = false;
    this.editSnapshot = null;
  }

  get isEditing(): boolean {
    return this.editingIndex !== null;
  }

  get associateOptions(): Employee[] {
    return this.employeeService.getEmployees()
      .filter(employee =>
        employee.designation === EmployeeRole.CA && employee.location === this.filter.location);
  }

  get teamLeadOptions(): Employee[] {
    return this.employeeService.getEmployees()
      .filter(employee =>
        employee.designation === EmployeeRole.TL && employee.location === this.filter.location);
  }

  isRowVisible(index: number, control: AbstractControl): boolean {
    return index === this.editingIndex ||
      matchesEmployeeFilter(this.filter, control.getRawValue(), this.employeeService);
  }

  hasVisibleRows(): boolean {
    return this.salesEntries.controls.some((control, index) => this.isRowVisible(index, control));
  }

  addSalesEntryRow(): void {
    if (this.isEditing) {
      return;
    }

    this.salesEntries.push(this.createSalesEntryGroup({ location: this.filter.location }));
    this.editingIndex = this.salesEntries.length - 1;
    this.isNewRow = true;
    this.editSnapshot = null;
    this.changeDetectorRef.detectChanges();
    this.focusRowInput(this.editingIndex, false);
  }

  editSalesEntryRow(index: number): void {
    if (this.isEditing) {
      return;
    }

    const group = this.salesEntries.at(index);
    this.editSnapshot = group.getRawValue();
    this.isNewRow = false;
    this.editingIndex = index;
    group.enable();
    this.changeDetectorRef.detectChanges();
    this.focusRowInput(index, false);
  }

  saveSalesEntryRow(index: number): void {
    const group = this.salesEntries.at(index);
    applyEmployeeDefaults(group, this.employeeService);

    if (group.invalid) {
      group.markAllAsTouched();
      this.changeDetectorRef.detectChanges();
      this.focusRowInput(index, true);
      return;
    }

    this.persist(this.store.save(this.toSalesDoc(group)));
    group.disable();
    this.endEdit();
  }

  cancelSalesEntryRow(index: number): void {
    if (this.isNewRow) {
      this.salesEntries.removeAt(index);
    } else {
      const group = this.salesEntries.at(index);
      group.reset(this.editSnapshot);
      group.disable();
    }

    this.endEdit();
  }

  private endEdit(): void {
    this.editingIndex = null;
    this.isNewRow = false;
    this.editSnapshot = null;
    this.changeDetectorRef.markForCheck();
  }

  private focusRowInput(index: number, firstInvalid: boolean): void {
    // Wait for the new row to be rendered and its controls enabled.
    setTimeout(() => {
      const row = this.salesRows?.get(index)?.nativeElement;
      if (!row) {
        return;
      }

      // Reactive forms set the disabled property, not the attribute, so use :enabled.
      const editable = 'input:enabled, select:enabled, textarea:enabled';
      const input = (firstInvalid ? row.querySelector<HTMLInputElement>('.ng-invalid:enabled') : null)
        ?? row.querySelector<HTMLInputElement>(editable);

      const container = this.salesTableContainer?.nativeElement;
      if (container && index === this.salesEntries.length - 1) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

      input?.focus({ preventScroll: true });
      if (input?.type === 'text') {
        input.select();
      }
    });
  }

  removeSalesEntryRow(index: number): void {
    if (this.isEditing) {
      return;
    }

    this.pendingRemoveIndex = index;
  }

  confirmRemoveSalesEntryRow(): void {
    const index = this.pendingRemoveIndex;
    this.pendingRemoveIndex = null;

    if (index === null) {
      return;
    }

    if (this.salesEntries.length > 1) {
      const id: string = this.salesEntries.at(index).get('id')?.value;
      this.salesEntries.removeAt(index);
      if (id) {
        this.persist(this.store.remove(id));
      }
      this.changeDetectorRef.markForCheck();
    }
  }

  onMonthChange(): void {

    this.loadSalesHistory();
    this.checkScheme();
    void this.loadEntries();
    this.incentiveResult = null;
    this.selectedEmployeeForCalculation = '';
    if (this.form) {
      this.form.patchValue({
        month: this.selectedMonth
      });
    }
  }

  checkScheme(): void {
    const scheme = this.incentiveService.getSchemeForMonth(this.selectedMonth);
    this.hasScheme = !!scheme;
  }

  loadSalesHistory(): void {

    this.incentiveService.salesEntries$.pipe(takeUntil(this.destroy$))
      .subscribe((entries: SalesEntry[]) => {
        this.salesHistory = entries.filter(
          e => e.invoiceDate === this.selectedMonth)
          .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
      });
  }

  saveSalesEntry(): void {
    if (this.isEditing) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      alert(
        'Please fill all required fields correctly.'
      );

      return;
    }

    // Rows are disabled when not in edit mode, so use raw value.
    const docs = this.salesEntries.controls.map(control => this.toSalesDoc(control));

    this.store.saveMany(docs)
      .then(() => alert('Sales entries saved successfully!'))
      .catch(error => this.handleDbError(error));
  }

  private async loadEntries(): Promise<void> {
    try {
      const docs = await this.store.byMonth(this.selectedMonth);
      this.initForm();

      for (const doc of docs) {
        const group = this.createSalesEntryGroup({ ...doc, product: doc.parentProductLine });
        group.disable();
        this.salesEntries.push(group);
      }

      if (docs.length === 0) {
        this.addSalesEntryRow();
      }

      this.changeDetectorRef.markForCheck();
    } catch (error) {
      this.handleDbError(error);
    }
  }

  private toSalesDoc(control: AbstractControl): SalesDoc {
    const idControl = control.get('id');
    if (idControl && !idControl.value) {
      idControl.setValue(crypto.randomUUID());
    }

    return { ...control.getRawValue(), month: this.selectedMonth } as SalesDoc;
  }

  private persist(operation: Promise<void>): void {
    operation.catch(error => this.handleDbError(error));
  }

  private handleDbError(error: unknown): void {
    console.error('Database error:', error);
    alert('Unable to access the local database.');
  }


  deleteSalesEntry(entryId: string): void {
    if (confirm('Are you sure you want to delete this sales entry?')) {
      this.incentiveService.deleteSalesEntry(
        entryId
      );
    }
  }

  calculateIncentive(): void {
    if (!this.selectedEmployeeForCalculation) {
      alert('Please select an employee.');
      return;
    }

    if (!this.hasScheme) {
      alert('No scheme found for the selected month.');
      this.incentiveResult = null;
      return;
    }

    const result = this.incentiveService.calculateIncentive(
      this.selectedEmployeeForCalculation, this.selectedMonth);

    if (result) {
      this.incentiveResult = result;
    } else {
      alert('No sales data found for the selected employee and month.');
      this.incentiveResult = null;
    }
  }

  resetForm(): void {
    this.selectedEmployee = undefined;
    void this.loadEntries();
  }


  getManagerName(managerId?: string): string {

    if (!managerId) {
      return 'N/A';
    }

    const manager = this.employees.find(e => e.id === managerId);
    return manager?.name || 'N/A';
  }


  getTeamLeadName(teamLeadId?: string): string {
    if (!teamLeadId) {
      return 'N/A';
    }

    const teamLead = this.employees.find(e => e.id === teamLeadId);
    return teamLead?.name || 'N/A';
  }

  getEmployeeName(employeeId: string): string {
    const employee = this.employees.find(e => e.id === employeeId);
    return employee?.name || 'Unknown';
  }

  trackByControl(index: number, control: AbstractControl): AbstractControl {
    return control;
  }

  onExcelFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (extension !== '.xlsx' && extension !== '.xls') {

      alert('Please select a valid Excel file (.xlsx or .xls).');
      input.value = '';
      return;
    }

    ExcelImportHelper.readFile(file).then((excelData: Record<string, unknown>[]) => {
      console.log('Parsed Excel data:', excelData);
      if (excelData.length === 0) {
        alert('No data rows were found in the Excel file.');
        return;
      }

      const result = this.importSalesEntriesFromExcel(excelData);
      console.log('Excel import result:', result);

      if (result.importedCount === 0) {
        alert(
          'No valid sales entries were found in the Excel file.\n\n' +
          'Please check that the Excel contains an Invoice Number column with values.'
        );

        return;
      } else {
        this.changeDetectorRef.markForCheck();
      }


      let message = `${result.importedCount} sales entr${result.importedCount === 1
        ? 'y'
        : 'ies'
        } imported successfully.`;


      if (result.skippedCount > 0) {
        message += `\n${result.skippedCount} row(s) were skipped.`;
      }

      alert(message);
      this.focusLastSalesEntry();
    }
    )
      .catch((error: unknown) => {
        console.error('Excel import error:', error);
        alert(error instanceof Error ? error.message : 'Unable to process the Excel file.');
      }
      )
      .finally(
        () => {
          input.value = '';
        }
      );
  }

  private importSalesEntriesFromExcel(rows: Record<string, unknown>[]): { importedCount: number; skippedCount: number; } {

    let importedCount = 0;
    let skippedCount = 0;
    const docs: SalesDoc[] = [];

    for (const row of rows) {
      const invoiceNumber = this.excelText(row['invoice number']);

      if (!invoiceNumber) {
        skippedCount++;
        continue;
      }

      const invoiceDate = this.excelDateToInputDate(row['invoice date']);
      if (invoiceDate.substring(0, 7) !== this.selectedMonth) {
        skippedCount++;
        continue;
      }
      const salesEntry: Partial<SalesEntry> = {
        invoiceNumber,
        invoiceDate,
        stockDate: this.excelDateToInputDate(row['stock date']),
        chassisNo: this.excelText(row['chassis no']),
        engineNo: this.excelText(row['engine no.']),
        product: this.excelText(row['parent product line']),
        ca: this.excelText(row['ca name'] ?? row['ca']),
        tl: this.excelText(row['tl']),
        location: this.excelText(row['order sales team'] ?? row['location']),
        tmInvoiceDate: this.excelDateToInputDate(row['tm invoice date'])
      };

      const group = this.createSalesEntryGroup(salesEntry);
      applyEmployeeDefaults(group, this.employeeService);
      group.disable();
      this.salesEntries.push(group);
      docs.push(this.toSalesDoc(group));
      importedCount++;
    }

    this.persist(this.store.saveMany(docs));
    return { importedCount, skippedCount };
  }

  private excelText(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  }

  private excelDateToInputDate(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    if (value instanceof Date) {

      if (Number.isNaN(value.getTime())) {
        return '';
      }

      return this.formatInputDate(
        value
      );
    }

    if (typeof value === 'number') {

      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + value * 86400000);

      if (Number.isNaN(date.getTime())) {
        return '';
      }

      return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0')].join('-');
    }

    const stringValue = this.excelText(value);

    if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
      return stringValue;
    }

    const indianDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(stringValue);

    if (indianDate) {
      const [, day, month, year] = indianDate;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const parsedDate = new Date(stringValue);

    if (!Number.isNaN(parsedDate.getTime())) {
      return this.formatInputDate(parsedDate);
    }

    console.warn('Unable to parse Excel date:', value);
    return '';
  }

  private formatInputDate(date: Date): string {

    return [
      date.getFullYear(),
      String(
        date.getMonth() + 1
      ).padStart(2, '0'),
      String(
        date.getDate()
      ).padStart(2, '0')
    ].join('-');
  }

  private focusLastSalesEntry(): void {
    this.changeDetectorRef.detectChanges();
    this.salesRows.last?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private createSalesEntryGroup(entry?: Partial<SalesEntry>): FormGroup {

    return this.fb.group({

      id: [entry?.id ?? ''],

      invoiceNumber: [
        entry?.invoiceNumber ?? '',
        Validators.required
      ],

      invoiceDate: [
        entry?.invoiceDate ?? '',
        Validators.required
      ],

      stockDate: [
        entry?.stockDate ?? '',
        Validators.required
      ],

      chassisNo: [
        entry?.chassisNo ?? '',
        Validators.required
      ],

      engineNo: [
        entry?.engineNo ?? '',
        Validators.required
      ],

      parentProductLine: [
        entry?.product ?? '',
        Validators.required
      ],

      ca: [
        entry?.ca ?? '',
        Validators.required
      ],

      location: [
        entry?.location ?? '',
        Validators.required
      ],

      tl: [entry?.tl ?? ''],

      tmInvoiceDate: [
        entry?.tmInvoiceDate ?? '',
        Validators.required
      ]
    });
  }

}