# Graph switching guide (Dashboard)

This guide is for future AI agents adding or refactoring **dashboard line charts** (or other charts with hover tooltips + a “headline value”).

It summarizes a real bug where switching metrics would randomly show **0 / $0** in the header while the line still showed data.

---

## Core lesson

When a chart supports **hover tooltips** and a **separate header value**, you must treat tooltip state as *optional* and *ephemeral*.

**Never convert “missing” into 0.** If you do, the UI will sometimes “lock on” to a fabricated 0 during fast rerenders (metric switching, filter changes, concurrent rendering), even when the chart data is correct.

---

## What happened (high-signal context from the buggy-dashboard docs)

- The dashboard renders **three** `DashboardChart` instances (one large + two small), so multiple observers/render paths exist simultaneously.
- The bug was **random/timing-dependent**: switching metrics eventually shows **0**.
- Early root-cause hypotheses focused on **React Query enabled-toggling / loading state gaps** (React Query v5 `isLoading` semantics).
- Those hypotheses were plausible, and several `isLoading` strategies were tried, including “always enable all queries”.
- The bug persisted because the actual failure mode was different:
  - the **header** could be driven by **tooltip state**
  - the tooltip pipeline was sometimes manufacturing `0` from `undefined`

---

## The real “0 while chart has data” root cause

The header value calculation in `DashboardChart` gives tooltip value precedence whenever it exists.
If the tooltip pipeline produces `{ value: 0 }` during a transient render, the header will display **0**, even though the current metric’s real `rawValues`/`chartData` are non-empty.

The critical anti-pattern is:

```ts
value: Number(item.value ?? 0)
```

That turns “no value yet” into “0”, which is indistinguishable from a legitimate datapoint value of 0.

---

## Rules to avoid this class of bug

- **Rule 1: Never coerce tooltip values**
  - Do **not** use `Number(x ?? 0)` for tooltip payloads.
  - Instead, only include a tooltip payload entry when the value is a real finite number.

- **Rule 2: Reset tooltip state on metric/filter changes**
  - Tooltip state must not “leak” across metric switches, date range changes, interval changes, or product filter changes.
  - Provide a `resetKey` that changes whenever the chart’s semantic meaning changes.

- **Rule 3: One source of truth**
  - Prefer header values derived from the same data backing the chart (`rawValues` / `chartData`).
  - If you allow tooltip override, ensure the override is only used when the tooltip value is *valid and current*.

- **Rule 4: Loading state is necessary but not sufficient**
  - React Query `isLoading` / `isPending` gaps can cause “empty data” windows.
  - Even if loading is perfect, tooltip-state bugs can still cause incorrect header values.

---

## Patterns to copy (Flowglad)

### Pattern A — “Only include tooltip payload items when value is valid”

In `src/components/charts/LineChart.tsx`, build a `PayloadItem[]` like:

- interpret numbers or numeric strings
- drop non-finite values (`NaN`, `Infinity`, `undefined`)
- never substitute `0`

This ensures “missing” stays missing.

### Pattern B — Reset tooltip state with a `resetKey`

In `src/hooks/useChartTooltip.ts`, accept an optional `resetKey?: string` and clear tooltip state when it changes.

Recommended `resetKey` inputs for dashboard charts:

- `selectedMetric`
- `interval`
- `fromDate.toISOString()`
- `toDate.toISOString()`
- `productId` (or other filters)

### Pattern C — Defensive tooltip override in the header

If the header uses tooltip override, only accept:

- `typeof tooltipValue === 'number'`
- `Number.isFinite(tooltipValue)`

Do not treat `0` as “missing”; treat it as a legitimate value *only* when it comes from a valid payload.

---

## Checklist when adding a new dashboard chart

- **Tooltip payload**
  - [ ] No `?? 0` coercion
  - [ ] Drop invalid payload items (missing/NaN)
  - [ ] Keep tooltip payload types consistent (`PayloadItem[]`)

- **Tooltip state**
  - [ ] Tooltip state is reset when the chart meaning changes (metric/filter/range)

- **Header value**
  - [ ] Derived from the same data as the chart by default
  - [ ] Tooltip override is guarded (finite number only)

- **Query/data loading**
  - [ ] Avoid relying on React Query `isLoading` alone when `enabled` toggles are involved
  - [ ] If you use `enabled`, ensure the UI doesn’t render “empty means 0” during transitions

---

## Debugging playbook (if this ever regresses)

- **Log in the tooltip pipeline**
  - Is tooltip payload containing `value: 0` while Recharts `item.value` was actually `undefined`?
  - Are we carrying tooltip state across metric switches?

- **Log in `DashboardChart`**
  - `selectedMetric`
  - `rawValues.length`
  - `displayValue` decision path (tooltip vs cumulative vs latest)

- **Log in `useMetricData`**
  - active query key + `data` presence + `isPending`/`isFetching`

---

## Relevant code locations

- `src/components/DashboardChart.tsx`: metric switcher + header value logic
- `src/hooks/useChartTooltip.ts`: tooltip state management + reset behavior
- `src/components/charts/LineChart.tsx`: Recharts tooltip payload shaping (do not coerce!)
- `src/hooks/useMetricData.ts`: query + loading state; be careful with `enabled` toggles

