import { Component, inject } from '@angular/core';
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

    form: FormGroup;

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
        this.newEmployee = this.newEmployeeDefaults();
        this.employees.push(this.newEmployeeDefaults());
        this.editIndex = this.employees.length - 1;
    }

    edit(index: number): void {

        this.editIndex = index;

        const emp = this.employees[index];

        this.editModel = {
            id: emp.id || this.generateId(emp.name),
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
    }

    update(index: number): void {

        if (!this.editModel.name || !this.editModel.designation) {
            return;
        }

        const updatedEmp = {
            ...this.employees[index],
            id: this.employees[index].id || this.editModel.id || this.generateId(this.editModel.name),
            name: this.editModel.name,
            designation: this.editModel.designation,
            location: this.editModel.location,
            reportTo: this.editModel.reportTo
        };

        this.employees[index] = updatedEmp;
        this.employeeService.save(updatedEmp).catch(error => console.error('Unable to save employee:', error));

        this.cancelEdit();
    }

    cancelEdit(): void {
        this.editIndex = null;

        this.editModel = {
            name: '',
            designation: EmployeeRole.CA,
            location: '',
            reportTo: ''
        };

        this.form.reset();
    }

    delete(index: number): void {

        const [removed] = this.employees.splice(index, 1);
        if (removed?.id) {
            this.employeeService.remove(removed.id).catch(error => console.error('Unable to delete employee:', error));
        }

        if (this.editIndex === index) {
            this.cancelEdit();
        }
    }

    generateId(name: string): string {

        const parts = name.split(' ');

        let id = parts[0].substring(0, 5);

        while (id.length < 5) {
            id += parts[0].at(-1) ?? '';
        }

        return id + (parts.at(-1)?.substring(0, 3) || '');
    }

    getUpperRoleEmployees(currentRole: EmployeeRole) {

        if (!currentRole) {
            return [];
        }

        return this.employees.filter(
            e => e.designation === currentRole + 1
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

        return this.employees.filter(emp => {
            const matchLocation =
                !this.filterModel.location ||
                emp.location === this.filterModel.location &&
                emp.designation > this.filterModel.designation;


            return matchLocation;
        });
    }

    private newEmployeeDefaults(): Employee {
        return {
            id: '',
            name: '',
            designation: EmployeeRole.CA,
            location: this.filterModel.location || '',
            reportTo: this.filterModel.reportTo || ''
        };
    }
}