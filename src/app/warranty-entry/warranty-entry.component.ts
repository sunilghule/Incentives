import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ExcelImportHelper } from '../shared/helper/excel-import-helper';
import { getPreviousMonth } from '../shared/helper/date-helper';
import { ConfirmModalComponent } from '../shared/confirmation.message/confirm-modal.component';
import {
    EmployeeFilterComponent, EmployeeFilterModel, applyEmployeeDefaults, createEmployeeFilter, matchesEmployeeFilter
} from '../shared/employee-filter/employee-filter.component';
import { EmployeeService } from '../services/employee.service';
import { DatabaseService } from '../core/db/database.service';
import { MonthlyEntryStore } from '../core/db/monthly-entry-store';
import { DynamicEntryDoc } from '../core/db/schemas';
import { WarrantyEntry, WarrantyEntryField } from './warranty-entry.model';

@Component({
    selector: 'app-warranty-entry',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, ConfirmModalComponent, EmployeeFilterComponent],
    templateUrl: './warranty-entry.component.html',
    styleUrls: ['./warranty-entry.component.scss']
})
export class WarrantyEntryComponent implements OnInit {
    form!: FormGroup;
    selectedMonth = getPreviousMonth();

    fields: WarrantyEntryField[] = [
        { key: 'date', label: 'DATE', inputType: 'date' },
        { key: 'ewPolicyNo', label: 'EW Policy No', inputType: 'text' },
        { key: 'name', label: 'Name', inputType: 'text' },
        { key: 'chassisNo', label: 'Chassis No', inputType: 'text' },
        { key: 'ca', label: 'CA', inputType: 'text' },
        { key: 'tl', label: 'TL', inputType: 'text' },
        { key: 'amt', label: 'AMT', inputType: 'number' },
        { key: 'remark', label: 'remark', inputType: 'text', required: false },
        { key: 'location', label: 'Location', inputType: 'text', required: false, hidden: true }
    ];

    @ViewChildren('warrantyEntryRow') warrantyRows!: QueryList<ElementRef<HTMLTableRowElement>>;

    @ViewChild('warrantyTableContainer') warrantyTableContainer?: ElementRef<HTMLDivElement>;

    editingIndex: number | null = null;

    pendingRemoveIndex: number | null = null;

    filter: EmployeeFilterModel = createEmployeeFilter();

    private isNewRow = false;

    private editSnapshot: Record<string, unknown> | null = null;

    constructor(
        private readonly fb: FormBuilder,
        private readonly employeeService: EmployeeService,
        private readonly database: DatabaseService,
        private readonly changeDetectorRef: ChangeDetectorRef
    ) { }

    private readonly store = new MonthlyEntryStore<DynamicEntryDoc>(() => this.database.db.warranty);

    get warrantyEntries(): FormArray {
        return this.form.get('warrantyEntries') as FormArray;
    }

    ngOnInit(): void {
        this.initForm();
        this.loadEntries();
    }

    initForm(): void {
        this.form = this.fb.group({
            warrantyEntries: this.fb.array([])
        });
        this.editingIndex = null;
        this.isNewRow = false;
        this.editSnapshot = null;
    }

    get isEditing(): boolean {
        return this.editingIndex !== null;
    }

    isRowVisible(index: number, control: AbstractControl): boolean {
        return index === this.editingIndex
            || matchesEmployeeFilter(this.filter, control.getRawValue(), this.employeeService);
    }

    hasVisibleRows(): boolean {
        return this.warrantyEntries.controls.some((control, index) => this.isRowVisible(index, control));
    }

    addWarrantyEntryRow(): void {
        if (this.isEditing) {
            return;
        }

        this.warrantyEntries.push(this.createWarrantyEntryGroup({ values: { location: this.filter.location } }));
        this.editingIndex = this.warrantyEntries.length - 1;
        this.isNewRow = true;
        this.editSnapshot = null;
        this.changeDetectorRef.detectChanges();
        this.focusRowInput(this.editingIndex, false);
    }

    editWarrantyEntryRow(index: number): void {
        if (this.isEditing) {
            return;
        }

        const group = this.warrantyEntries.at(index);
        this.editSnapshot = group.getRawValue();
        this.isNewRow = false;
        this.editingIndex = index;
        group.enable();
        this.changeDetectorRef.detectChanges();
        this.focusRowInput(index, false);
    }

    saveWarrantyEntryRow(index: number): void {
        const group = this.warrantyEntries.at(index);
        applyEmployeeDefaults(group, this.employeeService);

        if (group.invalid) {
            group.markAllAsTouched();
            this.changeDetectorRef.detectChanges();
            this.focusRowInput(index, true);
            return;
        }

        this.persist(this.store.save(this.toDoc(group)));
        group.disable();
        this.endEdit();
    }

    cancelWarrantyEntryRow(index: number): void {
        if (this.isNewRow) {
            this.warrantyEntries.removeAt(index);
        } else {
            const group = this.warrantyEntries.at(index);
            group.reset(this.editSnapshot);
            group.disable();
        }

        this.endEdit();
    }

    removeWarrantyEntryRow(index: number): void {
        if (this.isEditing) {
            return;
        }

        this.pendingRemoveIndex = index;
    }

    confirmRemoveWarrantyEntryRow(): void {
        const index = this.pendingRemoveIndex;
        this.pendingRemoveIndex = null;

        if (index === null) {
            return;
        }

        if (this.warrantyEntries.length > 1) {
            const id: string = this.warrantyEntries.at(index).get('id')?.value;
            this.warrantyEntries.removeAt(index);
            if (id) {
                this.persist(this.store.remove(id));
            }
            this.changeDetectorRef.markForCheck();
        }
    }

    private endEdit(): void {
        this.editingIndex = null;
        this.isNewRow = false;
        this.editSnapshot = null;
        this.changeDetectorRef.markForCheck();
    }

    onMonthChange(): void {
        this.loadEntries();
    }

    saveWarrantyEntry(): void {
        if (this.isEditing) {
            return;
        }

        if (this.form.invalid) {
            this.form.markAllAsTouched();
            alert('Please fill all required fields correctly.');
            return;
        }

        const docs = this.warrantyEntries.controls.map(control => this.toDoc(control));

        this.store.saveMany(docs)
            .then(() => alert('Warranty entries saved successfully!'))
            .catch(error => this.handleDbError(error));
    }

    resetForm(): void {
        this.loadEntries();
    }

    private async loadEntries(): Promise<void> {
        try {
            const docs = await this.store.byMonth(this.selectedMonth);
            this.initForm();

            for (const doc of docs) {
                const group = this.createWarrantyEntryGroup({ id: doc.id, values: doc.values });
                group.disable();
                this.warrantyEntries.push(group);
            }

            if (docs.length === 0) {
                this.addWarrantyEntryRow();
            }

            this.changeDetectorRef.markForCheck();
        } catch (error) {
            this.handleDbError(error);
        }
    }

    private toDoc(control: AbstractControl): DynamicEntryDoc {
        const idControl = control.get('id');
        if (idControl && !idControl.value) {
            idControl.setValue(crypto.randomUUID());
        }

        const { id, ...values } = control.getRawValue() as Record<string, unknown>;
        const stringValues = Object.fromEntries(
            Object.entries(values).map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)])
        );

        return { id: String(id), month: this.selectedMonth, values: stringValues };
    }

    private persist(operation: Promise<void>): void {
        operation.catch(error => this.handleDbError(error));
    }

    private handleDbError(error: unknown): void {
        console.error('Database error:', error);
        alert('Unable to access the local database.');
    }

    trackByControl(index: number, control: AbstractControl): AbstractControl {
        return control;
    }

    trackByField(index: number, field: WarrantyEntryField): string {
        return field.key;
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
            if (excelData.length === 0) {
                alert('No data rows were found in the Excel file.');
                return;
            }

            const result = this.importWarrantyEntriesFromExcel(excelData);

            if (result.importedCount === 0) {
                alert('No valid warranty entries were found in the Excel file.');
                return;
            }

            let message = `${result.importedCount} warranty entr${result.importedCount === 1 ? 'y' : 'ies'} imported successfully.`;

            if (result.skippedCount > 0) {
                message += `\n${result.skippedCount} row(s) were skipped.`;
            }

            alert(message);
            this.focusLastWarrantyEntry();
        })
            .catch((error: unknown) => {
                console.error('Excel import error:', error);
                alert(error instanceof Error ? error.message : 'Unable to process the Excel file.');
            })
            .finally(() => {
                input.value = '';
            });
    }

    private importWarrantyEntriesFromExcel(rows: Record<string, unknown>[]): { importedCount: number; skippedCount: number; } {
        let importedCount = 0;
        let skippedCount = 0;
        const docs: DynamicEntryDoc[] = [];

        for (const row of rows) {
            const hasData = Object.values(row).some(value => String(value).trim() !== '');

            if (!hasData) {
                skippedCount++;
                continue;
            }

            const values: Record<string, string> = {};

            for (const field of this.fields) {
                values[field.key] = this.formatExcelValue(
                    this.getExcelValue(row, field.label),
                    field.inputType
                );
            }

            const group = this.createWarrantyEntryGroup({ values });
            applyEmployeeDefaults(group, this.employeeService);
            group.disable();
            this.warrantyEntries.push(group);
            docs.push(this.toDoc(group));
            importedCount++;
        }

        this.persist(this.store.saveMany(docs));
        return { importedCount, skippedCount };
    }

    private createWarrantyEntryGroup(entry?: WarrantyEntry): FormGroup {
        const controls: Record<string, unknown[]> = { id: [entry?.id ?? ''] };

        for (const field of this.fields) {
            controls[field.key] = [
                entry?.values[field.key] ?? '',
                field.required === false ? [] : Validators.required
            ];
        }

        return this.fb.group(controls);
    }

    private getExcelValue(row: Record<string, unknown>, label: string): unknown {
        return row[label.toLowerCase()] ?? '';
    }

    private formatExcelValue(value: unknown, inputType: WarrantyEntryField['inputType']): string {
        if (inputType === 'date') {
            return this.excelDateToInputDate(value);
        }

        return String(value ?? '').trim();
    }

    private excelDateToInputDate(value: unknown): string {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
                return '';
            }

            return this.formatInputDate(value);
        }

        if (typeof value === 'number') {
            const excelEpoch = new Date(Date.UTC(1899, 11, 30));
            const date = new Date(excelEpoch.getTime() + value * 86400000);

            if (Number.isNaN(date.getTime())) {
                return '';
            }

            return [
                date.getUTCFullYear(),
                String(date.getUTCMonth() + 1).padStart(2, '0'),
                String(date.getUTCDate()).padStart(2, '0')
            ].join('-');
        }

        const stringValue = String(value).trim();

        if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
            return stringValue;
        }

        const indianDate = stringValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

        if (indianDate) {
            const [, day, month, year] = indianDate;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        const parsedDate = new Date(stringValue);

        if (!Number.isNaN(parsedDate.getTime())) {
            return this.formatInputDate(parsedDate);
        }

        return '';
    }

    private formatInputDate(date: Date): string {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    private focusLastWarrantyEntry(): void {
        this.changeDetectorRef.detectChanges();
        this.warrantyRows?.last?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    private focusRowInput(index: number, firstInvalid: boolean): void {
        // Wait for the new row to be rendered and its controls enabled.
        setTimeout(() => {
            const row = this.warrantyRows?.get(index)?.nativeElement;
            if (!row) {
                return;
            }

            // Reactive forms set the disabled property, not the attribute, so use :enabled.
            const editable = 'input:enabled, select:enabled, textarea:enabled';
            const input = (firstInvalid ? row.querySelector<HTMLInputElement>('.ng-invalid:enabled') : null)
                ?? row.querySelector<HTMLInputElement>(editable);

            const container = this.warrantyTableContainer?.nativeElement;
            if (container && index === this.warrantyEntries.length - 1) {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            }
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

            input?.focus({ preventScroll: true });
            if (input?.type === 'text') {
                input.select();
            }
        });
    }
}