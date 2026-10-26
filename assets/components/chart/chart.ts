import Component from '@wexample/symfony-loader/js/Class/Component';
import LazyActivationMixin from '@wexample/symfony-loader/js/Class/Mixins/LazyActivationMixin';
import { AssetsServiceEvents } from '@wexample/symfony-loader/js/Services/AssetsService';
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, HeatmapChart, LineChart, MapChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  CalendarComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { ECharts, EChartsCoreOption } from 'echarts/core';

// Only what the types below draw, so that a page carries a part of ECharts and
// not the whole of it. Svg and not canvas: sharp on paper and in an export.
echarts.use([
  BarChart,
  BoxplotChart,
  HeatmapChart,
  LineChart,
  MapChart,
  PieChart,
  ScatterChart,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  SVGRenderer,
]);

// The countries of the map type, registered once whichever chart asks first.
const WORLD_MAP = 'world';
let worldMapLoading: Promise<void> | null = null;

function worldMapLoad(): Promise<void> {
  // A chunk of its own: only a page drawing a map carries the shapes.
  worldMapLoading ??= import('./map/world.json').then((module: any) => {
    echarts.registerMap(WORLD_MAP, module.default ?? module);
  });

  return worldMapLoading;
}

// The period a period-nav announces (`period-change`, with ISO bounds), to
// which a chart reading its points from the api restricts them.
type ChartPeriod = { from: string; to: string };

type ChartSeries = {
  name: string;
  values: (number | null)[] | number[][];
  // A category of the palette (mixins/categories): `mint`, `plum`…
  color?: string;
};

type ChartData = {
  categories?: string[];
  series?: ChartSeries[];
  // capacity
  load?: number[];
  capacity?: number[];
  // forecast
  actual?: (number | null)[];
  forecast?: (number | null)[];
  low?: (number | null)[];
  high?: (number | null)[];
  today?: string | null;
  // histogram
  samples?: number[];
  bins?: number;
};

type ChartFormat = {
  style?: 'decimal' | 'percent' | 'currency' | 'unit';
  currency?: string;
  unit?: string;
  decimals?: number;
};

type ChartOptions = {
  lazy: boolean;
  type: 'line' | 'area' | 'bar' | 'donut' | 'capacity' | 'forecast' | 'boxplot' | 'histogram' | 'map' | 'calendar';
  data: ChartData;
  // The name of a chart served as ChartPoint entities (symfony-charts).
  source: string | null;
  // Whether its points follow the period-nav of the page: `from` and `to`
  // sent with the query, read again on each change.
  period: boolean;
  format: ChartFormat | null;
  stacked: boolean;
  horizontal: boolean;
  smooth: boolean;
  legend: boolean | null;
  thresholds: { warning: number; overload: number };
};

type ChartWords = Record<
  'actual' | 'forecast' | 'confidence' | 'today' | 'load' | 'capacity' | 'count' | 'min' | 'q1' | 'median' | 'q3' | 'max',
  string
>;

// The roles of the design system, read where the chart is drawn so that a
// colour scheme reaches it as it reaches the rest of the page.
type ChartTheme = {
  text: string;
  strong: string;
  line: string;
  axis: string;
  surface: string;
  font: string;
  accent: string;
  warning: string;
  error: string;
  series: string[];
};

// The series after the first, which takes the accent: categories far enough
// from one another to be told apart side by side.
const SERIES_CATEGORIES = ['blue-jeans', 'mint', 'plum', 'sunflower', 'grapefruit', 'aqua', 'grass', 'bittersweet', 'lavender', 'pink-rose', 'teal'];
// Below this distance from the accent, a category is left out of the series.
const ACCENT_DISTANCE = 90;
const HISTOGRAM_BINS = 10;

export default class extends Component {
  // Given by chart() (ChartExtension), merged in by the loader.
  declare public options: ChartOptions;
  private chart?: ECharts;
  private data: ChartData = {};
  private words = {} as ChartWords;
  private resizeObserver?: ResizeObserver;
  // While the data is on its way, there is nothing to say "empty" about yet.
  private loading = false;
  // Paper is white whatever the scheme on screen: drawn in ink while printing.
  private printing = false;
  private period: ChartPeriod | null = null;

  // A chart is a library to start: it waits to be seen (`lazy: false` on a
  // call to draw it at once, at the top of a page).
  async init() {
    LazyActivationMixin.apply(this);
    await super.init();
  }

  protected async activateListeners(): Promise<void> {
    await super.activateListeners();

    const canvas = this.el.querySelector<HTMLElement>('.chart--canvas');

    if (!canvas) {
      return;
    }

    this.words = JSON.parse(canvas.dataset.words || '{}');
    this.chart = echarts.init(canvas, null, { renderer: 'svg' });

    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(canvas);
    window.addEventListener('beforeprint', this.onPrint);
    window.addEventListener('afterprint', this.onPrintEnd);
    // A colour scheme, a palette or a skin switched: drawn again in its colours.
    this.app.services.events.listen(AssetsServiceEvents.USAGE_CHANGE, this.onUsageChange);

    // Not awaited: a slow answer would hold the activation of the component
    // and, through it, whatever the page activates after.
    void this.start();
  }

  private async start(): Promise<void> {
    if (this.options.type === 'map') {
      await worldMapLoad();
    }

    if (this.options.source && this.options.period) {
      // The period-nav announced its period before this chart listened, or
      // will: it is asked to say it again, and every change after is heard.
      document.addEventListener('period-change', this.onPeriodChange);
      document.dispatchEvent(new CustomEvent('period-request'));

      return;
    }

    if (this.options.source) {
      await this.fetchData(this.options.source);
    } else {
      this.data = this.options.data ?? {};
    }

    this.draw();
  }

  private onPeriodChange = (event: Event): void => {
    const { from, to } = (event as CustomEvent<ChartPeriod>).detail;

    if (this.period?.from === from && this.period?.to === to) {
      return;
    }

    this.period = { from, to };
    void this.fetchData(this.options.source!).then(() => this.draw());
  };

  protected async deactivateListeners(): Promise<void> {
    this.resizeObserver?.disconnect();
    document.removeEventListener('period-change', this.onPeriodChange);
    this.app.services.events.forget(AssetsServiceEvents.USAGE_CHANGE, this.onUsageChange);
    window.removeEventListener('beforeprint', this.onPrint);
    window.removeEventListener('afterprint', this.onPrintEnd);
    this.chart?.dispose();
    this.chart = undefined;

    await super.deactivateListeners();
  }

  private onUsageChange = (): void => {
    this.draw();
  };

  private onPrint = (): void => {
    this.printing = true;
    this.draw();
  };

  private onPrintEnd = (): void => {
    this.printing = false;
    this.draw();
  };

  // The points of the chart, read as any list of entities is read: through
  // the repository generated from ChartPoint, which knows its endpoint.
  private async fetchData(source: string): Promise<void> {
    this.loading = true;
    this.chart?.showLoading('default', { text: '', color: this.theme().accent, maskColor: 'transparent' });

    try {
      const repository = (this.app.getService('api') as any).client.getRepository('chartPoint');
      // No locale in the query: symfony-translations answers an api call in
      // the language of the page it comes from.
      const points = await repository.fetchList({ query: { chart: source, ...(this.period ?? {}) } });
      this.data = this.pivot(points);
    } catch {
      this.data = {};
    }

    this.loading = false;
    this.chart?.hideLoading();
  }

  // Points to the shape the types draw from: the categories in the order of
  // their position, a series per key with its label and colour, and each
  // series again under its own key — `load`, `actual`… — for the types that
  // read one by name.
  private pivot(points: any[]): ChartData {
    const read = (point: any, name: string) => point.getDataValue(name);
    const sorted = [...points].sort((a, b) => read(a, 'position') - read(b, 'position'));
    const categories = [...new Set(sorted.map((point) => read(point, 'x') as string))];
    const series = new Map<string, ChartSeries>();

    sorted.forEach((point) => {
      const key = read(point, 'series') as string;

      if (!series.has(key)) {
        series.set(key, {
          name: read(point, 'seriesLabel') ?? key,
          values: new Array(categories.length).fill(null),
          ...(read(point, 'color') ? { color: read(point, 'color') } : {}),
        });
      }

      (series.get(key)!.values as (number | null)[])[categories.indexOf(read(point, 'x'))] = read(point, 'y') ?? null;
    });

    const data: ChartData & Record<string, unknown> = { categories, series: [...series.values()] };
    series.forEach((item, key) => {
      data[key] = item.values;
    });

    return data;
  }

  private draw(): void {
    if (!this.chart || this.loading) {
      return;
    }

    const option = this.build(this.theme());
    const empty = this.el.querySelector<HTMLElement>('.chart--empty');
    const canvas = this.el.querySelector<HTMLElement>('.chart--canvas');

    if (empty && canvas) {
      empty.hidden = option !== null;
      canvas.hidden = option === null;
    }

    if (option) {
      // The canvas may just have been shown again: measure it before drawing.
      this.chart.resize();
      this.chart.setOption(option, { notMerge: true });
    }
  }

  private build(theme: ChartTheme): EChartsCoreOption | null {
    switch (this.options.type) {
      case 'donut':
        return this.donut(theme);
      case 'capacity':
        return this.capacity(theme);
      case 'forecast':
        return this.forecast(theme);
      case 'boxplot':
        return this.boxplot(theme);
      case 'histogram':
        return this.histogram(theme);
      case 'map':
        return this.map(theme);
      case 'calendar':
        return this.calendar(theme);
      default:
        return this.cartesian(theme);
    }
  }

  private cartesian(theme: ChartTheme): EChartsCoreOption | null {
    const series = this.data.series ?? [];

    if (!series.length || !this.data.categories?.length) {
      return null;
    }

    const type = this.options.type;
    const horizontal = this.options.horizontal && type === 'bar';
    const categoryAxis = this.categoryAxis(theme, this.data.categories);
    const valueAxis = this.valueAxis(theme);

    return {
      ...this.base(theme, series.length > 1),
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
      series: series.map((item) => ({
        name: item.name,
        type: type === 'bar' ? 'bar' : 'line',
        data: item.values,
        stack: this.options.stacked ? 'total' : undefined,
        smooth: this.options.smooth,
        showSymbol: false,
        symbolSize: 6,
        barMaxWidth: 32,
        lineStyle: { width: 2 },
        areaStyle: type === 'area' ? { opacity: 0.2 } : undefined,
        emphasis: { focus: 'series' },
        ...(item.color ? { color: this.categoryColor(item.color, theme) } : {}),
      })),
    };
  }

  private donut(theme: ChartTheme): EChartsCoreOption | null {
    const values = (this.data.series?.[0]?.values ?? []) as (number | null)[];
    const categories = this.data.categories ?? [];

    if (!values.length) {
      return null;
    }

    const full = this.formatter(false);

    return {
      ...this.base(theme, this.options.legend ?? true),
      legend: { ...this.legend(theme), bottom: 0, top: undefined },
      tooltip: {
        ...this.tooltip(theme),
        trigger: 'item',
        formatter: (params: any) => `${params.marker} ${params.name}<br><strong>${full(params.value)}</strong> · ${params.percent} %`,
      },
      series: [{
        type: 'pie',
        radius: ['50%', '75%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: { show: false },
        itemStyle: { borderColor: theme.surface, borderWidth: 2 },
        data: categories.map((name, index) => ({ name, value: values[index] })),
      }],
    };
  }

  // Countries coloured by their value, in the accent: the categories are ISO 3166 alpha-2 codes, named in the language
  // of the page where the pointer stops.
  private map(theme: ChartTheme): EChartsCoreOption | null {
    const values = (this.data.series?.[0]?.values ?? []) as (number | null)[];
    const categories = this.data.categories ?? [];

    if (!values.length) {
      return null;
    }

    const full = this.formatter(false);
    const names = new Intl.DisplayNames(this.locale() ? [this.locale()!.replace('_', '-')] : [], { type: 'region' });
    const name = (code: string) => {
      try {
        return names.of(code) ?? code;
      } catch {
        return code;
      }
    };

    return {
      ...this.base(theme, false),
      tooltip: {
        ...this.tooltip(theme),
        trigger: 'item',
        formatter: (params: any) => `${name(params.name)}<br><strong>${full(Number.isNaN(params.value) ? null : params.value)}</strong>`,
      },
      visualMap: {
        type: 'continuous',
        min: 0,
        max: Math.max(1, ...values.map((value) => value ?? 0)),
        show: false,
        // The accent, fainter for the fewest: a country with none keeps the
        // ground's line colour, and one with a few is told apart from it.
        inRange: { color: [theme.accent], colorAlpha: [0.35, 1] },
      },
      series: [{
        type: 'map',
        map: WORLD_MAP,
        roam: false,
        selectedMode: false,
        showLegendSymbol: false,
        itemStyle: { areaColor: theme.line, borderColor: theme.surface, borderWidth: 0.5 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: theme.strong } },
        data: categories.map((code, index) => ({ name: code, value: values[index] })),
      }],
    };
  }

  // A value a day, a column a week from Monday, as a contribution calendar
  // reads: the days without any keep the ground's line colour, the others the
  // accent, fainter for the fewest.
  private calendar(theme: ChartTheme): EChartsCoreOption | null {
    const values = (this.data.series?.[0]?.values ?? []) as (number | null)[];
    const days = this.data.categories ?? [];

    if (!days.length) {
      return null;
    }

    const locale = this.locale()?.replace('_', '-');
    const full = this.formatter(false);
    const months = Array.from({ length: 12 }, (_, month) =>
      new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2000, month, 1))
    );
    const dayName = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });

    return {
      ...this.base(theme, false),
      tooltip: {
        ...this.tooltip(theme),
        trigger: 'item',
        formatter: (params: any) => `${dayName.format(new Date(`${params.value[0]}T00:00:00Z`))}<br><strong>${full(params.value[1])}</strong>`,
      },
      visualMap: {
        type: 'continuous',
        min: 1,
        max: Math.max(1, ...values.map((value) => value ?? 0)),
        show: false,
        inRange: { color: [theme.accent], colorAlpha: [0.3, 1] },
        outOfRange: { color: [theme.line] },
      },
      calendar: {
        range: [days[0], days[days.length - 1]],
        top: 24,
        left: 8,
        right: 8,
        bottom: 8,
        cellSize: ['auto', 'auto'],
        splitLine: { show: false },
        itemStyle: { color: theme.line, borderColor: theme.surface, borderWidth: 2 },
        dayLabel: { show: false, firstDay: 1 },
        monthLabel: { nameMap: months, color: theme.text, fontFamily: theme.font },
        yearLabel: { show: false },
      },
      series: [{
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: days.map((day, index) => [day, values[index] ?? 0]),
      }],
    };
  }

  // Load against capacity, one bar per category: the bar takes the colour of
  // its ratio, the capacity is a tick across it, and both numbers are written.
  private capacity(theme: ChartTheme): EChartsCoreOption | null {
    const categories = this.data.categories ?? [];
    const load = this.data.load ?? [];
    const capacity = this.data.capacity ?? [];

    if (!categories.length) {
      return null;
    }

    const full = this.formatter(false);
    const ratio = (index: number) => (capacity[index] ? load[index] / capacity[index] : 0);
    const percent = (index: number) => new Intl.NumberFormat(this.locale(), { style: 'percent', maximumFractionDigits: 0 }).format(ratio(index));
    const colorOf = (index: number) => {
      if (ratio(index) > this.options.thresholds.overload) {
        return theme.error;
      }

      return ratio(index) > this.options.thresholds.warning ? theme.warning : theme.accent;
    };
    const peak = Math.max(...load, ...capacity, 0);

    return {
      ...this.base(theme, this.options.legend ?? true),
      tooltip: {
        ...this.tooltip(theme),
        formatter: (params: any[]) => {
          const index = params[0].dataIndex;

          return `${categories[index]}<br>${this.words.load} : <strong>${full(load[index])}</strong> (${percent(index)})<br>${this.words.capacity} : ${full(capacity[index])}`;
        },
      },
      // Room on the right for the label written past the longest bar.
      xAxis: { ...this.valueAxis(theme), max: Math.ceil(peak * 1.3) || undefined },
      yAxis: { ...this.categoryAxis(theme, categories), inverse: true },
      series: [
        {
          name: this.words.load,
          type: 'bar',
          color: theme.accent,
          barMaxWidth: 22,
          data: load.map((value, index) => ({ value, itemStyle: { color: colorOf(index) } })),
          label: {
            show: true,
            position: 'right',
            color: theme.text,
            formatter: (params: any) => `${percent(params.dataIndex)} · ${full(load[params.dataIndex])} / ${full(capacity[params.dataIndex])}`,
          },
        },
        {
          name: this.words.capacity,
          type: 'scatter',
          color: theme.strong,
          symbol: 'rect',
          symbolSize: [3, 28],
          z: 3,
          data: capacity.map((value, index) => [value, categories[index]]),
        },
      ],
    };
  }

  // What happened, then what is expected: the actual line stops at today, the
  // forecast carries on dashed inside its band, and today is a line across.
  private forecast(theme: ChartTheme): EChartsCoreOption | null {
    const categories = this.data.categories ?? [];

    if (!categories.length) {
      return null;
    }

    const actual = this.data.actual ?? [];
    const forecast = this.data.forecast ?? [];
    const low = this.data.low ?? [];
    const high = this.data.high ?? [];
    const hasBand = low.length > 0 && high.length > 0;
    const full = this.formatter(false);
    const forecastColor = this.categoryColor('plum', theme);
    const series: any[] = [];

    if (hasBand) {
      // Two stacked areas, the lower one invisible: what shows is the space
      // between low and high.
      series.push(
        {
          name: 'band-floor',
          type: 'line',
          data: low,
          stack: 'band',
          silent: true,
          symbol: 'none',
          lineStyle: { opacity: 0 },
          tooltip: { show: false },
        },
        {
          name: this.words.confidence,
          type: 'line',
          data: high.map((value, index) => (value === null || low[index] === null ? null : value - (low[index] as number))),
          stack: 'band',
          silent: true,
          symbol: 'none',
          color: forecastColor,
          lineStyle: { opacity: 0 },
          areaStyle: { color: forecastColor, opacity: 0.18 },
        }
      );
    }

    series.push(
      {
        name: this.words.actual,
        type: 'line',
        data: actual,
        color: theme.accent,
        showSymbol: false,
        lineStyle: { width: 2.5 },
        markLine: this.data.today
          ? {
            silent: true,
            symbol: 'none',
            lineStyle: { color: theme.text, type: 'dashed', width: 1 },
            label: { formatter: this.words.today, color: theme.text, position: 'insideEndTop' },
            data: [{ xAxis: this.data.today }],
          }
          : undefined,
      },
      {
        name: this.words.forecast,
        type: 'line',
        data: forecast,
        color: forecastColor,
        showSymbol: false,
        lineStyle: { width: 2, type: 'dashed' },
      }
    );

    return {
      ...this.base(theme, true),
      legend: { ...this.legend(theme), data: [this.words.actual, this.words.forecast, ...(hasBand ? [this.words.confidence] : [])] },
      tooltip: {
        ...this.tooltip(theme),
        formatter: (params: any[]) => {
          const index = params[0].dataIndex;
          const lines = [categories[index]];

          if (actual[index] !== null && actual[index] !== undefined) {
            lines.push(`${this.words.actual} : <strong>${full(actual[index])}</strong>`);
          }
          if (forecast[index] !== null && forecast[index] !== undefined) {
            lines.push(`${this.words.forecast} : <strong>${full(forecast[index])}</strong>`);
          }
          if (hasBand && low[index] !== null && high[index] !== null && low[index] !== undefined) {
            lines.push(`${this.words.confidence} : ${full(low[index])} – ${full(high[index])}`);
          }

          return lines.join('<br>');
        },
      },
      xAxis: { ...this.categoryAxis(theme, categories), boundaryGap: false },
      yAxis: this.valueAxis(theme),
      series,
    };
  }

  private boxplot(theme: ChartTheme): EChartsCoreOption | null {
    const series = this.data.series ?? [];
    const categories = this.data.categories ?? [];

    if (!series.length || !categories.length) {
      return null;
    }

    const full = this.formatter(false);

    return {
      ...this.base(theme, series.length > 1),
      tooltip: {
        ...this.tooltip(theme),
        trigger: 'item',
        formatter: (params: any) => {
          // The value may lead with the category index: the five are the last five.
          const [min, q1, median, q3, max] = (params.value as number[]).slice(-5);

          return [
            `${params.marker} ${params.name}`,
            `${this.words.max} : ${full(max)}`,
            `${this.words.q3} : ${full(q3)}`,
            `${this.words.median} : <strong>${full(median)}</strong>`,
            `${this.words.q1} : ${full(q1)}`,
            `${this.words.min} : ${full(min)}`,
          ].join('<br>');
        },
      },
      xAxis: this.categoryAxis(theme, categories),
      yAxis: this.valueAxis(theme),
      series: series.map((item, index) => {
        const color = item.color ? this.categoryColor(item.color, theme) : theme.series[index % theme.series.length];

        return {
          name: item.name,
          type: 'boxplot',
          data: (item.values as number[][]).map((samples) => this.fiveNumbers(samples)),
          itemStyle: { color: echarts.color.modifyAlpha(color, 0.2), borderColor: color, borderWidth: 1.5 },
          boxWidth: [8, 40],
        };
      }),
    };
  }

  private histogram(theme: ChartTheme): EChartsCoreOption | null {
    const samples = (this.data.samples ?? []).filter((value) => Number.isFinite(value));

    if (!samples.length) {
      return null;
    }

    const bins = Math.max(1, this.data.bins ?? HISTOGRAM_BINS);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const width = (max - min) / bins || 1;
    const counts = new Array(bins).fill(0);

    samples.forEach((value) => {
      counts[Math.min(bins - 1, Math.floor((value - min) / width))]++;
    });

    const compact = this.formatter(true);
    const categories = counts.map((_, index) => `${compact(min + index * width)}–${compact(min + (index + 1) * width)}`);

    return {
      ...this.base(theme, false),
      tooltip: { ...this.tooltip(theme), valueFormatter: (value: number) => String(value) },
      xAxis: this.categoryAxis(theme, categories),
      yAxis: { ...this.valueAxis(theme), axisLabel: { color: theme.text }, minInterval: 1 },
      series: [{
        name: this.words.count,
        type: 'bar',
        data: counts,
        color: theme.accent,
        barCategoryGap: '6%',
      }],
    };
  }

  private base(theme: ChartTheme, legend: boolean): EChartsCoreOption {
    const show = this.options.legend ?? legend;

    return {
      // A chart drawn for paper is printed at once, not halfway through.
      animation: !this.printing,
      animationDuration: 400,
      color: theme.series,
      textStyle: { fontFamily: theme.font, color: theme.text },
      grid: {
        left: 8,
        right: 16,
        top: show ? 40 : 16,
        bottom: 8,
        outerBoundsMode: 'same',
        outerBoundsContain: 'axisLabel',
      },
      legend: { ...this.legend(theme), show },
      tooltip: this.tooltip(theme),
    };
  }

  private legend(theme: ChartTheme): object {
    return {
      top: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: theme.text },
    };
  }

  private tooltip(theme: ChartTheme): object {
    return {
      trigger: 'axis',
      confine: true,
      backgroundColor: theme.surface,
      borderColor: theme.line,
      textStyle: { color: theme.strong, fontFamily: theme.font },
      axisPointer: { type: 'line', lineStyle: { color: theme.axis } },
      valueFormatter: this.formatter(false),
    };
  }

  private categoryAxis(theme: ChartTheme, categories: string[]): object {
    return {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: theme.axis } },
      axisTick: { show: false },
      axisLabel: { color: theme.text },
    };
  }

  private valueAxis(theme: ChartTheme): object {
    return {
      type: 'value',
      axisLabel: { color: theme.text, formatter: this.formatter(true) },
      splitLine: { lineStyle: { color: theme.line } },
    };
  }

  // Axes write compact numbers, "12 k"; tooltips write them whole.
  private formatter(compact: boolean): (value: number | null | undefined) => string {
    const format = this.options.format ?? {};
    const style = format.style ?? 'decimal';
    const number = new Intl.NumberFormat(this.locale(), {
      style,
      currency: style === 'currency' ? format.currency ?? 'EUR' : undefined,
      unit: style === 'unit' ? format.unit : undefined,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: format.decimals ?? (compact ? 1 : 2),
    });

    return (value) => (value === null || value === undefined || Number.isNaN(value) ? '—' : number.format(value));
  }

  private locale(): string | undefined {
    return document.documentElement.lang || undefined;
  }

  private theme(): ChartTheme {
    const style = getComputedStyle(this.el);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    const accent = read('--accent-9', '#6366f1');
    // The colours that fill a mark read on white as on the screen's ground;
    // the inks and the lines of a dark scheme would vanish on paper.
    const ink = this.printing
      ? { text: '#444444', strong: '#111111', line: '#e0e0e0', axis: '#bbbbbb', surface: '#ffffff' }
      : {
        text: read('--text-color-muted', '#666666'),
        strong: read('--text-color-default', '#222222'),
        line: read('--border-color-discreet', '#e5e5e5'),
        axis: read('--border-color-default', '#d4d4d4'),
        surface: read('--surface-3', '#ffffff'),
      };

    return {
      ...ink,
      font: read('--font-family-base', 'sans-serif'),
      accent,
      warning: read('--warning-9', '#f59e0b'),
      error: read('--error-9', '#ef4444'),
      // A category too close to the accent would read as the first series twice.
      series: [accent, ...SERIES_CATEGORIES
        .map((name) => read(`--cat-${name}-9`, ''))
        .filter((color) => color && this.distance(color, accent) > ACCENT_DISTANCE)],
    };
  }

  // How far apart two colours are, in rgb: enough to tell red from orange.
  private distance(first: string, second: string): number {
    const channels = (color: string) => {
      const parsed = echarts.color.parse(color) as number[] | undefined;

      return parsed ?? [0, 0, 0];
    };
    const [r1, g1, b1] = channels(first);
    const [r2, g2, b2] = channels(second);

    return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
  }

  private categoryColor(name: string, theme: ChartTheme): string {
    return getComputedStyle(this.el).getPropertyValue(`--cat-${name}-9`).trim() || theme.accent;
  }

  // min, first quartile, median, third quartile, max, by linear interpolation.
  private fiveNumbers(samples: number[]): number[] {
    const sorted = samples.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);

    if (!sorted.length) {
      return [];
    }

    const quantile = (q: number) => {
      const position = (sorted.length - 1) * q;
      const below = Math.floor(position);
      const above = Math.ceil(position);

      return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
    };

    return [sorted[0], quantile(0.25), quantile(0.5), quantile(0.75), sorted[sorted.length - 1]];
  }
}
