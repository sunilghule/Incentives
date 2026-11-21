import { Injectable } from '@angular/core';
import { SalesEntry } from '../../sales-entry/sales-entry.model';
import { DynamicEntryDoc, SalesDoc } from '../db/schemas';
import { Employee, EmployeeDesignation, EmployeeRole } from '../models/employee.model';
import { IncentiveScheme, SchemeType, SubScheme, TargetType } from '../models/incentive-scheme.model';
import { IncentiveCalculation } from '../models/incentive.model';

/** Accepts both stored rows and UI rows without inventing their missing money fields. */
export type IncentiveSale = Partial<SalesEntry & SalesDoc> & {
    employeeId?: string;
    employeeName?: string;
    carModel?: string;
    carType?: string;
    variant?: string;
    engine?: string;
    transmission?: string;
    productId?: string;
    stockAge?: number;
    stockAgeDays?: number;
    units?: number;
};

/** Monetary values are invoice totals after multiplying carValue by unitsSold.
 * Overrides describe only the already employee/month/location-filtered population.
 * Discount percent is a single explicit adjustment rate, or a value-weighted invoice rate.
 */
export interface IncentiveCalculationContext {
    targetUnits?: number;
    targetValue?: number;
    targetType?: TargetType;
    totalSalesValue?: number;
    locationSalesValues?: Readonly<Record<string, number>>;
    discountPercent?: number;
}

type Row = Readonly<Record<string, unknown>>;
interface Sale {
    source: IncentiveSale;
    model: string;
    type: string;
    variant: string;
    engine: string;
    transmission: string;
    productId: string;
    location: string;
    units: number;
    stock: boolean;
    age?: number;
}

const text = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number' ? String(value).trim().toLowerCase() : '';
const number = (value: unknown): number | undefined => {
    if (typeof value !== 'number' && typeof value !== 'string') return undefined;
    if (typeof value === 'string' && !value.trim()) return undefined;
    const parsed = Number(typeof value === 'string' ? value.replace(/,/g, '') : value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const record = (value: unknown): Row =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(record) : [];
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const sumUnits = (sales: readonly Sale[]): number => sales.reduce((sum, sale) => sum + sale.units, 0);
const money = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

function rank(value: unknown): string {
    const key = text(value);
    const numeric = number(value);
    if (numeric !== undefined && EmployeeRole[numeric] !== undefined) return text(EmployeeRole[numeric]);
    const designation = Object.entries(EmployeeDesignation).find(([, label]) => text(label) === key);
    return designation ? text(EmployeeRole[Number(designation[0])]) : key;
}

function rankMatches(value: unknown, employee: Employee): boolean {
    return !text(value) || rank(value) === 'all' || rank(value) === rank(employee.designation);
}

function ranksMatch(values: unknown, employee: Employee): boolean {
    return list(values).length === 0 || list(values).some(value => rankMatches(value, employee));
}

/** Date-only arithmetic avoids local-time/DST drift; slash dates are explicitly day-first. */
function date(value: unknown): number | undefined {
    if (value instanceof Date) return Number.isFinite(value.getTime())
        ? Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) : undefined;
    const input = text(value);
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:t.*)?$/.exec(input);
    const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(input);
    if (!iso && !dayFirst) return undefined;
    const year = Number(iso ? iso[1] : dayFirst?.[3]);
    const month = Number(iso ? iso[2] : dayFirst?.[2]);
    const day = Number(iso ? iso[3] : dayFirst?.[1]);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
        ? timestamp : undefined;
}

function monthOf(value: unknown): string | undefined {
    const match = /^(\d{4})-(\d{1,2})$/.exec(text(value));
    if (match) return Number(match[2]) >= 1 && Number(match[2]) <= 12
        ? `${match[1]}-${match[2].padStart(2, '0')}` : undefined;
    const timestamp = date(value);
    return timestamp === undefined ? undefined : new Date(timestamp).toISOString().slice(0, 7);
}

function matchesModels(values: unknown, model: string): boolean {
    return list(values).length === 0 || list(values).some(value => text(value) === text(model));
}

function matchesSelector(selector: Row, sale: Sale): boolean {
    return (!text(selector['productId']) || text(selector['productId']) === text(sale.productId))
        && (!text(selector['model']) || text(selector['model']) === text(sale.model))
        && (!text(selector['variant']) || text(selector['variant']) === text(sale.variant))
        && (!text(selector['fuelType']) || text(selector['fuelType']) === text(sale.type))
        && (!text(selector['engine']) || text(selector['engine']) === text(sale.engine))
        && (!text(selector['transmission']) || text(selector['transmission']) === text(sale.transmission));
}

/** Highest lower bound wins; original input order breaks ties without sorting/mutation. */
function highest(tiers: readonly Row[], threshold: string, eligible: (tier: Row) => boolean): Row | undefined {
    return tiers.reduce<Row | undefined>((best, tier) => {
        const level = number(tier[threshold]);
        return level !== undefined && eligible(tier) && (!best || level > (number(best[threshold]) ?? -Infinity))
            ? tier : best;
    }, undefined);
}

function groups(tiers: readonly Row[]): Row[][] {
    const grouped = new Map<string, Row[]>();
    for (const tier of tiers) {
        const key = JSON.stringify([rank(tier['rank']) || 'all',
        [...new Set(list(tier['carModels']).map(text))].sort((a, b) => a.localeCompare(b))]);
        grouped.set(key, [...(grouped.get(key) ?? []), tier]);
    }
    return [...grouped.values()];
}

function achievement(context: IncentiveCalculationContext, totalValue: number | undefined, totalUnits: number) {
    const valueTarget = context.targetType === TargetType.VALUE_BASED
        || (context.targetType !== TargetType.UNIT_BASED && context.targetValue !== undefined && context.targetUnits === undefined);
    const target = number(valueTarget ? context.targetValue : context.targetUnits);
    const totalAchieved = valueTarget ? totalValue ?? 0 : totalUnits;
    return {
        valueTarget, target,
        metrics: {
            totalTarget: target ?? 0, totalAchieved,
            achievementPercent: target !== undefined && target > 0 ? totalAchieved / target * 100 : 0
        }
    };
}

function applicable(sub: SubScheme, config: Row, employee: Employee): boolean {
    if (sub.type === SchemeType.GM_TARGET) return rank(employee.designation) === 'gm';
    return sub.type !== SchemeType.TARGET_ACHIEVEMENT
        || rows(config['tiers']).length > 0
        || ranksMatch(config['applyToRanks'], employee);
}

@Injectable({ providedIn: 'root' })
export class NewIncentiveCalculationService {
    calculate(
        employee: Employee,
        month: string,
        scheme: IncentiveScheme,
        sales: readonly IncentiveSale[],
        accessories?: readonly DynamicEntryDoc[],
        employees: readonly Employee[] = [],
        context: IncentiveCalculationContext = {}
    ): IncentiveCalculation {
        const warnings = new Set<string>();
        const warn = (message: string): void => { warnings.add(message); };
        const result: IncentiveCalculation = {
            employeeId: employee.id, employeeName: employee.name, month,
            totalTarget: 0, totalAchieved: 0, achievementPercent: 0,
            totalIncentive: 0, breakdown: [], schemeBreakdown: []
        };
        const requestedMonth = monthOf(month);
        if (!requestedMonth || monthOf(scheme.month) !== requestedMonth) {
            result.warnings = ['Invalid calculation month or scheme month does not match.'];
            return result;
        }
        const people = [employee, ...employees.filter(person => text(person.id) !== text(employee.id))];
        const findPerson = (identity: unknown): Employee | undefined => {
            const key = text(identity);
            return key ? people.find(person => text(person.id) === key)
                ?? people.find(person => text(person.name) === key) : undefined;
        };
        const isEmployee = (identity: unknown): boolean => !!text(identity)
            && (text(identity) === text(employee.id) || text(identity) === text(employee.name));
        const belongsToEmployee = (row: Row): boolean => {
            const role = rank(employee.designation);
            if (role === 'ca') return isEmployee(row['ca']) || isEmployee(row['employeeId']) || isEmployee(row['employeeName']);
            if (role === 'tl') return isEmployee(row['tl']);
            if (employees.length === 0) {
                warn('Employee hierarchy is required for higher-manager attribution.');
                return false;
            }
            // Start from both explicit entry owners; reportTo is the only manager attribution source.
            return [row['ca'], row['tl']].some(identity => {
                let current = findPerson(identity);
                const visited = new Set<string>();
                while (current && !visited.has(text(current.id))) {
                    visited.add(text(current.id));
                    if (isEmployee(current.id)) return true;
                    current = findPerson(current.reportTo);
                }
                return false;
            });
        };
        const inLocation = (value: unknown): boolean => !scheme.locations?.length
            || scheme.locations.some(location => text(location) === text(value));
        const inPeriod = (value: unknown, storedMonth: unknown): boolean => {
            if ((text(value) ? monthOf(value) : monthOf(storedMonth)) !== requestedMonth) return false;
            const start = date(scheme.startDate);
            const end = date(scheme.endDate);
            if (start === undefined && end === undefined) return true;
            const timestamp = date(value);
            return timestamp !== undefined && (start === undefined || timestamp >= start) && (end === undefined || timestamp <= end);
        };
        const eligibleSales: Sale[] = sales.filter(sale => inPeriod(sale.invoiceDate, sale.month)
            && inLocation(sale.location) && belongsToEmployee(record(sale))).map(source => {
                const invoice = date(source.invoiceDate);
                const stocked = date(source.stockDate);
                const age = number(source.stockAgeDays ?? source.stockAge ?? source.stockAgeing)
                    ?? (invoice !== undefined && stocked !== undefined ? Math.floor((invoice - stocked) / 86400000) : undefined);
                const rawUnits = number(source.unitsSold ?? source.units);
                if (rawUnits !== undefined && rawUnits < 0) warn('Negative sales units excluded.');
                return {
                    source, model: source.carModel || source.product || source.parentProductLine || '',
                    type: source.carType ?? '', location: source.location ?? '', units: Math.max(0, rawUnits ?? 1), age,
                    variant: source.variant ?? '', engine: source.engine ?? '', transmission: source.transmission ?? '',
                    productId: source.productId ?? '',
                    stock: typeof source.isStock === 'boolean' ? source.isStock
                        : invoice !== undefined && stocked !== undefined && stocked <= invoice
                };
            });
        const accessoryRows = (accessories ?? []).filter(entry => inPeriod(entry.values['date'] ?? entry.values['invoiceDate'], entry.month)
            && inLocation(entry.values['location']) && belongsToEmployee(entry.values));
        const totalUnits = sumUnits(eligibleSales);
        const salesValue = (entries: readonly Sale[]): number | undefined => {
            if (entries.some(sale => number(sale.source.carValue) === undefined)) return undefined;
            return entries.reduce((sum, sale) => sum + (number(sale.source.carValue) ?? 0) * sale.units, 0);
        };
        const totalValue = number(context.totalSalesValue) ?? salesValue(eligibleSales);
        const { valueTarget, target, metrics } = achievement(context, totalValue, totalUnits);
        Object.assign(result, metrics);

        const ordered = scheme.schemes.map((sub, index) => ({ sub, index }))
            .sort((a, b) => a.sub.priority - b.sub.priority || a.index - b.index);
        for (const { sub } of ordered) {
            const raw = record(sub);
            const legacy = record(sub.volumeConfig);
            const configKey: Partial<Record<SchemeType, keyof SubScheme>> = {
                [SchemeType.VOLUME_BASED]: 'volumeConfig', [SchemeType.MODEL_BONUS]: 'modelBonusConfig',
                [SchemeType.TARGET_ACHIEVEMENT]: 'targetAchievementConfig', [SchemeType.LOCATION_BASED]: 'locationConfig',
                [SchemeType.ACCESSORIES]: 'accessoriesConfig', [SchemeType.DISCOUNT_BASED]: 'discountConfig',
                [SchemeType.STOCK_REDUCTION]: 'stockReductionConfig', [SchemeType.GM_TARGET]: 'gmTargetConfig'
            };
            const key = configKey[sub.type];
            const config = key && raw[key] ? record(raw[key]) : legacy;
            if (!applicable(sub, config, employee)) continue;
            const getTiers = (field = 'tiers', copiedField?: string): Row[] => {
                const canonical = rows(config[field]);
                if (key && raw[key] && canonical.length) return canonical;
                const copied = rows(copiedField ? raw[copiedField] : undefined);
                if (copied.length) return copied;
                return canonical.length ? canonical : rows(config['tiers']);
            };
            const selectedSales = eligibleSales.filter(sale =>
                matchesModels(config['carModels'] ?? raw['carModels'], sale.model)
                && (!text(config['carModel']) || text(config['carModel']) === text(sale.model))
                && matchesModels(config['carTypes'] ?? raw['carTypes'], sale.type)
                && (!text(config['carType']) || text(config['carType']) === text(sale.type)));
            const units = sumUnits(selectedSales);
            const ranked = (tiers: readonly Row[]): Row[] => tiers.filter(tier => rankMatches(tier['rank'], employee));
            let amount = 0;
            let details = '';
            let field: keyof Pick<IncentiveCalculation, 'volumeIncentive' | 'modelBonusIncentive' | 'targetAchievementBonus'
                | 'locationBonus' | 'accessoriesIncentive' | 'discountIncentive' | 'stockReductionIncentive'> | undefined;
            const handlers: Partial<Record<SchemeType, () => void>> = {
                [SchemeType.VOLUME_BASED]: () => {
                    field = 'volumeIncentive';
                    const tabs = rows(config['modelTabs']);
                    const volumeConfigs = tabs.length ? tabs : [config];
                    const volumeSales = tabs.length ? eligibleSales : selectedSales;
                    for (const volumeConfig of volumeConfigs) {
                        const tabSales = volumeSales.filter(sale =>
                            matchesModels(volumeConfig['carModels'], sale.model)
                            && matchesModels(volumeConfig['carTypes'], sale.type));
                        const selectors = rows(volumeConfig['selectors']);
                        const matchedSales = selectors.length
                            ? tabSales.filter(sale => selectors.some(selector => matchesSelector(selector, sale)))
                            : tabSales;
                        const tabUnits = sumUnits(matchedSales);
                        const tier = highest(ranked(rows(volumeConfig['tiers'])), 'minVolume', row => tabUnits > 0
                            && tabUnits >= (number(row['minVolume']) ?? Infinity) && tabUnits <= (number(row['maxVolume']) ?? -Infinity));
                        if (tier) amount += matchedSales.reduce((sum, sale) => sum + sale.units * (
                            volumeConfig['applyStockDifferential'] === true && !sale.stock
                                ? number(tier['incentiveAmountNonStock']) ?? number(tier['incentiveAmount']) ?? 0
                                : number(tier['incentiveAmount']) ?? 0), 0);
                    }
                    details = `${units} eligible units; each model tab uses its highest inclusive volume tier; rate paid per unit.`;
                },
                [SchemeType.MODEL_BONUS]: () => {
                    field = 'modelBonusIncentive';
                    for (const group of groups(ranked(getTiers('bonuses', 'modelBonusTiers')))) {
                        const tier = highest(group, 'numberOfCars', row => {
                            const count = sumUnits(selectedSales.filter(sale => matchesModels(row['carModels'], sale.model)));
                            return count > 0 && count >= (number(row['numberOfCars']) ?? Infinity);
                        });
                        amount += number(tier?.['fixedIncentiveAmount']) ?? 0;
                    }
                    details = 'Highest eligible tier per identical rank/model group, paid once (not per vehicle).';
                },
                [SchemeType.ACCESSORIES]: () => {
                    field = 'accessoriesIncentive';
                    // Separate rows are authoritative for this employee/month, including an explicit zero.
                    const entries = accessoryRows.length
                        ? accessoryRows.map(entry => ({ value: number(entry.values['principalAmount']) }))
                        : eligibleSales.map(sale => ({ value: number(sale.source.accessoryValue) }));
                    const tiers = ranked(getTiers('tiers', 'accessoryTiers'));
                    let selectedTier: Row | undefined;
                    let selectedValue = 0;
                    for (const tier of tiers) {
                        if (entries.some(entry => entry.value === undefined)) {
                            warn(`${sub.name}: missing accessory principalAmount/accessoryValue.`);
                            continue;
                        }
                        const value = entries.reduce((sum, entry) => sum + (entry.value ?? 0), 0);
                        const threshold = number(tier['amount']);
                        if (threshold !== undefined && value >= threshold && value > 0
                            && (!selectedTier || threshold > (number(selectedTier['amount']) ?? -Infinity))) {
                            selectedTier = tier;
                            selectedValue = value;
                        }
                    }
                    const fixedAmount = number(selectedTier?.['incentiveAmount']);
                    amount = fixedAmount !== undefined
                        ? fixedAmount
                        : selectedValue * (number(selectedTier?.['incentivePercent']) ?? 0) / 100;
                    details = fixedAmount !== undefined
                        ? 'Single highest threshold fixed payout; no cumulative slabs.'
                        : 'Single highest threshold rate on the entire eligible accessory amount; no cumulative slabs.';
                },
                [SchemeType.STOCK_REDUCTION]: () => {
                    field = 'stockReductionIncentive';
                    if (selectedSales.some(sale => sale.stock && sale.age === undefined)) warn(`${sub.name}: missing stock age/date data.`);
                    const buckets = new Map<string, Row[]>();
                    for (const tier of ranked(getTiers('tiers', 'stockReductionTiers'))) {
                        const bucket = JSON.stringify([number(tier['minStockDays']), number(tier['maxStockDays'])]);
                        buckets.set(bucket, [...(buckets.get(bucket) ?? []), tier]);
                    }
                    for (const bucket of buckets.values()) {
                        const tier = highest(bucket, 'saleTarget', row => {
                            const count = sumUnits(selectedSales.filter(sale => sale.stock && sale.age !== undefined
                                && sale.age >= (number(row['minStockDays']) ?? Infinity) && sale.age <= (number(row['maxStockDays']) ?? -Infinity)));
                            return count > 0 && count >= (number(row['saleTarget']) ?? Infinity);
                        });
                        amount += number(tier?.['incentiveAmount']) ?? 0;
                    }
                    details = 'One highest achieved payout per matching inclusive stock-age bucket; no shared pool allocation.';
                },
                [SchemeType.TARGET_ACHIEVEMENT]: () => {
                    field = 'targetAchievementBonus';
                    const tiers = getTiers('tiers');
                    const tier = ranked(tiers)[0];
                    const requiredPercent = number(tier?.['requiredAchievementPercent']
                        ?? config['requiredAchievementPercent']) ?? Infinity;
                    if (target === undefined || target <= 0) warn(`${sub.name}: missing positive targetUnits/targetValue context.`);
                    else if (valueTarget && totalValue === undefined) warn(`${sub.name}: missing monetary sales data.`);
                    else if (result.achievementPercent >= requiredPercent) {
                        const percent = number(config['bonusPercent']);
                        const bonus = number(tier?.['bonusAmount'] ?? config['bonusAmount']) ?? 0;
                        if (percent !== undefined && percent !== 0) {
                            if (totalValue === undefined) warn(`${sub.name}: missing monetary sales data for bonusPercent.`);
                            else amount = totalValue * percent / 100;
                        } else amount = tier?.['perCarValue'] === true ? bonus * units : bonus;
                    }
                },
                [SchemeType.LOCATION_BASED]: () => {
                    field = 'locationBonus';
                    for (const locationTarget of getTiers('locationTargets')) {
                        if (!rankMatches(locationTarget['rank'], employee)) continue;
                        const location = text(locationTarget['location']);
                        const entries = selectedSales.filter(sale => text(sale.location) === location);
                        if (!entries.length) continue;
                        const locationUnits = number(locationTarget['targetUnits']);
                        const targetPercent = number(locationTarget['targetPercent']) ?? 100;
                        const requiredUnits = locationUnits === undefined
                            ? undefined
                            : locationUnits * targetPercent / 100;
                        const locationValue = number(locationTarget['targetValue']);
                        if (locationUnits === undefined && locationValue === undefined) {
                            warn(`${sub.name}: missing location target data.`);
                            continue;
                        }
                        const override = Object.entries(context.locationSalesValues ?? {}).find(([name]) => text(name) === location)?.[1];
                        const value = number(override) ?? salesValue(entries);
                        if (locationValue !== undefined && value === undefined) {
                            warn(`${sub.name}: missing monetary sales data for ${location}.`);
                            continue;
                        }
                        if ((requiredUnits === undefined || sumUnits(entries) >= requiredUnits)
                            && (locationValue === undefined || (value ?? 0) >= locationValue)) amount += number(locationTarget['bonusAmount']) ?? 0;
                    }
                },
                [SchemeType.DISCOUNT_BASED]: () => {
                    field = 'discountIncentive';
                    let discount = number(context.discountPercent);
                    if (discount === undefined && selectedSales.length) {
                        const value = salesValue(selectedSales);
                        if (value !== undefined && value > 0 && selectedSales.every(sale =>
                            number(sale.source.discountPercent) !== undefined || number(sale.source.discountAmount) !== undefined)) {
                            const discounted = selectedSales.reduce((sum, sale) => sum + (
                                number(sale.source.discountAmount) ?? (number(sale.source.carValue) ?? 0) * (number(sale.source.discountPercent) ?? 0) / 100
                            ) * sale.units, 0);
                            discount = discounted / value * 100;
                        }
                    }
                    if (discount === undefined) warn(`${sub.name}: missing discountPercent context or monetary/discount invoice data.`);
                    else {
                        const tier = highest(getTiers(), 'minDiscountPercent', row => discount >= (number(row['minDiscountPercent']) ?? Infinity)
                            && discount <= (number(row['maxDiscountPercent']) ?? -Infinity));
                        if (tier) {
                            // Flat amount takes precedence; percentage adjusts only the running incentive.
                            const adjustment = number(tier['incentiveAmount'])
                                ?? result.totalIncentive * (number(tier['incentivePercent']) ?? 0) / 100;
                            amount = Math.abs(adjustment) * (config['applyTo'] === 'deduct' || tier['isDeduction'] === true ? -1 : 1);
                        }
                    }
                },
                [SchemeType.GM_TARGET]: () => {
                    const allowances: string[] = [];
                    for (const group of groups(getTiers('tiers', 'gmTargetTiers'))) {
                        const tier = highest(group, 'numberOfCars', row => {
                            const count = sumUnits(selectedSales.filter(sale => matchesModels(row['carModels'], sale.model)));
                            return count > 0 && count >= (number(row['numberOfCars']) ?? Infinity);
                        });
                        if (tier) allowances.push(`${number(tier['additionalDiscountPercent']) ?? 0}% additional discount allowance`);
                    }
                    details = `${allowances.join('; ') || 'No GM target achieved'}. Informational only; not a cash incentive.`;
                }
            };
            const handler = handlers[sub.type];
            if (handler) handler();
            else warn(`${sub.name}: unsupported scheme type ${sub.type}.`);
            amount = money(amount);
            if (field) result[field] = money((result[field] ?? 0) + amount);
            result.totalIncentive = money(result.totalIncentive + amount);
            result.schemeBreakdown?.push({ schemeName: sub.name, schemeType: sub.type, amount, details, priority: sub.priority });
        }
        if (warnings.size) result.warnings = [...warnings];
        return result;
    }
}
