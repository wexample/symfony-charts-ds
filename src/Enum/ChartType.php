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
 * - calendar: { categories: days written YYYY-MM-DD, in order, series: [{ name,
 *   values }] }, a cell a day coloured by the first series, a column a week
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
    case CALENDAR = 'calendar';
}
