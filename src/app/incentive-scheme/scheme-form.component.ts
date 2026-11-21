import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, FormArray, ValidationErrors, Validators, ReactiveFormsModule } from '@angular/forms';
import { IncentiveService } from '../core/services/incentive.service';
import { AccessoryTier, GMTargetTier, IncentiveScheme, LocationTarget, ModelBonus, SchemeType, StockReductionTier, SubScheme, TargetAchievementTier, VolumeModelSelector, VolumeTier } from '../core/models/incentive-scheme.model';
import { Subject, takeUntil } from 'rxjs';
import { EmployeeRole } from '../core/models/employee.model';
import { ExcelImportHelper } from '../shared/helper/excel-import-helper';
import { SchemeWorkbook } from '../shared/helper/scheme-workbook';
import { getPreviousMonth } from '../shared/helper/date-helper';
import { ProductService } from '../core/services/product.service';
import { Models, Product, ProductType } from '../core/models/product.model';
import { LOCATIONS } from '../core/db/seed-data';
import { ToastService } from '../shared/toast.message/toast.service';

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
  volumeTabs: VolumeModelTabFormValue[];
}

interface VolumeModelTabFormValue {
  carModels: string[];
  selectors: VolumeModelSelector[];
  carTypes: string[];
  applyStockDifferential: boolean;
  tiers: VolumeTier[];
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
  private readonly toastService = inject(ToastService);
  readonly products = this.productService.getProducts();
  readonly carModels = [...new Set([...Object.values(Models), ...this.products.map(product => product.model)])]
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
  private readonly activeVolumeTab = new WeakMap<FormGroup, number>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly incentiveService: IncentiveService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.initForm();
    this.loadExistingSchemes();
    this.selectPreviousWorkingMonth();
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
    return !this.busy() && !this.hasSavedScheme && this.schemes.length === 0 && this.isValidMonth(month);
  }

  get canImportExcel(): boolean {
    const month = this.form.get('month')?.value as string;
    return !this.busy() && !this.hasSavedScheme && this.schemes.length === 0 && this.isValidMonth(month);
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

  private selectPreviousWorkingMonth(): void {
    const month = getPreviousMonth();
    const saved = this.incentiveService.getAllSchemes().find(scheme => scheme.month === month);
    if (saved) {
      this.populateScheme(saved);
      this.status.set(`Loaded saved scheme for ${month}.`);
      return;
    }

    const [year, monthNumber] = month.split('-').map(Number);
    const monthLabel = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' })
      .format(new Date(year, monthNumber - 1, 1));
    this.form.patchValue({ month, name: `Sales Incentive scheme ${monthLabel}` }, { emitEvent: false });
    this.form.markAsPristine();
    this.status.set(`New scheme for ${month}. Enter rules or import a reference.`);
  }

  importEarlierMonth(sourceMonth: string): void {
    if (this.busy()) return;
    this.error.set('');
    this.status.set('');
    try {
      const month = this.form.get('month')?.value as string;
      if (!this.canImportEarlierScheme) throw new Error('Import requires an empty month draft.');
      if (!this.isValidMonth(month)) throw new Error('Select a working month before importing.');
      sourceMonth = sourceMonth || this.earlierSchemes[0]?.month || '';
      if (!this.isValidMonth(sourceMonth) || sourceMonth >= month) {
        throw new Error('Choose a source month earlier than the working month.');
      }
      const source = this.incentiveService.getAllSchemes().find(scheme => scheme.month === sourceMonth);
      if (!source) throw new Error('No saved scheme was found for the source month.');
      const draft = this.withoutIdentity(source);
      draft.month = month;
      SchemeWorkbook.validate(draft);
      if (!this.confirmDraftReplacement(this.hasSavedScheme)) return;
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
    schemes.forEach(sub => {
      const group = this.subSchemeFromModel(sub);
      this.schemes.push(group);
      this.expandedSubSchemes.add(group);
    });
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
    const modelFilters = this.volumeModelFilters(sub);
    const volumeTabs = this.volumeTabsFromModel(sub, modelFilters);
    group.patchValue({
      id: sub.id ?? '', name: sub.name,
      type: sub.type, priority: sub.priority,
      ...modelFilters,
      configJson: JSON.stringify(advanced ?? (this.isAdvancedType(sub.type) ? legacy : {}), null, 2)
    });
    volumeTabs.forEach(tab => (group.get('volumeTabs') as FormArray).push(tab));
    const arrays: Record<string, unknown> = {
      tiers: sub.type === SchemeType.VOLUME_BASED ? modelFilters.tiers : [],
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
    if (sub.type === SchemeType.VOLUME_BASED) this.loadActiveVolumeTab(group);
    this.configDrafts.set(group, { type: sub.type, values: {} });
    return group;
  }

  private volumeModelFilters(sub: SubScheme): VolumeModelTabFormValue {
    const config = sub.volumeConfig;
    const legacyCarModel = config?.carModel ? [config.carModel] : [];
    const legacyCarType = config?.carType ? [config.carType] : [];
    const firstTab = config?.modelTabs?.[0];
    return {
      carModels: firstTab?.carModels ?? config?.carModels ?? sub.carModels ?? legacyCarModel,
      selectors: firstTab?.selectors ?? config?.selectors ?? [],
      carTypes: firstTab?.carTypes ?? config?.carTypes ?? sub.carTypes ?? legacyCarType,
      applyStockDifferential: firstTab?.applyStockDifferential ?? config?.applyStockDifferential ?? false,
      tiers: firstTab?.tiers ?? config?.tiers ?? []
    };
  }

  private volumeTabsFromModel(sub: SubScheme, fallback: VolumeModelTabFormValue): FormGroup[] {
    const tabs = sub.volumeConfig?.modelTabs;
    return (tabs?.length ? tabs : [fallback]).map(tab => this.volumeTabGroup(tab));
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
      targetAchievementTiers: this.fb.array([]),
      volumeTabs: this.fb.array([])
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
    this.expandedSubSchemes.add(subScheme);
    this.onTypeChange(this.schemes.length - 1);
  }

  private volumeTabGroup(value?: Partial<VolumeModelTabFormValue>): FormGroup {
    const tiers = this.fb.array<FormGroup>([]);
    for (const tierValue of value?.tiers ?? []) {
      const tier = this.createTierGroup();
      tier.patchValue(this.normalizedTierValue(tierValue));
      tiers.push(tier);
    }
    return this.fb.group({
      carModels: [value?.carModels ?? []],
      selectors: [value?.selectors ?? (value?.carModels ?? []).map(model => ({ model }))],
      carTypes: [value?.carTypes ?? []],
      applyStockDifferential: [value?.applyStockDifferential ?? false],
      tiers
    });
  }

  private normalizedTierValue(value: unknown): Record<string, unknown> {
    const data = structuredClone(value) as Record<string, unknown>;
    if (typeof data['rank'] === 'number') data['rank'] = EmployeeRole[data['rank']];
    return data;
  }

  private volumeTabFromModel(value: { carModels: string[]; selectors?: VolumeModelSelector[]; carTypes?: string[]; applyStockDifferential?: boolean; tiers: VolumeTier[] }): FormGroup {
    return this.volumeTabGroup({
      carModels: value.carModels,
      selectors: value.selectors,
      carTypes: value.carTypes ?? [],
      applyStockDifferential: value.applyStockDifferential ?? false,
      tiers: value.tiers
    });
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
      slab: [''],
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
      slab: [''],
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
      slab: [''],
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
      slab: [''],
      rank: ['CA'],
      carModels: [[]],
      numberOfCars: [0, [Validators.required, Validators.min(1)]],
      fixedIncentiveAmount: [0, [Validators.required, Validators.min(0)]],
      description: ['']
    });
  }
  createLocationTargetGroup(): FormGroup {
    return this.fb.group({
      slab: [''],
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
      slab: [''],
      category: ['Finance', Validators.required],
      rank: ['CA'],
      requiredAchievementPercent: [100, [Validators.required, Validators.min(0.01), Validators.max(100)]],
      bonusAmount: [0, [Validators.required, Validators.min(0)]],
      perCarValue: [false]
    });
  }
  getTiers(schemeIndex: number): FormArray {
    return (this.schemes.at(schemeIndex) as FormGroup).get('tiers') as FormArray;
  }

  getVolumeTabs(schemeIndex: number): FormGroup[] {
    const scheme = this.schemes.at(schemeIndex) as FormGroup;
    this.ensureVolumeTabs(scheme);
    return (scheme.get('volumeTabs') as FormArray).controls as FormGroup[];
  }

  getActiveVolumeTabIndex(schemeIndex: number): number {
    const scheme = this.schemes.at(schemeIndex) as FormGroup;
    this.ensureVolumeTabs(scheme);
    const count = (scheme.get('volumeTabs') as FormArray).length;
    return Math.max(0, Math.min(this.activeVolumeTab.get(scheme) ?? 0, count - 1));
  }

  activateVolumeTab(schemeIndex: number, tabIndex: number): void {
    const scheme = this.schemes.at(schemeIndex) as FormGroup;
    const tabs = scheme.get('volumeTabs') as FormArray;
    if (tabIndex < 0 || tabIndex >= tabs.length) return;
    this.saveLegacyToActiveVolumeTab(scheme);
    this.activeVolumeTab.set(scheme, tabIndex);
    this.loadActiveVolumeTab(scheme);
  }

  createVolumeModelTab(schemeIndex: number, model: string): void {
    const selectedModel = model.trim();
    if (!selectedModel) return;
    const scheme = this.schemes.at(schemeIndex) as FormGroup;
    this.ensureVolumeTabs(scheme);
    const tabs = scheme.get('volumeTabs') as FormArray;
    const existing = tabs.controls.findIndex(tab =>
      ((tab.get('carModels')?.value as string[]) ?? []).includes(selectedModel));
    if (existing >= 0) {
      this.activateVolumeTab(schemeIndex, existing);
      return;
    }
    this.saveLegacyToActiveVolumeTab(scheme);
    const source = this.getActiveVolumeTab(scheme);
    if (!source) return;
    const currentModels = (source.get('carModels')?.value as string[]) ?? [];
    if (tabs.length === 1 && currentModels.length === 0) {
      source.get('carModels')?.setValue([selectedModel]);
      this.loadActiveVolumeTab(scheme);
      this.form.markAsDirty();
      return;
    }
    const copy = structuredClone(source.getRawValue()) as VolumeModelTabFormValue;
    copy.carModels = [selectedModel];
    tabs.push(this.volumeTabGroup(copy));
    this.activeVolumeTab.set(scheme, tabs.length - 1);
    this.loadActiveVolumeTab(scheme);
    this.form.markAsDirty();
  }

  addModelToActiveVolumeTab(schemeIndex: number, model: string): void {
    const selectedModel = model.trim();
    if (!selectedModel) return;
    const tabs = this.getVolumeTabs(schemeIndex);
    const owner = tabs.findIndex(tab => ((tab.get('carModels')?.value as string[]) ?? []).includes(selectedModel));
    if (owner >= 0) {
      this.activateVolumeTab(schemeIndex, owner);
      return;
    }
    const scheme = this.schemes.at(schemeIndex) as FormGroup;
    const active = this.getActiveVolumeTab(scheme);
    if (!active) return;
    const models = (active.get('carModels')?.value as string[]) ?? [];
    active.get('carModels')?.setValue([...models, selectedModel]);
    this.loadActiveVolumeTab(scheme);
  }

  removeModelFromVolumeTab(schemeIndex: number, tabIndex: number, model: string): void {
    const tab = this.getVolumeTabs(schemeIndex)[tabIndex];
    if (!tab) return;
    const models = ((tab.get('carModels')?.value as string[]) ?? []).filter(value => value !== model);
    tab.get('carModels')?.setValue(models);
    if (tabIndex === this.getActiveVolumeTabIndex(schemeIndex)) this.loadActiveVolumeTab(this.schemes.at(schemeIndex) as FormGroup);
  }

  getUnassignedVolumeModels(schemeIndex: number): string[] {
    const assigned = new Set(this.getVolumeTabs(schemeIndex)
      .flatMap(tab => (tab.get('carModels')?.value as string[]) ?? []));
    return this.carModels.filter(model => !assigned.has(model));
  }

  private ensureVolumeTabs(scheme: FormGroup): void {
    const tabs = scheme.get('volumeTabs') as FormArray;
    if (tabs.length) return;
    tabs.push(this.volumeTabGroup({
      carModels: (scheme.get('carModels')?.value as string[]) ?? [],
      carTypes: (scheme.get('carTypes')?.value as string[]) ?? [],
      applyStockDifferential: scheme.get('applyStockDifferential')?.value ?? false,
      tiers: (scheme.get('tiers') as FormArray).getRawValue()
    }));
    this.activeVolumeTab.set(scheme, 0);
  }

  private getActiveVolumeTab(scheme: FormGroup): FormGroup | undefined {
    this.ensureVolumeTabs(scheme);
    const tabs = scheme.get('volumeTabs') as FormArray;
    return tabs.at(Math.min(this.activeVolumeTab.get(scheme) ?? 0, tabs.length - 1)) as FormGroup | undefined;
  }

  private saveLegacyToActiveVolumeTab(scheme: FormGroup): void {
    const active = this.getActiveVolumeTab(scheme);
    if (!active) return;
    active.patchValue({
      carModels: scheme.get('carModels')?.value ?? [],
      carTypes: scheme.get('carTypes')?.value ?? [],
      applyStockDifferential: scheme.get('applyStockDifferential')?.value ?? false
    }, { emitEvent: false });
    const tabTiers = active.get('tiers') as FormArray;
    tabTiers.clear({ emitEvent: false });
    for (const value of (scheme.get('tiers') as FormArray).getRawValue()) {
      const tier = this.createTierGroup();
      tier.patchValue(value, { emitEvent: false });
      tabTiers.push(tier, { emitEvent: false });
    }
  }

  private loadActiveVolumeTab(scheme: FormGroup): void {
    const active = this.getActiveVolumeTab(scheme);
    if (!active) return;
    scheme.patchValue({
      carModels: active.get('carModels')?.value ?? [],
      carTypes: active.get('carTypes')?.value ?? [],
      applyStockDifferential: active.get('applyStockDifferential')?.value ?? false
    }, { emitEvent: false });
    const tiers = scheme.get('tiers') as FormArray;
    tiers.clear({ emitEvent: false });
    for (const value of (active.get('tiers') as FormArray).getRawValue()) {
      const tier = this.createTierGroup();
      tier.patchValue(value, { emitEvent: false });
      tiers.push(tier, { emitEvent: false });
    }
  }

  addTier(schemeIndex: number): void {
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

  duplicateLastTier(schemeIndex: number): void {
    const tiers = this.getTiers(schemeIndex);
    const lastTier = tiers.at(-1);
    const duplicate = this.createTierGroup();
    if (lastTier) duplicate.patchValue(structuredClone(lastTier.getRawValue()));
    tiers.push(duplicate);
  }

  addModelBonusTier(schemeIndex: number): void {
    this.getModelBonusTiers(schemeIndex).push(this.createModelBonusTierGroup());
  }

  removeModelBonusTier(schemeIndex: number, tierIndex: number): void {
    if (globalThis.confirm('Are you sure you want to remove this tier?')) {
      this.getModelBonusTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  addStockReductionTier(schemeIndex: number): void {
    this.getStockReductionTiers(schemeIndex).push(this.createStockReductionTierGroup());
  }

  removeStockReductionTier(schemeIndex: number, tierIndex: number): void {
    if (globalThis.confirm('Are you sure you want to remove this tier?')) {
      this.getStockReductionTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  addAccessoryTier(schemeIndex: number): void {
    this.getAccessoryTiers(schemeIndex).push(this.createAccessoryTierGroup());
  }

  removeAccessoryTier(schemeIndex: number, tierIndex: number): void {
    if (globalThis.confirm('Are you sure you want to remove this tier?')) {
      this.getAccessoryTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  addGMTargetTier(schemeIndex: number): void {
    this.getGMTargetTiers(schemeIndex).push(this.createGMTargetTierGroup());
  }

  removeGMTargetTier(schemeIndex: number, tierIndex: number): void {
    if (globalThis.confirm('Are you sure you want to remove this tier?')) {
      this.getGMTargetTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  addLocationTarget(schemeIndex: number): void {
    this.getLocationTargets(schemeIndex).push(this.createLocationTargetGroup());
  }

  removeLocationTarget(schemeIndex: number, targetIndex: number): void {
    if (globalThis.confirm('Are you sure you want to remove this location target?')) {
      this.getLocationTargets(schemeIndex).removeAt(targetIndex);
    }
  }

  addTargetAchievementTier(schemeIndex: number): void {
    this.getTargetAchievementTiers(schemeIndex).push(this.createTargetAchievementTierGroup());
  }

  removeTargetAchievementTier(schemeIndex: number, tierIndex: number): void {
    if (globalThis.confirm('Are you sure you want to remove this target achievement tier?')) {
      this.getTargetAchievementTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  removeTier(schemeIndex: number, tierIndex: number): void {
    if (globalThis.confirm('Are you sure you want to remove this tier?')) {
      this.getTiers(schemeIndex).removeAt(tierIndex);
    }
  }

  removeSubScheme(index: number): void {
    if (!globalThis.confirm('Are you sure you want to remove this sub-scheme?')) return;
    this.expandedSubSchemes.delete(this.schemes.at(index));
    this.schemes.removeAt(index);
  }

  cloneSubScheme(index: number): void {
    const subScheme = this.schemes.at(index) as FormGroup;
    const cloned = this.createSubSchemeGroup();
    const value = structuredClone(subScheme.getRawValue()) as SubSchemeFormValue;
    value.id = '';
    value.name = `${value.name} (copy)`;
    cloned.patchValue(value);
    this.restoreArrays(cloned, { ...value });
    (value.volumeTabs ?? []).forEach(tab => (cloned.get('volumeTabs') as FormArray).push(this.volumeTabGroup(tab)));
    const drafts = this.configDrafts.get(subScheme);
    this.configDrafts.set(cloned, structuredClone(drafts ?? { type: value.type, values: {} }));
    this.schemes.push(cloned);
    this.expandedSubSchemes.add(cloned);
    this.form.markAsDirty();
  }

  isSubSchemeExpanded(subScheme: AbstractControl): boolean {
    return this.expandedSubSchemes.has(subScheme);
  }

  toggleSubScheme(subScheme: AbstractControl): void {
    if (this.isSubSchemeExpanded(subScheme)) this.expandedSubSchemes.delete(subScheme);
    else this.expandedSubSchemes.add(subScheme);
  }

  expandSubScheme(subScheme: AbstractControl): void {
    const group = subScheme as FormGroup;
    this.expandedSubSchemes.add(group);
    const type = group.get('type')?.value as SchemeType;
    const arrayName = this.activeTierArrayName(type);
    if (arrayName && (group.get(arrayName) as FormArray).length === 0) {
      this.onTypeChange(this.schemes.controls.indexOf(group));
    }
  }

  addModelBonusCarModel(schemeIndex: number, tierIndex: number, model: string): void {
    if (!model?.trim()) return;
    const tier = this.getModelBonusTiers(schemeIndex).at(tierIndex);
    const current = (tier.get('carModels')?.value as string[]) ?? [];
    if (!current.includes(model.trim())) tier.get('carModels')?.setValue([...current, model.trim()]);
  }

  removeModelBonusCarModel(schemeIndex: number, tierIndex: number, model: string): void {
    const tier = this.getModelBonusTiers(schemeIndex).at(tierIndex);
    const current = (tier.get('carModels')?.value as string[]) ?? [];
    tier.get('carModels')?.setValue(current.filter(value => value !== model));
  }

  onAccessoryIncentiveChange(tier: AbstractControl, field: 'incentiveAmount' | 'incentivePercent'): void {
    const value = tier.get(field)?.value;
    if (value === null || value === undefined || value === '') return;
    const other = field === 'incentiveAmount' ? 'incentivePercent' : 'incentiveAmount';
    tier.get(other)?.setValue(null);
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

  hasDuplicateTierRange(schemeIndex: number): boolean {
    const seen = new Set<string>();
    for (const tier of this.getTiers(schemeIndex).controls) {
      const key = `${tier.get('rank')?.value ?? ''}|${tier.get('minVolume')?.value}|${tier.get('maxVolume')?.value}`;
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }

  hasOverlappingTierRange(schemeIndex: number): boolean {
    const grouped = new Map<string, { min: number; max: number }[]>();
    for (const tier of this.getTiers(schemeIndex).controls) {
      const rank = String(tier.get('rank')?.value ?? '');
      const range = { min: Number(tier.get('minVolume')?.value), max: Number(tier.get('maxVolume')?.value) };
      const ranges = grouped.get(rank) ?? [];
      if (ranges.some(item => range.min <= item.max && item.min <= range.max)) return true;
      grouped.set(rank, [...ranges, range]);
    }
    return false;
  }

  hasInvalidMinMaxVolume(schemeIndex: number): boolean {
    return this.getTiers(schemeIndex).controls.some(tier =>
      Number(tier.get('minVolume')?.value) > Number(tier.get('maxVolume')?.value));
  }

  /** Builds a detached, canonical draft containing all visible functional template details. */
  public buildScheme(): IncentiveScheme {
    const raw = structuredClone(this.form.getRawValue()) as SchemeFormValue;
    raw.schemes.forEach((sub, index) => {
      if (sub.type !== SchemeType.VOLUME_BASED) return;
      const activeIndex = this.getActiveVolumeTabIndex(index);
      if (sub.volumeTabs[activeIndex]) {
        sub.volumeTabs[activeIndex] = {
          carModels: [...sub.carModels],
          selectors: structuredClone(sub.volumeTabs[activeIndex].selectors ?? []),
          carTypes: [...sub.carTypes],
          applyStockDifferential: sub.applyStockDifferential,
          tiers: structuredClone(sub.tiers)
        };
      }
    });
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
              applyStockDifferential: s.applyStockDifferential,
              modelTabs: s.volumeTabs.map(tab => ({
                carModels: [...tab.carModels],
                selectors: structuredClone(tab.selectors),
                carTypes: [...tab.carTypes],
                applyStockDifferential: tab.applyStockDifferential,
                tiers: this.cleanRanks(tab.tiers).map(tier => {
                  if (tier.incentiveAmountNonStock == null) delete tier.incentiveAmountNonStock;
                  return tier;
                })
              }))
            };
            if (s.volumeTabs.length < 2) delete sub.volumeConfig.modelTabs;
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
      if ('slab' in copy && (copy as { slab?: string }).slab === '') {
        delete (copy as { slab?: string }).slab;
      }
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
      if (this.hasSavedScheme || this.schemes.length > 0) throw new Error('Excel import is available only for an unsaved month.');
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

  private confirmDraftReplacement(force = false): boolean {
    return (!force && !this.form.dirty) || globalThis.confirm('Replace this unsaved draft? Unsaved changes will be lost.');
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  newScheme() {
    if (this.busy() || !this.confirmDraftReplacement()) return;
    this.initForm();
    this.selectPreviousWorkingMonth();
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
    this.addModelToActiveVolumeTab(index, model);
  }

  removeCarModel(schemeIndex: number, model: string): void {
    const currentModels = this.schemes.at(schemeIndex).get('carModels')?.value || [];
    this.schemes.at(schemeIndex).get('carModels')?.setValue(
      currentModels.filter((value: string) => value !== model));
  }

  addCarType(index: number, type: string): void {
    if (!type) return;
    const currentTypes = this.schemes.at(index).get('carTypes')?.value || [];
    if (!currentTypes.includes(type)) {
      this.schemes.at(index).get('carTypes')?.setValue([...currentTypes, type]);
    }
  }

  removeCarType(schemeIndex: number, type: string): void {
    const currentTypes = this.schemes.at(schemeIndex).get('carTypes')?.value || [];
    this.schemes.at(schemeIndex).get('carTypes')?.setValue(
      currentTypes.filter((value: string) => value !== type));
  }

  getAvailableCarTypes(index: number): string[] {
    const selected = this.schemes.at(index).get('carTypes')?.value || [];
    return this.carTypes.filter(type => !selected.includes(type));
  }

  getRankClass(rank: unknown): string {
    const value = typeof rank === 'string' || typeof rank === 'number' ? String(rank) : '';
    return this.rankClasses[value] ?? 'rank-unassigned';
  }

  addGMTargetCarModel(schemeIndex: number, tierIndex: number, model: string): void {
    if (!model?.trim()) return;
    const tier = this.getGMTargetTiers(schemeIndex).at(tierIndex);
    const carModels = tier.get('carModels')?.value as string[];
    if (!carModels.includes(model.trim())) {
      tier.get('carModels')?.setValue([...carModels, model.trim()]);
    }
  }

  removeGMTargetCarModel(schemeIndex: number, tierIndex: number, model: string): void {
    const tier = this.getGMTargetTiers(schemeIndex).at(tierIndex);
    const carModels = tier.get('carModels')?.value as string[];
    tier.get('carModels')?.setValue(carModels.filter((m: string) => m !== model));
  }

  getGMTargetTiers(schemeIndex: number): FormArray {
    return (this.schemes.at(schemeIndex) as FormGroup).get('gmTargetTiers') as FormArray;
  }

  getModelBonusTiers(schemeIndex: number): FormArray {
    return (this.schemes.at(schemeIndex) as FormGroup).get('modelBonusTiers') as FormArray;
  }

  getStockReductionTiers(schemeIndex: number): FormArray {
    return (this.schemes.at(schemeIndex) as FormGroup).get('stockReductionTiers') as FormArray;
  }

  getAccessoryTiers(schemeIndex: number): FormArray {
    return (this.schemes.at(schemeIndex) as FormGroup).get('accessoryTiers') as FormArray;
  }

  getLocationTargets(schemeIndex: number): FormArray {
    return (this.schemes.at(schemeIndex) as FormGroup).get('locationTargets') as FormArray;
  }

  getTargetAchievementTiers(schemeIndex: number): FormArray {
    return (this.schemes.at(schemeIndex) as FormGroup).get('targetAchievementTiers') as FormArray;
  }

  productLabel(productId: string): string {
    const product = this.products.find(item => item.id === productId);
    return product ? this.describeProduct(product) : productId;
  }

  productDescription(product: Product): string {
    return this.describeProduct(product);
  }

  private describeProduct(product: Product): string {
    return this.formatModelSelector({
      model: product.model,
      variant: product.variant,
      fuelType: this.carTypeLabel(product.type),
      engine: product.engine,
      transmission: product.transmission
    });
  }

  selectorLabel(selector: VolumeModelSelector): string {
    if (selector.productId) return this.productLabel(selector.productId);
    return this.formatModelSelector(selector);
  }

  private formatModelSelector(selector: VolumeModelSelector): string {
    const model = selector.model?.trim() ?? '';
    const variant = this.cleanVariantLabel(model, selector.variant);
    const fuelType = this.fuelAbbreviation(selector.fuelType);
    return [model, variant, fuelType, selector.engine, selector.transmission]
      .filter(Boolean).join(' ') || 'All Models';
  }

  private cleanVariantLabel(model: string, variant?: string): string {
    const value = variant?.trim() ?? '';
    if (!model || !value) return value;
    if (!value.toLowerCase().startsWith(model.toLowerCase())) return value;
    const remainder = value.slice(model.length).replace(/^[\s-–—]+/, '').trim();
    return remainder || value;
  }

  private fuelAbbreviation(fuelType?: string): string {
    switch (fuelType?.trim().toLowerCase()) {
      case 'petrol': return 'P';
      case 'diesel': return 'D';
      case 'hybrid': return 'H';
      case 'electric':
      case 'ev': return 'EV';
      case 'cng': return 'CNG';
      default: return fuelType?.trim() ?? '';
    }
  }

  private carTypeLabel(type: ProductType): string {
    const name = ProductType[type];
    return name === 'CNG' ? name : name.charAt(0) + name.slice(1).toLowerCase();
  }

  getAvailableVolumeProducts(schemeIndex: number): Product[] {
    const selectedIds = new Set(this.getVolumeTabs(schemeIndex)
      .flatMap(tab => ((tab.get('selectors')?.value as VolumeModelSelector[]) ?? []))
      .map(selector => selector.productId)
      .filter((id): id is string => Boolean(id)));
    return this.products.filter(product => !selectedIds.has(product.id))
      .sort((a, b) => this.describeProduct(a).localeCompare(this.describeProduct(b)));
  }

  addProductToActiveVolumeTab(schemeIndex: number, productId: string): void {
    if (!productId) return;
    const product = this.products.find(item => item.id === productId);
    if (!product) return;
    const owner = this.getVolumeTabs(schemeIndex).findIndex(tab =>
      ((tab.get('selectors')?.value as VolumeModelSelector[]) ?? []).some(selector => selector.productId === productId));
    if (owner >= 0) {
      this.activateVolumeTab(schemeIndex, owner);
      return;
    }
    const scheme = this.schemes.at(schemeIndex) as FormGroup;
    const active = this.getActiveVolumeTab(scheme);
    if (!active) return;
    const selectors = (active.get('selectors')?.value as VolumeModelSelector[]) ?? [];
    active.get('selectors')?.setValue([...selectors, {
      productId: product.id,
      model: product.model,
      variant: product.variant,
      fuelType: this.carTypeLabel(product.type),
      engine: product.engine,
      transmission: product.transmission
    }]);
    active.get('carModels')?.setValue([...new Set([...((active.get('carModels')?.value as string[]) ?? []), product.model])]);
    this.loadActiveVolumeTab(scheme);
  }

  createProductVolumeTab(schemeIndex: number, productId: string): void {
    if (!productId) return;
    const owner = this.getVolumeTabs(schemeIndex).findIndex(tab =>
      ((tab.get('selectors')?.value as VolumeModelSelector[]) ?? []).some(selector => selector.productId === productId));
    if (owner >= 0) {
      this.activateVolumeTab(schemeIndex, owner);
      return;
    }
    this.createVolumeModelTab(schemeIndex, this.products.find(product => product.id === productId)?.model ?? '');
    const active = this.getActiveVolumeTab(this.schemes.at(schemeIndex) as FormGroup)!;
    active.get('selectors')?.setValue([]);
    active.get('carModels')?.setValue([]);
    this.addProductToActiveVolumeTab(schemeIndex, productId);
  }

  removeSelectorFromVolumeTab(schemeIndex: number, tabIndex: number, selectorIndex: number): void {
    const tab = this.getVolumeTabs(schemeIndex)[tabIndex];
    if (!tab) return;
    const selectors = [...((tab.get('selectors')?.value as VolumeModelSelector[]) ?? [])];
    selectors.splice(selectorIndex, 1);
    tab.get('selectors')?.setValue(selectors);
    tab.get('carModels')?.setValue([...new Set(selectors.map(selector => selector.model).filter(Boolean))] as string[]);
    if (tabIndex === this.getActiveVolumeTabIndex(schemeIndex)) this.loadActiveVolumeTab(this.schemes.at(schemeIndex) as FormGroup);
  }

  getVolumeTabLabel(schemeIndex: number, tabIndex: number): string {
    const tab = this.getVolumeTabs(schemeIndex)[tabIndex];
    const selectors = (tab?.get('selectors')?.value as VolumeModelSelector[]) ?? [];
    if (selectors.length) {
      if (selectors.every(selector => !selector.model)) return 'All Models';
      return selectors.map(selector => this.selectorLabelForTab(selector)).join(' + ');
    }
    const models = (tab?.get('carModels')?.value as string[]) ?? [];
    return models.length ? models.join(' + ') : 'All Models';
  }

  private selectorLabelForTab(selector: VolumeModelSelector): string {
    return this.formatModelSelector(selector);
  }

  getVariantsForModel(model: string): string[] {
    return this.productMetadataValues(model, 'variant');
  }

  getEnginesForModel(model: string): string[] {
    return this.productMetadataValues(model, 'engine');
  }

  getTransmissionsForModel(model: string): string[] {
    return this.productMetadataValues(model, 'transmission');
  }

  private productMetadataValues(model: string, field: 'variant' | 'engine' | 'transmission'): string[] {
    return [...new Set(this.products
      .filter(product => !model || product.model === model)
      .map(product => product[field])
      .filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  addSelectorToActiveVolumeTab(
    schemeIndex: number,
    model: string,
    variant = '',
    fuelType = '',
    engine = '',
    transmission = ''
  ): void {
    const selector: VolumeModelSelector = {
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
      ...(fuelType ? { fuelType } : {}),
      ...(engine ? { engine } : {}),
      ...(transmission ? { transmission } : {})
    };
    const key = JSON.stringify(selector);
    const scheme = this.schemes.at(schemeIndex) as FormGroup;
    const tabs = this.getVolumeTabs(schemeIndex);
    const owner = tabs.findIndex(tab =>
      ((tab.get('selectors')?.value as VolumeModelSelector[]) ?? [])
        .some(item => JSON.stringify(item) === key));
    if (owner >= 0) {
      this.activateVolumeTab(schemeIndex, owner);
      this.toastService.show('This model variant is already assigned to a tab.', 'info');
      return;
    }
    const active = this.getActiveVolumeTab(scheme);
    if (!active) return;
    const selectors = (active.get('selectors')?.value as VolumeModelSelector[]) ?? [];
    active.get('selectors')?.setValue([...selectors, selector]);
    if (model) active.get('carModels')?.setValue([
      ...new Set([...((active.get('carModels')?.value as string[]) ?? []), model])
    ]);
    this.loadActiveVolumeTab(scheme);
    this.form.markAsDirty();
  }

  copySelectorToNewVolumeTab(
    schemeIndex: number,
    model: string,
    variant = '',
    fuelType = '',
    engine = '',
    transmission = ''
  ): void {
    const selector: VolumeModelSelector = {
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
      ...(fuelType ? { fuelType } : {}),
      ...(engine ? { engine } : {}),
      ...(transmission ? { transmission } : {})
    };
    const key = JSON.stringify(selector);
    const owner = this.getVolumeTabs(schemeIndex).findIndex(tab =>
      ((tab.get('selectors')?.value as VolumeModelSelector[]) ?? [])
        .some(item => JSON.stringify(item) === key));
    if (owner >= 0) {
      this.activateVolumeTab(schemeIndex, owner);
      this.toastService.show('A tab with this model variant already exists.', 'info');
      return;
    }
    const scheme = this.schemes.at(schemeIndex) as FormGroup;
    this.ensureVolumeTabs(scheme);
    const tabs = scheme.get('volumeTabs') as FormArray;
    this.saveLegacyToActiveVolumeTab(scheme);
    const source = this.getActiveVolumeTab(scheme);
    if (!source) return;
    const copy = structuredClone(source.getRawValue()) as VolumeModelTabFormValue;
    copy.selectors = [{
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
      ...(fuelType ? { fuelType } : {}),
      ...(engine ? { engine } : {}),
      ...(transmission ? { transmission } : {})
    }];
    copy.carModels = model ? [model] : [];
    tabs.push(this.volumeTabGroup(copy));
    this.activeVolumeTab.set(scheme, tabs.length - 1);
    this.loadActiveVolumeTab(scheme);
    this.form.markAsDirty();
  }

  removeVolumeTab(schemeIndex: number, tabIndex: number): void {
    const scheme = this.schemes.at(schemeIndex) as FormGroup;
    const tabs = scheme.get('volumeTabs') as FormArray;
    if (tabs.length <= 1 || tabIndex < 0 || tabIndex >= tabs.length) return;
    const label = this.getVolumeTabLabel(schemeIndex, tabIndex);
    if (!globalThis.confirm(`Delete the ${label} tab? Its filters and tiers will be removed.`)) return;

    const activeIndex = this.getActiveVolumeTabIndex(schemeIndex);
    if (activeIndex === tabIndex) this.saveLegacyToActiveVolumeTab(scheme);
    tabs.removeAt(tabIndex);
    const nextIndex = activeIndex > tabIndex
      ? activeIndex - 1
      : Math.min(activeIndex, tabs.length - 1);
    this.activeVolumeTab.set(scheme, nextIndex);
    this.loadActiveVolumeTab(scheme);
    this.form.markAsDirty();
    this.toastService.show(`${label} tab deleted.`, 'success');
  }

  canRemoveVolumeTab(schemeIndex: number): boolean {
    return this.getVolumeTabs(schemeIndex).length > 1;
  }
}