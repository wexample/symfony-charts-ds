## What this package holds

Two components and their twig functions:

- `chart()`: a chart drawn by ECharts, in svg — sharp on paper and in an export — and coloured from the roles of the design system.
- `chart_sparkline()`: a line the size of a word, for a table row, drawn on the server as svg: a table of three thousand rows runs no script for it.

The data side — `ChartPoint`, its endpoint and providers — is `symfony-charts`.

## chart(type, data, options)

```twig
{{ chart('line', {
    categories: months,
    series: [
        { name: '@page::series.orders' | trans, values: orders },
        { name: '@page::series.returns' | trans, values: returns, color: 'mint' },
    ],
}, { smooth: true }) }}
```

The type decides the shape of `data` (`Enum/ChartType`):

| Type | Data |
|---|---|
| `line`, `area`, `bar` | `{ categories, series: [{ name, values, color? }] }` |
| `donut` | `{ categories, series: [{ name, values }] }`, the first series only |
| `capacity` | `{ categories, load, capacity }`: one horizontal bar per category, coloured by its ratio, the capacity a tick across it, `86 % · 412 / 480` written past it |
| `forecast` | `{ categories, actual, forecast, low?, high?, today? }`: the actual line, the forecast dashed inside its band, today a line across |
| `boxplot` | `{ categories, series: [{ name, values: [[samples], …] }] }`: the quartiles are computed from the raw samples |
| `histogram` | `{ samples, bins? }`, ten bins of equal width by default |
| `heatmap` | `{ x: [columns], y: [rows], values: [[x, y, value \| null], …] }`, two variables crossed, each cell coloured by its value on the system's colours — the accent, fainter for the least (`scale: 'sequential'`), or the error's to the success's (`'diverging'`), between `min` and `max` (the values' own by default; diverging from `center` — `0` between a loss and a gain —, as far on each side); a cell without a value greyed; its value written in it up to 64 cells, under the pointer past them. A cell pressed is told on the chart's element: `chart-cell`, `{ x, y, value }` |

Options:

- `source`: the name of a chart served as `ChartPoint` entities; read through the generated repository instead of `data`. The points are turned into the shape above: the categories by `position`, a series per key, and each series again under its own key — `load`, `actual` — for the types that read one by name. A heatmap crosses the two: the categories are its columns, each series a row.
- `scope`: with `source`, what the chart is about — a project, an account, by its id —, sent to the provider, which checks it.
- `poll`: with `source`, its points read again every so many seconds — a chart of what goes on now — through the loader's `PollingService` (not while the page is hidden, at once when seen again, further apart while the source fails), without a spinner over the points already drawn. Chosen by the page, never a fallback of live updates.
- `refresh`: with `source`, the events of the page after which its points are read again, in place — a run over, a form saved: `{ refresh: ['study:trials-changed'] }`.
- `format`: `{ style: decimal|percent|currency|unit, currency, unit, decimals }`, `Intl.NumberFormat` in the page's language. Axes write compact numbers (`25 k €`), tooltips whole ones.
- `stacked`, `horizontal` (bar), `smooth` (line, area).
- `legend`: shown when there is more than one series unless said.
- `thresholds`: `{ warning: 0.85, overload: 1.0 }` by default, the load ratios from which a capacity bar warns, then overloads.
- `height` (`--chart-height`, 18rem by default), `label` (the accessible name), `class`.
- `title`: the chart drawn in its card (`block block--card`), titled so — a chart among others on a page of stats; its accessible name too, unless `label` says another.
- `lazy`: true by default — the chart is initialised when it comes into view (`LazyActivationMixin` of `symfony-loader`). False for a chart at the top of a page.

The labels inside `data` come translated by the caller; the words the component writes itself — Actual, Forecast, Today, Capacity, the quartiles — are in `chart.trans.yml`.

## Colours

Read from the design system where the chart is drawn: the accent for the first series, then the categories of the palette (`--cat-<name>-9`) leaving out those too close to the accent; the muted text for axes, the discreet border for the grid, warning and error for capacity thresholds. A series picks a category by name with `color`. On `usage:change` — a colour scheme, a palette, a skin switched — the chart is drawn again in the new colours.

## chart_sparkline(values, options)

```twig
{{ chart_sparkline(item.orders, { active: [3, 5], label: 'Orders' }) }}
```

`active` is the window to highlight, as the first and last index; `width` and `height` the box, 96 × 24 by default. A null value is a gap. The geometry is `Helper/SparklineHelper::geometry()`, unit tested. In a `data_table`, the cell is `cell: 'html'`.

## Print

Svg, a chart is not cut between two pages, its tooltip is not printed.

## Taking a screenshot of a page of charts

Chrome's `--screenshot` mode never fires the `IntersectionObserver`: a lazy chart stays empty. Drive the page through the DevTools protocol and scroll it before capturing.

## A world map

`chart('map', { categories, series }, options)` colours the countries by the first series, from the ground of the page to the accent: the categories are ISO 3166-1 alpha-2 codes, named in the page's language under the pointer. The shapes are Natural Earth's (public domain, `assets/components/chart/map/world.json`), loaded in a chunk of their own by the first map of a page.

## Following the period-nav

`period: true`, with a `source`, sends the period the design system's period-nav announces (`period-change`) as `from` and `to`, and reads the points again at each change. The chart asks the period-nav for its period once listening (`period-request`), whichever of the two is ready first.
