# DEMO ONLY scheme spreadsheet

**Placeholder policy, not an approved compensation policy.** All names, rates,
thresholds and examples are demonstration data. No real approval, payroll
authorization, entitlement or production readiness is implied. Obtain a reviewed,
approved policy before using real employee or sales data.

## Copying workflow

1. Copy [dummy-scheme.csv](dummy-scheme.csv), available from
   `/samples/dummy-scheme.csv` when the app is served. Keep the original unchanged.
2. Open the copy in Excel or another spreadsheet editor. Keep month cells as text
   in `YYYY-MM` format. This sample is November 2026 and Pune only.
3. Keep the `DEMO ONLY` labels while experimenting. Repeat the shared metadata on
  **every row**. Each sub-scheme needs a
   unique name within the workbook. Use one workbook per scheme/month.
4. On Incentive Scheme, choose **Import spreadsheet** and select
  [dummy-scheme.xlsx](dummy-scheme.xlsx) or the CSV. The first worksheet is read.
  Validation is all-or-nothing and reports worksheet row numbers (header = row 1).
5. Review the UNSAVED draft, then click **Save Scheme**. Save success is shown only
  after the local database write completes. An existing month requires replacement
  confirmation. Export Excel produces an editable round-trip reference.
6. To reuse a saved scheme, load it, choose a different **Copy to month** value,
  and click **Copy as unsaved draft**. Review and Save; the source is unchanged.

## Try the complete dummy input set

Use a test database/profile: existing monthly data is not cleared automatically.
The example assumes only the four demo sales and one demo accessory row for the
employee/month. Reimporting sales or accessories appends rows, so import once.

1. Import and save the November 2026 demo scheme as above.
2. Verify employee **AMOL GHUTE** (ID `AMOLGHU`, CA) exists; the default employee
  master includes this person and TL AMOL JATHAR. The dummy transaction location
  is Pune; leave location filters clear (the default master location is Bhosari).
3. In **Sales Entry**, set Working Month to **2026-11**, cancel any empty new row,
  then import [dummy-sales.xlsx](dummy-sales.xlsx).
4. In **Accessory Entry**, select **2026-11**, cancel an empty new row, then import
  [dummy-accessories.xlsx](dummy-accessories.xlsx). Principal Amount is 30,000.
5. Return to Sales Entry, select **2026-11**, select **AMOL GHUTE** in Incentive
  calculation, and click **Calculate saved data**. Expand the result: **9,700**.
  Calculations use persisted entries, not unsaved form edits.
6. Refresh to verify persistence; copy/export/reimport the scheme to verify reuse.

Source CSVs are included next to the Excel workbooks for review. Sales import now
preserves Stock Date instead of replacing it with Invoice Date; rows outside the
selected working month are skipped. The files are dummy inputs, not auto-loaded
production data or an instruction to delete existing records.

## Flat columns

Headers ignore case, repeated whitespace and nonbreaking spaces. Lists use `|`
(for example `Pune|Mumbai` or `Swift|Baleno`). A blank optional list means no filter;
the explicit marker `[]` preserves an empty array on export. Lists containing
literal pipes/brackets or outer whitespace are exported as JSON arrays instead;
both representations are accepted. Empty, whitespace-only and quoted tier descriptions
are escaped as JSON strings to preserve them exactly. Numeric cells must be finite nonnegative numbers (no currency symbols,
thousands separators or percent signs). Required numeric cells cannot be blank.
Counts such as number of cars, stock sale targets and location target units must
be positive. All percentage fields are limited to 0–100.
Use the existing import helper's `cellDates: true` when reading CSV with SheetJS:
it can infer `2026-11` as a first-of-month Date, which this helper also accepts.
Unlabelled numeric Excel serials are not accepted as months.

| Columns | Meaning |
| --- | --- |
| scheme name, month, locations | Identical scheme metadata on every row; month is a real `YYYY-MM`, locations is a pipe list. Blank locations means all locations. |
| sub scheme, type, priority | Shared sub-scheme settings; repeat identically. Lower nonnegative priority executes first. |
| tier description | Optional tier description. |
| rank | Optional tier role. Blank means all; names such as `CA`, `TL`, `SM`, `SRSM`, `AGM`, `GM`, `All`, `NONE`, their numeric enum values (0–7), and full employee designation labels are accepted. |
| min volume, max volume, incentive amount, non stock amount | Volume inclusive bounds and per-sale payout. Non-stock amount is optional. Inclusive overlapping ranges for the same rank, or any intersecting `All` range, are rejected. |
| car models, car types, stock differential | Volume-level pipe filters and optional boolean differential flag. Car types are `Electric` or `ICE`. Model Bonus and GM Target tiers can also use car models. |
| car model, car type | Optional singular volume filters, preserved independently from the plural filters. |
| number of cars, fixed amount | Model bonus threshold and fixed once-per-achievement payout. |
| amount, incentive amount, incentive percent | Accessory principal threshold and either a fixed payout or a rate applied to the entire eligible principal. Exactly one incentive field is required. |
| min stock days, max stock days, sale target, incentive amount | Stock inclusive age bounds, positive unit target and fixed payout. Overlapping age ranges matching the same rank (including `All`) are rejected. |
| number of cars, additional discount percent | GM achievement threshold and discount allowance, not a cash incentive. |
| config json | Advanced configuration for Target Achievement, Location Based and Discount Based, described below. |

All eight type values are supported: `Volume Based`, `Model Bonus`, `Accessories`,
`Stock Reduction`, `GM Target`, `Target Achievement`, `Location Based`,
`Discount Based`. Type spelling ignores case/whitespace on import. Invalid types,
ranks, numeric values, reversed ranges, inconsistent metadata/settings and empty
tier arrays fail validation. Tier ranks, tier descriptions, target `applyToRanks`
are preserved. Unknown legacy columns are ignored
on import and are not exported. IDs are intentionally not transported;
this format transports policy configuration, not database identity, audit dates,
custom date windows or legacy duplicate form fields. Keep custom date windows in
the owning application rather than assuming this month-based file preserves them.

### Advanced config JSON

JSON uses the model's exact camelCase keys, numeric JSON numbers and boolean JSON
booleans. Put one tier/target per row; the helper combines rows of the same
sub-scheme. Export splits advanced tier arrays into individual rows, retaining
the config-level settings on each row. Target Achievement has just one row.
CSV editors quote JSON automatically; hand-written CSV must double internal
quotes and enclose the entire JSON cell in quotes.

- **Target Achievement:**
  `{"requiredAchievementPercent":100,"bonusAmount":500,"bonusPercent":2,"applyToRanks":[1]}`.
  `bonusPercent` and `applyToRanks` are optional; the remaining fields are required.
- **Location Based:**
  `{"locationTargets":[{"location":"Pune","targetUnits":5,"targetValue":2000000,"bonusAmount":800,"description":"Demo target"}]}`.
  `targetValue` and target description are optional.
- **Discount Based:**
  `{"applyTo":"deduct","tiers":[{"minDiscountPercent":0,"maxDiscountPercent":5,"incentiveAmount":100,"incentivePercent":2,"isDeduction":true,"description":"Demo adjustment"}]}`.
  `applyTo` is optional (`add` or `deduct`); each tier needs at least one of
  `incentiveAmount`/`incentivePercent`. `isDeduction` and description are optional.

## Reproducible example: 9,700, GM cash 0

Use the **new** incentive calculation service and one CA in Pune for November
2026. Attribute all four Swift sales and accessory entries to that same CA.
Each sale has one unit; the supplied invoices run from November 5 through 8:

| Sales | Stock date | Age at invoice |
| --- | --- | --- |
| Swift 1 and 2 | `2026-08-01` | 96–97 days, eligible for the 61–9999 day stock tier |
| Swift 3 and 4 | `2026-11-01` | 6–7 days, not eligible for that stock tier |

Use accessory principal totaling **30,000**, for example separate accessory
entries of 10,000 and 20,000, in Pune in the same month. Supply correct dates,
month and employee attribution on all entries.

- Volume: the demo's volume tiers are CA-only via their `rank`. 4 units selects
  the 4–999 tier, then **4 × 1,500 = 6,000** (per sale,
  not cumulative slabs).
- Model: at least 2 Swift sales gives **2,000 once**, not 2,000 per pair.
- Stock: 2 aged sales achieves the target, giving **800 once**, not per aged car.
- Accessories: 30,000 selects the 25,000 threshold; **30,000 × 3% = 900** on the
  entire principal, not cumulative rates.
- Total: **6,000 + 2,000 + 800 + 900 = 9,700**.
- GM: the 5-car/2% rule is an **allowance only**, always **0 cash**. Four sales
  do not achieve it; even when achieved it does not add money to the total.

### Calculation warnings and limitations

- Use valid stock dates/ages; do not mark the two aged cars non-stock. This demo
  leaves differential pricing unset, so the volume rate is the same for all sales.
- Separate accessory entries are authoritative, including an explicit zero;
  absent entries fall back to sale accessory values. Do not double-count them or
  assume missing principal is zero. Inspect missing-data warnings.
- Advanced target/location/discount calculations may require monetary values,
  target or discount context. Higher-manager attribution requires the employee
  hierarchy. A valid workbook alone does not provide these inputs or approval.
- The helper validates configuration only; it neither runs payroll nor persists
  imports. Review calculation warnings, attribution, rounding and approved policy
  before acting on results.