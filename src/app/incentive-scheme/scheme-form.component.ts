import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, FormArray, ValidationErrors, Validators, ReactiveFormsModule } from '@angular/forms';
import { IncentiveService } from '../core/services/incentive.service';
import { AccessoryTier, GMTargetTier, IncentiveScheme, LocationTarget, ModelBonus, SchemeType, StockReductionTier, SubScheme, TargetAchievementTier, VolumeTier } from '../core/models/incentive-scheme.model';
import { Subject, takeUntil } from 'rxjs';
import { EmployeeRole } from '../core/models/employee.model';
import { ExcelImportHelper } from '../shared/helper/excel-import-helper';
import { SchemeWorkbook } from '../shared/helper/scheme-workbook';
import { ProductService } from '../core/services/product.service';
import { Models, ProductType } from '../core/models/product.model';
import { LOCATIONS } from '../core/db/seed-data';

interface SubSchemeFormValue {
  id: string;
  name: string;
  type: SchemeType;
  priority: number;
  carModels: string[];
  carTypes: string[];
  applyStockDifferential: boolean;
  configJson: string;
  tiers: VolumeTier[];
  stockReductionTiers: StockReductionTier[];
  accessoryTiers: AccessoryTier[];
  gmTargetTiers: GMTargetTier[];
  modelBonusTiers: ModelBonus[];
  locationTargets: LocationTarget[];
  targetAchievementTiers: TargetAchievementTier[];
}

interface SchemeFormValue {
  id: string;
  month: string;
  name: string;
  locations: string[];
  schemes: SubSchemeFormValue[];
}

@Component({
  selector: 'app-scheme-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './scheme-form.component.html',
  styleUrls: ['./scheme-form.component.scss']
})
export class SchemeFormComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  employeeRanks = Object.values(EmployeeRole).filter((rank): rank is string =>
    typeof rank === 'string' && rank !== 'All' && rank !== 'NONE');
  readonly rankClasses: Readonly<Record<string, string>> = {
    CA: 'rank-ca', TL: 'rank-tl', SM: 'rank-sm', SRSM: 'rank-srsm', AGM: 'rank-agm', GM: 'rank-gm'
  };
  schemeTypes = Object.values(SchemeType);
  readonly targetAchievementCategories = ['Finance', 'Extended Warranty'] as const;
  private readonly productService = inject(ProductService);
  readonly carModels = [...new Set([...Object.values(Models), ...this.productService.getProducts().map(product => product.model)])]
    .sort((a, b) => a.localeCompare(b));
  readonly carTypes = Object.values(ProductType).filter((type): type is string => typeof type === 'string')
    .map(type => type === 'CNG' ? type : type.charAt(0) + type.slice(1).toLowerCase());
  readonly locations = [...LOCATIONS];
  readonly selectedFileName = signal('');
  readonly savedJson = signal('');
  existingSchemes: { id?: string; month: string; name: string; schemeCount: number }[] = [];
  readonly status = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  private metadata: Partial<IncentiveScheme> = {};
  private readonly configDrafts = new WeakMap<FormGroup, { type: SchemeType; values: Partial<Record<SchemeType, string>> }>();
  private readonly expandedSubSchemes = new Set<AbstractControl>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly incentiveService: IncentiveService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.initForm();
    this.loadExistingSchemes();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  initForm() {
    this.selectedFileName.set('');
    this.savedJson.set('');
    this.metadata = {};
    this.expandedSubSchemes.clear();
    this.form = this.fb.group({
      id: [''],
      month: ['', Validators.required],
      name: ['', Validators.required],
      locations: [[]], // <-- Add locations at scheme level
      schemes: this.fb.array([])
    });
    // Array/tag actions also change values programmatically; track those as edits.
    const form = this.form;
    form.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => form.markAsDirty());
  }

  loadExistingSchemes() {
    this.incentiveService.schemes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(schemes => {
        this.existingSchemes = schemes.map(s => ({
          id: s.id,
          month: s.month,
          name: s.name,
          // active: s.active, // Removed as per requirements
          schemeCount: s.schemes?.length || 0
        }));
        // RxDB live query emissions can arrive outside Angular's zone.
        this.cdr.detectChanges();
      });
  }

  loadScheme(schemeId: string | undefined) {
    if (this.busy() || !this.confirmDraftReplacement()) return;
    const schemes = this.incentiveService.getAllSchemes();
    const scheme = schemes.find(s => s.id === schemeId);

    if (!scheme) {
      this.error.set('Scheme not found.');
      return;
    }
    this.populateScheme(scheme);
    this.error.set('');
    this.status.set(`Loaded scheme for ${scheme.month}.`);
  }

  get earlierSchemes() {
    const month = this.form.get('month')?.value as string;
    if (!this.isValidMonth(month)) return [];
    return this.existingSchemes.filter(scheme => scheme.month < month)
      .sort((a, b) => b.month.localeCompare(a.month));
  }

  get canImportEarlierScheme(): boolean {
    const month = this.form.get('month')?.value as string;
    return !this.busy() && !this.hasSavedScheme && this.isValidMonth(month) && this.schemes.length === 0
      && !this.existingSchemes.some(scheme => scheme.month === month);
  }

  get canImportExcel(): boolean {
    const month = this.form.get('month')?.value as string;
    return !this.busy() && !this.hasSavedScheme && this.isValidMonth(month);
  }

  get hasSavedScheme(): boolean {
    return Boolean(this.form?.get('id')?.value);
  }

  selectWorkingMonth(input: HTMLInputElement): void {
    const month = input.value;
    const previous = this.form.get('month')?.value as string;
    if (month === previous) return;
    if (this.busy() || !this.isValidMonth(month) || !this.confirmDraftReplacement()) {
      input.value = previous;
      return;
    }
    const saved = this.incentiveService.getAllSchemes().find(scheme => scheme.month === month);
    if (saved) {
      this.populateScheme(saved);
    } else {
      this.initForm();
      const [year, monthNumber] = month.split('-').map(Number);
      const monthLabel = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' })
        .format(new Date(year, monthNumber - 1, 1));
      this.form.patchValue({ month, name: `Sales Incentive scheme ${monthLabel}` }, { emitEvent: false });
      this.form.markAsPristine();
    }
    this.error.set('');
    this.status.set(saved ? `Loaded saved scheme for ${month}.` : `New scheme for ${month}. Enter rules or import a reference.`);
  }

  importEarlierMonth(sourceMonth: string): void {
    if (this.busy()) return;
    this.error.set('');
    this.status.set('');
    try {
      const month = this.form.get('month')?.value as string;
      if (!this.canImportEarlierScheme) throw new Error('Previous-scheme import is available only for an empty month that is unsaved.');
      if (!this.isValidMonth(month)) throw new Error('Select a working month before importing.');
      if (this.schemes.length > 0 || this.incentiveService.getAllSchemes().some(scheme => scheme.month === month)) {
        throw new Error('Previous-scheme import is available only for an empty month without a saved scheme.');
      }
      if (!this.isValidMonth(sourceMonth) || sourceMonth >= month) {
        throw new Error('Choose a source month earlier than the working month.');
      }
      const source = this.incentiveService.getAllSchemes().find(scheme => scheme.month === sourceMonth);
      if (!source) throw new Error('No saved scheme was found for the source month.');
      const draft = this.withoutIdentity(source);
      draft.month = month;
      SchemeWorkbook.validate(draft);
      if (!this.confirmDraftReplacement()) return;
      this.populateScheme(draft);
      this.form.markAsDirty();
      this.status.set(`Imported ${sourceMonth} into ${month} as an UNSAVED draft. Review then Save. The source is unchanged.`);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    }
  }

  private isValidMonth(month: string): boolean {
    return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '');
  }

  private populateScheme(source: IncentiveScheme) {
    const scheme = structuredClone(source);
    this.initForm();
    const { id, name, month, locations, schemes, ...metadata } = scheme;
    this.metadata = metadata;
    this.form.patchValue({
      id: id ?? '', month, name, locations: locations ?? []
    });
    schemes.forEach(sub => this.schemes.push(this.subSchemeFromModel(sub)));
    this.form.markAsPristine();
    if (scheme.id) this.savedJson.set(JSON.stringify(scheme, null, 2));
  }

  private subSchemeFromModel(sub: SubScheme): FormGroup {
    const group = this.createSubSchemeGroup();
    // Earlier versions stored every type in volumeConfig and/or top-level arrays.
    const legacy = (sub.volumeConfig ?? {}) as unknown as Record<string, unknown>;
    const advancedConfigs: Partial<Record<SchemeType, object>> = {
      [SchemeType.TARGET_ACHIEVEMENT]: sub.targetAchievementConfig,
      [SchemeType.LOCATION_BASED]: sub.locationConfig,
      [SchemeType.DISCOUNT_BASED]: sub.discountConfig
    };
    const advanced = advancedConfigs[sub.type];
    const models = sub.volumeConfig?.carModels ?? sub.carModels ?? [];
    const types = sub.volumeConfig?.carTypes ?? sub.carTypes ?? [];
    const legacyModels = sub.volumeConfig?.carModel ? [sub.volumeConfig.carModel] : [];
    const legacyTypes = sub.volumeConfig?.carType ? [sub.volumeConfig.carType] : [];
    group.patchValue({
      id: sub.id ?? '', name: sub.name,
      type: sub.type, priority: sub.priority,
      carModels: models.length ? models : legacyModels,
      carTypes: types.length ? types : legacyTypes,
      applyStockDifferential: sub.volumeConfig?.applyStockDifferential ?? false,
      configJson: JSON.stringify(advanced ?? (this.isAdvancedType(sub.type) ? legacy : {}), null, 2)
    });
    const arrays: Record<string, unknown> = {
      tiers: sub.type === SchemeType.VOLUME_BASED ? sub.volumeConfig?.tiers : [],
      modelBonusTiers: sub.modelBonusConfig?.bonuses ?? sub.modelBonusTiers ?? legacy['modelBonusTiers']
        ?? (sub.type === SchemeType.MODEL_BONUS ? legacy['bonuses'] ?? legacy['tiers'] : []),
      stockReductionTiers: sub.stockReductionConfig?.tiers ?? sub.stockReductionTiers ?? legacy['stockReductionTiers']
        ?? (sub.type === SchemeType.STOCK_REDUCTION ? legacy['tiers'] : []),
      accessoryTiers: sub.accessoriesConfig?.tiers ?? sub.accessoryTiers ?? legacy['accessoryTiers']
        ?? (sub.type === SchemeType.ACCESSORIES ? legacy['tiers'] : []),
      gmTargetTiers: sub.gmTargetConfig?.tiers ?? sub.gmTargetTiers ?? legacy['gmTargetTiers']
        ?? (sub.type === SchemeType.GM_TARGET ? legacy['tiers'] : []),
      locationTargets: sub.locationConfig?.locationTargets ?? [],
      targetAchievementTiers: sub.targetAchievementConfig?.tiers
        ?? (sub.targetAchievementConfig ? [{
          category: 'Finance',
          rank: sub.targetAchievementConfig.applyToRanks?.[0],
          requiredAchievementPercent: sub.targetAchievementConfig.requiredAchievementPercent,
          bonusAmount: sub.targetAchievementConfig.bonusAmount,
          perCarValue: false
        }] : [])
    };
    this.restoreArrays(group, arrays);
    this.configDrafts.set(group, { type: sub.type, values: {} });
    return group;
  }

  private restoreArrays(group: FormGroup, values: Record<string, unknown>) {
    const factories: Record<string, () => FormGroup> = {
      tiers: () => this.createTierGroup(),
      modelBonusTiers: () => this.createModelBonusTierGroup(),
      stockReductionTiers: () => this.createStockReductionTierGroup(),
      accessoryTiers: () => this.createAccessoryTierGroup(),
      gmTargetTiers: () => this.createGMTargetTierGroup(),
      locationTargets: () => this.createLocationTargetGroup(),
      targetAchievementTiers: () => this.createTargetAchievementTierGroup()
    };
    for (const [key, factory] of Object.entries(factories)) {
      const array = group.get(key) as FormArray;
      array.clear();
      const tiers = values[key];
      if (!Array.isArray(tiers)) continue;
      for (const value of tiers) {
        const tier = factory();
        const data = structuredClone(value) as Record<string, unknown>;
        // Keep existing unrestricted tiers unchanged; CA is the default for new tiers only.
        if (tier.get('rank') && data['rank'] == null) data['rank'] = '';
        if (typeof data['rank'] === 'number') data['rank'] = EmployeeRole[data['rank']];
        tier.patchValue(data);
        array.push(tier);
      }
    }
  }

  get schemes(): FormArray {
    return this.form.get('schemes') as FormArray;
  }

  createSubSchemeGroup(): FormGroup {
    return this.fb.group({
      id: [''],
      name: ['', Validators.required],
      type: [SchemeType.VOLUME_BASED, Validators.required],
      priority: [1, [Validators.required, Validators.min(1)]],
      // Remove applicableLocations from sub-scheme
      carModels: [[]],
      carTypes: [[]],
      applyStockDifferential: [false],
      configJson: ['{}'],
      tiers: this.fb.array([]),
      stockReductionTiers: this.fb.array([]),
      accessoryTiers: this.fb.array([]),
      gmTargetTiers: this.fb.array([]),
      modelBonusTiers: this.fb.array([]),
      locationTargets: this.fb.array([]),
      targetAchievementTiers: this.fb.array([])
    });
  }

  addSubScheme() {
    const month = this.form.get('month')?.value as string;
    if (this.busy() || !this.isValidMonth(month)) return;
    const subScheme = this.createSubSchemeGroup();
    const [year, monthNumber] = month.split('-').map(Number);
    const monthLabel = new Intl.DateTimeFormat('en', { month: 'short' })
      .format(new Date(year, monthNumber - 1, 1));
    subScheme.patchValue({ name: `${monthLabel}-${year}-SubScheme-${this.schemes.length + 1}` });
    this.schemes.push(subScheme);
    this.onTypeChange(this.schemes.length - 1);
  }

  isAdvancedType(type: SchemeType): boolean {
    return type === SchemeType.DISCOUNT_BASED;
  }

  private activeTierArrayName(type: SchemeType): string | undefined {
    const arrays: Partial<Record<SchemeType, string>> = {
      [SchemeType.VOLUME_BASED]: 'tiers',
      [SchemeType.MODEL_BONUS]: 'modelBonusTiers',
      [SchemeType.STOCK_REDUCTION]: 'stockReductionTiers',
      [SchemeType.ACCESSORIES]: 'accessoryTiers',
      [SchemeType.GM_TARGET]: 'gmTargetTiers',
      [SchemeType.LOCATION_BASED]: 'locationTargets',
      [SchemeType.TARGET_ACHIEVEMENT]: 'targetAchievementTiers'
    };
    return arrays[type];
  }

  onTypeChange(index: number) {
    const group = this.schemes.at(index) as FormGroup;
    const type = group.get('type')?.value as SchemeType;
    const arrays: Partial<Record<SchemeType, [string, () => void]>> = {
      [SchemeType.VOLUME_BASED]: ['tiers', () => this.addTier(index)],
      [SchemeType.MODEL_BONUS]: ['modelBonusTiers', () => this.addModelBonusTier(index)],
      [SchemeType.STOCK_REDUCTION]: ['stockReductionTiers', () => this.addStockReductionTier(index)],
      [SchemeType.ACCESSORIES]: ['accessoryTiers', () => this.addAccessoryTier(index)],
      [SchemeType.GM_TARGET]: ['gmTargetTiers', () => this.addGMTargetTier(index)],
      [SchemeType.LOCATION_BASED]: ['locationTargets', () => this.addLocationTarget(index)],
      [SchemeType.TARGET_ACHIEVEMENT]: ['targetAchievementTiers', () => this.addTargetAchievementTier(index)]
    };
    const target = arrays[type];
    if (target && (group.get(target[0]) as FormArray).length === 0) target[1]();
    // Keep edits for each advanced type when switching back and forth.
    const config = group.get('configJson');
    const drafts = this.configDrafts.get(group) ?? { type: SchemeType.VOLUME_BASED, values: {} as Partial<Record<SchemeType, string>> };
    if (this.isAdvancedType(drafts.type)) drafts.values[drafts.type] = config?.value;
    if (this.isAdvancedType(type) && drafts.type !== type) {
      const defaults: Partial<Record<SchemeType, object>> = {
        [SchemeType.TARGET_ACHIEVEMENT]: { requiredAchievementPercent: 100, bonusAmount: 0 },
        [SchemeType.LOCATION_BASED]: { locationTargets: [{ location: 'Location', targetUnits: 1, bonusAmount: 0 }] },
        [SchemeType.DISCOUNT_BASED]: { applyTo: 'add', tiers: [{ minDiscountPercent: 0, maxDiscountPercent: 100, incentiveAmount: 0 }] }
      };
      config?.setValue(drafts.values[type] ?? JSON.stringify(defaults[type], null, 2));
    }
    drafts.type = type;
    this.configDrafts.set(group, drafts);
  }

  createTierGroup(): FormGroup {
    return this.fb.group({
      rank: ['CA'],
      minVolume: [0, [Validators.required, Validators.min(0)]],
      maxVolume: [0, [Validators.required, Validators.min(0)]],
      incentiveAmount: [0, [Validators.required, Validators.min(0)]],
      incentiveAmountNonStock: [null, [Validators.min(0)]],
      description: ['']
    });
  }

  createStockReductionTierGroup(): FormGroup {
    return this.fb.group({
      rank: ['CA'],
      minStockDays: [0, [Validators.required, Validators.min(0)]],
      maxStockDays: [0, [Validators.required, Validators.min(0)]],
      saleTarget: [0, [Validators.required, Validators.min(0)]],
      incentiveAmount: [0, [Validators.required, Validators.min(0)]],
      description: ['']
    });
  }

  createAccessoryTierGroup(): FormGroup {
    return this.fb.group({
      rank: ['CA'],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      incentiveAmount: [null, [Validators.min(0.01)]],
      incentivePercent: [null, [Validators.min(0.01), Validators.max(100)]],
      description: ['']
    }, { validators: this.accessoryIncentiveValidator });
  }

  private accessoryIncentiveValidator(control: AbstractControl): ValidationErrors | null {
    const fixed = control.get('incentiveAmount')?.value;
    const percent = control.get('incentivePercent')?.value;
    const hasFixed = fixed !== null && fixed !== undefined && fixed !== '';
    const hasPercent = percent !== null && percent !== undefined && percent !== '';
    return hasFixed === hasPercent ? { incentiveChoice: true } : null;
  }

  createGMTargetTierGroup(): FormGroup {
    return this.fb.group({
      carModels: [[]],
      numberOfCars: [0, [Validators.required, Validators.min(0)]],
      additionalDiscountPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
      description: ['']
    });
  }
  createModelBonusTierGroup(): FormGroup {
    return this.fb.group({
      rank: ['CA'],
      carModels: [[]],
      numberOfCars: [0, [Validators.required, Validators.min(1)]],
      fixedIncentiveAmount: [0, [Validators.required, Validators.min(0)]],
      description: ['']
    });
  }
  createLocationTargetGroup(): FormGroup {
    return this.fb.group({
      location: ['', Validators.required],
      rank: ['CA'],
      targetUnits: [1, [Validators.required, Validators.min(1)]],
      targetPercent: [100, [Validators.required, Validators.min(0.01), Validators.max(100)]],
      bonusAmount: [0, [Validators.required, Validators.min(0)]],
      targetValue: [null],
      description: ['']
    });
  }
  createTargetAchievementTierGroup(): FormGroup {
    return this.fb.group({
      category: ['Finance', Validators.required],
      rank: ['CA'],
      requiredAchievementPercent: [100, [Validators.required, Validators.min(0.01), Validators.max(100)]],
      bonusAmount: [0, [Validators.required, Validators.min(0)]],
      perCarValue: [false]
    });
  }
  getTiers(schemeIndex: number): FormArray {
    return this.schemes.at(schemeIndex).get('tiers') as FormArray;
  }

  getStockReductionTiers(schemeIndex: number): FormArray {
    return this.schemes.at(schemeIndex).get('stockReductionTiers') as FormArray;
  }

  getAccessoryTiers(schemeIndex: number): FormArray {
    return this.schemes.at(schemeIndex).get('accessoryTiers') as FormArray;
  }

  getGMTargetTiers(schemeIndex: number): FormArray {
    return this.schemes.at(schemeIndex).get('gmTargetTiers') as FormArray;
  }

  getLocationTargets(schemeIndex: number): FormArray {
    return this.schemes.at(schemeIndex).get('locationTargets') as FormArray;
  }

  getTargetAchievementTiers(schemeIndex: number): FormArray {
    return this.schemes.at(schemeIndex).get('targetAchievementTiers') as FormArray;
  }

  addTier(schemeIndex: number) {
    const tiers = this.getTiers(schemeIndex);
    if (tiers.length === 0) {
      tiers.push(this.createTierGroup());
      return;
    }

    const usedRankIndexes = tiers.controls
      .map(tier => this.employeeRanks.indexOf(String(tier.get('rank')?.value ?? '')))
      .filter(index => index >= 0);
    const lastRankIndex = Math.max(...usedRankIndexes, -1);
    const lastRank = this.employeeRanks[lastRankIndex];
    const nextRank = this.employeeRanks[lastRankIndex + 1];
    if (!lastRank || !nextRank) return;

    const sourceRows = tiers.controls
      .filter(tier => String(tier.get('rank')?.value ?? '') === lastRank)
      .map(tier => structuredClone(tier.getRawValue()));
    for (const sourceRow of sourceRows) {
      const duplicate = this.createTierGroup();
      duplicate.patchValue({ ...sourceRow, rank: nextRank });
      tiers.push(duplicate);
    }
  }

  duplicateLastTier(schemeIndex: number) {
    const tiers = this.getTiers(schemeIndex);
    const lastTier = tiers.at(-1);
    if (!lastTier) {
      tiers.push(this.createTierGroup());
      return;
    }

    const duplicate = this.createTierGroup();
    duplicate.patchValue(structuredClone(lastTier.getRawValue()));
    tiers.push(duplicate);
  }

  addStockReductionTier(schemeIndex: number) {
    const tier = this.createStockReductionTierGroup();
    this.getStockReductionTiers(schemeIndex).push(tier);
  }

  addAccessoryTier(schemeIndex: number) {
    const tier = this.createAccessoryTierGroup();
    this.getAccessoryTiers(schemeIndex).push(tier);
  }

  addGMTargetTier(schemeIndex: number) {
    const tier = this.createGMTargetTierGroup();
    this.getGMTargetTiers(schemeIndex).push(tier);
  }

  addLocationTarget(schemeIndex: number) {
    this.getLocationTargets(schemeIndex).push(this.createLocationTargetGroup());
  }

  removeLocationTarget(schemeIndex: number, targetIndex: number) {
    if (confirm('Are you sure you want to remove this location target?')) {
      this.getLocationTargets(schemeIndex).removeAt(targetIndex);
    }
  }

  addTargetAchievementTier(schemeIndex: number) {
    this.getTargetAchievementTiers(schemeIndex).push(this.createTargetAchievementTierGroup());
  }

  removeTargetAchievementTier(schemeIndex: number, tierIndex: number) {
    if (confirm('Are you sure you want to remove this target achievement tier?')) {
      this.getTargetAchievementTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  removeStockReductionTier(schemeIndex: number, tierIndex: number) {
    if (confirm('Are you sure you want to remove this tier?')) {
      this.getStockReductionTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  removeAccessoryTier(schemeIndex: number, tierIndex: number) {
    if (confirm('Are you sure you want to remove this tier?')) {
      this.getAccessoryTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  removeGMTargetTier(schemeIndex: number, tierIndex: number) {
    if (confirm('Are you sure you want to remove this tier?')) {
      this.getGMTargetTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  // Model Bonus tier methods
  getModelBonusTiers(schemeIndex: number): FormArray {
    return this.schemes.at(schemeIndex).get('modelBonusTiers') as FormArray;
  }

  addModelBonusTier(schemeIndex: number) {
    this.getModelBonusTiers(schemeIndex).push(this.createModelBonusTierGroup());
  }

  removeModelBonusTier(schemeIndex: number, tierIndex: number) {
    if (confirm('Are you sure you want to remove this tier?')) {
      this.getModelBonusTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  removeTier(schemeIndex: number, tierIndex: number) {
    if (confirm('Are you sure you want to remove this tier?')) {
      this.getTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  removeSubScheme(index: number) {
    if (confirm('Are you sure you want to remove this sub-scheme?')) {
      this.expandedSubSchemes.delete(this.schemes.at(index));
      this.schemes.removeAt(index);
    }
  }

  cloneSubScheme(index: number) {
    const subScheme = this.schemes.at(index);
    const clonedSubScheme = this.createSubSchemeGroup();
    const subSchemeValue = structuredClone(subScheme.getRawValue()) as SubSchemeFormValue;
    subSchemeValue.id = '';
    subSchemeValue.name = `${subSchemeValue.name} (copy)`;
    clonedSubScheme.patchValue(subSchemeValue);
    this.restoreArrays(clonedSubScheme, { ...subSchemeValue });
    const drafts = this.configDrafts.get(subScheme as FormGroup);
    this.configDrafts.set(clonedSubScheme, structuredClone(drafts ?? { type: subSchemeValue.type, values: {} }));
    this.schemes.push(clonedSubScheme);
  }

  isSubSchemeExpanded(subScheme: AbstractControl): boolean {
    return this.expandedSubSchemes.has(subScheme);
  }

  toggleSubScheme(subScheme: AbstractControl): void {
    if (this.isSubSchemeExpanded(subScheme)) {
      this.expandedSubSchemes.delete(subScheme);
    } else {
      this.expandedSubSchemes.add(subScheme);
    }
  }

  expandSubScheme(subScheme: AbstractControl): void {
    this.expandedSubSchemes.add(subScheme);
  }

  /** Builds a detached, canonical draft containing all visible functional template details. */
  public buildScheme(): IncentiveScheme {
    const raw = structuredClone(this.form.getRawValue()) as SchemeFormValue;
    return {
      ...structuredClone(this.metadata),
      ...(raw.id ? { id: raw.id } : {}),
      name: raw.name, month: raw.month, locations: raw.locations,
      schemes: raw.schemes.map(s => {
        const sub: SubScheme = {
          ...(s.id ? { id: s.id } : {}),
          name: s.name, type: s.type,
          priority: s.priority
        };
        switch (s.type) {
          case SchemeType.VOLUME_BASED:
            sub.volumeConfig = {
              tiers: this.cleanRanks(s.tiers).map(tier => {
                if (tier.incentiveAmountNonStock == null) delete tier.incentiveAmountNonStock;
                return tier;
              }), carModels: s.carModels, carTypes: s.carTypes,
              applyStockDifferential: s.applyStockDifferential
            };
            break;
          case SchemeType.MODEL_BONUS:
            sub.modelBonusConfig = { bonuses: this.cleanRanks(s.modelBonusTiers) };
            break;
          case SchemeType.STOCK_REDUCTION:
            sub.stockReductionConfig = { tiers: this.cleanRanks(s.stockReductionTiers) };
            break;
          case SchemeType.ACCESSORIES:
            sub.accessoriesConfig = {
              tiers: this.cleanRanks(s.accessoryTiers).map(tier => {
                if (tier.incentiveAmount == null) delete tier.incentiveAmount;
                if (tier.incentivePercent == null) delete tier.incentivePercent;
                return tier;
              })
            };
            break;
          case SchemeType.GM_TARGET:
            sub.gmTargetConfig = { tiers: s.gmTargetTiers };
            break;
          case SchemeType.TARGET_ACHIEVEMENT: {
            const tiers = this.cleanRanks(s.targetAchievementTiers);
            sub.targetAchievementConfig = {
              tiers,
              requiredAchievementPercent: tiers[0]?.requiredAchievementPercent ?? 100,
              bonusAmount: tiers[0]?.bonusAmount ?? 0
            };
            break;
          }
          case SchemeType.LOCATION_BASED:
            sub.locationConfig = {
              locationTargets: this.cleanRanks(s.locationTargets).map(target => {
                if (target.targetValue == null) delete target.targetValue;
                return target;
              })
            };
            break;
          case SchemeType.DISCOUNT_BASED:
            sub.discountConfig = this.parseConfig(s) as NonNullable<SubScheme['discountConfig']>;
            break;
        }
        return sub;
      })
    };
  }

  private cleanRanks<T extends { rank?: string | EmployeeRole }>(tiers: T[]): T[] {
    return tiers.map(tier => {
      const copy = { ...tier };
      if (copy.rank === '') delete copy.rank;
      if ('description' in copy && (copy as { description?: string }).description === '') {
        delete (copy as { description?: string }).description;
      }
      return copy;
    });
  }

  private parseConfig(sub: SubSchemeFormValue): object {
    try {
      const config: unknown = JSON.parse(sub.configJson);
      if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Expected a JSON object');
      return config;
    } catch (error) {
      throw new Error(`${sub.name || sub.type}: invalid configuration JSON. ${this.errorMessage(error)}`);
    }
  }

  private validatedScheme(): IncentiveScheme {
    this.form.markAllAsTouched();
    // Hidden tiers from a previously selected type must not invalidate this type.
    if (this.form.get('name')?.invalid || this.form.get('month')?.invalid
      || this.schemes.controls.some(sub => sub.get('name')?.invalid || sub.get('priority')?.invalid)) {
      throw new Error('Please fill all required fields correctly.');
    }
    for (const sub of this.schemes.controls) {
      const arrayName = this.activeTierArrayName(sub.get('type')?.value as SchemeType);
      const tiers = arrayName ? sub.get(arrayName) as FormArray : undefined;
      if (tiers && (tiers.length === 0 || tiers.controls.some(tier => tier.invalid))) {
        throw new Error(`${sub.get('name')?.value || sub.get('type')?.value}: complete all tier details.`);
      }
    }
    const scheme = this.buildScheme();
    SchemeWorkbook.validate(scheme);
    return scheme;
  }

  async save(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.status.set('');
    try {
      const scheme = this.validatedScheme();
      this.busy.set(true);
      const saved = await this.incentiveService.saveScheme(scheme);
      if (!saved) return; // Replacement was declined; keep the draft unsaved.
      this.form.patchValue({ id: saved.id }, { emitEvent: false });
      this.metadata = {
        startDate: saved.startDate, endDate: saved.endDate,
        createdDate: saved.createdDate, updatedDate: saved.updatedDate
      };
      this.form.markAsPristine();
      this.savedJson.set(JSON.stringify(saved, null, 2));
      this.status.set(`Scheme for ${saved.month} saved successfully.`);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async deleteCurrentScheme(): Promise<void> {
    if (this.busy() || !this.hasSavedScheme) return;
    const schemeId = String(this.form.get('id')?.value ?? '');
    const month = String(this.form.get('month')?.value ?? '');
    if (!globalThis.confirm(`Delete the saved scheme for ${month}? This cannot be undone.`)) return;

    this.error.set('');
    this.status.set('');
    this.busy.set(true);
    try {
      await this.incentiveService.deleteScheme(schemeId);
      const [year, monthNumber] = month.split('-').map(Number);
      const monthLabel = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' })
        .format(new Date(year, monthNumber - 1, 1));
      this.initForm();
      this.form.patchValue({ month, name: `Sales Incentive scheme ${monthLabel}` }, { emitEvent: false });
      this.form.markAsPristine();
      this.status.set(`Deleted saved scheme for ${month}.`);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async importSpreadsheet(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    let importing = false;
    try {
      const file = input.files?.[0];
      if (!file || this.busy()) return;
      const targetMonth = this.form.get('month')?.value as string;
      if (!this.isValidMonth(targetMonth)) throw new Error('Select a working month before importing.');
      if (!this.canImportExcel) throw new Error('Excel import is available only for an unsaved month.');
      this.selectedFileName.set(file.name);
      this.error.set('');
      this.status.set('');
      this.busy.set(true);
      importing = true;
      const parsed = SchemeWorkbook.fromRows(await ExcelImportHelper.readFile(file));
      SchemeWorkbook.validate(parsed);
      if (!this.confirmDraftReplacement()) return;
      const draft = this.withoutIdentity(parsed);
      draft.month = targetMonth;
      this.populateScheme(draft);
      this.selectedFileName.set(file.name);
      this.form.markAsDirty();
      this.status.set(`Spreadsheet imported into ${targetMonth} as an UNSAVED draft. Review then Save.`);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      input.value = '';
      if (importing) this.busy.set(false);
    }
  }

  exportExcel() {
    this.error.set('');
    try {
      SchemeWorkbook.download(this.validatedScheme());
    } catch (error) {
      this.error.set(this.errorMessage(error));
    }
  }

  copyToMonth(month: string) {
    if (this.busy()) return;
    this.error.set('');
    this.status.set('');
    try {
      if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month) || month === this.form.get('month')?.value) {
        throw new Error('Choose a valid destination month different from the current month.');
      }
      const copy = this.withoutIdentity(this.validatedScheme());
      copy.month = month;
      SchemeWorkbook.validate(copy);
      this.populateScheme(copy);
      this.form.markAsDirty();
      this.status.set(`Copied to ${month} as an UNSAVED draft. Review then Save. The source is unchanged.`);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    }
  }

  private withoutIdentity(source: IncentiveScheme): IncentiveScheme {
    const copy = structuredClone(source);
    delete copy.id;
    delete copy.createdDate;
    delete copy.updatedDate;
    copy.schemes.forEach(sub => delete sub.id);
    return copy;
  }

  private confirmDraftReplacement(): boolean {
    return !this.form.dirty || globalThis.confirm('Replace this unsaved draft? Unsaved changes will be lost.');
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  newScheme() {
    if (this.busy() || !this.confirmDraftReplacement()) return;
    this.initForm();
    this.status.set('');
    this.error.set('');
  }

  // Helper method to check if a sub-scheme is valid
  isSubSchemeValid(index: number): boolean {
    return this.schemes.at(index).valid;
  }

  // Helper method to get validation errors for debugging
  getFormValidationErrors() {
    const errors: any = {};

    Object.keys(this.form.controls).forEach(key => {
      const control = this.form.get(key);
      if (control?.errors) {
        errors[key] = control.errors;
      }
    });

    this.schemes.controls.forEach((scheme: any, schemeIndex: number) => {
      Object.keys((scheme as FormGroup).controls).forEach(key => {
        const control = scheme.get(key);
        if (control?.errors) {
          errors[`scheme_${schemeIndex}_${key}`] = control.errors;
        }
      });
    });

    return errors;
  }

  // Helper to add a location
  addLocation(location: string) {
    if (!location?.trim()) return;
    const currentLocations = this.form.get('locations')?.value || [];
    if (!currentLocations.includes(location.trim())) {
      this.form.get('locations')?.setValue([...currentLocations, location.trim()]);
    }
  }

  // Helper to remove a location
  removeLocation(location: string) {
    const currentLocations = this.form.get('locations')?.value || [];
    const updatedLocations = currentLocations.filter((l: string) => l !== location);
    this.form.get('locations')?.setValue(updatedLocations);
  }

  // Helper to add a car model
  addCarModel(index: number, model: string) {
    if (!model?.trim()) return;
    const currentModels = this.schemes.at(index).get('carModels')?.value || [];
    if (!currentModels.includes(model.trim())) {
      this.schemes.at(index).get('carModels')?.setValue([...currentModels, model.trim()]);
    }
  }

  // Helper to remove a car model
  removeCarModel(schemeIndex: number, model: string) {
    const currentModels = this.schemes.at(schemeIndex).get('carModels')?.value || [];
    const updatedModels = currentModels.filter((m: string) => m !== model);
    this.schemes.at(schemeIndex).get('carModels')?.setValue(updatedModels);
  }

  // Helper to add a car type
  addCarType(index: number, type: string) {
    if (!type) return;
    const currentTypes = this.schemes.at(index).get('carTypes')?.value || [];
    if (!currentTypes.includes(type)) {
      this.schemes.at(index).get('carTypes')?.setValue([...currentTypes, type]);
    }
  }

  // Helper to remove a car type
  removeCarType(schemeIndex: number, type: string) {
    const currentTypes = this.schemes.at(schemeIndex).get('carTypes')?.value || [];
    const updatedTypes = currentTypes.filter((t: string) => t !== type);
    this.schemes.at(schemeIndex).get('carTypes')?.setValue(updatedTypes);
  }

  // Get available car types not yet selected
  getAvailableCarTypes(index: number): string[] {
    const currentTypes = this.schemes.at(index).get('carTypes')?.value || [];
    return this.carTypes.filter(type => !currentTypes.includes(type));
  }

  getRankClass(rank: unknown): string {
    return this.rankClasses[String(rank ?? '')] ?? 'rank-unassigned';
  }

  // Helper to add a car model to GM Target tier
  addGMTargetCarModel(schemeIndex: number, tierIndex: number, model: string) {
    if (!model?.trim()) return;
    const tier = this.getGMTargetTiers(schemeIndex).at(tierIndex);
    const currentModels = tier.get('carModels')?.value || [];
    if (!currentModels.includes(model.trim())) {
      tier.get('carModels')?.setValue([...currentModels, model.trim()]);
    }
  }

  // Helper to remove a car model from GM Target tier
  removeGMTargetCarModel(schemeIndex: number, tierIndex: number, model: string) {
    const tier = this.getGMTargetTiers(schemeIndex).at(tierIndex);
    const currentModels = tier.get('carModels')?.value || [];
    const updatedModels = currentModels.filter((m: string) => m !== model);
    tier.get('carModels')?.setValue(updatedModels);
  }

  addModelBonusCarModel(schemeIndex: number, tierIndex: number, model: string) {
    if (!model?.trim()) return;
    const tier = this.getModelBonusTiers(schemeIndex).at(tierIndex);
    const currentModels = tier.get('carModels')?.value || [];
    if (!currentModels.includes(model.trim())) {
      tier.get('carModels')?.setValue([...currentModels, model.trim()]);
    }
  }

  removeModelBonusCarModel(schemeIndex: number, tierIndex: number, model: string) {
    const tier = this.getModelBonusTiers(schemeIndex).at(tierIndex);
    const currentModels = tier.get('carModels')?.value || [];
    tier.get('carModels')?.setValue(currentModels.filter((m: string) => m !== model));
  }

  onAccessoryIncentiveChange(tier: AbstractControl, field: 'incentiveAmount' | 'incentivePercent'): void {
    const value = tier.get(field)?.value;
    if (value === null || value === undefined || value === '') return;
    const otherField = field === 'incentiveAmount' ? 'incentivePercent' : 'incentiveAmount';
    tier.get(otherField)?.setValue(null);
  }

  canAddAccessoryTier(tier: AbstractControl): boolean {
    const amount = Number(tier.get('amount')?.value);
    const fixed = Number(tier.get('incentiveAmount')?.value);
    const percent = Number(tier.get('incentivePercent')?.value);
    const hasFixed = tier.get('incentiveAmount')?.value !== null
      && tier.get('incentiveAmount')?.value !== undefined
      && tier.get('incentiveAmount')?.value !== '';
    const hasPercent = tier.get('incentivePercent')?.value !== null
      && tier.get('incentivePercent')?.value !== undefined
      && tier.get('incentivePercent')?.value !== '';
    return amount > 0 && ((hasFixed && !hasPercent && fixed > 0)
      || (hasPercent && !hasFixed && percent > 0 && percent <= 100));
  }

  // Add these stubs for edit/save actions for sub-schemes (to match template)
  editSubScheme(index: number) {
    // Implement edit logic if needed, or leave as a stub for now
    // For example, you might set an "editing" flag on the sub-scheme
    // This is a placeholder to prevent build errors if used in template
  }

  saveSubScheme(index: number) {
    // Implement save logic if needed, or leave as a stub for now
    // For example, you might validate and persist changes to the sub-scheme
    // This is a placeholder to prevent build errors if used in template
  }

  // Checks for duplicate min/max for rank (already present)
  hasDuplicateTierRange(schemeIndex: number): boolean {
    const tiers = this.getTiers(schemeIndex).controls;
    const seen = new Set<string>();
    for (const tier of tiers) {
      const rank = tier.get('rank')?.value || '';
      const min = tier.get('minVolume')?.value;
      const max = tier.get('maxVolume')?.value;
      if (rank !== undefined && min !== undefined && max !== undefined && min !== '' && max !== '') {
        const key = `${rank}|${min}|${max}`;
        if (seen.has(key)) {
          return true;
        }
        seen.add(key);
      }
    }
    return false;
  }

  // Helper: Checks if two ranges overlap (fix: do not sort in-place, and use correct overlap logic)
  private doRangesOverlap(ranges: Array<{ min: number, max: number }>): boolean {
    // Make a copy to avoid mutating the original array
    const sortedRanges = [...ranges].sort((a, b) => a.min - b.min);
    for (let i = 0; i < sortedRanges.length; i++) {
      const a = sortedRanges[i];
      for (let j = i + 1; j < sortedRanges.length; j++) {
        const b = sortedRanges[j];
        // Overlap if a.min <= b.max && b.min <= a.max
        if (a.min <= b.max && b.min <= a.max) {
          return true;
        }
      }
    }
    return false;
  }

  // New: Checks if any min/max range for a rank overlaps with another
  hasOverlappingTierRange(schemeIndex: number): boolean {
    const tiers = this.getTiers(schemeIndex).controls;
    const rangesByRank: { [rank: string]: Array<{ min: number, max: number }> } = {};
    for (const tier of tiers) {
      const rank = tier.get('rank')?.value || '';
      const min = Number(tier.get('minVolume')?.value);
      const max = Number(tier.get('maxVolume')?.value);
      if (rank && !Number.isNaN(min) && !Number.isNaN(max)) {
        if (!rangesByRank[rank]) rangesByRank[rank] = [];
        rangesByRank[rank].push({ min, max });
      }
    }
    for (const rank in rangesByRank) {
      if (this.doRangesOverlap(rangesByRank[rank])) {
        return true;
      }
    }
    return false;
  }

  // Match workbook validation: a single-volume range is valid.
  hasInvalidMinMaxVolume(schemeIndex: number): boolean {
    const tiers = this.getTiers(schemeIndex).controls;
    for (const tier of tiers) {
      const min = Number(tier.get('minVolume')?.value);
      const max = Number(tier.get('maxVolume')?.value);
      if (!Number.isNaN(min) && !Number.isNaN(max) && min > max) {
        return true;
      }
    }
    return false;
  }
}
