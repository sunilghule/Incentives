import { Injectable, inject, isDevMode } from '@angular/core';
import { addRxPlugin, createRxDatabase, RxStorage } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { ProductService } from '../services/product.service';
import {
    AppCollections, AppDatabase, dynamicEntrySchema, employeeSchema, productSchema, salesSchema, SchemeDoc, schemeSchema
} from './schemas';
import { buildSeedData, DUMMY_EMPLOYEES } from './seed-data';
import { DEFAULT_EMPLOYEES } from '../../services/employee.service';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
    private readonly productService = inject(ProductService);

    private database?: AppDatabase;

    get db(): AppDatabase {
        if (!this.database) {
            throw new Error('Database has not been initialised.');
        }

        return this.database;
    }

    async init(): Promise<void> {
        if (this.database) {
            return;
        }

        let storage: RxStorage<unknown, unknown> = getRxStorageDexie();

        if (isDevMode()) {
            const [{ RxDBDevModePlugin }, { wrappedValidateAjvStorage }] = await Promise.all([
                import('rxdb/plugins/dev-mode'),
                import('rxdb/plugins/validate-ajv')
            ]);
            addRxPlugin(RxDBDevModePlugin);
            // Dev-mode requires schema validation around the storage.
            storage = wrappedValidateAjvStorage({ storage });
        }

        this.database = await createRxDatabase<AppCollections>({
            name: 'incentivesdb',
            storage,
            multiInstance: true,
            closeDuplicates: true
        });

        await this.database.addCollections({
            sales: { schema: salesSchema },
            warranty: { schema: dynamicEntrySchema },
            accessory: { schema: dynamicEntrySchema },
            employees: { schema: employeeSchema },
            products: { schema: productSchema },
            schemes: { schema: schemeSchema }
        });

        await this.seed(this.database);
    }

    /** Fills empty collections with master data and dummy entries (first run only). */
    private async seed(db: AppDatabase): Promise<void> {
        const employees = [...DEFAULT_EMPLOYEES, ...DUMMY_EMPLOYEES];
        const products = this.productService.getProducts();

        if (await db.employees.count().exec() === 0) {
            await db.employees.bulkInsert(employees.map(emp => ({
                id: emp.id,
                name: emp.name,
                designation: emp.designation,
                location: emp.location ?? '',
                reportTo: emp.reportTo ?? ''
            })));
        }

        if (await db.products.count().exec() === 0) {
            await db.products.bulkInsert(products.map(product => ({ ...product, type: Number(product.type) })));
        }

        const seed = buildSeedData(employees, [...new Set(products.map(p => p.model))]);

        if (await db.sales.count().exec() === 0) {
            await db.sales.bulkInsert(seed.sales);
        }

        if (await db.warranty.count().exec() === 0) {
            await db.warranty.bulkInsert(seed.warranty);
        }

        if (await db.accessory.count().exec() === 0) {
            await db.accessory.bulkInsert(seed.accessory);
        }

        if (await db.schemes.count().exec() === 0) {
            const legacy = this.readLegacySchemes();
            const legacyMonths = new Set(legacy.map(s => s.month));
            await db.schemes.bulkInsert([...legacy, ...seed.schemes.filter(s => !legacyMonths.has(s.month))]);
            localStorage.removeItem('schemes');
        }
    }

    // Schemes were previously kept in localStorage; carry them over once.
    private readLegacySchemes(): SchemeDoc[] {
        try {
            const schemes = JSON.parse(localStorage.getItem('schemes') ?? '[]') as Record<string, unknown>[];

            return schemes
                .filter(s => typeof s['month'] === 'string')
                .map(s => {
                    const id = String(s['id'] || crypto.randomUUID());
                    return { id, month: String(s['month']), payload: { ...s, id } };
                });
        } catch {
            return [];
        }
    }
}
