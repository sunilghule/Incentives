export interface Employee {
    id: string;
    name: string;
    designation: EmployeeRole;
    reportTo?: string;
    location?: string;
}

export enum EmployeeRole {
    'All' = 0,    // All roles
    CA = 1,   // Customer Associate
    TL = 2,   // Team Lead
    SM = 3,   // Sales Manager
    SRSM = 4, // Senior Sales Manager
    AGM = 5,  // Assistant General Manager
    GM = 6,   // General Manager
    NONE = 7
}

export const EmployeeDesignation: Record<EmployeeRole, string> = {
    [EmployeeRole.All]: 'All roles',
    [EmployeeRole.CA]: 'Customer Associate',
    [EmployeeRole.TL]: 'Team Lead',
    [EmployeeRole.SM]: 'Sales Manager',
    [EmployeeRole.SRSM]: 'Senior Sales Manager',
    [EmployeeRole.AGM]: 'Assistant General Manager',
    [EmployeeRole.GM]: 'General Manager',
    [EmployeeRole.NONE]: '',
};
