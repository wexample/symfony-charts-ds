<?php

namespace Wexample\SymfonyChartsDs\Twig;

use InvalidArgumentException;
use Twig\Environment;
use Twig\TwigFunction;
use Wexample\SymfonyChartsDs\Enum\ChartType;
use Wexample\SymfonyChartsDs\Helper\SparklineHelper;
use Wexample\SymfonyDesignSystem\Twig\AbstractTemplateExtension;

/**
 * - `chart(type, data, { height, format, stacked, horizontal, smooth, legend, thresholds, source, lazy })`:
 *   a chart drawn by ECharts, data shaped as ChartType says. With `source`,
 *   the points of that chart are read from the api instead, as ChartPoint
 *   entities (symfony-charts).
 * - `chart_sparkline(values, { active: [from, to], width, height, label })`:
 *   a small line drawn on the server, for a table row.
 */
class ChartExtension extends AbstractTemplateExtension
{
    private const int SPARKLINE_WIDTH = 96;

    private const int SPARKLINE_HEIGHT = 24;

    public function getFunctions(): array
    {
        return [
            new TwigFunction(
                'chart',
                function (
                    Environment $twig,
                    $context,
                    string $type,
                    array $data = [],
                    array $options = []
                ): string {
                    $type = ChartType::tryFrom($type)
                        ?? throw new InvalidArgumentException(sprintf('Unknown chart type "%s".', $type));

                    return $this->renderComponent(
                        $twig,
                        $context,
                        '@WexampleSymfonyChartsDsBundle/components/chart',
                        [
                            'type' => $type->value,
                            'height' => $options['height'] ?? null,
                            'label' => $options['label'] ?? null,
                            'class' => $options['class'] ?? null,
                        ],
                        [
                            'type' => $type->value,
                            // False to draw at once rather than when scrolled to.
                            'lazy' => (bool) ($options['lazy'] ?? true),
                            'data' => $data,
                            // The name of a chart served as ChartPoint entities, read
                            // instead of `data`.
                            'source' => $options['source'] ?? null,
                            // { style: decimal|percent|currency|unit, currency, unit, decimals }
                            'format' => $options['format'] ?? null,
                            'stacked' => (bool) ($options['stacked'] ?? false),
                            'horizontal' => (bool) ($options['horizontal'] ?? false),
                            'smooth' => (bool) ($options['smooth'] ?? false),
                            // Null: shown when there is more than one series.
                            'legend' => $options['legend'] ?? null,
                            // capacity: the load ratios from which a bar warns, then overloads.
                            'thresholds' => ($options['thresholds'] ?? []) + ['warning' => 0.85, 'overload' => 1.0],
                        ]
                    );
                },
                self::TEMPLATE_FUNCTION_OPTIONS
            ),
            new TwigFunction(
                'chart_sparkline',
                function (
                    Environment $twig,
                    $context,
                    array $values,
                    array $options = []
                ): string {
                    $width = (float) ($options['width'] ?? self::SPARKLINE_WIDTH);
                    $height = (float) ($options['height'] ?? self::SPARKLINE_HEIGHT);

                    return $this->renderComponent(
                        $twig,
                        $context,
                        '@WexampleSymfonyChartsDsBundle/components/chart-sparkline',
                        [
                            'width' => $width,
                            'height' => $height,
                            'label' => $options['label'] ?? null,
                            'class' => $options['class'] ?? null,
                            'geometry' => SparklineHelper::geometry($values, $width, $height, $options['active'] ?? null),
                        ]
                    );
                },
                self::TEMPLATE_FUNCTION_OPTIONS
            ),
        ];
    }
}
