import * as XLSX from 'xlsx';
import { EmployeeDesignation, EmployeeRole } from '../../core/models/employee.model';
import { CarType, IncentiveScheme, SchemeType, SubScheme } from '../../core/models/incentive-scheme.model';
import { ProductType } from '../../core/models/product.model';

type Data = Record<string, unknown>;
type Cells = Record<string, string | number | boolean>;
type Origin = { first: number; tiers: number[] };
type Layout = { config: string; tiers?: string; fields?: Record<string, string>; json?: boolean };

const layouts: Record<SchemeType, Layout> = {
    [SchemeType.VOLUME_BASED]: {
        config: 'volumeConfig', tiers: 'tiers', fields: {
            minVolume: 'min volume', maxVolume: 'max volume', incentiveAmount: 'incentive amount',
            incentiveAmountNonStock: 'non stock amount'
        }
    },
    [SchemeType.MODEL_BONUS]: {
        config: 'modelBonusConfig', tiers: 'bonuses', fields: {
            numberOfCars: 'number of cars', fixedIncentiveAmount: 'fixed amount'
        }
    },
    [SchemeType.ACCESSORIES]: {
        config: 'accessoriesConfig', tiers: 'tiers', fields: {
            amount: 'amount', incentiveAmount: 'incentive amount', incentivePercent: 'incentive percent'
        }
    },
    [SchemeType.STOCK_REDUCTION]: {
        config: 'stockReductionConfig', tiers: 'tiers', fields: {
            minStockDays: 'min stock days', maxStockDays: 'max stock days', saleTarget: 'sale target',
            incentiveAmount: 'incentive amount'
        }
    },
    [SchemeType.GM_TARGET]: {
        config: 'gmTargetConfig', tiers: 'tiers', fields: {
            numberOfCars: 'number of cars', additionalDiscountPercent: 'additional discount percent'
        }
    },
    [SchemeType.TARGET_ACHIEVEMENT]: { config: 'targetAchievementConfig', json: true },
    [SchemeType.LOCATION_BASED]: {
        config: 'locationConfig', tiers: 'locationTargets', fields: {
            location: 'location', targetUnits: 'target units', targetPercent: 'target percent',
            targetValue: 'target value', bonusAmount: 'bonus amount'
        }
    },
    [SchemeType.DISCOUNT_BASED]: { config: 'discountConfig', tiers: 'tiers', json: true }
};

const normalize = (value: string): string => value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const blank = (value: unknown): boolean => value === undefined || value === null || (typeof value === 'string' && !value.trim());
const fail = (context: string, message: string): never => { throw new Error(`${context}: ${message}`); };
const object = (value: unknown, context: string): Data => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(context, 'expected an object');
    return value as Data;
};
const text = (value: unknown, context: string): string => {
    if (typeof value !== 'string' || !value.trim()) return fail(context, 'expected nonempty text');
    return value.trim();
};

function numeric(value: unknown, context: string, coerce = false, positive = false, percent = false): number {
    const parsed = coerce && typeof value === 'string' && value.trim()
        && /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ? Number(value) : value;
    if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0 || (positive && parsed <= 0)) {
        return fail(context, `expected a finite ${positive ? 'positive' : 'nonnegative'} number`);
    }
    if (percent && parsed > 100) return fail(context, 'percentage must not exceed 100');
    return parsed;
}

function boolean(value: unknown, context: string): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return normalize(value) === 'true';
    return fail(context, 'expected true or false');
}

function role(value: unknown, context: string): EmployeeRole {
    if (typeof value === 'number' && Number.isInteger(value) && typeof EmployeeRole[value] === 'string') return value;
    if (typeof value === 'string' && value.trim()) {
        const key = normalize(value);
        const match = Object.values(EmployeeRole).filter((entry): entry is EmployeeRole => typeof entry === 'number')
            .find(entry => key === String(entry) || key === normalize(EmployeeRole[entry])
                || (!!EmployeeDesignation[entry] && key === normalize(EmployeeDesignation[entry])));
        if (match !== undefined) return match;
    }
    return fail(context, 'invalid rank');
}

function strings(value: unknown, context: string, spreadsheet = false): string[] {
    let items = value;
    if (spreadsheet && typeof value === 'string') {
        if (value.trim().startsWith('[')) {
            try { items = JSON.parse(value); }
            catch { return fail(context, 'invalid JSON list'); }
        } else items = value.split('|').map(item => item.trim());
    }
    if (!Array.isArray(items)) return fail(context, 'expected a list');
    return items.map(item => {
        text(item, context);
        return item as string;
    });
}

function enumValue<T extends string>(value: unknown, values: readonly T[], context: string): T {
    const match = typeof value === 'string' ? values.find(entry => normalize(entry) === normalize(value)) : undefined;
    return match ?? fail(context, 'invalid enum value');
}

function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
        return '{' + entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',') + '}';
    }
    return JSON.stringify(value) ?? 'undefined';
}

function normalizedRow(source: Data, context: string): Data {
    const row: Data = {};
    for (const [header, value] of Object.entries(object(source, context))) {
        const key = normalize(header);
        if (Object.hasOwn(row, key)) fail(context, `duplicate normalized header ${key}`);
        Object.defineProperty(row, key, { value, enumerable: true });
    }
    return row;
}

function optionalList(row: Data, column: string, context: string): string[] | undefined {
    const value = row[column];
    return blank(value) ? undefined : strings(value, `${context} ${column}`, true);
}

function monthCell(value: unknown, context: string): string {
    // ExcelImportHelper uses cellDates:true; SheetJS infers YYYY-MM CSV cells as dates.
    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime()) || value.getUTCDate() !== 1) return fail(context, 'expected a first-of-month date or YYYY-MM text');
        return value.toISOString().slice(0, 7);
    }
    return text(value, context);
}

function readDescription(value: unknown, context: string): string | undefined {
    if (blank(value)) return undefined;
    if (typeof value !== 'string') return fail(context, 'description must be text');
    if (!value.startsWith('"')) return value;
    try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed === 'string') return parsed;
    } catch { /* Ordinary text may start with a quotation mark. */ }
    return value;
}

function readSub(row: Data, context: string): SubScheme {
    return {
        name: text(row['sub scheme'], `${context} sub scheme`),
        type: enumValue(row['type'], Object.values(SchemeType), `${context} type`),
        priority: numeric(row['priority'], `${context} priority`, true)
    };
}

function readVolume(row: Data, context: string): Data {
    const config: Data = {};
    for (const column of ['car models', 'car types']) {
        const values = optionalList(row, column, context);
        if (values !== undefined) config[column === 'car models' ? 'carModels' : 'carTypes'] = values;
    }
    if (!blank(row['car model'])) config['carModel'] = text(row['car model'], `${context} car model`);
    if (!blank(row['car type'])) config['carType'] = enumValue(row['car type'], Object.values(CarType), `${context} car type`);
    if (!blank(row['stock differential'])) config['applyStockDifferential'] = boolean(row['stock differential'], `${context} stock differential`);
    return config;
}

function readFlat(row: Data, type: SchemeType, context: string): { config: Data; tiers: Data[] } {
    const tier: Data = {};
    if (!blank(row['slab'])) tier['slab'] = text(row['slab'], `${context} slab`);
    for (const [field, column] of Object.entries(layouts[type].fields ?? {})) {
        const optional = field === 'incentiveAmountNonStock'
            || (type === SchemeType.ACCESSORIES && ['incentiveAmount', 'incentivePercent'].includes(field))
            || (type === SchemeType.LOCATION_BASED && ['targetPercent', 'targetValue'].includes(field));
        if (optional && blank(row[column])) continue;
        tier[field] = field === 'location' || field === 'category'
            ? text(row[column], `${context} ${column}`)
            : numeric(row[column], `${context} ${column}`, true);
    }
    if (!blank(row['rank'])) {
        role(row['rank'], `${context} rank`);
        tier['rank'] = typeof row['rank'] === 'string' ? row['rank'].trim() : row['rank'];
    }
    if (type === SchemeType.TARGET_ACHIEVEMENT) {
        tier['category'] = enumValue(tier['category'], ['Finance', 'Extended Warranty'], `${context} category`);
        tier['perCarValue'] = blank(row['per car value'])
            ? false
            : boolean(row['per car value'], `${context} per car value`);
    }
    const description = readDescription(row['tier description'], `${context} tier description`);
    if (description !== undefined) tier['description'] = description;
    const config = type === SchemeType.VOLUME_BASED ? readVolume(row, context) : {};
    if ([SchemeType.MODEL_BONUS, SchemeType.GM_TARGET].includes(type)) {
        const models = optionalList(row, 'car models', context);
        if (models !== undefined) tier['carModels'] = models;
    }
    return { config, tiers: [tier] };
}

function readJson(row: Data, layout: Layout, context: string): { config: Data; tiers: Data[] } {
    let config: Data;
    try { config = object(JSON.parse(text(row['config json'], `${context} config json`)), `${context} config json`); }
    catch (error) { return fail(`${context} config json`, error instanceof Error ? error.message : 'invalid JSON'); }
    if (!layout.tiers) return { config, tiers: [config] };
    const values = config[layout.tiers];
    if (!Array.isArray(values) || !values.length) return fail(context, 'config json must contain nonempty tiers');
    const tiers = values.map(value => object(value, `${context} config json tier`));
    config = { ...config };
    delete config[layout.tiers];
    return { config, tiers };
}

function readRows(rows: Record<string, unknown>[]): { scheme: IncentiveScheme; origins: Origin[] } {
    if (!Array.isArray(rows) || !rows.length) return fail('Row 2', 'workbook has no tiers');
    const scheme: IncentiveScheme = { name: '', month: '', schemes: [] };
    const origins: Origin[] = [];
    const groups = new Map<string, { sub: SubScheme; settings: string; origin: Origin }>();
    let metadata: string | undefined;
    rows.forEach((source, index) => {
        const context = `Row ${index + 2}`;
        const row = normalizedRow(source, context);
        const name = text(row['scheme name'], `${context} scheme name`);
        const month = monthCell(row['month'], `${context} month`);
        const locations = optionalList(row, 'locations', context);
        const currentMetadata = stable({ name, month, locations });
        if (metadata !== undefined && metadata !== currentMetadata) fail(context, 'conflicting scheme name, month or locations metadata');
        metadata = currentMetadata;
        scheme.name = name;
        scheme.month = month;
        if (locations !== undefined) scheme.locations = locations;
        const sub = readSub(row, context);
        const { name: subName, type } = sub;
        const layout = layouts[type];
        const { config, tiers } = layout.json ? readJson(row, layout, context) : readFlat(row, type, context);
        const settings = stable({ ...sub, config: layout.tiers ? config : undefined });
        const key = normalize(subName);
        let group = groups.get(key);
        if (group && group.settings !== settings) fail(context, `inconsistent settings for sub-scheme ${subName}`);
        if (!group) {
            const origin: Origin = { first: index + 2, tiers: [] };
            (sub as unknown as Data)[layout.config] = layout.tiers ? { ...config, [layout.tiers]: [] } : config;
            group = { sub, settings, origin };
            groups.set(key, group);
            scheme.schemes.push(sub);
            origins.push(origin);
        } else if (!layout.tiers) fail(context, `duplicate configuration for ${subName}`);
        if (layout.tiers) {
            const target = object((group.sub as unknown as Data)[layout.config], context)[layout.tiers] as Data[];
            target.push(...tiers);
        }
        group.origin.tiers.push(...tiers.map(() => index + 2));
    });
    return { scheme, origins };
}

const requiredNumbers: Record<SchemeType, string[]> = {
    [SchemeType.VOLUME_BASED]: ['minVolume', 'maxVolume', 'incentiveAmount'],
    [SchemeType.MODEL_BONUS]: ['numberOfCars', 'fixedIncentiveAmount'],
    [SchemeType.ACCESSORIES]: ['amount'],
    [SchemeType.STOCK_REDUCTION]: ['minStockDays', 'maxStockDays', 'saleTarget', 'incentiveAmount'],
    [SchemeType.GM_TARGET]: ['numberOfCars', 'additionalDiscountPercent'],
    [SchemeType.TARGET_ACHIEVEMENT]: ['requiredAchievementPercent', 'bonusAmount'],
    [SchemeType.LOCATION_BASED]: ['targetUnits', 'bonusAmount'],
    [SchemeType.DISCOUNT_BASED]: ['minDiscountPercent', 'maxDiscountPercent']
};
const optionalNumbers: Partial<Record<SchemeType, string[]>> = {
    [SchemeType.VOLUME_BASED]: ['incentiveAmountNonStock'],
    [SchemeType.ACCESSORIES]: ['incentiveAmount', 'incentivePercent'],
    [SchemeType.LOCATION_BASED]: ['targetPercent', 'targetValue'],
    [SchemeType.TARGET_ACHIEVEMENT]: ['bonusPercent'],
    [SchemeType.DISCOUNT_BASED]: ['incentiveAmount', 'incentivePercent']
};
const bounds: Partial<Record<SchemeType, [string, string]>> = {
    [SchemeType.VOLUME_BASED]: ['minVolume', 'maxVolume'],
    [SchemeType.STOCK_REDUCTION]: ['minStockDays', 'maxStockDays'],
    [SchemeType.DISCOUNT_BASED]: ['minDiscountPercent', 'maxDiscountPercent']
};
type Range = { min: number; max: number; rank: EmployeeRole; context: string };

function optionalRoles(value: unknown, context: string): void {
    if (value === undefined) return;
    if (!Array.isArray(value)) return fail(context, 'ranks must be an array');
    for (const rank of value) role(rank, context);
}

function optionalBoolean(value: unknown, context: string): void {
    if (value !== undefined && typeof value !== 'boolean') fail(context, 'must be boolean');
}

function optionalDescription(value: unknown, context: string): void {
    if (value !== undefined && typeof value !== 'string') fail(context, 'description must be text');
}

function validateVolume(config: Data, context: string): void {
    if (config['carModels'] !== undefined) strings(config['carModels'], `${context} car models`);
    if (config['carTypes'] !== undefined) {
        for (const car of strings(config['carTypes'], `${context} car types`)) {
            const types = [...Object.values(CarType), ...Object.values(ProductType)
                .filter((value): value is string => typeof value === 'string')
                .map(value => value === 'CNG' ? value : value.charAt(0) + value.slice(1).toLowerCase())];
            if (!types.includes(car)) fail(context, 'invalid car type enum');
        }
    }
    if (config['carModel'] !== undefined) text(config['carModel'], `${context} car model`);
    if (config['carType'] !== undefined && !Object.values(CarType).includes(config['carType'] as CarType)) fail(context, 'invalid car type enum');
    optionalBoolean(config['applyStockDifferential'], `${context} stock differential`);
}

function validateConfig(config: Data, type: SchemeType, context: string): void {
    if (type === SchemeType.VOLUME_BASED) validateVolume(config, context);
    if (type === SchemeType.DISCOUNT_BASED && config['applyTo'] !== undefined
        && config['applyTo'] !== 'add' && config['applyTo'] !== 'deduct') fail(context, 'applyTo must be add or deduct');
}

function validateTier(tier: Data, type: SchemeType, context: string): void {
    if (tier['slab'] !== undefined) text(tier['slab'], `${context} slab`);
    const fields = [...requiredNumbers[type], ...(optionalNumbers[type] ?? []).filter(field => tier[field] !== undefined)];
    for (const field of fields) {
        const positive = ['numberOfCars', 'saleTarget', 'targetUnits'].includes(field)
            || (type === SchemeType.ACCESSORIES && ['amount', 'incentiveAmount', 'incentivePercent'].includes(field))
            || (type === SchemeType.LOCATION_BASED && field === 'targetPercent')
            || (type === SchemeType.TARGET_ACHIEVEMENT && field === 'requiredAchievementPercent');
        numeric(tier[field], `${context} ${field}`, false,
            positive, field.toLowerCase().includes('percent'));
    }
    if (tier['rank'] !== undefined) role(tier['rank'], `${context} rank`);
    if ([SchemeType.MODEL_BONUS, SchemeType.GM_TARGET].includes(type) && tier['carModels'] !== undefined) {
        strings(tier['carModels'], `${context} car models`);
    }
    optionalDescription(tier['description'], `${context} tier description`);
    if (type === SchemeType.TARGET_ACHIEVEMENT) {
        optionalRoles(tier['applyToRanks'], `${context} applyToRanks`);
        if (tier['category'] !== undefined) {
            if (typeof tier['category'] !== 'string'
                || !['Finance', 'Extended Warranty'].includes(tier['category'])) {
                fail(context, 'invalid target achievement category');
            }
            optionalBoolean(tier['perCarValue'], `${context} per car value`);
        }
    }
    if (type === SchemeType.LOCATION_BASED) text(tier['location'], `${context} location`);
    if (type === SchemeType.ACCESSORIES) {
        const hasAmount = tier['incentiveAmount'] !== undefined;
        const hasPercent = tier['incentivePercent'] !== undefined;
        if (hasAmount === hasPercent) fail(context, 'accessory tier needs exactly one of incentive amount or incentive percent');
    }
    if (type === SchemeType.DISCOUNT_BASED) {
        if (tier['incentiveAmount'] === undefined && tier['incentivePercent'] === undefined) fail(context, 'discount tier needs an amount or percent');
        optionalBoolean(tier['isDeduction'], `${context} isDeduction`);
    }
}

function validateRange(tier: Data, type: SchemeType, context: string, ranges: Range[]): void {
    const keys = bounds[type];
    if (!keys) return;
    // Numeric types and finiteness were checked by validateTier.
    const min = tier[keys[0]] as number;
    const max = tier[keys[1]] as number;
    if (min > max) fail(context, `${keys[0]} must not exceed ${keys[1]}`);
    if (type === SchemeType.DISCOUNT_BASED) return;
    const rank = tier['rank'] === undefined ? EmployeeRole.All : role(tier['rank'], `${context} rank`);
    const collision = ranges.find(previous => (rank === EmployeeRole.All || previous.rank === EmployeeRole.All || previous.rank === rank)
        && min <= previous.max && max >= previous.min);
    if (collision) fail(context, `overlapping ${type} ranges with ${collision.context}`);
    ranges.push({ min, max, rank, context });
}

function validateSub(sub: Data, context: string, nextRow: number, origin?: Origin): number {
    const name = text(sub['name'], `${context} sub scheme`);
    const at = `${context} (${name})`;
    if (!Object.values(SchemeType).includes(sub['type'] as SchemeType)) fail(at, 'invalid scheme type enum');
    const type = sub['type'] as SchemeType;
    const layout = layouts[type];
    numeric(sub['priority'], `${at} priority`);
    const config = object(sub[layout.config], `${at} ${layout.config}`);
    validateConfig(config, type, at);
    const modelTabs = config['modelTabs'];
    if (type === SchemeType.VOLUME_BASED && modelTabs !== undefined) {
        if (!Array.isArray(modelTabs) || !modelTabs.length) return fail(at, 'modelTabs must be a nonempty list');
        modelTabs.forEach((value, tabIndex) => {
            const tab = object(value, `${at} model tab ${tabIndex + 1}`);
            validateConfig(tab, type, `${at} model tab ${tabIndex + 1}`);
            const tabTiers: unknown[] = Array.isArray(tab['tiers']) ? tab['tiers'] : [];
            if (!tabTiers.length) fail(`${at} model tab ${tabIndex + 1}`, 'must contain nonempty tiers');
            const ranges: Range[] = [];
            tabTiers.forEach((tier, tierIndex) => {
                const row = object(tier, `${at} model tab ${tabIndex + 1}, tier ${tierIndex + 1}`);
                validateTier(row, type, `${at} model tab ${tabIndex + 1}, tier ${tierIndex + 1}`);
                validateRange(row, type, `${at} model tab ${tabIndex + 1}, tier ${tierIndex + 1}`, ranges);
            });
        });
    }
    const values = layout.tiers ? config[layout.tiers] : [config];
    if (!Array.isArray(values) || !values.length) return fail(at, 'configuration must contain nonempty tiers');
    const ranges: Range[] = [];
    values.forEach((value, tierIndex) => {
        const where = `Row ${origin?.tiers[tierIndex] ?? nextRow + tierIndex} (${name}, tier ${tierIndex + 1})`;
        const tier = object(value, where);
        validateTier(tier, type, where);
        validateRange(tier, type, where, ranges);
    });
    return values.length;
}

function validateScheme(value: IncentiveScheme, origins?: Origin[]): void {
    const scheme = object(value, 'Row 2 scheme');
    text(scheme['name'], 'Row 2 scheme name');
    if (typeof scheme['month'] !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(scheme['month'])) {
        fail('Row 2 month', 'expected a valid YYYY-MM month');
    }
    if (scheme['locations'] !== undefined) strings(scheme['locations'], 'Row 2 locations');
    if (!Array.isArray(scheme['schemes']) || !scheme['schemes'].length) return fail('Row 2', 'scheme must contain nonempty sub-schemes');
    const names = new Set<string>();
    let nextRow = 2;
    scheme['schemes'].forEach((value: unknown, subIndex: number) => {
        const origin = origins?.[subIndex];
        const context = `Row ${origin?.first ?? nextRow}`;
        const sub = object(value, context);
        const name = text(sub['name'], `${context} sub scheme`);
        if (names.has(normalize(name))) fail(context, `duplicate sub-scheme name ${name}`);
        names.add(normalize(name));
        nextRow += validateSub(sub, context, nextRow, origin);
    });
}

function put(row: Cells, column: string, value: unknown): void {
    if (Array.isArray(value)) {
        const needsJson = !value.length || value.some(item => typeof item === 'string' && /[|[\]]|^\s|\s$/.test(item));
        row[column] = needsJson ? JSON.stringify(value) : value.join('|');
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') row[column] = value;
}

function putDescription(row: Cells, column: string, value: string | undefined): void {
    if (value === undefined) return;
    row[column] = !value.trim() || value.startsWith('"') ? JSON.stringify(value) : value;
}

function writeFlat(row: Cells, tier: Data, config: Data, type: SchemeType): void {
    for (const [field, column] of Object.entries(layouts[type].fields ?? {})) put(row, column, tier[field]);
    put(row, 'slab', tier['slab']);
    put(row, 'rank', tier['rank']);
    putDescription(row, 'tier description', tier['description'] as string | undefined);
    if (type === SchemeType.TARGET_ACHIEVEMENT) put(row, 'per car value', tier['perCarValue']);
    if (type === SchemeType.VOLUME_BASED) put(row, 'car models', config['carModels']);
    if ([SchemeType.MODEL_BONUS, SchemeType.GM_TARGET].includes(type)) put(row, 'car models', tier['carModels']);
    if (type === SchemeType.VOLUME_BASED) {
        put(row, 'car types', config['carTypes']);
        put(row, 'car model', config['carModel']);
        put(row, 'car type', config['carType']);
        put(row, 'stock differential', config['applyStockDifferential']);
    }
}

function writeSub(scheme: IncentiveScheme, sub: SubScheme): Cells[] {
    const layout = layouts[sub.type];
    const config = (sub as unknown as Data)[layout.config] as Data;
    const tiers = layout.tiers ? config[layout.tiers] as Data[] : [config];
    return tiers.map(tier => {
        const row: Cells = {
            'scheme name': scheme.name, month: scheme.month, 'sub scheme': sub.name,
            type: sub.type, priority: sub.priority
        };
        put(row, 'locations', scheme.locations);
        if (layout.json) row['config json'] = JSON.stringify(layout.tiers ? { ...config, [layout.tiers]: [tier] } : config);
        else writeFlat(row, tier, config, sub.type);
        return row;
    });
}

/** Pure spreadsheet conversion. No persistence or mutation of caller-owned data. */
export class SchemeWorkbook {
    static fromRows(rows: Record<string, unknown>[]): IncentiveScheme {
        const { scheme, origins } = readRows(rows);
        validateScheme(scheme, origins);
        return scheme;
    }

    static toRows(scheme: IncentiveScheme): Record<string, string | number | boolean>[] {
        this.validate(scheme);
        return scheme.schemes.flatMap(sub => writeSub(scheme, sub));
    }

    static download(scheme: IncentiveScheme): void {
        const worksheet = XLSX.utils.json_to_sheet(this.toRows(scheme));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Scheme');
        XLSX.writeFile(workbook, `scheme-${scheme.month}.xlsx`);
    }

    static dummy(month = '2026-11'): IncentiveScheme {
        const sub = (type: SchemeType, priority: number, config: Partial<SubScheme>): SubScheme => ({
            name: `DEMO ONLY ${type}`, type, priority, ...config
        });
        const scheme: IncentiveScheme = {
            name: 'DEMO ONLY', month, locations: ['Pune'], schemes: [
                sub(SchemeType.VOLUME_BASED, 1, {
                    volumeConfig: {
                        tiers: [
                            { rank: 'CA', minVolume: 1, maxVolume: 3, incentiveAmount: 1000 },
                            { rank: 'CA', minVolume: 4, maxVolume: 999, incentiveAmount: 1500 }
                        ]
                    }
                }),
                sub(SchemeType.MODEL_BONUS, 2, {
                    modelBonusConfig: {
                        bonuses: [
                            { rank: 'CA', carModels: ['Swift'], numberOfCars: 2, fixedIncentiveAmount: 2000 }
                        ]
                    }
                }),
                sub(SchemeType.ACCESSORIES, 3, {
                    accessoriesConfig: {
                        tiers: [
                            { rank: 'CA', amount: 10000, incentivePercent: 2 },
                            { rank: 'CA', amount: 25000, incentivePercent: 3 }
                        ]
                    }
                }),
                sub(SchemeType.STOCK_REDUCTION, 4, {
                    stockReductionConfig: {
                        tiers: [
                            { rank: 'CA', minStockDays: 61, maxStockDays: 9999, saleTarget: 2, incentiveAmount: 800 }
                        ]
                    }
                }),
                sub(SchemeType.GM_TARGET, 5, {
                    gmTargetConfig: {
                        tiers: [
                            { numberOfCars: 5, additionalDiscountPercent: 2 }
                        ]
                    }
                })
            ]
        };
        this.validate(scheme);
        return scheme;
    }

    static validate(scheme: IncentiveScheme): void {
        validateScheme(scheme);
    }
}