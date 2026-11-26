<?php

namespace Wexample\SymfonyChartsDs\Enum;

/**
 * What chart() can draw, and the shape of the data each one is handed:
 *
 * - line, area, bar: { categories, series: [{ name, values, color? }] }
 * - donut: { categories, series: [{ name, values }] }, the first series only
 * - capacity: { categories, load, capacity }, one horizontal bar per category
 * - forecast: { categories, actual, forecast, low?, high?, today? }
 * - boxplot: { categories, series: [{ name, values: [[samples], ...] }] }
 * - histogram: { samples, bins? }
 * - map: { categories: ISO 3166 alpha-2 codes, series: [{ name, values }] },
 *   countries coloured by the first series
 * - heatmap: { x: [column labels], y: [row labels], values: [[x_index,
 *   y_index, value | null], ...] }, two variables crossed, each cell coloured
 *   by its value — null, no value, the cell greyed —; options `min`, `max`
 *   (the scale's bounds, the values' own by default) and `scale`
 *   (`sequential`, `diverging`). A cell pressed is told on the chart's
 *   element as `chart-cell`, `{ x, y, value }`.
 * - scatter: { series: [{ name, color?, hollow?, points: [{ x, y, label,
 *   size?, details?, href? }] }] }, two measures crossed, a point each thing
 *   measured; options `xLabel`, `yLabel` (what the axes measure) and
 *   `format`, which both axes share. A series is a kind of point, named in
 *   the legend, coloured by a category or by a role of the system
 *   (`success`, `warning`, `error`, `accent`, `muted`), drawn as rings when
 *   `hollow`. A point pressed is told as `chart-point`, and opens its `href`.
 */
enum ChartType: string
{
    case LINE = 'line';
    case AREA = 'area';
    case BAR = 'bar';
    case DONUT = 'donut';
    case CAPACITY = 'capacity';
    case FORECAST = 'forecast';
    case BOXPLOT = 'boxplot';
    case HISTOGRAM = 'histogram';
    case MAP = 'map';
    case HEATMAP = 'heatmap';
    case SCATTER = 'scatter';
}
