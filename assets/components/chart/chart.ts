import Component from '@wexample/symfony-loader/js/Class/Component';
import LazyActivationMixin from '@wexample/symfony-loader/js/Class/Mixins/LazyActivationMixin';
import { AssetsServiceEvents } from '@wexample/symfony-loader/js/Services/AssetsService';
import PollingService from '@wexample/symfony-loader/js/Services/PollingService';
import { periodFollow, type PeriodBounds } from '@wexample/symfony-design-system/js/Helper/PeriodHelper';
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, HeatmapChart, LineChart, MapChart, PieChart, ScatterChart } from 'echarts/charts';
import {
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


// A point of a scatter: where it stands, what it is called under the pointer,
// and — each optional — what sizes it against the others, the lines said
// after its two figures, the page it opens when pressed.
type ChartScatterPoint = {
  x: number;
  y: number;
  label: string;
  size?: number | null;
  details?: string[];
  href?: string | null;
};

type ChartSeries = {
  name: string;
  values: (number | null)[] | number[][];
  // A category of the palette (mixins/categories): `mint`, `plum`… — or, for
  // a series that stands for a state, a role of the system: `success`,
  // `warning`, `error`, `accent`, `muted`.
  color?: string;
  // scatter: its points, and whether they are drawn as rings — a series set
  // apart from the others by more than its colour.
  points?: ChartScatterPoint[];
  hollow?: boolean;
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
  // heatmap: the columns, the rows, a cell each [column, row, value]
  x?: string[];
  y?: string[];
  values?: [number, number, number | null][];
};

type ChartFormat = {
  style?: 'decimal' | 'percent' | 'currency' | 'unit';
  currency?: string;
  unit?: string;
  decimals?: number;
};

type ChartOptions = {
  lazy: boolean;
  type: 'line' | 'area' | 'bar' | 'donut' | 'capacity' | 'forecast' | 'boxplot' | 'histogram' | 'map' | 'heatmap' | 'scatter';
  data: ChartData;
  // The name of a chart served as ChartPoint entities (symfony-charts).
  source: string | null;
  // Whether its points follow the period-nav of the page: `from` and `to`
  // sent with the query, read again on each change.
  period: boolean;
  // What the chart is about — a project, an account, by its id —, sent with
  // the query for the provider to read and check.
  scope: string | null;
  // With `source`: seconds between two readings of its points, or null.
  poll: number | null;
  // With `source`: the events of the page after which its points are read
  // again — a run over, a form saved.
  refresh: string[];
  format: ChartFormat | null;
  stacked: boolean;
  horizontal: boolean;
  smooth: boolean;
  legend: boolean | null;
  thresholds: { warning: number; overload: number };
  // heatmap: the bounds of its scale — the values' own when null —, and
  // whether it runs one way (`sequential`) or both ways from its middle.
  min: number | null;
  max: number | null;
  scale: 'sequential' | 'diverging';
  // diverging: the value it diverges from — 0 between a loss and a gain —,
  // its bounds then as far on each side; the middle of its bounds when null.
  center: number | null;
  // scatter: what its two axes measure, written along them and under the pointer.
  xLabel: string | null;
  yLabel: string | null;
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
  success: string;
  series: string[];
};

// The series after the first, which takes the accent: categories far enough
// from one another to be told apart side by side.
const SERIES_CATEGORIES = ['blue-jeans', 'mint', 'plum', 'sunflower', 'grapefruit', 'aqua', 'grass', 'bittersweet', 'lavender', 'pink-rose', 'teal'];
// Below this distance from the accent, a category is left out of the series.
const ACCENT_DISTANCE = 90;
const HISTOGRAM_BINS = 10;
// Up to this many cells, a heatmap writes each value in its cell; past it,
// under the pointer only.
const HEATMAP_LABELLED_CELLS = 64;
// A scatter's point, across: the same for all without sizes, between the two
// with — never so small that the pointer cannot land on it.
const SCATTER_SIZE = 12;
const SCATTER_SIZE_MIN = 10;
const SCATTER_SIZE_MAX = 28;
// The roles of the system a series may be coloured by, for a series that
// stands for a state rather than for one category among others.
const SERIES_ROLES = ['success', 'warning', 'error', 'accent', 'muted'] as const;

export default class extends Component {
  // Given by chart() (ChartExtension), merged in by the loader.
  declare public options: ChartOptions;
  private chart?: ECharts;
  private data: ChartData = {};
  private words = {} as ChartWords;
  private resizeObserver?: ResizeObserver;
  private resizeFrame = 0;
  // While the data is on its way, there is nothing to say "empty" about yet.
  private loading = false;
  // Paper is white whatever the scheme on screen: drawn in ink while printing.
  private printing = false;
  // The period-nav's period its points are restricted to (`period`).
  private period: PeriodBounds | null = null;
  private forgetPeriod?: () => void;

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
    // A heatmap's cell pressed: told on the chart's element, what it stands
    // for with it — a page opening what the cell counts.
    this.chart.on('click', (params: any) => {
      // A scatter's point pressed: told the same way, and its page opened
      // when it has one.
      if (this.options.type === 'scatter' && params.data?.point) {
        const point = params.data.point as ChartScatterPoint;
        this.el.dispatchEvent(new CustomEvent('chart-point', { bubbles: true, detail: { ...point, series: params.seriesName ?? null } }));

        if (point.href) {
          window.location.assign(point.href);
        }

        return;
      }

      if (this.options.type === 'heatmap' && Array.isArray(params.data?.value ?? params.value)) {
        const [column, row, value] = (params.data?.value ?? params.value) as [number, number, number | null];
        this.el.dispatchEvent(new CustomEvent('chart-cell', {
          bubbles: true,
          detail: { x: this.data.x?.[column] ?? null, y: this.data.y?.[row] ?? null, value: value ?? null },
        }));
      }
    });

    // Resized on the next frame rather than in the observer's callback: the
    // svg redrawn there changes the layout being observed, which the browser
    // reports as an error (ResizeObserver loop completed with undelivered
    // notifications). One resize per frame however many notifications.
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.chart?.resize());
    });
    this.resizeObserver.observe(canvas);
    window.addEventListener('beforeprint', this.onPrint);
    window.addEventListener('afterprint', this.onPrintEnd);
    // A colour scheme, a palette or a skin switched: drawn again in its colours.
    this.app.services.events.listen(AssetsServiceEvents.USAGE_CHANGE, this.onUsageChange);
    this.refreshEvents().forEach((event) => this.app.services.events.listen(event, this.onRefresh));

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
      // will: followed either way, read again at each change.
      this.forgetPeriod = periodFollow((period) => {
        this.period = period;
        void this.fetchData(this.options.source!).then(() => this.draw());
      });
      this.startPolling();

      return;
    }

    if (this.options.source) {
      await this.fetchData(this.options.source);
    } else {
      this.data = this.options.data ?? {};
    }

    this.draw();
    this.startPolling();
  }

  // Its points read again on a clock (`poll`), through the page's
  // PollingService: not while nobody looks, at once when they look again,
  // further apart while the source fails; stopped with the chart.
  private startPolling(): void {
    const source = this.options.source;

    if (!source || !this.options.poll) {
      return;
    }

    (this.app.getServiceOrFail(PollingService) as PollingService).start({
      owner: this,
      intervalMs: this.options.poll * 1000,
      read: async () => {
        // Following the period-nav, it waits for the period to be said.
        if (this.options.period && !this.period) {
          return;
        }

        await this.fetchData(source, true);
        this.draw();
      },
    });
  }

  protected async deactivateListeners(): Promise<void> {
    (this.app.services[PollingService.serviceName] as PollingService | undefined)?.stopOwner(this);
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.resizeFrame);
    this.forgetPeriod?.();
    this.app.services.events.forget(AssetsServiceEvents.USAGE_CHANGE, this.onUsageChange);
    this.refreshEvents().forEach((event) => this.app.services.events.forget(event, this.onRefresh));
    window.removeEventListener('beforeprint', this.onPrint);
    window.removeEventListener('afterprint', this.onPrintEnd);
    this.chart?.dispose();
    this.chart = undefined;

    await super.deactivateListeners();
  }

  private onUsageChange = (): void => {
    this.draw();
  };

  // The events after which its points are read again (`refresh`): only a
  // chart served by a source has anything to read again.
  private refreshEvents(): string[] {
    return this.options.source ? (this.options.refresh ?? []) : [];
  }

  // Read again in place, as on a clock: what is drawn stays until the new
  // points come.
  private onRefresh = (): void => {
    if (this.options.source) {
      void this.fetchData(this.options.source, true).then(() => this.draw());
    }
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
  // the repository generated from ChartPoint, which knows its endpoint. A
  // failure is thrown, not drawn as an empty chart: a repository the api
  // client does not register, or an answer in error, must show.
  // `silent`: read again on a clock — the points already drawn stay, no
  // spinner over them.
  private async fetchData(source: string, silent: boolean = false): Promise<void> {
    this.loading = true;

    if (!silent) {
      this.chart?.showLoading('default', { text: '', color: this.theme().accent, maskColor: 'transparent' });
    }

    try {
      const repository = (this.app.getService('api') as any).client.getRepository('chartPoint');
      // No locale in the query: symfony-translations answers an api call in
      // the language of the page it comes from.
      const points = await repository.fetchList({
        query: { chart: source, ...(this.options.scope ? { scope: this.options.scope } : {}), ...(this.period ?? {}) },
      });
      this.data = this.pivot(points);
    } finally {
      this.loading = false;
      this.chart?.hideLoading();
    }
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

    // A heatmap crosses the two: the categories its columns, a row per
    // series, a cell per point.
    if (this.options.type === 'heatmap') {
      const rows = [...series.values()];
      data.x = categories;
      data.y = rows.map((row) => row.name);
      data.values = rows.flatMap((row, rowIndex) => (row.values as (number | null)[])
        .map((value, column) => [column, rowIndex, value] as [number, number, number | null]));
    }

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
      case 'heatmap':
        return this.heatmap(theme);
      case 'scatter':
        return this.scatter(theme);
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

  // Two variables crossed — a column each value of one, a row each value of
  // the other —, each cell coloured by its value on a scale of the system's
  // colours: the accent, fainter for the least (`sequential`), or the
  // error's to the success's through the ground's line (`diverging`). A
  // cell without a value is the ground's line, said so under the pointer.
  // Its value written in it while the grid is small; its scale under it.
  private heatmap(theme: ChartTheme): EChartsCoreOption | null {
    const columns = this.data.x ?? [];
    const rows = this.data.y ?? [];
    const cells = (this.data.values ?? []).filter((cell) => Array.isArray(cell) && cell.length >= 3);

    if (!columns.length || !rows.length) {
      return null;
    }

    const full = this.formatter(false);
    const known = cells.filter((cell) => cell[2] !== null && Number.isFinite(cell[2])) as [number, number, number][];
    const empty = cells.filter((cell) => !(cell[2] !== null && Number.isFinite(cell[2])));
    const values = known.map((cell) => cell[2]);
    let min = this.options.min ?? (values.length ? Math.min(...values) : 0);
    let max = this.options.max ?? (values.length ? Math.max(...values) : 1);
    const center = this.options.scale === 'diverging' ? this.options.center : null;

    // Diverging from a value: as far on each side, so that it stays the
    // middle colour whatever the values.
    if (center !== null && center !== undefined) {
      const reach = Math.max(Math.abs(max - center), Math.abs(min - center)) || 1;
      min = this.options.min ?? center - reach;
      max = this.options.max ?? center + reach;
    }
    const labelled = columns.length * rows.length <= HEATMAP_LABELLED_CELLS;
    const colors = this.options.scale === 'diverging'
      ? [theme.error, theme.axis, theme.success]
      : [echarts.color.modifyAlpha(theme.accent, 0.15), theme.accent];
    const name = (cell: [number, number, unknown]) => `${columns[cell[0]] ?? ''} · ${rows[cell[1]] ?? ''}`;

    return {
      ...this.base(theme, false),
      grid: { left: 8, right: 16, top: 16, bottom: 56, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
      tooltip: {
        ...this.tooltip(theme),
        trigger: 'item',
        formatter: (params: any) => `${name(params.value)}<br><strong>${params.seriesIndex === 1 ? '—' : full(params.value[2])}</strong>`,
      },
      xAxis: { ...this.categoryAxis(theme, columns), splitArea: { show: false } },
      yAxis: { ...this.categoryAxis(theme, rows), splitArea: { show: false } },
      visualMap: [{
        type: 'continuous',
        seriesIndex: 0,
        min,
        max: max === min ? min + 1 : max,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemHeight: 160,
        itemWidth: 10,
        text: [full(max), full(min)],
        textStyle: { color: theme.text },
        inRange: { color: colors },
      }, {
        // The cells without a value, one colour: the ground's line.
        type: 'piecewise',
        seriesIndex: 1,
        show: false,
        pieces: [{ value: 0, color: theme.line }],
      }],
      series: [{
        type: 'heatmap',
        data: known,
        label: { show: labelled, color: theme.strong, formatter: (params: any) => full(params.value[2]) },
        itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 2 },
        emphasis: { itemStyle: { borderColor: theme.strong } },
        cursor: 'pointer',
      }, {
        type: 'heatmap',
        data: empty.map((cell) => [cell[0], cell[1], 0]),
        itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 2 },
        label: { show: false },
        silent: false,
      }],
    };
  }

  // Two measures crossed, a point each thing measured: where it stands says
  // both at once, and the cloud says what no list does — where most of them
  // are, and what stands apart. A series is a kind of point, named in the
  // legend; the pointer says which point and its figures, whole.
  private scatter(theme: ChartTheme): EChartsCoreOption | null {
    const series = (this.data.series ?? []).filter((item) => item.points?.length);

    if (!series.length) {
      return null;
    }

    const full = this.formatter(false);
    const escape = echarts.format.encodeHTML;
    const xLabel = this.options.xLabel ?? '';
    const yLabel = this.options.yLabel ?? '';
    const sizes = series
      .flatMap((item) => item.points!.map((point) => point.size))
      .filter((size): size is number => typeof size === 'number' && Number.isFinite(size) && size > 0);
    const largest = sizes.length ? Math.max(...sizes) : 0;
    // By area, as the eye reads a disc: the square root of its share of the largest.
    const sizeOf = (size?: number | null): number => (largest > 0 && typeof size === 'number' && size > 0
      ? SCATTER_SIZE_MIN + (SCATTER_SIZE_MAX - SCATTER_SIZE_MIN) * Math.sqrt(size / largest)
      : (largest > 0 ? SCATTER_SIZE_MIN : SCATTER_SIZE));
    const axisName = (name: string, gap: number) => ({
      name,
      nameLocation: 'middle',
      nameGap: gap,
      nameTextStyle: { color: theme.text },
      // Its bounds are its points', not zero's: a cloud far from the origin is not squeezed into a corner.
      scale: true,
    });

    return {
      ...this.base(theme, series.length > 1),
      // The legend's key is the mark's: a disc, a ring.
      legend: { ...this.legend(theme), show: this.options.legend ?? series.length > 1, icon: 'circle', itemWidth: 10, itemHeight: 10 },
      grid: { left: 24, right: 24, top: (this.options.legend ?? series.length > 1) ? 40 : 16, bottom: 28, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
      tooltip: {
        ...this.tooltip(theme),
        trigger: 'item',
        formatter: (params: any) => {
          const point = params.data?.point as ChartScatterPoint | undefined;

          if (!point) {
            return '';
          }

          // Every word comes from the data: written as text, never as markup.
          return [
            `<strong>${escape(point.label)}</strong>`,
            `${escape(yLabel)} : <strong>${full(point.y)}</strong>`,
            `${escape(xLabel)} : <strong>${full(point.x)}</strong>`,
            ...(point.details ?? []).map((line) => escape(line)),
          ].join('<br>');
        },
      },
      xAxis: { ...this.valueAxis(theme), ...axisName(xLabel, 30) },
      yAxis: { ...this.valueAxis(theme), ...axisName(yLabel, 48) },
      series: series.map((item, index) => {
        const color = item.color ? this.seriesColor(item.color, theme) : theme.series[index % theme.series.length];

        return {
          name: item.name,
          type: 'scatter',
          symbol: 'circle',
          data: item.points!.map((point) => ({ value: [point.x, point.y], point, symbolSize: sizeOf(point.size) })),
          // A disc wears a ring of the ground's colour: two that overlap stay
          // two. A hollow series is the other way round — the ground inside,
          // its colour around.
          itemStyle: item.hollow
            ? { color: theme.surface, borderColor: color, borderWidth: 2 }
            : { color, borderColor: theme.surface, borderWidth: 2, opacity: 0.9 },
          emphasis: { scale: 1.4, itemStyle: { borderColor: theme.strong, opacity: 1 } },
          cursor: item.points!.some((point) => point.href) ? 'pointer' : 'default',
          // Where nothing was gained nor lost: a line across, once.
          ...(index === 0 ? {
            markLine: {
              silent: true,
              symbol: 'none',
              label: { show: false },
              lineStyle: { color: theme.axis, type: 'solid', width: 1 },
              data: [{ yAxis: 0 }],
            },
          } : {}),
        };
      }),
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
      // Laid along a narrow chart — a horizontal bar in a card of four —,
      // its figures leave out those that would run into each other.
      axisLabel: { color: theme.text, formatter: this.formatter(true), hideOverlap: true },
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
      success: read('--success-9', '#22c55e'),
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

  // A series' colour by its name: a role of the system — a state —, or a
  // category of the palette.
  private seriesColor(name: string, theme: ChartTheme): string {
    if ((SERIES_ROLES as readonly string[]).includes(name)) {
      return name === 'muted' ? theme.text : theme[name as 'success' | 'warning' | 'error' | 'accent'];
    }

    return this.categoryColor(name, theme);
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
