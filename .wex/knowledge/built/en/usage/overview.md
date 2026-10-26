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

Options:

- `source`: the name of a chart served as `ChartPoint` entities; read through the generated repository instead of `data`. The points are turned into the shape above: the categories by `position`, a series per key, and each series again under its own key — `load`, `actual` — for the types that read one by name.
- `format`: `{ style: decimal|percent|currency|unit, currency, unit, decimals }`, `Intl.NumberFormat` in the page's language. Axes write compact numbers (`25 k €`), tooltips whole ones.
- `stacked`, `horizontal` (bar), `smooth` (line, area).
- `legend`: shown when there is more than one series unless said.
- `thresholds`: `{ warning: 0.85, overload: 1.0 }` by default, the load ratios from which a capacity bar warns, then overloads.
- `height` (`--chart-height`, 18rem by default), `label` (the accessible name), `class`.
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

## A calendar

`chart('calendar', { categories, series }, options)` draws a value a day as a contribution calendar does: a cell a day, a column a week from Monday, the months named in the page's language. The categories are the days, written `YYYY-MM-DD` and in order, the first and the last bounding the calendar; a day at zero keeps the ground's line colour, the others take the accent, fainter for the fewest. Seven rows hold in a short chart: `height: '9rem'` for a year across a column of text.

## Following the period-nav

`period: true`, with a `source`, sends the period the design system's period-nav announces (`period-change`) as `from` and `to`, and reads the points again at each change. The chart asks the period-nav for its period once listening (`period-request`), whichever of the two is ready first.
