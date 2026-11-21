import { RxCollection, RxDatabase, RxJsonSchema } from 'rxdb';

export interface SalesDoc {
    id: string;
    month: string;
    invoiceNumber: string;
    invoiceDate: string;
    stockDate: string;
    chassisNo: string;
    engineNo: string;
    parentProductLine: string;
    ca: string;
    tl: string;
    location: string;
    tmInvoiceDate: string;
}

/** Warranty and accessory rows have config-driven columns, stored as a values map. */
export interface DynamicEntryDoc {
    id: string;
    month: string;
    values: Record<string, string>;
}

export interface EmployeeDoc {
    id: string;
    name: string;
    designation: number;
    location: string;
    reportTo: string;
}

export interface ProductDoc {
    id: string;
    model: string;
    variant: string;
    type: number;
    category: string;
    engine: string;
    transmission: string;
}

export interface SchemeDoc {
    id: string;
    month: string;
    payload: Record<string, unknown>;
}

export type AppCollections = {
    sales: RxCollection<SalesDoc>;
    warranty: RxCollection<DynamicEntryDoc>;
    accessory: RxCollection<DynamicEntryDoc>;
    employees: RxCollection<EmployeeDoc>;
    products: RxCollection<ProductDoc>;
    schemes: RxCollection<SchemeDoc>;
};

export type AppDatabase = RxDatabase<AppCollections>;

const id = { type: 'string', maxLength: 64 } as const;
const month = { type: 'string', maxLength: 7 } as const;
const text = { type: 'string' } as const;

export const salesSchema: RxJsonSchema<SalesDoc> = {
    version: 1,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id, month,
        invoiceNumber: text, invoiceDate: text, stockDate: text,
        chassisNo: text,
        engineNo: text, parentProductLine: text, ca: text, tl: text,
        location: text, tmInvoiceDate: text
    },
    required: ['id', 'month'],
    indexes: ['month']
};

export const dynamicEntrySchema: RxJsonSchema<DynamicEntryDoc> = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id, month,
        values: { type: 'object', additionalProperties: { type: 'string' } }
    },
    required: ['id', 'month', 'values'],
    indexes: ['month']
};

export const employeeSchema: RxJsonSchema<EmployeeDoc> = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id,
        name: text,
        designation: { type: 'integer' },
        location: text,
        reportTo: text
    },
    required: ['id', 'name', 'designation']
};

export const productSchema: RxJsonSchema<ProductDoc> = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id,
        model: text, variant: text,
        type: { type: 'integer' },
        category: text, engine: text, transmission: text
    },
    required: ['id', 'model', 'variant', 'type']
};

export const schemeSchema: RxJsonSchema<SchemeDoc> = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id, month,
        payload: { type: 'object' }
    },
    required: ['id', 'month', 'payload'],
    indexes: ['month']
};
