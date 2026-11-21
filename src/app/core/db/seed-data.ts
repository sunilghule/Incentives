import { Employee, EmployeeRole } from '../models/employee.model';
import { SchemeType } from '../models/incentive-scheme.model';
import { DynamicEntryDoc, SalesDoc, SchemeDoc } from './schemas';

export const LOCATIONS = ['Bhosari', 'Handewadi', 'Warge', 'Talegaon'];

/** Extra teams so every location has a GM → TL → CA hierarchy for the dummy data. */
export const DUMMY_EMPLOYEES: Employee[] = [
    { id: 'KULKAAJA', name: 'AJAY KULKARNI', designation: EmployeeRole.GM, location: 'Handewadi', reportTo: '' },
    { id: 'DESHRAHU', name: 'RAHUL DESHMUKH', designation: EmployeeRole.TL, location: 'Handewadi', reportTo: 'KULKAAJA' },
    { id: 'SHINDPRI', name: 'PRIYA SHINDE', designation: EmployeeRole.TL, location: 'Handewadi', reportTo: 'KULKAAJA' },
    { id: 'MORESAC', name: 'SACHIN MORE', designation: EmployeeRole.CA, location: 'Handewadi', reportTo: 'DESHRAHU' },
    { id: 'GAIKWROH', name: 'ROHAN GAIKWAD', designation: EmployeeRole.CA, location: 'Handewadi', reportTo: 'DESHRAHU' },
    { id: 'NIKAMSNE', name: 'SNEHA NIKAM', designation: EmployeeRole.CA, location: 'Handewadi', reportTo: 'SHINDPRI' },
    { id: 'KADAMOMK', name: 'OMKAR KADAM', designation: EmployeeRole.CA, location: 'Handewadi', reportTo: 'SHINDPRI' },

    { id: 'JOSHIMAH', name: 'MAHESH JOSHI', designation: EmployeeRole.GM, location: 'Warge', reportTo: '' },
    { id: 'PATILKIR', name: 'KIRAN PATIL', designation: EmployeeRole.TL, location: 'Warge', reportTo: 'JOSHIMAH' },
    { id: 'SAWANANI', name: 'ANITA SAWANT', designation: EmployeeRole.TL, location: 'Warge', reportTo: 'JOSHIMAH' },
    { id: 'CHAVAVIS', name: 'VISHAL CHAVAN', designation: EmployeeRole.CA, location: 'Warge', reportTo: 'PATILKIR' },
    { id: 'MANEPOO', name: 'POOJA MANE', designation: EmployeeRole.CA, location: 'Warge', reportTo: 'PATILKIR' },
    { id: 'BHOSLAKS', name: 'AKSHAY BHOSLE', designation: EmployeeRole.CA, location: 'Warge', reportTo: 'SAWANANI' },
    { id: 'JADHANEH', name: 'NEHA JADHAV', designation: EmployeeRole.CA, location: 'Warge', reportTo: 'SAWANANI' },

    { id: 'PAWARSUN', name: 'SUNIL PAWAR', designation: EmployeeRole.GM, location: 'Talegaon', reportTo: '' },
    { id: 'KALESAN', name: 'SANDEEP KALE', designation: EmployeeRole.TL, location: 'Talegaon', reportTo: 'PAWARSUN' },
    { id: 'DHUMAMEG', name: 'MEGHA DHUMAL', designation: EmployeeRole.TL, location: 'Talegaon', reportTo: 'PAWARSUN' },
    { id: 'LONDHTUS', name: 'TUSHAR LONDHE', designation: EmployeeRole.CA, location: 'Talegaon', reportTo: 'KALESAN' },
    { id: 'WAGHGAN', name: 'GANESH WAGH', designation: EmployeeRole.CA, location: 'Talegaon', reportTo: 'KALESAN' },
    { id: 'SHELASWA', name: 'SWATI SHELAR', designation: EmployeeRole.CA, location: 'Talegaon', reportTo: 'DHUMAMEG' },
    { id: 'GHODKNIT', name: 'NITIN GHODKE', designation: EmployeeRole.CA, location: 'Talegaon', reportTo: 'DHUMAMEG' }
];

const CUSTOMER_NAMES = [
    'ANIL SHARMA', 'SUNITA RAO', 'VIKAS MEHTA', 'KAVITA IYER', 'RAJESH GUPTA', 'MEENA NAIR',
    'SURESH REDDY', 'ASHA KULKARNI', 'DEEPAK SINGH', 'NEETA JOSHI', 'PRAKASH VERMA', 'LATA DESAI'
];

const SALES_PER_LOCATION_PER_MONTH = 5;
const SEED_MONTHS = 3;

export interface SeedData {
    sales: SalesDoc[];
    warranty: DynamicEntryDoc[];
    accessory: DynamicEntryDoc[];
    schemes: SchemeDoc[];
}

/** Builds deterministic dummy entries for the last few months across all locations. */
export function buildSeedData(employees: Employee[], productModels: string[], today = new Date()): SeedData {
    const random = createRandom(20260926);
    const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
    const byId = new Map(employees.map(emp => [emp.id, emp]));
    const months = Array.from({ length: SEED_MONTHS }, (_, i) => monthOffset(today, -(i + 1)));

    const data: SeedData = { sales: [], warranty: [], accessory: [], schemes: [] };
    let serial = 1;

    for (const month of months) {
        const [year, monthNumber] = month.split('-').map(Number);
        const daysInMonth = new Date(year, monthNumber, 0).getDate();
        const dateIn = (day: number) => `${month}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}`;

        for (const location of LOCATIONS) {
            const associates = employees.filter(emp => emp.designation === EmployeeRole.CA && emp.location === location);
            if (associates.length === 0) {
                continue;
            }

            for (let i = 0; i < SALES_PER_LOCATION_PER_MONTH; i++) {
                const ca = pick(associates);
                const tl = byId.get(ca.reportTo ?? '');
                const day = 1 + Math.floor(random() * daysInMonth);
                const seq = String(serial++).padStart(5, '0');
                const chassisNo = `MAT${month.replace('-', '')}${seq}`;

                data.sales.push({
                    id: `sales-${seq}`,
                    month,
                    invoiceNumber: `INV${month.replace('-', '')}${seq}`,
                    invoiceDate: dateIn(day),
                    stockDate: dateIn(Math.max(1, day - 5)),
                    chassisNo,
                    engineNo: `ENG${seq}`,
                    parentProductLine: pick(productModels),
                    ca: ca.name,
                    tl: tl?.name ?? '',
                    location,
                    tmInvoiceDate: dateIn(Math.max(1, day - 2))
                });

                // Roughly half the vehicles sold also get an extended warranty.
                if (random() < 0.5) {
                    data.warranty.push({
                        id: `warranty-${seq}`,
                        month,
                        values: {
                            date: dateIn(day),
                            ewPolicyNo: `EW${seq}`,
                            name: pick(CUSTOMER_NAMES),
                            chassisNo,
                            ca: ca.name,
                            tl: tl?.name ?? '',
                            amt: String(8000 + Math.round(random() * 12) * 1000),
                            remark: '',
                            location
                        }
                    });
                }
            }

            for (const ca of associates) {
                const baseAmount = 10000 + Math.round(random() * 40) * 1000;
                const lamination = Math.round(random() * 5) * 1000;
                const threeM = Math.round(random() * 8) * 1000;
                const foc = Math.round(random() * 3) * 1000;

                data.accessory.push({
                    id: `accessory-${month}-${ca.id}`,
                    month,
                    values: {
                        ca: ca.name,
                        baseAmount: String(baseAmount),
                        lamination: String(lamination),
                        principalAmount: String(baseAmount + lamination + threeM),
                        foc: String(foc),
                        threeM: String(threeM),
                        mtdRetails: String(1 + Math.floor(random() * 6)),
                        retail: String(1 + Math.floor(random() * 6)),
                        other: String(Math.round(random() * 2) * 500),
                        tl: byId.get(ca.reportTo ?? '')?.name ?? '',
                        location
                    }
                });
            }
        }

        data.schemes.push(buildScheme(month));
    }

    return data;
}

function buildScheme(month: string): SchemeDoc {
    const now = new Date().toISOString();

    return {
        id: `scheme-${month}`,
        month,
        payload: {
            id: `scheme-${month}`,
            name: `Sales Incentive ${month}`,
            month,
            locations: LOCATIONS,
            createdDate: now,
            updatedDate: now,
            schemes: [
                {
                    id: `volume-${month}`,
                    type: SchemeType.VOLUME_BASED,
                    name: 'Volume Slab',
                    priority: 1,
                    volumeConfig: {
                        tiers: [
                            { rank: 'CA', minVolume: 1, maxVolume: 3, incentiveAmount: 1000, incentiveAmountNonStock: 750 },
                            { rank: 'CA', minVolume: 4, maxVolume: 6, incentiveAmount: 1500, incentiveAmountNonStock: 1200 },
                            { rank: 'CA', minVolume: 7, maxVolume: 999, incentiveAmount: 2000, incentiveAmountNonStock: 1600 }
                        ]
                    }
                },
                {
                    id: `accessories-${month}`,
                    type: SchemeType.ACCESSORIES,
                    name: 'Accessories Bonus',
                    priority: 2,
                    accessoriesConfig: {
                        tiers: [
                            { amount: 10000, incentivePercent: 2 },
                            { amount: 25000, incentivePercent: 3 }
                        ]
                    }
                }
            ]
        }
    };
}

function monthOffset(date: Date, offset: number): string {
    const d = new Date(date.getFullYear(), date.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Seeded PRNG (mulberry32) so dummy data is identical on every fresh install.
function createRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
