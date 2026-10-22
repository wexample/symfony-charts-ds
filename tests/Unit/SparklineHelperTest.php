<?php

namespace Wexample\SymfonyChartsDs\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Wexample\SymfonyChartsDs\Helper\SparklineHelper;

class SparklineHelperTest extends TestCase
{
    public function testGeometry(): void
    {
        $geometry = SparklineHelper::geometry([0, 10, 5], 104, 24, [1, 2]);

        $this->assertSame('2,22 52,2 102,12', $geometry['points']);
        $this->assertSame(['x' => 102.0, 'y' => 12.0], $geometry['last']);
        $this->assertSame(['x' => 27.0, 'width' => 77.0], $geometry['active']);
        $this->assertSame(0.0, $geometry['min']);
        $this->assertSame(10.0, $geometry['max']);
    }

    public function testGapsAndFlatSeries(): void
    {
        $this->assertSame('2,12 52,12', SparklineHelper::geometry([3, 3, null], 104, 24)['points']);
    }

    public function testEmpty(): void
    {
        $this->assertSame('', SparklineHelper::geometry([null], 104, 24)['points']);
        $this->assertNull(SparklineHelper::geometry([], 104, 24)['last']);
    }
}
