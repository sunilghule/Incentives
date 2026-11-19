import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormsModule } from '@angular/forms';
import { Employee, EmployeeDesignation, EmployeeRole } from '../../core/models/employee.model';
import { EmployeeService } from '../../services/employee.service';

export interface EmployeeFilterModel {
    location: string;
    designation: EmployeeRole;
    reportTo: string;
}

export interface EmployeeFilterRow {
    ca?: string;
    tl?: string;
    location?: string;
}

export function createEmployeeFilter(): EmployeeFilterModel {
    return { location: '', designation: EmployeeRole.All, reportTo: '' };
}

/** Matches a row on location and on the CA/TL reporting line. */
export function matchesEmployeeFilter(
    filter: EmployeeFilterModel,
    row: EmployeeFilterRow,
    employeeService: EmployeeService
): boolean {
    const employee = employeeService.findEmployee(row.ca) ?? employeeService.findEmployee(row.tl);

    if (filter.location) {
        const location = filter.location.toLowerCase();
        const matchesLocation = (row.location ?? '').trim().toLowerCase() === location
            || employee?.location?.toLowerCase() === location;

        if (!matchesLocation) {
            return false;
        }
    }

    if (!filter.reportTo) {
        return true;
    }

    return !!employee && employeeService.isInReportingLine(employee.id, filter.reportTo);
}

/** Fills empty location / TL controls of a row from the CA's employee record. */
export function applyEmployeeDefaults(group: AbstractControl, employeeService: EmployeeService): void {
    const ca = employeeService.findEmployee(group.get('ca')?.value);
    if (!ca) {
        return;
    }

    const location = group.get('location');
    if (location && !location.value && ca.location) {
        location.setValue(ca.location);
    }

    const tl = group.get('tl');
    const teamLead = employeeService.findEmployee(ca.reportTo);
    if (tl && !tl.value && teamLead) {
        tl.setValue(teamLead.name);
    }
}

@Component({
    selector: 'app-employee-filter',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="d-flex align-items-center gap-2 w-auto">
        <select class="form-select form-select-sm" id="filterLocation" aria-label="Filter by Location"
            [disabled]="disabled" [ngModel]="filter.location" (ngModelChange)="update({ location: $event, reportTo: '' })">
            <option value="">All Locations</option>
            <option *ngFor="let loc of locations" [value]="loc">{{ loc }}</option>
        </select>

        <select class="form-select form-select-sm" id="filterDesignation" aria-label="Filter by Designation"
            [disabled]="disabled" [ngModel]="filter.designation"
            (ngModelChange)="update({ designation: $event, reportTo: '' })">
            <option *ngFor="let role of employeeRoles" [ngValue]="role">{{ employeeRoleLabels[role] }}</option>
        </select>

        <select class="form-select form-select-sm" id="filterReportTo" aria-label="Filter by Report To"
            [disabled]="disabled" [ngModel]="filter.reportTo" (ngModelChange)="update({ reportTo: $event })">
            <option value="">All Report To</option>
            <option *ngFor="let emp of reportToOptions" [ngValue]="emp.id">
                {{ emp.name }} - {{ employeeRoleLabels[emp.designation] }}
            </option>
        </select>

        <button class="btn btn-sm btn-outline-secondary" type="button" title="Clear Filters" [disabled]="disabled"
            (click)="clear()">
            <i class="bi bi-x-circle"></i>
        </button>
    </div>
    `
})
export class EmployeeFilterComponent {
    @Input() filter: EmployeeFilterModel = createEmployeeFilter();
    @Input() disabled = false;
    @Output() filterChange = new EventEmitter<EmployeeFilterModel>();

    private readonly employeeService = inject(EmployeeService);

    readonly locations = ['Bhosari', 'Handewadi', 'Warge', 'Talegaon'];

    readonly employeeRoles = Object.values(EmployeeRole)
        .filter((role): role is EmployeeRole => typeof role === 'number' && role !== EmployeeRole.NONE);

    readonly employeeRoleLabels = EmployeeDesignation;

    get reportToOptions(): Employee[] {
        return this.employeeService.getEmployees().filter(emp =>
            (!this.filter.location || emp.location === this.filter.location) &&
            (this.filter.designation === EmployeeRole.All || emp.designation === this.filter.designation));
    }

    update(patch: Partial<EmployeeFilterModel>): void {
        this.filter = { ...this.filter, ...patch };
        this.filterChange.emit(this.filter);
    }

    clear(): void {
        this.update(createEmployeeFilter());
    }
}
