import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { IncentiveScheme, SchemeMetadata } from '../models/incentive-scheme.model';
import { IncentiveCalculation } from '../models/incentive.model';
import { IncentiveCalculationService } from './incentive-calculation.service';
import { SalesEntry } from '../../sales-entry/sales-entry.model';
import { Employee, EmployeeRole } from '../models/employee.model';
import { DatabaseService } from '../db/database.service';
import { DynamicEntryDoc, SalesDoc } from '../db/schemas';
import { SchemeService } from './scheme.service';
import { SchemeWorkbook } from '../../shared/helper/scheme-workbook';
import { IncentiveCalculationContext } from './new-incentive-calculation.service';

@Injectable({
  providedIn: 'root'
})
export class IncentiveService {
  private readonly salesEntries = new BehaviorSubject<SalesEntry[]>([]);
  private readonly employees = new BehaviorSubject<Employee[]>([]);
  private readonly accessories = new BehaviorSubject<DynamicEntryDoc[]>([]);

  private readonly database = inject(DatabaseService);
  private readonly schemeService = inject(SchemeService);

  schemes$ = this.schemeService.schemes$;
  salesEntries$ = this.salesEntries.asObservable();
  employees$ = this.employees.asObservable();
  accessories$ = this.accessories.asObservable();

  constructor(private readonly calculationService: IncentiveCalculationService) { }

  /** Loads data from the database and keeps the subjects in sync with it. */
  async load(): Promise<void> {
    const db = this.database.db;

    const [sales, employees] = await Promise.all([
      db.sales.find().exec(),
      db.employees.find().exec(),
      this.schemeService.load()
    ]);

    this.salesEntries.next(sales.map(doc => this.toSalesEntry(doc.toMutableJSON())));
    this.employees.next(employees.map(doc => this.toEmployee(doc.toMutableJSON())));
    const accessories = await db.accessory.find().exec();
    this.accessories.next(accessories.map(doc => doc.toMutableJSON()));

    db.sales.find().$.subscribe(docs =>
      this.salesEntries.next(docs.map(doc => this.toSalesEntry(doc.toMutableJSON()))));
    db.employees.find().$.subscribe(docs =>
      this.employees.next(docs.map(doc => this.toEmployee(doc.toMutableJSON()))));
    db.accessory.find().$.subscribe(docs =>
      this.accessories.next(docs.map(doc => doc.toMutableJSON())));
  }

  // ==================== SCHEME MANAGEMENT ====================

  /**
   * Save or update an incentive scheme (ruleset for a month)
   */
  async saveScheme(scheme: IncentiveScheme): Promise<IncentiveScheme | undefined> {
    SchemeWorkbook.validate(scheme);
    const clash = this.schemeService.getAll()
      .find(s => s.month === scheme.month && s.id !== scheme.id);

    if (clash && !globalThis.confirm(`A scheme already exists for ${scheme.month}. Do you want to replace it?`)) {
      return;
    }

    // Replace the month's existing document rather than creating duplicate rulesets.
    const saved = await this.schemeService.save({ ...scheme, id: clash?.id ?? scheme.id });
    if (clash && scheme.id && scheme.id !== clash.id) {
      await this.schemeService.delete(scheme.id);
    }
    return saved;
  }

  getSchemeForMonth(month: string): IncentiveScheme | undefined {
    return this.schemeService.getForMonth(month);
  }

  getAllSchemes(): IncentiveScheme[] {
    return this.schemeService.getAll();
  }

  getSchemeMetadata(schemeId: string): SchemeMetadata | undefined {
    return this.schemeService.getMetadata(schemeId);
  }

  async deleteScheme(schemeId: string): Promise<void> {
    await this.schemeService.delete(schemeId);
  }

  async cloneSchemeToNewMonth(schemeId: string, newMonth: string): Promise<IncentiveScheme | undefined> {
    const original = this.schemeService.getById(schemeId);
    if (!original) throw new Error('Scheme not found.');
    return this.saveScheme({ ...structuredClone(original), id: undefined, month: newMonth });
  }

  // ==================== SALES ENTRY MANAGEMENT ====================

  saveSalesEntry(entry: SalesEntry): void {
    // Ensure all required fields for the new model are present
    const requiredFields = [
      'invoiceDate', 'stockDate', 'invoiceNumber',
      'chassisNo', 'engineNo', 'parentProductLine', 'ca', 'tl', 'location', 'sm',
      'tmInvoiceDate', 'stockAgeing', 'club'
    ];
    for (const field of requiredFields) {
      if (!(field in entry) || entry[field as keyof SalesEntry] === undefined || entry[field as keyof SalesEntry] === '') {
        alert(`Missing required field: ${field}`);
        return;
      }
    }

    const entries = this.salesEntries.value;
    if (entry.id) {
      const index = entries.findIndex(e => e.id === entry.id);
      if (index > -1) {
        entries[index] = entry;
      }
    } else {
      entry.id = this.generateId();
      (entry as any).createdAt = new Date();
      entries.push(entry);
    }

    this.salesEntries.next(entries);
    this.persist(this.database.db.sales.upsert(this.toSalesDoc(entry)));
  }

  getSalesEntriesForMonth(month: string, employeeId?: string): SalesEntry[] {
    // Filter by invoiceDate month (YYYY-MM) and optionally by CA (employeeId argument now maps to ca field)
    return this.salesEntries.value.filter(e => {
      const entryMonth = e.invoiceDate ? e.invoiceDate.substring(0, 7) : '';
      const matchesMonth = entryMonth === month;
      const matchesEmployee = !employeeId || e.ca === employeeId;
      return matchesMonth && matchesEmployee;
    });
  }

  getAllSalesEntries(): SalesEntry[] {
    // Sort by invoiceDate descending
    return [...this.salesEntries.value].sort((a, b) => {
      const dateA = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
      const dateB = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
      return dateB - dateA;
    });
  }

  deleteSalesEntry(entryId: string): void {
    const entries = this.salesEntries.value.filter(e => e.id !== entryId);
    this.salesEntries.next(entries);
    this.persist(this.database.db.sales.findOne(entryId).remove());
  }

  // ==================== EMPLOYEE MANAGEMENT ====================

  saveEmployee(employee: Employee): void {
    const employees = this.employees.value;
    const index = employees.findIndex(e => e.id === employee.id);

    if (index > -1) {
      employees[index] = employee;
    } else {
      employees.push(employee);
    }

    this.employees.next(employees);
    this.persist(this.database.db.employees.upsert({
      id: employee.id,
      name: employee.name,
      designation: employee.designation,
      location: employee.location ?? '',
      reportTo: employee.reportTo ?? ''
    }));
  }

  getAllEmployees(): Employee[] {
    return [...this.employees.value].sort((a, b) => a.name.localeCompare(b.name));
  }

  getEmployeesByRole(role: EmployeeRole): Employee[] {
    return this.employees.value.filter(e => e.designation === role);
  }

  getEmployee(employeeId: string): Employee | undefined {
    return this.employees.value.find(e => e.id === employeeId);
  }

  deleteEmployee(employeeId: string): void {
    const employees = this.employees.value.filter(e => e.id !== employeeId);
    this.employees.next(employees);
    this.persist(this.database.db.employees.findOne(employeeId).remove());
  }

  // ==================== INCENTIVE CALCULATION ====================

  calculateIncentive(employeeId: string, month: string, context: IncentiveCalculationContext = {}): IncentiveCalculation | null {
    const employee = this.getEmployee(employeeId);
    const scheme = this.getSchemeForMonth(month);
    if (!employee || !scheme) return null;
    return this.calculationService.calculate(employee, month, scheme, this.salesEntries.value,
      this.accessories.value, this.employees.value, context);
  }

  calculateMonthlyIncentives(month: string): IncentiveCalculation[] | null {
    if (!this.getSchemeForMonth(month)) return null;
    return this.getAllEmployees().map(employee => this.calculateIncentive(employee.id, month)!)
      .filter(result => result !== null);
  }

  // ==================== UTILITY METHODS ====================

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  private persist(operation: Promise<unknown>): void {
    operation.catch(error => console.error('Database write failed:', error));
  }

  private toSalesEntry(doc: SalesDoc): SalesEntry {
    return { ...doc, product: doc.parentProductLine } as unknown as SalesEntry;
  }

  private toSalesDoc(entry: SalesEntry): SalesDoc {
    const value = entry as unknown as Partial<SalesDoc> & { product?: string };
    return {
      id: entry.id,
      month: entry.invoiceDate?.substring(0, 7) ?? '',
      invoiceNumber: value.invoiceNumber ?? '',
      invoiceDate: value.invoiceDate ?? '',
      stockDate: value.stockDate ?? '',
      chassisNo: value.chassisNo ?? '',
      engineNo: value.engineNo ?? '',
      parentProductLine: value.parentProductLine ?? value.product ?? '',
      ca: value.ca ?? '',
      tl: value.tl ?? '',
      location: value.location ?? '',
      tmInvoiceDate: value.tmInvoiceDate ?? ''
    };
  }

  private toEmployee(doc: { id: string; name: string; designation: number; location: string; reportTo: string }): Employee {
    return { ...doc, designation: doc.designation as EmployeeRole };
  }

  exportScheme(schemeId: string): string {
    return this.schemeService.export(schemeId);
  }

  async importScheme(schemeJson: string): Promise<IncentiveScheme | undefined> {
    const scheme = JSON.parse(schemeJson) as IncentiveScheme;
    return this.saveScheme({ ...scheme, id: undefined });
  }

  clearAllData(): void {
    if (confirm('Are you sure you want to clear ALL data? This cannot be undone!')) {
      const db = this.database.db;
      this.persist(Promise.all([
        this.schemeService.deleteAll(),
        db.sales.find().remove(),
        db.employees.find().remove()
      ]));
    }
  }
}