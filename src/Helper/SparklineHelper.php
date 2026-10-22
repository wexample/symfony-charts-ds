<?php

namespace Wexample\SymfonyChartsDs\Helper;

class SparklineHelper
{
    /**
     * The geometry of a sparkline in a box of `width` × `height`, computed
     * here so that a table of three thousand rows draws three thousand svg
     * and runs no script. The line keeps a margin of `inset` so that its
     * stroke and its last dot are not cut by the box. `active` is the window
     * to highlight, as the first and last index it covers.
     *
     * @param list<int|float|null> $values
     * @param array{0: int, 1: int}|null $active
     *
     * @return array{
     *     points: string,
     *     last: array{x: float, y: float}|null,
     *     active: array{x: float, width: float}|null,
     *     min: float|null,
     *     max: float|null
     * }
     */
    public static function geometry(
        array $values,
        float $width,
        float $height,
        ?array $active = null,
        float $inset = 2.0,
    ): array {
        $values = array_values($values);
        $numbers = array_filter($values, static fn ($value) => null !== $value);

        if (! $numbers) {
            return ['points' => '', 'last' => null, 'active' => null, 'min' => null, 'max' => null];
        }

        $min = (float) min($numbers);
        $max = (float) max($numbers);
        $count = count($values);
        $step = $count > 1 ? ($width - 2 * $inset) / ($count - 1) : 0.0;
        // A flat series is drawn across the middle, not along the floor.
        $range = $max - $min;
        $x = static fn (int $index): float => round($inset + $index * $step, 2);
        $y = static fn (float $value): float => round(
            $range > 0
                ? $height - $inset - ($value - $min) / $range * ($height - 2 * $inset)
                : $height / 2,
            2
        );

        $points = [];
        $last = null;
        foreach ($values as $index => $value) {
            if (null !== $value) {
                $last = ['x' => $x($index), 'y' => $y((float) $value)];
                $points[] = $last['x'].','.$last['y'];
            }
        }

        $window = null;
        if (null !== $active) {
            $from = max(0, min($active[0], $active[1]));
            $to = min($count - 1, max($active[0], $active[1]));
            // Half a step on each side: the window covers its points, not
            // the gaps between their neighbours.
            $start = max(0.0, $x($from) - $step / 2);
            $end = min($width, $x($to) + $step / 2);
            $window = ['x' => round($start, 2), 'width' => round(max(0.0, $end - $start), 2)];
        }

        return [
            'points' => implode(' ', $points),
            'last' => $last,
            'active' => $window,
            'min' => $min,
            'max' => $max,
        ];
    }
}
