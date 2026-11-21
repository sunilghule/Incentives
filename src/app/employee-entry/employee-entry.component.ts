import { Component, ElementRef, QueryList, ViewChildren, inject } from '@angular/core';
import {
    FormBuilder,
    FormGroup,
    Validators,
    ReactiveFormsModule,
    FormsModule
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Employee, EmployeeDesignation, EmployeeRole } from '../core/models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { ToastService } from '../shared/toast.message/toast.service';

@Component({
    selector: 'app-employee-entry',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule],
    templateUrl: './employee-entry.component.html',
    styleUrl: './employee-entry.component.scss'
})
export class EmployeeEntryComponent {

    roleCA = EmployeeRole.CA;
    roleAll = EmployeeRole.All;

    employeeService = inject(EmployeeService);
    private readonly toastService = inject(ToastService);

    form: FormGroup;

    @ViewChildren('employeeRow') employeeRows!: QueryList<ElementRef<HTMLTableRowElement>>;

    employeeRoles = Object.values(EmployeeRole)
        .filter((role): role is EmployeeRole => typeof role === 'number');

    locations = ['Bhosari', 'Handewadi', 'Warge', 'Talegaon'];

    employees = this.employeeService.getEmployees();

    EmployeeRoleLabels = EmployeeDesignation;

    editIndex: number | null = null;

    editModel: {
        id?: string;
        name: string;
        designation: EmployeeRole;
        location: string;
        reportTo?: string;
    } = {
            name: '',
            designation: EmployeeRole.CA,
            location: '',
            reportTo: ''
        };

    filterModel = {
        designation: EmployeeRole.All,
        reportTo: '',
        location: ''
    };

    newEmployee = this.newEmployeeDefaults();

    constructor(private readonly fb: FormBuilder) {
        this.form = this.fb.group({
            name: ['', Validators.required],
            designation: [EmployeeRole.CA, Validators.required],
            location: ['']
        });
    }

    clearFilters(): void {
        this.filterModel = {
            designation: EmployeeRole.All,
            reportTo: '',
            location: ''
        };

        this.newEmployee = this.newEmployeeDefaults();
        this.toastService.show('Employee filters cleared.', 'success');
    }

    save(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        if (this.editIndex === null) {
            const newEmp = {
                id: this.generateId(this.form.value.name),
                name: this.form.value.name,
                designation: this.form.value.designation as EmployeeRole,
                location: this.form.value.location
            };

            this.employees.push(newEmp);
        } else {
            const updatedEmp = {
                ...this.employees[this.editIndex],
                name: this.form.value.name,
                designation: this.form.value.designation as EmployeeRole,
                location: this.form.value.location
            };

            this.employees[this.editIndex] = updatedEmp;

            this.editIndex = null;
            this.editModel = {
                name: '',
                designation: EmployeeRole.CA,
                location: '',
                reportTo: ''
            };
        }

        this.form.reset();
    }

    addNewEmployee(): void {
        if (this.editIndex !== null) {
            this.toastService.show('Finish or cancel the current edit first.', 'error');
            return;
        }

        this.newEmployee = this.newEmployeeDefaults();
        this.employees.push(this.newEmployeeDefaults());
        this.edit(this.employees.length - 1);
        this.focusRow(this.editIndex, true);
        this.toastService.show('New employee row added.', 'success');
    }

    edit(index: number): void {
        if (this.editIndex !== null && this.editIndex !== index) {
            this.toastService.show('Finish or cancel the current edit first.', 'error');
            return;
        }

        this.editIndex ??= index;

        const emp = this.employees[index];

        this.editModel = {
            id: emp.id || (emp.name.trim() ? this.generateId(emp.name) : ''),
            name: emp.name,
            designation: emp.designation,
            location: emp.location || '',
            reportTo: emp.reportTo
        };

        this.form.patchValue({
            name: emp.name,
            designation: emp.designation,
            location: emp.location || ''
        });
        this.focusRow(index, false);
        this.toastService.show('Employee edit mode enabled.', 'info');
    }

    async update(index: number): Promise<void> {
        if (!this.isValidEmployeeName(this.editModel.name) || !this.isEmployeeIdUnique(index)
            || !this.editModel.designation) {
            this.toastService.show('Enter a valid unique employee name and ID.', 'error');
            return;
        }

        const name = this.editModel.name.trim().replace(/\s+/g, ' ');

        const updatedEmp = {
            ...this.employees[index],
            id: this.employees[index].id || this.generateId(name),
            name,
            designation: this.editModel.designation,
            location: this.editModel.location,
            reportTo: this.editModel.reportTo
        };

        try {
            await this.employeeService.save(updatedEmp);
            this.employees[index] = updatedEmp;
            this.cancelEdit(false);
            this.toastService.show('Employee saved successfully.', 'success');
        } catch (error) {
            console.error('Unable to save employee:', error);
            this.toastService.show('Unable to save employee.', 'error');
        }
    }

    cancelEdit(showMessage = true): void {
        const index = this.editIndex;
        if (index !== null && !this.employees[index]?.id && !this.editModel.name.trim()) {
            this.employees.splice(index, 1);
        }
        this.editIndex = null;

        this.editModel = {
            name: '',
            designation: EmployeeRole.CA,
            location: '',
            reportTo: ''
        };

        this.form.reset();
        if (showMessage) {
            this.toastService.show('Employee edit cancelled.', 'info');
        }
    }

    async delete(index: number): Promise<void> {
        if (this.editIndex !== null) {
            this.toastService.show('Finish or cancel the current edit first.', 'error');
            return;
        }

        const employee = this.employees[index];
        if (!employee || !globalThis.confirm(`Delete ${employee.name || 'this employee'}?`)) {
            if (!employee) this.toastService.show('Employee was not found.', 'error');
            return;
        }

        try {
            if (employee.id) await this.employeeService.remove(employee.id);
            this.employees.splice(index, 1);
            this.toastService.show('Employee deleted successfully.', 'success');
        } catch (error) {
            console.error('Unable to delete employee:', error);
            this.toastService.show('Unable to delete employee.', 'error');
        }

        if (this.editIndex === index) {
            this.cancelEdit();
        }
    }

    getEmployeeIndex(employee: Employee): number {
        return this.employees.indexOf(employee);
    }

    generateId(name: string): string {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length < 2) {
            return '';
        }

        const firstName = parts[0];
        const surname = parts.slice(1).join(' ');
        return this.generateIdFromParts(firstName, surname);
    }

    generateIdFromParts(firstName: string, surname: string): string {
        if (!firstName.trim() || !surname.trim()) {
            return '';
        }

        const normalizedSurname = surname.trim().toUpperCase();
        const surnameId = normalizedSurname.length >= 5
            ? normalizedSurname.substring(0, 5)
            : normalizedSurname.padEnd(5, normalizedSurname.at(-1));
        const normalizedFirstName = firstName.trim().split(/\s+/)[0].toUpperCase();

        return surnameId + normalizedFirstName.substring(0, 3).padEnd(3, normalizedFirstName.at(-1));
    }

    isValidEmployeeName(name: string): boolean {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        return parts.length >= 2;
    }

    isEmployeeIdUnique(index: number): boolean {
        const id = this.employees[index]?.id || this.editModel.id;
        if (!id) {
            return false;
        }
        return !this.employees.some((employee, employeeIndex) =>
            employeeIndex !== index && employee.id.toUpperCase() === id.toUpperCase());
    }

    updateNewEmployeeId(index: number): void {
        if (!this.employees[index]?.id) {
            this.editModel.id = this.generateId(this.editModel.name);
        }
    }

    getUpperRoleEmployees(currentRole: EmployeeRole) {

        if (!currentRole) {
            return [];
        }

        return this.employees.filter(
            e => e.designation === currentRole + 1 && e.designation !== EmployeeRole.CA
        );
    }

    getDesignationLabel(designation: EmployeeRole): string {
        return EmployeeDesignation[designation] || '';
    }

    getReportToLabel(reportTo?: string): string {

        if (!reportTo) {
            return '';
        }

        const employee = this.employees.find(emp => emp.id === reportTo);

        if (!employee) {
            return reportTo;
        }

        return `${employee.name} - ${this.getDesignationLabel(employee.designation)}`;
    }

    /**
     * Automatically re-evaluated whenever filterModel changes
     */
    get filteredEmployees() {

        return this.employees.filter(emp => {

            const matchLocation =
                !this.filterModel.location ||
                emp.location === this.filterModel.location;

            const matchDesignation =
                this.filterModel.designation === EmployeeRole.All ||
                emp.designation === this.filterModel.designation;

            const matchReportTo =
                !this.filterModel.reportTo ||
                emp.reportTo === this.filterModel.reportTo;

            return (
                matchLocation &&
                matchDesignation &&
                matchReportTo
            );
        });
    }

    get filteredReportTo() {
        return this.employees.filter(emp =>
            emp.designation !== EmployeeRole.CA &&
            (this.filterModel.designation === EmployeeRole.All || emp.designation > this.filterModel.designation) &&
            (!this.filterModel.location || emp.location === this.filterModel.location)
        );
    }

    private focusRow(index: number | null, select: boolean): void {
        if (index === null) {
            return;
        }

        setTimeout(() => {
            const employee = this.employees[index];
            const visibleIndex = this.filteredEmployees.indexOf(employee);
            const row = visibleIndex >= 0 ? this.employeeRows?.get(visibleIndex)?.nativeElement : undefined;
            if (!row) {
                return;
            }
            const input = row.querySelector<HTMLInputElement>('input');
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            input?.focus({ preventScroll: true });
            if (select) {
                input?.select();
            }
        });
    }

    private newEmployeeDefaults(): Employee {
        return {
            id: '',
            name: '',
            designation: this.filterModel.designation === EmployeeRole.All
                ? EmployeeRole.CA
                : this.filterModel.designation,
            location: this.filterModel.location || '',
            reportTo: this.filterModel.reportTo || ''
        };
    }
}