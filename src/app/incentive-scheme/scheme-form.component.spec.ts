import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { FormArray, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Employee, EmployeeRole } from '../core/models/employee.model';
import { CarType, IncentiveScheme, SchemeType } from '../core/models/incentive-scheme.model';
import { IncentiveService } from '../core/services/incentive.service';
import { NewIncentiveCalculationService } from '../core/services/new-incentive-calculation.service';
import { ExcelImportHelper } from '../shared/helper/excel-import-helper';
import { SchemeWorkbook } from '../shared/helper/scheme-workbook';
import { SchemeFormComponent } from './scheme-form.component';

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

/** Use explicit optional fields so exact equality also checks every form default. */
function persistedDummy(): IncentiveScheme {
    const source = SchemeWorkbook.dummy();
    source.id = 'source-scheme';
    source.createdDate = new Date('2026-10-01T00:00:00Z');
    source.updatedDate = new Date('2026-10-02T00:00:00Z');
    source.locations = ['Pune', 'Mumbai'];
    source.schemes.forEach((sub, index) => {
        sub.id = `source-sub-${index}`;
        sub.priority = index + 10;
    });
    const volume = source.schemes[0].volumeConfig!;
    volume.carModels = ['Swift', 'Baleno'];
    volume.carTypes = [CarType.ICE];
    volume.applyStockDifferential = true;
    volume.tiers.forEach((tier, index) => {
        tier.description = `Volume ${index}`;
        tier.incentiveAmountNonStock = index === 0 ? 0 : 900;
    });
    source.schemes[1].modelBonusConfig!.bonuses[0].description = 'Swift bonus';
    source.schemes[2].accessoriesConfig!.tiers.forEach((tier, index) => {
        tier.description = `Accessories ${index}`;
    });
    source.schemes[3].stockReductionConfig!.tiers[0].description = 'Aged stock';
    Object.assign(source.schemes[4].gmTargetConfig!.tiers[0], {
        carModels: ['Swift'], description: 'GM target'
    });
    return source;
}

const arrayCases = [
    [0, 'tiers', 2],
    [1, 'modelBonusTiers', 1],
    [2, 'accessoryTiers', 2],
    [3, 'stockReductionTiers', 1],
    [4, 'gmTargetTiers', 1]
] as const;

describe('SchemeFormComponent', () => {
    let fixture: ComponentFixture<SchemeFormComponent>;
    let component: SchemeFormComponent;
    let schemes$: BehaviorSubject<IncentiveScheme[]>;
    let service: {
        schemes$: ReturnType<BehaviorSubject<IncentiveScheme[]>['asObservable']>;
        getAllSchemes: ReturnType<typeof vi.fn<() => IncentiveScheme[]>>;
        saveScheme: ReturnType<typeof vi.fn<(scheme: IncentiveScheme) => Promise<IncentiveScheme | undefined>>>;
        deleteScheme: ReturnType<typeof vi.fn<(schemeId: string) => Promise<void>>>;
    };

    beforeEach(async () => {
        schemes$ = new BehaviorSubject<IncentiveScheme[]>([]);
        service = {
            schemes$: schemes$.asObservable(),
            getAllSchemes: vi.fn(() => schemes$.value),
            saveScheme: vi.fn<(scheme: IncentiveScheme) => Promise<IncentiveScheme | undefined>>(),
            deleteScheme: vi.fn<(schemeId: string) => Promise<void>>()
        };
        vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
        await TestBed.configureTestingModule({
            imports: [SchemeFormComponent],
            providers: [provideHttpClient(), { provide: IncentiveService, useValue: service }]
        })
            // Exercise the real reactive form/lifecycle without coupling logic tests to markup.
            .overrideComponent(SchemeFormComponent, { set: { template: '', styles: [], styleUrls: [] } })
            .compileComponents();
        fixture = TestBed.createComponent(SchemeFormComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    afterEach(() => {
        fixture.destroy();
        schemes$.complete();
        vi.restoreAllMocks();
    });

    function load(source = persistedDummy()): IncentiveScheme {
        schemes$.next([source]);
        component.loadScheme(source.id);
        return source;
    }

    it('requires a selected month to add a sub-scheme and lists only actual employee ranks', () => {
        component.addSubScheme();
        expect(component.schemes).toHaveLength(0);
        component.form.patchValue({ month: '2026-11' });
        component.addSubScheme();
        component.addSubScheme();
        expect(component.schemes).toHaveLength(2);
        expect(component.schemes.at(0).get('name')?.value).toBe('Nov-2026-SubScheme-1');
        expect(component.schemes.at(1).get('name')?.value).toBe('Nov-2026-SubScheme-2');
        expect(component.employeeRanks).toEqual(['CA', 'TL', 'SM', 'SRSM', 'AGM', 'GM']);
        expect(component.createTierGroup().get('rank')?.value).toBe('CA');
        expect(component.createStockReductionTierGroup().get('rank')?.value).toBe('CA');
        expect(component.createAccessoryTierGroup().get('rank')?.value).toBe('CA');
        expect(component.createModelBonusTierGroup().get('rank')?.value).toBe('CA');
        expect(component.carModels).toContain('Nexon');
        expect(component.carModels).toContain('Harrier');
        expect(component.carTypes).toEqual(['Petrol', 'Diesel', 'Electric', 'CNG', 'Hybrid']);
    });

    it('assigns a distinct background class to each employee rank selector', () => {
        expect(component.employeeRanks.map(rank => component.getRankClass(rank))).toEqual([
            'rank-ca', 'rank-tl', 'rank-sm', 'rank-srsm', 'rank-agm', 'rank-gm'
        ]);
        expect(component.getRankClass('')).toBe('rank-unassigned');
    });

    it('expands a sub-scheme from its card and toggles it with the header control', () => {
        component.form.patchValue({ month: '2026-11' });
        component.addSubScheme();
        const subScheme = component.schemes.at(0);

        expect(component.isSubSchemeExpanded(subScheme)).toBe(false);
        component.expandSubScheme(subScheme);
        expect(component.isSubSchemeExpanded(subScheme)).toBe(true);
        component.toggleSubScheme(subScheme);
        expect(component.isSubSchemeExpanded(subScheme)).toBe(false);
        component.toggleSubScheme(subScheme);
        expect(component.isSubSchemeExpanded(subScheme)).toBe(true);
    });

    it('duplicates only the last rank rows for the next available higher rank', () => {
        component.form.patchValue({ month: '2026-11' });
        component.addSubScheme();
        const tiers = component.getTiers(0);
        tiers.at(0).patchValue({ minVolume: 0, maxVolume: 3, incentiveAmount: 1000, description: 'Entry' });
        const secondTier = component.createTierGroup();
        secondTier.patchValue({ minVolume: 4, maxVolume: 999, incentiveAmount: 2000, description: 'Target' });
        tiers.push(secondTier);

        component.addTier(0);
        component.addTier(0);

        expect(tiers.getRawValue()).toEqual([
            { rank: 'CA', minVolume: 0, maxVolume: 3, incentiveAmount: 1000, incentiveAmountNonStock: null, description: 'Entry' },
            { rank: 'CA', minVolume: 4, maxVolume: 999, incentiveAmount: 2000, incentiveAmountNonStock: null, description: 'Target' },
            { rank: 'TL', minVolume: 0, maxVolume: 3, incentiveAmount: 1000, incentiveAmountNonStock: null, description: 'Entry' },
            { rank: 'TL', minVolume: 4, maxVolume: 999, incentiveAmount: 2000, incentiveAmountNonStock: null, description: 'Target' },
            { rank: 'SM', minVolume: 0, maxVolume: 3, incentiveAmount: 1000, incentiveAmountNonStock: null, description: 'Entry' },
            { rank: 'SM', minVolume: 4, maxVolume: 999, incentiveAmount: 2000, incentiveAmountNonStock: null, description: 'Target' }
        ]);
    });

    it('duplicates only the last row for the inline tier action', () => {
        component.form.patchValue({ month: '2026-11' });
        component.addSubScheme();
        const tiers = component.getTiers(0);
        tiers.at(0).patchValue({ minVolume: 0, maxVolume: 3, incentiveAmount: 1000, description: 'First' });
        const lastTier = component.createTierGroup();
        lastTier.patchValue({ rank: 'TL', minVolume: 4, maxVolume: 999, incentiveAmount: 2000, description: 'Last' });
        tiers.push(lastTier);

        component.duplicateLastTier(0);

        expect(tiers).toHaveLength(3);
        expect(tiers.at(2).getRawValue()).toEqual(tiers.at(1).getRawValue());
        expect(tiers.at(2)).not.toBe(tiers.at(1));
        expect(tiers.at(0).get('description')?.value).toBe('First');
    });

    function uploadEvent(): { event: Event; input: HTMLInputElement; file: File } {
        const file = new File(['dummy workbook'], 'scheme.xlsx');
        const input = document.createElement('input');
        input.type = 'file';
        Object.defineProperty(input, 'files', { value: [file] });
        return { event: { target: input } as unknown as Event, input, file };
    }

    it('updates the existing scheme list from the BehaviorSubject and unsubscribes on destroy', () => {
        const source = persistedDummy();
        schemes$.next([source]);
        expect(component.existingSchemes).toEqual([
            { id: source.id, month: source.month, name: source.name, schemeCount: 5 }
        ]);
        component.ngOnDestroy();
        schemes$.next([]);
        expect(component.existingSchemes).toHaveLength(1);
    });

    it('loads the unmodified dummy into all five correctly populated FormArrays', () => {
        load(SchemeWorkbook.dummy());
        expect(component.schemes).toHaveLength(5);
        expect(component.schemes.controls.map(group => group.get('type')?.value)).toEqual([
            SchemeType.VOLUME_BASED, SchemeType.MODEL_BONUS, SchemeType.ACCESSORIES,
            SchemeType.STOCK_REDUCTION, SchemeType.GM_TARGET
        ]);
        for (const [index, key, length] of arrayCases) {
            const array = component.schemes.at(index).get(key);
            expect(array).toBeInstanceOf(FormArray);
            expect(array as FormArray).toHaveLength(length);
        }
        expect(component.getTiers(0).at(1).getRawValue()).toMatchObject({
            rank: 'CA', minVolume: 4, maxVolume: 999, incentiveAmount: 1500
        });
        expect(component.getModelBonusTiers(1).at(0).get('carModels')?.value).toEqual(['Swift']);
        expect(component.getAccessoryTiers(2).getRawValue()).toMatchObject([
            { amount: 10000, incentivePercent: 2 }, { amount: 25000, incentivePercent: 3 }
        ]);
        expect(component.getAccessoryTiers(2).at(0).get('carModels')).toBeNull();
        expect(component.getStockReductionTiers(3).at(0).get('saleTarget')?.value).toBe(2);
        expect(component.getGMTargetTiers(4).at(0).get('numberOfCars')?.value).toBe(5);
        expect(component.form.pristine).toBe(true);
        expect(component.status()).toBe('Loaded scheme for 2026-11.');
        expect(service.saveScheme).not.toHaveBeenCalled();
    });

    it('builds exact type-specific configs, identities, priorities, locations and metadata', () => {
        const source = load();
        const before = structuredClone(source);
        const result = component.buildScheme();
        expect(result).toEqual(source);
        expect(source).toEqual(before);
        expect(component.form.pristine).toBe(true);
        expect(result).not.toBe(source);
        expect(result.schemes[0].volumeConfig).not.toBe(source.schemes[0].volumeConfig);
        result.locations!.push('Nagpur');
        result.schemes[1].modelBonusConfig!.bonuses[0].carModels!.push('Changed');
        expect(component.form.get('locations')?.value).toEqual(['Pune', 'Mumbai']);
        expect(component.getModelBonusTiers(1).at(0).get('carModels')?.value).toEqual(['Swift']);
        source.schemes[0].volumeConfig!.tiers.push({ rank: 'CA', minVolume: 10, maxVolume: 20, incentiveAmount: 3000 });
        expect(component.getTiers(0).at(2).getRawValue()).toMatchObject({
            rank: 'CA', minVolume: 10, maxVolume: 20, incentiveAmount: 3000
        });
        expect(source).toEqual(before);
    });

    it('defines no removed sub-scheme controls and omits legacy metadata when building a saved source', () => {
        const fresh = component.createSubSchemeGroup();
        const source = persistedDummy();
        const expected = structuredClone(source);
        for (const sub of source.schemes) {
            // Only historical fixtures may contain these unknown sub-scheme fields.
            const legacy = sub as unknown as Record<string, unknown>;
            legacy['enabled'] = false;
            legacy['description'] = 'Legacy sub-scheme description';
            legacy['applicableRanks'] = [EmployeeRole.CA];
        }
        const before = structuredClone(source);
        load(source);
        const result = component.buildScheme();
        for (const key of ['enabled', 'description', 'applicableRanks', 'totalIncentiveAmount']) {
            expect(fresh.get(key)).toBeNull();
            for (const group of component.schemes.controls) expect(group.get(key)).toBeNull();
            for (const sub of result.schemes) expect(sub).not.toHaveProperty(key);
        }
        expect(result).toEqual(expected);
        expect(source).toEqual(before);
        expect(component.form.pristine).toBe(true);
        expect(service.saveScheme).not.toHaveBeenCalled();
    });

    it('omits empty IDs and null optional non-stock amounts rather than inventing persistence identities', () => {
        load(SchemeWorkbook.dummy());
        const result = component.buildScheme();
        expect(result).not.toHaveProperty('id');
        for (const sub of result.schemes) expect(sub).not.toHaveProperty('id');
        expect(result.schemes[0].volumeConfig!.tiers[0]).not.toHaveProperty('incentiveAmountNonStock');
    });

    it('awaits persistence before assigning the saved ID, marking pristine or reporting success', async () => {
        load(SchemeWorkbook.dummy());
        component.form.patchValue({ name: 'Edited draft' });
        const draft = component.buildScheme();
        const pending = deferred<IncentiveScheme | undefined>();
        service.saveScheme.mockReturnValue(pending.promise);
        const saving = component.save();
        expect(service.saveScheme).toHaveBeenCalledExactlyOnceWith(draft);
        expect(component.busy()).toBe(true);
        expect(component.status()).toBe('');
        expect(component.error()).toBe('');
        expect(component.form.get('id')?.value).toBe('');
        expect(component.form.dirty).toBe(true);
        await component.save();
        expect(service.saveScheme).toHaveBeenCalledTimes(1);
        const saved: IncentiveScheme = {
            ...draft, id: 'persisted-id', createdDate: new Date('2026-11-17T00:00:00Z'),
            updatedDate: new Date('2026-11-17T01:00:00Z')
        };
        pending.resolve(saved);
        await saving;
        expect(component.form.get('id')?.value).toBe(saved.id);
        expect(component.buildScheme()).toEqual(saved);
        expect(component.form.pristine).toBe(true);
        expect(component.busy()).toBe(false);
        expect(component.status()).toBe('Scheme for 2026-11 saved successfully.');
        expect(component.error()).toBe('');
    });

    it('reports a rejected save without changing the identity, draft or dirty state', async () => {
        load();
        component.form.patchValue({ name: 'Keep after failure' });
        const before = component.form.getRawValue();
        const pending = deferred<IncentiveScheme | undefined>();
        service.saveScheme.mockReturnValue(pending.promise);
        const saving = component.save();
        pending.reject(new Error('Database write failed'));
        await saving;
        expect(component.error()).toBe('Database write failed');
        expect(component.status()).toBe('');
        expect(component.busy()).toBe(false);
        expect(component.form.getRawValue()).toEqual(before);
        expect(component.form.dirty).toBe(true);
    });

    it('preserves the unsaved draft when the service declines replacement', async () => {
        load(SchemeWorkbook.dummy());
        component.form.patchValue({ name: 'Cancelled replacement' });
        const before = component.form.getRawValue();
        service.saveScheme.mockResolvedValue(undefined);
        await component.save();
        expect(service.saveScheme).toHaveBeenCalledOnce();
        expect(component.form.getRawValue()).toEqual(before);
        expect(component.form.dirty).toBe(true);
        expect(component.status()).toBe('');
        expect(component.error()).toBe('');
        expect(component.busy()).toBe(false);
    });

    it('copies to another month as an identity-free draft, then saves with a new ID without mutating the source', async () => {
        const source = load();
        const before = structuredClone(source);
        const originalDraft = component.buildScheme();
        component.copyToMonth('2026-12');
        const copy = component.buildScheme();
        expect(copy.month).toBe('2026-12');
        expect(copy).not.toHaveProperty('id');
        expect(copy).not.toHaveProperty('createdDate');
        expect(copy).not.toHaveProperty('updatedDate');
        expect(copy.schemes).toEqual(originalDraft.schemes.map(({ id: _id, ...sub }) => sub));
        expect(copy.locations).toEqual(before.locations);
        component.form.patchValue({ name: 'Monthly copy' });
        expect(component.form.dirty).toBe(true);
        expect(component.status()).toContain('UNSAVED draft');
        expect(service.saveScheme).not.toHaveBeenCalled();
        service.saveScheme.mockImplementation(async draft => ({ ...draft, id: 'new-month-id' }));
        await component.save();
        expect(service.saveScheme).toHaveBeenCalledExactlyOnceWith(copy);
        expect(component.form.get('id')?.value).toBe('new-month-id');
        expect(component.form.get('id')?.value).not.toBe(source.id);
        expect(source).toEqual(before);
        expect(schemes$.value).toEqual([before]);
    });

    it.each(['2026-11', '2026-13', '2026-1', '0000-12', 'not-a-month'])('rejects invalid/same copy month %s without replacing or saving the draft', month => {
        load();
        const before = component.form.getRawValue();
        component.copyToMonth(month);
        expect(component.error()).toMatch(/valid destination month different/);
        expect(component.form.getRawValue()).toEqual(before);
        expect(service.saveScheme).not.toHaveBeenCalled();
    });

    it.each(['top-level arrays', 'named arrays in volumeConfig', 'tiers in volumeConfig'] as const)(
        'recovers all four non-volume legacy types from %s', storage => {
            const expected = persistedDummy();
            const legacy = structuredClone(expected);
            const cases = [
                [1, 'modelBonusConfig', 'bonuses', 'modelBonusTiers'],
                [2, 'accessoriesConfig', 'tiers', 'accessoryTiers'],
                [3, 'stockReductionConfig', 'tiers', 'stockReductionTiers'],
                [4, 'gmTargetConfig', 'tiers', 'gmTargetTiers']
            ] as const;
            for (const [index, configKey, tiersKey, arrayKey] of cases) {
                // Model historical malformed documents without weakening the production types.
                const sub = legacy.schemes[index] as unknown as Record<string, unknown>;
                const config = sub[configKey] as Record<string, unknown>;
                const tiers = config[tiersKey];
                delete sub[configKey];
                const volume: Record<string, unknown> = storage === 'top-level arrays' ? {} : {
                    [storage === 'named arrays in volumeConfig' ? arrayKey : 'tiers']: tiers
                };
                if (storage === 'top-level arrays') sub[arrayKey] = tiers;
                sub['volumeConfig'] = volume;
            }
            const before = structuredClone(legacy);
            load(legacy);
            expect(component.buildScheme()).toEqual(expected);
            expect(legacy).toEqual(before);
            expect(service.saveScheme).not.toHaveBeenCalled();
        }
    );

    it('recovers singular legacy volume filters and numeric tier ranks', () => {
        const source = persistedDummy();
        const config = source.schemes[0].volumeConfig!;
        delete config.carModels;
        delete config.carTypes;
        config.carModel = 'Swift';
        config.carType = CarType.ICE;
        config.tiers[0].rank = EmployeeRole.CA;
        load(source);
        expect(component.schemes.at(0).get('carModels')?.value).toEqual(['Swift']);
        expect(component.schemes.at(0).get('carTypes')?.value).toEqual([CarType.ICE]);
        expect(component.getTiers(0).at(0).get('rank')?.value).toBe('CA');
        expect(component.buildScheme().schemes[0].volumeConfig).toEqual({
            carModels: ['Swift'], carTypes: [CarType.ICE], applyStockDifferential: true,
            tiers: config.tiers.map(tier => ({ ...tier, rank: 'CA' }))
        });
    });

    it('copies volume scheme details into a separate model tab without adding another sub-scheme', () => {
        component.form.patchValue({ month: '2026-11' });
        component.addSubScheme();
        const firstTier = component.getTiers(0).at(0);
        firstTier.patchValue({ minVolume: 1, maxVolume: 3, incentiveAmount: 1500, description: 'Copied tier' });
        component.schemes.at(0).patchValue({ carTypes: ['Petrol'], applyStockDifferential: true });

        component.createVolumeModelTab(0, 'Baleno');
        component.createVolumeModelTab(0, 'Swift');

        expect(component.schemes).toHaveLength(1);
        expect(component.getVolumeTabs(0)).toHaveLength(2);
        expect(component.getVolumeTabs(0)[0].get('carModels')?.value).toEqual(['Baleno']);
        expect(component.getVolumeTabs(0)[1].get('carModels')?.value).toEqual(['Swift']);
        expect(component.getTiers(0).getRawValue()).toEqual([
            { rank: 'CA', minVolume: 1, maxVolume: 3, incentiveAmount: 1500, incentiveAmountNonStock: null, description: 'Copied tier' }
        ]);
        component.getTiers(0).at(0).patchValue({ incentiveAmount: 2500 });
        const tabs = component.buildScheme().schemes[0].volumeConfig!.modelTabs!;
        expect(tabs[0].tiers[0].incentiveAmount).toBe(1500);
        expect(tabs[1].tiers[0].incentiveAmount).toBe(2500);
        expect(tabs.every(tab => tab.carTypes?.includes('Petrol') && tab.applyStockDifferential)).toBe(true);
    });

    it('restores and switches copied volume model tabs with independent tier arrays', () => {
        const source = SchemeWorkbook.dummy();
        source.schemes[0].volumeConfig!.modelTabs = [
            { carModels: ['Swift'], carTypes: ['Petrol'], applyStockDifferential: false, tiers: [{ rank: 'CA', minVolume: 1, maxVolume: 2, incentiveAmount: 1000 }] },
            { carModels: ['Baleno'], carTypes: ['Diesel'], applyStockDifferential: true, tiers: [{ rank: 'CA', minVolume: 1, maxVolume: 2, incentiveAmount: 2000 }] }
        ];
        load(source);

        expect(component.getTiers(0).at(0).get('incentiveAmount')?.value).toBe(1000);
        component.activateVolumeTab(0, 1);
        expect(component.getTiers(0).at(0).get('incentiveAmount')?.value).toBe(2000);
        expect(component.schemes.at(0).get('applyStockDifferential')?.value).toBe(true);
        component.activateVolumeTab(0, 0);
        expect(component.getTiers(0).at(0).get('incentiveAmount')?.value).toBe(1000);
    });

    it.each([
        [SchemeType.MODEL_BONUS, 1, 'modelBonusConfig', 'bonuses'],
        [SchemeType.STOCK_REDUCTION, 3, 'stockReductionConfig', 'tiers']
    ] as const)('adds optional full model metadata tabs to %s templates', (type, index, configKey, tiersKey) => {
        const source = load();
        component.activateRevisedTab;
        component.getRevisedTabs(index);
        component.addSelectorToActiveRevisedTab(index, 'Nexon', 'XZ+', 'Petrol', '1.2', 'Manual');
        const selectors = component.getRevisedTabSelectors(index, 0);
        expect(selectors).toContainEqual({
            model: 'Nexon', variant: 'XZ+', fuelType: 'Petrol', engine: '1.2', transmission: 'Manual'
        });

        component.createRevisedTab(index, 'Harrier', 'Adventure', 'Diesel', '2.0', 'Automatic');
        const result = component.buildScheme();
        const config = result.schemes[index][configKey]!
        expect(config.modelTabs).toHaveLength(2);
        expect(config.modelTabs?.[1].selectors).toEqual([{
            model: 'Harrier', variant: 'Adventure', fuelType: 'Diesel', engine: '2.0', transmission: 'Automatic'
        }]);
        const expectedTiers = (source.schemes[index][configKey] as unknown as Record<string, unknown>)[tiersKey];
        expect((config as unknown as Record<string, unknown>)[tiersKey]).toEqual(expectedTiers);
        expect(result.schemes[index].type).toBe(type);
    });

    it('deletes a saved month scheme only after confirmation', async () => {
        const source = load();
        service.deleteScheme.mockResolvedValue();
        vi.mocked(globalThis.confirm).mockReturnValue(false);
        await component.deleteCurrentScheme();
        expect(service.deleteScheme).not.toHaveBeenCalled();
        expect(component.form.get('id')?.value).toBe(source.id);

        vi.mocked(globalThis.confirm).mockReturnValue(true);
        await component.deleteCurrentScheme();
        expect(service.deleteScheme).toHaveBeenCalledExactlyOnceWith(source.id);
        expect(component.form.get('month')?.value).toBe(source.month);
        expect(component.form.get('id')?.value).toBe('');
        expect(component.schemes).toHaveLength(0);
        expect(component.hasSavedScheme).toBe(false);
        expect(component.canImportExcel).toBe(true);
        expect(component.status()).toContain('Deleted saved scheme');
    });

    it.each([
        ['fixed', 'incentiveAmount'],
        ['percentage', 'incentivePercent']
    ] as const)('allows adding an accessory tier with positive %s incentive', (_label, field) => {
        const tier = component.createAccessoryTierGroup();
        expect(component.canAddAccessoryTier(tier)).toBe(false);
        tier.patchValue({ amount: 10000, [field]: 5 });
        expect(component.canAddAccessoryTier(tier)).toBe(true);
    });

    it('rejects zero accessory slab and incentive values', () => {
        const tier = component.createAccessoryTierGroup();
        tier.patchValue({ amount: 0, incentiveAmount: 500 });
        expect(component.canAddAccessoryTier(tier)).toBe(false);
        expect(tier.valid).toBe(false);
        tier.patchValue({ amount: 10000, incentiveAmount: 0 });
        expect(component.canAddAccessoryTier(tier)).toBe(false);
        expect(tier.valid).toBe(false);
        tier.patchValue({ incentiveAmount: null, incentivePercent: 0 });
        expect(component.canAddAccessoryTier(tier)).toBe(false);
        expect(tier.valid).toBe(false);
    });
});