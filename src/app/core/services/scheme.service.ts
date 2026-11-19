import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DatabaseService } from '../db/database.service';
import { SchemeDoc } from '../db/schemas';
import { IncentiveScheme, SchemeMetadata } from '../models/incentive-scheme.model';

/** CRUD access to incentive schemes stored in the `schemes` RxDB collection. */
@Injectable({ providedIn: 'root' })
export class SchemeService {
    private readonly database = inject(DatabaseService);
    private readonly schemes = new BehaviorSubject<IncentiveScheme[]>([]);

    readonly schemes$: Observable<IncentiveScheme[]> = this.schemes.asObservable();

    /** Loads schemes once and keeps the subject in sync with the collection. */
    async load(): Promise<void> {
        const collection = this.database.db.schemes;
        const docs = await collection.find().exec();

        this.schemes.next(docs.map(doc => this.toScheme(doc.toMutableJSON().payload)));

        collection.find().$.subscribe(live =>
            this.schemes.next(live.map(doc => this.toScheme(doc.toMutableJSON().payload))));
    }

    getAll(): IncentiveScheme[] {
        return [...this.schemes.value].sort((a, b) => b.month.localeCompare(a.month));
    }

    getById(schemeId: string): IncentiveScheme | undefined {
        return this.schemes.value.find(s => s.id === schemeId);
    }

    getForMonth(month: string): IncentiveScheme | undefined {
        return this.schemes.value.find(s => s.month === month);
    }

    getMetadata(schemeId: string): SchemeMetadata | undefined {
        const scheme = this.getById(schemeId);
        if (!scheme) return undefined;

        return {
            schemeId: scheme.id!,
            month: scheme.month,
            totalRules: scheme.schemes?.length ?? 0,
            applicableModels: [],
            applicableYears: []
        };
    }

    async insert(scheme: IncentiveScheme): Promise<IncentiveScheme> {
        const created: IncentiveScheme = {
            ...this.toScheme(scheme as unknown as Record<string, unknown>),
            id: scheme.id || this.generateId(),
            createdDate: new Date(),
            updatedDate: new Date()
        };

        await this.database.db.schemes.insert(this.toDoc(created));
        this.replaceLocal(created);

        return created;
    }

    async update(scheme: IncentiveScheme): Promise<IncentiveScheme> {
        if (!scheme.id) {
            throw new Error('Cannot update a scheme without an id.');
        }

        const updated: IncentiveScheme = {
            ...this.toScheme(scheme as unknown as Record<string, unknown>), updatedDate: new Date()
        };

        await this.database.db.schemes.upsert(this.toDoc(updated));
        this.replaceLocal(updated);

        return updated;
    }

    /** Inserts when the scheme is new, updates it otherwise. */
    async save(scheme: IncentiveScheme): Promise<IncentiveScheme> {
        const exists = !!scheme.id && this.schemes.value.some(s => s.id === scheme.id);

        return exists ? this.update(scheme) : this.insert(scheme);
    }

    async delete(schemeId: string): Promise<void> {
        await this.database.db.schemes.findOne(schemeId).remove();
        this.schemes.next(this.schemes.value.filter(s => s.id !== schemeId));
    }

    async deleteAll(): Promise<void> {
        await this.database.db.schemes.find().remove();
        this.schemes.next([]);
    }

    async cloneToMonth(schemeId: string, newMonth: string): Promise<IncentiveScheme | undefined> {
        const original = this.getById(schemeId);
        if (!original) return undefined;

        return this.insert({ ...structuredClone(original), id: undefined, month: newMonth });
    }

    export(schemeId: string): string {
        const scheme = this.getById(schemeId);

        return scheme ? JSON.stringify(scheme, null, 2) : '';
    }

    async import(schemeJson: string): Promise<IncentiveScheme> {
        const scheme = JSON.parse(schemeJson) as IncentiveScheme;

        return this.insert({ ...scheme, id: undefined });
    }

    private replaceLocal(scheme: IncentiveScheme): void {
        const schemes = this.schemes.value.filter(s => s.id !== scheme.id);
        this.schemes.next([...schemes, scheme]);
    }

    private toDoc(scheme: IncentiveScheme): SchemeDoc {
        return {
            id: scheme.id!,
            month: scheme.month,
            payload: JSON.parse(JSON.stringify(scheme))
        };
    }

    private toScheme(payload: Record<string, unknown>): IncentiveScheme {
        const scheme = payload as unknown as IncentiveScheme;

        return {
            ...scheme,
            // Only current sub-scheme fields are exposed or saved, even for older payloads.
            schemes: scheme.schemes.map(sub => Object.fromEntries(
                Object.entries(sub).filter(([key]) => [
                    'id', 'type', 'name', 'priority', 'volumeConfig', 'modelBonusConfig',
                    'targetAchievementConfig', 'locationConfig', 'accessoriesConfig', 'discountConfig',
                    'stockReductionConfig', 'gmTargetConfig', 'carModels', 'carTypes',
                    'modelBonusTiers', 'stockReductionTiers', 'accessoryTiers', 'gmTargetTiers'
                ].includes(key))
            ) as unknown as IncentiveScheme['schemes'][number]),
            createdDate: scheme.createdDate ? new Date(scheme.createdDate) : undefined,
            updatedDate: scheme.updatedDate ? new Date(scheme.updatedDate) : undefined
        };
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
}
