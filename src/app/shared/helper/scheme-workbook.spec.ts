/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { EmployeeRole } from '../../core/models/employee.model';
import { CarType, IncentiveScheme, SchemeType } from '../../core/models/incentive-scheme.model';
import { SchemeWorkbook } from './scheme-workbook';

const allTypes = (): IncentiveScheme => {
    const scheme = SchemeWorkbook.dummy();
    const volume = scheme.schemes[0];
    volume.volumeConfig = {
        carModels: ['Swift', 'Baleno'], carTypes: [CarType.ICE, CarType.ELECTRIC],
        carModel: 'Swift', carType: CarType.ICE, applyStockDifferential: false, tiers: [
            {
                rank: EmployeeRole.CA, minVolume: 1, maxVolume: 3, incentiveAmount: 1000,
                incentiveAmountNonStock: 500, description: 'First tier'
            },
            { rank: 'CA', minVolume: 4, maxVolume: 999, incentiveAmount: 1500, incentiveAmountNonStock: 900 }
        ]
    };
    scheme.schemes[1].modelBonusConfig!.bonuses.push({
        rank: 'All', carModels: [], numberOfCars: 10,
        fixedIncentiveAmount: 4000, description: 'Any model'
    });
    scheme.schemes[3].stockReductionConfig!.tiers[0].description = 'Stock description';
    scheme.schemes[4].gmTargetConfig!.tiers[0].carModels = ['Swift'];
    scheme.schemes.push(
        {
            name: 'Target', type: SchemeType.TARGET_ACHIEVEMENT, priority: 6, targetAchievementConfig: {
                requiredAchievementPercent: 100, bonusAmount: 700, bonusPercent: 2, applyToRanks: [EmployeeRole.CA, EmployeeRole.TL]
            }
        },
        {
            name: 'Locations', type: SchemeType.LOCATION_BASED, priority: 7, locationConfig: {
                locationTargets: [
                    { location: 'Pune', targetUnits: 4, targetValue: 2000000, bonusAmount: 1000, description: 'Pune target' },
                    { location: 'Mumbai', targetUnits: 5, bonusAmount: 2000 }
                ]
            }
        },
        {
            name: 'Discount', type: SchemeType.DISCOUNT_BASED, priority: 8, discountConfig: {
                applyTo: 'deduct', tiers: [
                    {
                        minDiscountPercent: 0, maxDiscountPercent: 2, incentiveAmount: 150, incentivePercent: 1,
                        isDeduction: false, description: 'Preserve both alternatives'
                    },
                    { minDiscountPercent: 3, maxDiscountPercent: 100, incentivePercent: 2, isDeduction: true }
                ]
            }
        }
    );
    return scheme;
};

const rows = (): Record<string, unknown>[] => SchemeWorkbook.toRows(SchemeWorkbook.dummy());

describe('SchemeWorkbook', () => {
    it('roundtrips all eight configs, tier descriptions, target ranks and singular/plural filters', () => {
        const scheme = allTypes();
        const before = structuredClone(scheme);
        const flat = SchemeWorkbook.toRows(scheme);
        expect(new Set(flat.map(row => row['type'])).size).toBe(8);
        expect(flat.filter(row => row['type'] === SchemeType.LOCATION_BASED)).toHaveLength(2);
        expect(flat.filter(row => row['type'] === SchemeType.DISCOUNT_BASED)).toHaveLength(2);
        expect(flat.every(row => !Object.hasOwn(row, 'total pool'))).toBe(true);
        expect(SchemeWorkbook.fromRows(flat)).toEqual(scheme);
        expect(scheme).toEqual(before);
    });

    it('ignores legacy removed columns on import and does not export them', () => {
        const scheme = allTypes();
        const input = SchemeWorkbook.toRows(scheme).map((row, index) => ({
            ...row,
            enabled: index % 2 ? false : 'not a boolean',
            description: index % 2 ? 'Legacy description' : 123,
            ranks: index % 2 ? 'CEO' : '{invalid list',
            applicableRanks: index % 2 ? ['CEO'] : false,
            'total pool': 'legacy field'
        }));
        const before = structuredClone(input);
        const imported = SchemeWorkbook.fromRows(input);
        expect(imported).toEqual(scheme);
        expect(input).toEqual(before);
        for (const sub of imported.schemes) {
            for (const field of ['enabled', 'description', 'applicableRanks']) {
                expect(Object.hasOwn(sub, field)).toBe(false);
            }
        }
        for (const row of SchemeWorkbook.toRows(imported)) {
            for (const column of ['enabled', 'description', 'ranks', 'applicableRanks', 'total pool']) {
                expect(Object.hasOwn(row, column)).toBe(false);
            }
        }
    });

    it('does not validate or export legacy sub-scheme properties on existing objects', () => {
        const scheme = allTypes();
        const expected = structuredClone(scheme);
        for (const sub of scheme.schemes) {
            Object.assign(sub, { enabled: 'invalid', description: 123, applicableRanks: ['CEO'] });
        }
        const before = structuredClone(scheme);
        expect(() => SchemeWorkbook.validate(scheme)).not.toThrow();
        expect(SchemeWorkbook.toRows(scheme)).toEqual(SchemeWorkbook.toRows(expected));
        expect(SchemeWorkbook.fromRows(SchemeWorkbook.toRows(scheme))).toEqual(expected);
        expect(scheme).toEqual(before);
    });

    it('roundtrips all eight configs through an actual XLSX workbook', () => {
        const scheme = allTypes();
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(SchemeWorkbook.toRows(scheme)), 'Scheme');
        const bytes: Uint8Array = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const restored = XLSX.read(bytes, { type: 'array' });
        expect(SchemeWorkbook.fromRows(XLSX.utils.sheet_to_json(restored.Sheets['Scheme'], { defval: '' }))).toEqual(scheme);
    });

    it('imports the real CSV with xlsx and matches the same dummy exactly, then roundtrips', () => {
        const csv = readFileSync('public/samples/dummy-scheme.csv', 'utf8');
        // Use the same CSV date inference as ExcelImportHelper.
        const workbook = XLSX.read(csv, { type: 'string', cellDates: true });
        const imported = SchemeWorkbook.fromRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }));
        expect(imported).toEqual(SchemeWorkbook.dummy());
        expect(SchemeWorkbook.fromRows(SchemeWorkbook.toRows(imported))).toEqual(imported);
    });

    it('accepts CSV through the exact array/date/header options used by ExcelImportHelper', () => {
        const bytes = new TextEncoder().encode(readFileSync('public/samples/dummy-scheme.csv', 'utf8'));
        const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], {
            header: 1, defval: '', raw: true
        });
        const headers = matrix[0].map(value => String(value).trim().toLowerCase());
        const input = matrix.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
        expect(SchemeWorkbook.fromRows(input)).toEqual(SchemeWorkbook.dummy());
    });

    it('rejects invalid Date month cells and dates not on the first of a month', () => {
        for (const month of [new Date(NaN), new Date('2026-11-02T00:00:00Z')]) {
            const input = rows();
            input[0]['month'] = month;
            expect(() => SchemeWorkbook.fromRows(input)).toThrow(/Row 2.*month/);
        }
    });

    it('normalizes lowercase, case, whitespace and NBSP headers and enum spelling', () => {
        const input = rows().map(row => Object.fromEntries(Object.entries(row)
            .map(([key, value]) => [` \u00a0${key.toUpperCase().replace(/ /g, '  ')}  `, value])));
        input[0][' \u00a0TYPE  '] = ' volume   based ';
        expect(SchemeWorkbook.fromRows(input)).toEqual(SchemeWorkbook.dummy());
    });

    it('preserves explicit zero, false, empty filters and omitted optional values', () => {
        const scheme = SchemeWorkbook.dummy();
        scheme.locations = [];
        scheme.schemes[0].volumeConfig!.carModels = [];
        scheme.schemes[0].volumeConfig!.carTypes = [];
        scheme.schemes[0].volumeConfig!.applyStockDifferential = false;
        scheme.schemes[0].volumeConfig!.tiers[0].incentiveAmountNonStock = 0;
        expect(SchemeWorkbook.fromRows(SchemeWorkbook.toRows(scheme))).toEqual(scheme);
    });

    it('roundtrips fixed accessory incentives and requires exactly one payout mode', () => {
        const scheme = SchemeWorkbook.dummy();
        scheme.schemes[2].accessoriesConfig!.tiers = [
            { rank: 'CA', amount: 10000, incentiveAmount: 400 },
            { rank: 'CA', amount: 25000, incentivePercent: 3 }
        ];
        expect(SchemeWorkbook.fromRows(SchemeWorkbook.toRows(scheme))).toEqual(scheme);

        const both = structuredClone(scheme);
        both.schemes[2].accessoriesConfig!.tiers[0].incentivePercent = 2;
        expect(() => SchemeWorkbook.validate(both)).toThrow(/exactly one/);

        const neither = structuredClone(scheme);
        delete neither.schemes[2].accessoriesConfig!.tiers[0].incentiveAmount;
        expect(() => SchemeWorkbook.validate(neither)).toThrow(/exactly one/);
    });

    it('ignores legacy accessory car-model columns and does not export them', () => {
        const input = SchemeWorkbook.toRows(SchemeWorkbook.dummy()).map(row => ({ ...row }));
        input.filter(row => row['type'] === SchemeType.ACCESSORIES).forEach(row => row['car models'] = 'Swift');
        const imported = SchemeWorkbook.fromRows(input);
        expect(imported.schemes[2].accessoriesConfig!.tiers.every(tier => !Object.hasOwn(tier, 'carModels'))).toBe(true);
        expect(SchemeWorkbook.toRows(imported).filter(row => row['type'] === SchemeType.ACCESSORIES)
            .every(row => !Object.hasOwn(row, 'car models'))).toBe(true);
    });

    it('preserves empty/whitespace/quoted tier descriptions and models containing pipe characters', () => {
        const scheme = SchemeWorkbook.dummy();
        scheme.schemes[0].volumeConfig!.tiers[0].description = '';
        scheme.schemes[0].volumeConfig!.tiers[1].description = '   ';
        scheme.schemes[1].modelBonusConfig!.bonuses[0].description = '"Quoted text"';
        scheme.schemes[1].modelBonusConfig!.bonuses[0].carModels = ['Swift|Special', '[Concept]', ' Spaced '];
        expect(SchemeWorkbook.fromRows(SchemeWorkbook.toRows(scheme))).toEqual(scheme);
    });

    it.each(['', 'abc', 'Infinity', 'NaN', '-1', '1,000', true, null, NaN, Infinity, -1, {}])(
        'rejects invalid required numeric cell %s with worksheet row context', value => {
            const input = rows();
            input[0]['incentive amount'] = value;
            expect(() => SchemeWorkbook.fromRows(input)).toThrow(/Row 2.*incentive amount/i);
        });

    it.each(['2026-00', '2026-13', '2026-1', '0000-11', '26-11', '', '2026-11-01'])('rejects invalid month %s', month => {
        const scheme = SchemeWorkbook.dummy();
        scheme.month = month;
        expect(() => SchemeWorkbook.validate(scheme)).toThrow(/Row 2.*month/);
        expect(() => SchemeWorkbook.fromRows(rows().map(row => ({ ...row, month })))).toThrow(/Row 2.*month/);
    });

    it.each(['CEO', '8', -1, 1.5, true])('rejects invalid rank %s', rank => {
        const input = rows();
        input[0]['rank'] = rank;
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(/Row 2.*rank/);
    });

    it.each(['CA', 'Customer Associate', '1', 1, 'All', 'All roles', '0', 0, 'NONE'])('accepts known tier rank %s', rank => {
        const input = rows().slice(0, 1);
        input[0]['rank'] = rank;
        expect(() => SchemeWorkbook.fromRows(input)).not.toThrow();
    });

    it.each(['scheme name', 'month', 'locations'])('rejects conflicting %s metadata at the offending row', column => {
        const input = rows();
        input[1][column] = column === 'month' ? '2026-12' : 'different';
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(/Row 3.*conflicting/);
    });

    it.each(['type', 'priority', 'car models', 'stock differential'])('rejects inconsistent sub-scheme setting %s', column => {
        const input = rows();
        const replacements: Record<string, unknown> = {
            type: 'Accessories', priority: 99, 'car models': 'Swift', 'stock differential': true
        };
        input[1][column] = replacements[column];
        if (column === 'type') { input[1]['amount'] = 1; input[1]['incentive percent'] = 2; }
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(/Row 3.*inconsistent/);
    });

    it('rejects inconsistent advanced config-level settings', () => {
        const advanced = SchemeWorkbook.toRows(allTypes());
        const last = advanced.at(-1)!;
        const config = JSON.parse(String(last['config json']));
        last['config json'] = JSON.stringify({ ...config, applyTo: 'add' });
        expect(() => SchemeWorkbook.fromRows(advanced)).toThrow(/Row .*inconsistent/);
    });

    it.each(['CA', 'All', '0'])('rejects inclusive volume overlap with %s, including All', rank => {
        const input = rows();
        input[1]['min volume'] = 3;
        input[1]['rank'] = rank;
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(/Row 3.*overlapping.*Row 2/);
    });

    it('allows overlapping volume windows for distinct specific ranks', () => {
        const input = rows();
        input[1]['min volume'] = 1;
        input[1]['rank'] = 'TL';
        expect(() => SchemeWorkbook.fromRows(input)).not.toThrow();
    });

    it.each(['CA', 'All'])('rejects stock overlap with %s', rank => {
        const input = rows();
        input.push({ ...input[5], rank, 'min stock days': 9999, 'max stock days': 10000 });
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(/Row 9.*overlapping.*Row 7/);
    });

    it('rejects reversed ranges, excessive percentages, empty tiers and nonpositive counts', () => {
        const input = rows();
        input[0]['max volume'] = 0;
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(/Row 2.*minVolume/);
        input[0]['max volume'] = 3;
        input[3]['incentive percent'] = 101;
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(/Row 5.*100/);
        for (const [index, column] of [[2, 'number of cars'], [5, 'sale target'], [6, 'number of cars']] as const) {
            const invalid = rows();
            invalid[index][column] = 0;
            expect(() => SchemeWorkbook.fromRows(invalid)).toThrow(/positive/);
        }
        const scheme = SchemeWorkbook.dummy();
        scheme.schemes[0].volumeConfig!.tiers = [];
        expect(() => SchemeWorkbook.validate(scheme)).toThrow(/nonempty tiers/);
        expect(() => SchemeWorkbook.fromRows([])).toThrow(/Row 2.*no tiers/);
    });

    it('validates direct schemas as strictly as spreadsheet values', () => {
        const invalid = (mutate: (scheme: IncentiveScheme) => void, message: RegExp): void => {
            const scheme = allTypes();
            mutate(scheme);
            expect(() => SchemeWorkbook.validate(scheme)).toThrow(message);
            expect(() => SchemeWorkbook.toRows(scheme)).toThrow(message);
        };
        invalid(scheme => { scheme.schemes[0].priority = NaN; }, /priority/);
        invalid(scheme => { scheme.schemes[0].volumeConfig!.tiers[0].incentiveAmount = Infinity; }, /finite/);
        invalid(scheme => { scheme.schemes[0].volumeConfig!.tiers[0].rank = 'CEO'; }, /rank/);
        invalid(scheme => { scheme.schemes[0].volumeConfig!.tiers[1].minVolume = 3; }, /overlapping/);
        invalid(scheme => { scheme.schemes[0].volumeConfig!.carTypes = ['Unknown fuel']; }, /car type/);
        invalid(scheme => { scheme.schemes[4].gmTargetConfig!.tiers[0].additionalDiscountPercent = 101; }, /100/);
        invalid(scheme => { scheme.schemes[5].targetAchievementConfig!.bonusPercent = 101; }, /100/);
        invalid(scheme => { scheme.schemes[5].targetAchievementConfig!.applyToRanks = [99 as EmployeeRole]; }, /applyToRanks.*invalid rank/);
        invalid(scheme => { Object.assign(scheme.schemes[0].volumeConfig!.tiers[0], { description: 123 }); }, /tier description/);
        invalid(scheme => { scheme.schemes[6].locationConfig!.locationTargets[0].targetUnits = 0; }, /positive/);
        invalid(scheme => { scheme.schemes[7].discountConfig!.tiers[0].minDiscountPercent = 5; }, /must not exceed/);
        invalid(scheme => { scheme.schemes[7].discountConfig!.tiers[0].incentivePercent = 101; }, /100/);
    });

    it('rejects malformed or invalid advanced JSON with the original row context', () => {
        const input = SchemeWorkbook.toRows(allTypes());
        const index = input.findIndex(row => row['type'] === SchemeType.DISCOUNT_BASED);
        input[index]['config json'] = '{bad';
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(new RegExp(`Row ${index + 2}.*config json`));
        input[index]['config json'] = '{"tiers":[]}';
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(/nonempty tiers/);
        input[index]['config json'] = '{"tiers":[{"minDiscountPercent":0,"maxDiscountPercent":101,"incentiveAmount":1}]}';
        input.splice(index + 1, 1);
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(new RegExp(`Row ${index + 2}.*100`));
    });

    it('is all-or-nothing and does not mutate rows on failure', () => {
        const input = rows();
        input.at(-1)!['number of cars'] = 0;
        const before = structuredClone(input);
        expect(() => SchemeWorkbook.fromRows(input)).toThrow(/positive/);
        expect(input).toEqual(before);
    });

    it('uses the requested dummy month and rejects invalid ones', () => {
        expect(SchemeWorkbook.dummy('2027-01').month).toBe('2027-01');
        expect(() => SchemeWorkbook.dummy('2026-13')).toThrow(/month/);
    });

    it('keeps dummy volume eligibility on CA tiers and preserves model and GM tier settings', () => {
        const scheme = SchemeWorkbook.dummy();
        expect(scheme.schemes[0].volumeConfig!.tiers.map(tier => tier.rank)).toEqual(['CA', 'CA']);
        expect(scheme.schemes[1].modelBonusConfig!.bonuses).toEqual([
            { rank: 'CA', carModels: ['Swift'], numberOfCars: 2, fixedIncentiveAmount: 2000 }
        ]);
        expect(scheme.schemes[4].gmTargetConfig!.tiers).toEqual([
            { numberOfCars: 5, additionalDiscountPercent: 2 }
        ]);
    });

    it('validates before attempting a download', () => {
        const scheme = SchemeWorkbook.dummy();
        scheme.month = 'invalid';
        const validate = vi.spyOn(SchemeWorkbook, 'validate');
        expect(() => SchemeWorkbook.download(scheme)).toThrow(/month/);
        expect(validate).toHaveBeenCalledWith(scheme);
        validate.mockRestore();
    });

});