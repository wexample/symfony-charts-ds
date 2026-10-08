# symfony-charts-ds

Version: 2.0.0

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

## Table of Contents

- [What this package holds](#what-this-package-holds)
- [chart(type, data, options)](#charttype-data-options)
- [Colours](#colours)
- [chart_sparkline(values, options)](#chartsparklinevalues-options)
- [Print](#print)
- [Taking a screenshot of a page of charts](#taking-a-screenshot-of-a-page-of-charts)
- [Integration in the Suite](#integration-in-the-suite)
- [Dependencies](#dependencies)
- [Versioning & Compatibility Policy](#versioning--compatibility-policy)
- [License](#license)
- [About us](#about-us)
- [Migration Notes](#migration-notes)

## Integration in the Suite

This package is part of the Wexample Suite — a collection of high-quality, modular tools designed to work seamlessly together across multiple languages and environments.

### Related Packages

The suite includes packages for configuration management, file handling, prompts, and more. Each package can be used independently or as part of the integrated suite.

Visit the [Wexample Suite documentation](https://docs.wexample.com) for the complete package ecosystem.

## Dependencies

- php: >=8.5
- wexample/symfony-charts: >=2.0.0
- wexample/symfony-design-system: >=32.0.0
- wexample/symfony-helpers: >=15.0.0
- wexample/symfony-loader: >=22.0.0

## Versioning & Compatibility Policy

Wexample packages follow **Semantic Versioning** (SemVer):

- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

We maintain backward compatibility within major versions and provide clear migration guides for breaking changes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Free to use in both personal and commercial projects.

## About us

[Wexample](https://wexample.com) stands as a cornerstone of the digital ecosystem — a collective of seasoned engineers, researchers, and creators driven by a relentless pursuit of technological excellence. More than a media platform, it has grown into a vibrant community where innovation meets craftsmanship, and where every line of code reflects a commitment to clarity, durability, and shared intelligence.

This packages suite embodies this spirit. Trusted by professionals and enthusiasts alike, it delivers a consistent, high-quality foundation for modern development — open, elegant, and battle-tested. Its reputation is built on years of collaboration, refinement, and rigorous attention to detail, making it a natural choice for those who demand both robustness and beauty in their tools.

Wexample cultivates a culture of mastery. Each package, each contribution carries the mark of a community that values precision, ethics, and innovation — a community proud to shape the future of digital craftsmanship.

## Migration Notes

When upgrading between major versions, refer to the migration guides in the documentation.

Breaking changes are clearly documented with upgrade paths and examples.
