import { Injectable, inject } from '@angular/core';
import { Employee, EmployeeRole } from '../core/models/employee.model';
import { DatabaseService } from '../core/db/database.service';
import { EmployeeDoc } from '../core/db/schemas';

/** Initial employee master used to seed the database on first run. */
export const DEFAULT_EMPLOYEES: Employee[] = [
    { id: 'SAPARGAN', name: 'GANESH SAPAR', designation: EmployeeRole.GM, location: 'Bhosari', reportTo: '' },
    { id: 'PATILSHE', name: 'SHEKHAR PATIL', designation: EmployeeRole.GM, location: 'Bhosari', reportTo: '' },
    { id: 'DHULESHW', name: 'SHWETA DHULE', designation: EmployeeRole.GM, location: 'Bhosari', reportTo: '' },
    { id: 'JATHAAMO', name: 'AMOL JATHAR', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'SAPARGAN' },
    { id: 'AMOLGHU', name: 'AMOL GHUTE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'JATHAAMO' },
    { id: 'PRAVINPA', name: 'PRAVIN PANGE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'JATHAAMO' },
    { id: 'SUMITJA', name: 'SUMIT JADHAV', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'JATHAAMO' },
    { id: 'PAWARMAN', name: 'MANISH PAWAR', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'SAPARGAN' },
    { id: 'KUMBHTEJ', name: 'TEJAS KUMBHAR', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'SAPARGAN' },
    { id: 'JAMBHVAI', name: 'VAIBHAV JAMBHALE', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'SAPARGAN' },
    { id: 'KAMBLAKS', name: 'AKSHAY KAMBLE', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'PATILSHE' },
    { id: 'SAHURASH', name: 'ASHISH SAHURKAR', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'PATILSHE' },
    { id: 'BHANDISH', name: 'ISHWAR BHANDE', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'PATILSHE' },
    { id: 'BABARANI', name: 'ANIKET BABAR', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'BHANDISH' },
    { id: 'ARUNEDIP', name: 'DIPAK ARUNE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'BHANDISH' },
    { id: 'KHANDMON', name: 'MONIKA KHANDAGALE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'BHANDISH' },
    { id: 'PAYGUNIL', name: 'NILESH PAYGUDE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'BHANDISH' },
    { id: 'PAWARVIN', name: 'VINAYAK PAWAR', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'BHANDISH' },
    { id: 'BHINGNIK', name: 'NIKHIL BHINGARDIVE', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'PATILSHE' },
    { id: 'PAWARPRA', name: 'PRANAV PAWAR', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'PATILSHE' },
    { id: 'DAHATPRA', name: 'PRAVIN DAHATONDE', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'PATILSHE' },
    { id: 'KADAMSID', name: 'SIDDHANATH KADAM', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'PATILSHE' },
    { id: 'KANDEDIP', name: 'DIPAK KANDELE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'PAWARMAN' },
    { id: 'KADAMKAR', name: 'KARAN KADAM', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'PAWARMAN' },
    { id: 'BHOITRAH', name: 'RAHUL BHOITE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'PAWARMAN' },
    { id: 'KUTHERUS', name: 'RUSHIKESH KUTHE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'PAWARMAN' },
    { id: 'BATHEAJI', name: 'AJINKYA BATHE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'KUMBHTEJ' },
    { id: 'JAWALNEE', name: 'NEELMANI JAWALE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'KUMBHTEJ' },
    { id: 'BODHESWA', name: 'SWAPNIL BODHE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'KUMBHTEJ' },
    { id: 'GAIKWAPE', name: 'APEKSHA GAIKWAD', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'JAMBHVAI' },
    { id: 'BHOSAPRA', name: 'PRATIK BHOSALE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'JAMBHVAI' },
    { id: 'SANASAMO', name: 'AMOL SANAS', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'KAMBLAKS' },
    { id: 'INGULSOH', name: 'SOHAM INGULKAR', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'KAMBLAKS' },
    { id: 'MALUSSUY', name: 'SUYOG MALUSARE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'KAMBLAKS' },
    { id: 'MAHATVIJ', name: 'VIJAY MAHATO', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'KAMBLAKS' },
    { id: 'JARANAMO', name: 'AMOL JARANDE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'SAHURASH' },
    { id: 'BANDAANI', name: 'ANIL BANDAL', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'SAHURASH' },
    { id: 'PAWARROH', name: 'ROHIT PAWAR', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'SAHURASH' },
    { id: 'SHITOROH', name: 'ROHIT SHITOLE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'SAHURASH' },
    { id: 'SHAHAVIS', name: 'VISHAL SHAHANE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'SAHURASH' },
    { id: 'WAGHMNAY', name: 'NAYANA WAGHMARE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'PAWARPRA' },
    { id: 'JAGTAVIK', name: 'VIKRANT CHANDRASHEKHAR JAGTAP', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'PAWARPRA' },
    { id: 'HIVALANU', name: 'ANURAG HIVALE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'DAHATPRA' },
    { id: 'BANSOPRA', name: 'PRAMOD BANSODE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'DAHATPRA' },
    { id: 'BURANSOU', name: 'SOURABH BURANDE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'DAHATPRA' },
    { id: 'BIRMANIR', name: 'NIRANJAN BIRMAL', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'KADAMSID' },
    { id: 'GIRIGSUR', name: 'SURAJ GIRIGOSAVI', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'KADAMSID' },
    { id: 'GHATOSWA', name: 'SWARAJ GHATOLE', designation: EmployeeRole.CA, location: 'Bhosari', reportTo: 'KADAMSID' },
    { id: 'MARNEAJI', name: 'AJINKYA MARNE', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'DHULESHW' },
    { id: 'SATPUNIS', name: 'NISHANT SATPUTE', designation: EmployeeRole.TL, location: 'Bhosari', reportTo: 'DHULESHW' }
];

@Injectable({
    providedIn: 'root'
})
export class EmployeeService {

    private readonly database = inject(DatabaseService);

    // Kept as a stable array reference; components bind to it directly.
    private readonly employees: Employee[] = [];

    /** Loads employees from the database and keeps the in-memory list in sync. */
    async load(): Promise<void> {
        const collection = this.database.db.employees;
        this.replaceAll(await collection.find().exec());
        collection.find().$.subscribe(docs => this.replaceAll(docs));
    }

    async save(employee: Employee): Promise<void> {
        await this.database.db.employees.upsert({
            id: employee.id,
            name: employee.name,
            designation: employee.designation,
            location: employee.location ?? '',
            reportTo: employee.reportTo ?? ''
        });
    }

    async remove(id: string): Promise<void> {
        await this.database.db.employees.findOne(id).remove();
    }

    getManagers(): Employee[] {
        return this.employees.filter(emp => emp.designation === EmployeeRole.GM);
    }

    getManagerById(id: string): Employee | undefined {
        return this.employees.find(emp => emp.id === id && emp.designation === EmployeeRole.GM);
    }

    getTLsByGM(reportTo: string): Employee[] {
        return this.employees.filter(emp => emp.reportTo === reportTo && emp.designation === EmployeeRole.TL);
    }

    getCAsByTL(reportTo: string): Employee[] {
        return this.employees.filter(emp => emp.reportTo === reportTo && emp.designation === EmployeeRole.CA);
    }

    getEmployees(): Employee[] {
        return this.employees;
    }

    /** Finds an employee by id or name (case-insensitive). */
    findEmployee(idOrName?: string): Employee | undefined {
        const key = (idOrName ?? '').trim().toUpperCase();
        if (!key) {
            return undefined;
        }

        return this.employees.find(emp => emp.id.toUpperCase() === key || emp.name.toUpperCase() === key);
    }

    /** True when the employee is the manager or reports to them at any level. */
    isInReportingLine(employeeId: string, managerId: string): boolean {
        const visited = new Set<string>();
        let current: string | undefined = employeeId;

        while (current && !visited.has(current)) {
            if (current === managerId) {
                return true;
            }

            visited.add(current);
            current = this.employees.find(emp => emp.id === current)?.reportTo;
        }

        return false;
    }

    private replaceAll(docs: { toJSON(): EmployeeDoc }[]): void {
        const unsaved = this.employees.filter(emp => !emp.id);
        const saved = docs.map(doc => {
            const data = doc.toJSON();
            return { ...data, designation: data.designation as EmployeeRole };
        });
        this.employees.splice(0, this.employees.length, ...saved, ...unsaved);
    }
}