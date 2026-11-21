import '@angular/compiler';
import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { DynamicEntryDoc } from '../db/schemas';
import { Employee, EmployeeRole } from '../models/employee.model';
import { CarType, IncentiveScheme, SchemeType, SubScheme, TargetType } from '../models/incentive-scheme.model';
import { IncentiveCalculationService } from './incentive-calculation.service';
import { IncentiveSale, NewIncentiveCalculationService } from './new-incentive-calculation.service';
import { SchemeWorkbook } from '../../shared/helper/scheme-workbook';

const month = '2026-10';
const ca: Employee = { id: 'ca1', name: 'Alice Associate', designation: EmployeeRole.CA, reportTo: 'tl1' };
const tl: Employee = { id: 'tl1', name: 'Terry Lead', designation: EmployeeRole.TL, reportTo: 'sm1' };
const sm: Employee = { id: 'sm1', name: 'Sam Manager', designation: EmployeeRole.SM, reportTo: 'gm1' };
const gm: Employee = { id: 'gm1', name: 'Grace Manager', designation: EmployeeRole.GM };
const people = [ca, tl, sm, gm];
const engine = new NewIncentiveCalculationService();
const sale = (overrides: IncentiveSale = {}): IncentiveSale => ({
    id: 'invoice1', invoiceDate: '2026-10-10', stockDate: '2026-07-02',
    ca: ca.id, tl: tl.name, product: 'Nexon', carType: 'Electric', location: 'Pune', ...overrides
});
const accessory = (amount: string, values: Record<string, string> = {}, entryMonth = month): DynamicEntryDoc => ({
    id: `accessory-${amount}`, month: entryMonth,
    values: { ca: ca.name, tl: tl.id, location: 'Pune', principalAmount: amount, ...values }
});
const sub = (type: SchemeType, config: Partial<SubScheme> = {}): SubScheme => ({
    type, name: type, priority: 1, ...config
});
const scheme = (...schemes: SubScheme[]): IncentiveScheme => ({ name: 'Test scheme', month, schemes });
const volume = (config: Partial<SubScheme> = {}): SubScheme => sub(SchemeType.VOLUME_BASED, {
    volumeConfig: { tiers: [{ minVolume: 1, maxVolume: 100, incentiveAmount: 100 }] }, ...config
});
const modelBonus = (): SubScheme => sub(SchemeType.MODEL_BONUS, {
    modelBonusConfig: {
        bonuses: [
            { rank: 'CA', carModels: ['Nexon'], numberOfCars: 2, fixedIncentiveAmount: 1000 },
            { rank: '1', carModels: ['NEXON'], numberOfCars: 4, fixedIncentiveAmount: 2000 }
        ]
    }
});
const accessoriesBonus = (): SubScheme => sub(SchemeType.ACCESSORIES, {
    accessoriesConfig: {
        tiers: [
            { amount: 10000, incentivePercent: 2 }, { amount: 25000, incentivePercent: 3 }
        ]
    }
});
const stockBonus = (): SubScheme => sub(SchemeType.STOCK_REDUCTION, {
    stockReductionConfig: {
        tiers: [
            { rank: 'CA', minStockDays: 90, maxStockDays: 120, saleTarget: 1, incentiveAmount: 300 },
            { rank: '1', minStockDays: 90, maxStockDays: 120, saleTarget: 2, incentiveAmount: 800 }
        ]
    }
});
const targetBonus = (): SubScheme => sub(SchemeType.TARGET_ACHIEVEMENT, {
    targetAchievementConfig: { requiredAchievementPercent: 100, bonusAmount: 500 }
});
const discountBonus = (config: Partial<SubScheme> = {}): SubScheme => sub(SchemeType.DISCOUNT_BASED, {
    priority: 2, discountConfig: {
        applyTo: 'deduct', tiers: [
            { minDiscountPercent: 0, maxDiscountPercent: 10, incentivePercent: 10 }
        ]
    }, ...config
});

function freezeDeep(value: unknown): void {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
}

describe('NewIncentiveCalculationService', () => {
    it('dummy: 5000 volume + 2000 model + 800 stock + 900 accessories = 8700', () => {
        const config = scheme(volume({
            volumeConfig: {
                applyStockDifferential: true, tiers: [
                    { minVolume: 1, maxVolume: 3, incentiveAmount: 500 },
                    { minVolume: 4, maxVolume: 6, incentiveAmount: 1500, incentiveAmountNonStock: 1000 }
                ]
            }
        }), modelBonus(), stockBonus(), accessoriesBonus());
        const sales = [sale(), sale(), sale({ isStock: false }), sale({ isStock: false })];
        const result = engine.calculate(ca, month, config, sales, [accessory('10000'), accessory('20000')]);
        expect(result).toMatchObject({
            totalAchieved: 4, totalIncentive: 8700,
            volumeIncentive: 5000, modelBonusIncentive: 2000, stockReductionIncentive: 800, accessoriesIncentive: 900
        });
        expect(result.schemeBreakdown).toHaveLength(4);
        expect(result.warnings).toBeUndefined();
    });

    it.each([[1, 100], [3, 900], [4, 1200], [6, 1800], [7, 0]])('volume inclusive boundary %s => %s', (units, expected) => {
        const config = scheme(volume({
            volumeConfig: {
                tiers: [
                    { minVolume: 1, maxVolume: 3, incentiveAmount: 100 },
                    { minVolume: 3, maxVolume: 6, incentiveAmount: 300 }
                ]
            }
        }));
        expect(engine.calculate(ca, month, config, [sale({ unitsSold: units })]).totalIncentive).toBe(expected);
    });

    it('defaults units to one, honors zero, and deterministically picks the first tied tier', () => {
        const config = scheme(volume({
            volumeConfig: {
                tiers: [
                    { minVolume: 1, maxVolume: 2, incentiveAmount: 100 },
                    { minVolume: 1, maxVolume: 2, incentiveAmount: 999 }
                ]
            }
        }));
        expect(engine.calculate(ca, month, config, [sale(), sale({ unitsSold: 0 })]).totalIncentive).toBe(100);
        expect(engine.calculate(ca, month, config, []).totalIncentive).toBe(0);
    });

    it('filters months, invalid dates, identities and scheme locations', () => {
        const config = { ...scheme(volume()), locations: ['pune'] };
        const sales = [sale(), sale({ ca: '  ALICE ASSOCIATE ', invoiceDate: '31/10/2026' }),
        sale({ invoiceDate: '2026-10-31T23:59:59-05:00' }),
        sale({ invoiceDate: '2026-11-01', month }), sale({ invoiceDate: '31/02/2026', month }),
        sale({ ca: 'other' }), sale({ location: 'Mumbai' }), sale({ invoiceDate: 'invalid', month })];
        expect(engine.calculate(ca, month, config, sales).totalIncentive).toBe(300);
        expect(engine.calculate(ca, 'invalid', config, sales).warnings?.[0]).toContain('month');
        expect(engine.calculate(ca, '2026-11', config, sales).totalIncentive).toBe(0);
    });

    it('accepts stored month when invoice date is absent and enforces inclusive custom dates', () => {
        expect(engine.calculate(ca, month, scheme(volume()), [sale({ invoiceDate: undefined, month })]).totalIncentive).toBe(100);
        const config = { ...scheme(volume()), startDate: new Date(2026, 9, 10), endDate: new Date(2026, 9, 20) };
        expect(engine.calculate(ca, month, config, [sale(), sale({ invoiceDate: '2026-10-20' }),
        sale({ invoiceDate: '2026-10-21' }), sale({ invoiceDate: undefined, month })]).totalAchieved).toBe(2);
    });

    it.each([EmployeeRole.CA, '1', 'CA', 'Customer Associate', 'All', '0'])('normalizes numeric/string rank %s', role => {
        const config = scheme(volume({
            volumeConfig: {
                tiers: [
                    { rank: role, minVolume: 1, maxVolume: 10, incentiveAmount: 100 }
                ]
            }
        }));
        expect(engine.calculate(ca, month, config, [sale()]).totalIncentive).toBe(100);
    });

    it('executes all sub-schemes while preserving tier-level rank filtering', () => {
        const config = scheme(volume(), volume(),
            volume({ volumeConfig: { tiers: [{ rank: 'TL', minVolume: 1, maxVolume: 10, incentiveAmount: 999 }] } }));
        const result = engine.calculate(ca, month, config, [sale()]);
        expect(result.totalIncentive).toBe(200);
        expect(result.schemeBreakdown).toHaveLength(3);
    });

    it('filters both model/type arrays and singular model/type configs', () => {
        const config = scheme(volume({
            volumeConfig: {
                carModels: ['NEXON'], carTypes: ['electric'],
                tiers: [{ minVolume: 1, maxVolume: 1, incentiveAmount: 100 }]
            }
        }));
        const sales = [sale(), sale({ product: 'Punch' }), sale({ carType: 'ICE' }), sale({ carType: undefined })];
        expect(engine.calculate(ca, month, config, sales).totalIncentive).toBe(100);
        const singular = scheme(volume({
            volumeConfig: {
                carModel: 'Nexon', carType: CarType.ELECTRIC,
                tiers: [{ minVolume: 1, maxVolume: 1, incentiveAmount: 100 }]
            }
        }));
        expect(engine.calculate(ca, month, singular, sales).totalIncentive).toBe(100);
    });

    it('reads stored parentProductLine, root model/type arrays, and copied modelBonusTiers', () => {
        const config = scheme(sub(SchemeType.MODEL_BONUS, {
            carModels: ['Nexon'], carTypes: ['Electric'],
            volumeConfig: { tiers: [{ minVolume: 1, maxVolume: 99, incentiveAmount: 999 }] },
            modelBonusTiers: [{ rank: 'CA', carModels: ['Nexon'], numberOfCars: 2, fixedIncentiveAmount: 700 }]
        }));
        expect(engine.calculate(ca, month, config, [sale({ product: undefined, parentProductLine: 'Nexon', units: 2 })]).totalIncentive).toBe(700);
    });

    it('reads type config copied into volumeConfig without mutating it', () => {
        const copied = { tiers: [{ rank: 'CA', carModels: ['Nexon'], numberOfCars: 2, fixedIncentiveAmount: 700 }] };
        const config = scheme(sub(SchemeType.MODEL_BONUS, { volumeConfig: copied as unknown as SubScheme['volumeConfig'] }));
        freezeDeep(config);
        expect(engine.calculate(ca, month, config, [sale({ unitsSold: 5 })]).totalIncentive).toBe(700);
    });

    it('pays each distinct model bonus group once at its highest achievement, not repeated multiples', () => {
        const config = scheme(sub(SchemeType.MODEL_BONUS, {
            modelBonusConfig: {
                bonuses: [
                    { rank: 'CA', carModels: ['Nexon', 'Punch'], numberOfCars: 1, fixedIncentiveAmount: 100 },
                    { rank: '1', carModels: ['PUNCH', 'NEXON'], numberOfCars: 2, fixedIncentiveAmount: 500 },
                    { rank: 'CA', carModels: ['Punch'], numberOfCars: 1, fixedIncentiveAmount: 200 },
                    { rank: 'TL', numberOfCars: 1, fixedIncentiveAmount: 9000 }
                ]
            }
        }));
        expect(engine.calculate(ca, month, config, [sale({ unitsSold: 10 }), sale({ product: 'Punch' })]).modelBonusIncentive).toBe(700);
    });

    it.each([[9999, 0], [10000, 200], [24999, 499.98], [25000, 750], [30000, 900]])(
        'accessory threshold %s pays %s across the entire amount', (amount, expected) => {
            expect(engine.calculate(ca, month, scheme(accessoriesBonus()), [], [accessory(String(amount))]).totalIncentive).toBe(expected);
        });

    it('pays the fixed amount once for the highest eligible accessory slab', () => {
        const config = scheme(sub(SchemeType.ACCESSORIES, {
            accessoriesConfig: {
                tiers: [
                    { amount: 10000, incentiveAmount: 300 },
                    { amount: 25000, incentiveAmount: 750 }
                ]
            }
        }));
        expect(engine.calculate(ca, month, config, [], [accessory('30000')]).totalIncentive).toBe(750);
    });

    it('aggregates only eligible accessory rows and never double-counts embedded accessoryValue', () => {
        const config = { ...scheme(accessoriesBonus()), locations: ['Pune'] };
        const rows = [accessory('10000'), accessory('20000', { ca: ca.id }),
        accessory('90000', { ca: 'other' }), accessory('90000', { location: 'Mumbai' }), accessory('90000', {}, '2026-09')];
        expect(engine.calculate(ca, month, config, [sale({ accessoryValue: 100000 })], rows).totalIncentive).toBe(900);
        expect(engine.calculate(ca, month, config, [sale({ accessoryValue: 100000 })], [accessory('0')]).totalIncentive).toBe(0);
        expect(engine.calculate(ca, month, config, [sale({ accessoryValue: 30000 })]).totalIncentive).toBe(900);
    });

    it('applies accessory rank restrictions without filtering by car model and warns on missing principalAmount', () => {
        const config = scheme(sub(SchemeType.ACCESSORIES, {
            accessoriesConfig: {
                tiers: [
                    { rank: 'CA', amount: 10000, incentivePercent: 5 },
                    { rank: 'TL', amount: 10000, incentivePercent: 90 }
                ]
            }
        }));
        expect(engine.calculate(ca, month, config, [], [accessory('20000', { carModel: 'Nexon' }),
        accessory('90000', { carModel: 'Punch' })]).totalIncentive).toBe(5500);
        const result = engine.calculate(ca, month, scheme(accessoriesBonus()), [sale({ accessoryValue: 90000 })], [accessory('')]);
        expect(result.totalIncentive).toBe(0);
        expect(result.warnings?.join()).toContain('principalAmount');
    });

    it('computes stock age from dates, uses explicit stock status, and pays each bucket only once', () => {
        const sales = [sale({ invoiceDate: '2026-10-01', stockDate: '2026-07-03' }), // exactly 90 days
        sale({ stockAgeing: '120' }), sale({ stockAge: 121 }), sale({ isStock: false, stockAge: 100 }),
        sale({ stockDate: '2026-11-01', stockAge: 100 })];
        expect(engine.calculate(ca, month, scheme(stockBonus()), sales).stockReductionIncentive).toBe(800);
        expect(engine.calculate(ca, month, scheme(stockBonus()), [sale()]).stockReductionIncentive).toBe(300);
        expect(engine.calculate(ca, month, scheme(stockBonus()), [sale({ stockAge: 89 })]).totalIncentive).toBe(0);
    });

    it('warns for missing stock age without inventing a shared pool allocation', () => {
        const config = stockBonus();
        const result = engine.calculate(ca, month, scheme(config), [sale(), sale({ isStock: true, stockDate: undefined })]);
        expect(result.totalIncentive).toBe(300);
        expect(result.warnings?.join()).toContain('stock age');
    });

    it('GM target is a zero-cash informational allowance and never pays non-GMs', () => {
        const config = scheme(sub(SchemeType.GM_TARGET, {
            gmTargetConfig: {
                tiers: [
                    { carModels: ['Nexon'], numberOfCars: 1, additionalDiscountPercent: 2 },
                    { carModels: ['Nexon'], numberOfCars: 2, additionalDiscountPercent: 5 }
                ]
            }
        }));
        const sales = [sale({ unitsSold: 2, carValue: 1000000 })];
        const result = engine.calculate(gm, month, config, sales, [], people);
        expect(result.totalIncentive).toBe(0);
        expect(result.schemeBreakdown?.[0]).toMatchObject({ amount: 0, details: expect.stringContaining('5%') });
        expect(engine.calculate(ca, month, config, sales).schemeBreakdown).toEqual([]);
    });

    it('requires explicit target context; unit bonus is independent of preceding incentives', () => {
        const config = scheme(volume(), targetBonus());
        const missing = engine.calculate(ca, month, config, [sale()]);
        expect(missing.totalIncentive).toBe(100);
        expect(missing.warnings?.join()).toContain('targetUnits');
        const result = engine.calculate(ca, month, config, [sale()], [], [], { targetUnits: 1 });
        expect(result).toMatchObject({ totalTarget: 1, totalAchieved: 1, achievementPercent: 100, totalIncentive: 600 });
    });

    it('supports value-based targets and percent bonuses only with monetary evidence', () => {
        const bonus = targetBonus();
        if (bonus.targetAchievementConfig) bonus.targetAchievementConfig.bonusPercent = 1;
        const context = { targetValue: 100000, targetType: TargetType.VALUE_BASED };
        const missing = engine.calculate(ca, month, scheme(bonus), [sale()], [], [], context);
        expect(missing.totalIncentive).toBe(0);
        expect(missing.warnings?.join()).toContain('monetary');
        expect(engine.calculate(ca, month, scheme(bonus), [sale({ carValue: 50000, unitsSold: 2 })], [], [], context))
            .toMatchObject({ totalAchieved: 100000, totalTarget: 100000, achievementPercent: 100, totalIncentive: 1000 });
        expect(engine.calculate(ca, month, scheme(bonus), [sale()], [], [], { ...context, totalSalesValue: 200000 }).totalIncentive).toBe(2000);
        const unitMissing = engine.calculate(ca, month, scheme(bonus), [sale()], [], [], { targetUnits: 1 });
        expect(unitMissing.warnings?.join()).toContain('bonusPercent');
    });

    it('honors target-specific rank restrictions', () => {
        const bonus = targetBonus();
        if (bonus.targetAchievementConfig) bonus.targetAchievementConfig.applyToRanks = [EmployeeRole.TL];
        expect(engine.calculate(ca, month, scheme(bonus), [sale()]).schemeBreakdown).toEqual([]);
    });

    it('evaluates per-location unit/value targets with explicit monetary overrides', () => {
        const config = scheme(sub(SchemeType.LOCATION_BASED, {
            locationConfig: {
                locationTargets: [
                    { location: 'Pune', targetUnits: 2, targetValue: 100000, bonusAmount: 700 },
                    { location: 'Mumbai', targetUnits: 1, bonusAmount: 300 }
                ]
            }
        }));
        const sales = [sale({ unitsSold: 2 }), sale({ location: 'Mumbai' })];
        const missing = engine.calculate(ca, month, config, sales);
        expect(missing.totalIncentive).toBe(300);
        expect(missing.warnings?.join()).toContain('monetary');
        expect(engine.calculate(ca, month, config, sales, [], [], { locationSalesValues: { pune: 100000 } }).totalIncentive).toBe(1000);
    });

    it('orders each scheme by priority, breaking ties in original order', () => {
        const config = scheme(discountBonus(), volume(), volume({ name: 'later', priority: 3 }));
        const result = engine.calculate(ca, month, config, [sale()], [], [], { discountPercent: 5 });
        expect(result.totalIncentive).toBe(190); // 100 - 10 + 100
        expect(result.schemeBreakdown?.map(item => item.schemeName)).toEqual([SchemeType.VOLUME_BASED, SchemeType.DISCOUNT_BASED, 'later']);
        const tied = scheme(volume(), discountBonus({ priority: 1 }), volume({ name: 'last', priority: 1 }));
        expect(engine.calculate(ca, month, tied, [sale()], [], [], { discountPercent: 5 }).totalIncentive).toBe(190);
    });

    it('uses deduction sign once and supports percentage additions on running incentive', () => {
        const deduct = discountBonus({
            discountConfig: {
                applyTo: 'deduct', tiers: [
                    { minDiscountPercent: 0, maxDiscountPercent: 10, incentiveAmount: -25, isDeduction: true }
                ]
            }
        });
        const add = discountBonus({
            priority: 3, discountConfig: {
                applyTo: 'add', tiers: [
                    { minDiscountPercent: 0, maxDiscountPercent: 10, incentivePercent: 20 }
                ]
            }
        });
        expect(engine.calculate(ca, month, scheme(volume(), deduct, add), [sale()], [], [], { discountPercent: 5 }))
            .toMatchObject({ totalIncentive: 90, discountIncentive: -10 }); // 100 - 25 + 15
    });

    it('warns rather than assuming zero discount or inventing weighted sale values', () => {
        const missing = engine.calculate(ca, month, scheme(volume(), discountBonus()), [sale({ discountPercent: 5 })]);
        expect(missing.totalIncentive).toBe(100);
        expect(missing.warnings?.join()).toContain('discountPercent');
        expect(engine.calculate(ca, month, scheme(volume(), discountBonus()), [sale({ carValue: 1000, discountPercent: 5 })]).totalIncentive).toBe(90);
    });

    it('uses value-weighted discount rather than a misleading invoice average', () => {
        const discount = discountBonus({
            discountConfig: {
                tiers: [
                    { minDiscountPercent: 0, maxDiscountPercent: 2, incentiveAmount: 50 },
                    { minDiscountPercent: 2, maxDiscountPercent: 10, incentiveAmount: 500 }
                ]
            }
        });
        const result = engine.calculate(ca, month, scheme(discount), [sale({ carValue: 900, discountPercent: 0 }),
        sale({ carValue: 100, discountAmount: 10 })]);
        expect(result.totalIncentive).toBe(50); // 1%, not unweighted 5%
    });

    it('attributes TL by tl, and all higher managers through reportTo hierarchy', () => {
        const sales = [sale(), sale({ ca: 'other', tl: 'other' })];
        expect(engine.calculate(tl, month, scheme(volume()), sales).totalAchieved).toBe(1);
        expect(engine.calculate(sm, month, scheme(volume()), sales, [], people).totalAchieved).toBe(1);
        expect(engine.calculate(gm, month, scheme(volume()), sales, [], people).totalAchieved).toBe(1);
        expect(engine.calculate(gm, month, scheme(accessoriesBonus()), [], [accessory('30000')], people).totalIncentive).toBe(900);
        expect(engine.calculate(gm, month, scheme(volume()), [sale({ sm: gm.id })]).warnings?.join()).toContain('hierarchy');
    });

    it('resolves case-insensitive reportTo names and terminates unrelated hierarchy cycles', () => {
        const linked = [{ ...ca, reportTo: 'terry lead' }, { ...tl, reportTo: 'SAM MANAGER' }, sm, gm];
        expect(engine.calculate(gm, month, scheme(volume()), [sale()], [], linked).totalAchieved).toBe(1);
        const cycle = [{ ...ca, reportTo: tl.id }, { ...tl, reportTo: ca.id }, gm];
        expect(engine.calculate(gm, month, scheme(volume()), [sale()], [], cycle).totalAchieved).toBe(0);
        const self = [{ ...ca, reportTo: ca.id }, gm];
        expect(engine.calculate(gm, month, scheme(volume()), [sale({ tl: '' })], [], self).totalAchieved).toBe(0);
    });

    it('does not mutate schemes, tiers, sales, accessory rows, employees, or context', () => {
        const config = scheme(discountBonus(), volume(), modelBonus(), stockBonus(), accessoriesBonus());
        const sales = [sale({ unitsSold: 4, accessoryValue: 99999 })];
        const accessories = [accessory('30000')];
        const employees = people.map(person => ({ ...person }));
        const context = { targetUnits: 4, discountPercent: 5, locationSalesValues: { Pune: 1000 } };
        const inputs = [config, sales, accessories, employees, context];
        const before = JSON.stringify(inputs);
        freezeDeep(inputs);
        const first = engine.calculate(ca, month, config, sales, accessories, employees, context);
        const second = engine.calculate(ca, month, config, sales, accessories, employees, context);
        expect(second).toEqual(first);
        expect(JSON.stringify(inputs)).toBe(before);
    });

    it('facade delegates the complete synchronous signature', () => {
        const injector = Injector.create({ providers: [NewIncentiveCalculationService, IncentiveCalculationService] });
        const facade = injector.get(IncentiveCalculationService);
        const args = [ca, month, scheme(volume(), accessoriesBonus(), targetBonus()), [sale()],
            [accessory('30000')], people, { targetUnits: 1 }] as const;
        expect(facade.calculate(...args)).toEqual(engine.calculate(...args));
        injector.destroy();
    });

    it('matches generic and exact volume product metadata selectors', () => {
        const selectors = SchemeWorkbook.dummy();
        selectors.schemes[0].volumeConfig = {
            tiers: [],
            modelTabs: [{
                carModels: [], carTypes: [], selectors: [{ model: 'Nexon', fuelType: 'Petrol', variant: 'Smart', engine: '1.2' }],
                tiers: [{ rank: 'CA', minVolume: 1, maxVolume: 10, incentiveAmount: 100 }]
            }]
        };
        const matching = [{
            id: 'specific', invoiceDate: `${month}-15`, ca: ca.id, carModel: 'Nexon', carType: 'Petrol',
            variant: 'Smart', engine: '1.2', transmission: 'Manual'
        }];
        const nonMatching = [{
            id: 'other', invoiceDate: `${month}-15`, ca: ca.id, carModel: 'Nexon', carType: 'Diesel',
            variant: 'Smart', engine: '1.5', transmission: 'Manual'
        }];
        expect(engine.calculate(ca, month, selectors, matching).totalIncentive).toBe(100);
        expect(engine.calculate(ca, month, selectors, nonMatching).totalIncentive).toBe(0);
    });
});