<?php
include 'kite.php';

if (!isset($_SESSION['access_token'])) {
    header("Location: index.php");
    exit;
}

function h($value) {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function formatAmount($value) {
    return number_format((float) $value, 2);
}

$type = $_GET['type'] ?? 'sector';

$titles = [
    'sector' => 'Sector View',
    '5min-breakout' => '5 Min Breakout',
    'top-gainers' => 'Top Gainers',
    'top-losers' => 'Top Losers',
];

$pageTitle = $titles[$type] ?? 'Scanner';
$holdings = kiteRequest("portfolio/holdings");
$rows = [];

if ($type === 'sector') {
    $rows = [
        ['name' => 'Banking', 'stocks' => 5, 'change' => 1.45],
        ['name' => 'IT', 'stocks' => 7, 'change' => -0.84],
        ['name' => 'Auto', 'stocks' => 4, 'change' => 0.62],
        ['name' => 'Pharma', 'stocks' => 3, 'change' => 0.23],
    ];
} else {
    $holdingData = $holdings['data'] ?? [];
    foreach ($holdingData as $item) {
        $rows[] = [
            'symbol' => $item['tradingsymbol'] ?? '-',
            'exchange' => $item['exchange'] ?? '-',
            'last_price' => (float) ($item['last_price'] ?? 0),
            'change_pct' => (float) ($item['day_change_percentage'] ?? 0),
            'pnl' => (float) ($item['pnl'] ?? 0),
        ];
    }

    if ($type === 'top-gainers') {
        usort($rows, function ($a, $b) {
            return $b['change_pct'] <=> $a['change_pct'];
        });
    } elseif ($type === 'top-losers') {
        usort($rows, function ($a, $b) {
            return $a['change_pct'] <=> $b['change_pct'];
        });
    } elseif ($type === '5min-breakout') {
        usort($rows, function ($a, $b) {
            return abs($b['change_pct']) <=> abs($a['change_pct']);
        });
    }
}
?>
<!DOCTYPE html>
<html>
<head>
    <title><?= h($pageTitle) ?></title>
    <style>
        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: #f4f7fb;
            color: #1f2937;
        }
        .container {
            max-width: 1100px;
            margin: 30px auto;
            padding: 0 16px;
        }
        .top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 16px;
        }
        .back {
            text-decoration: none;
            color: #1d4ed8;
            font-size: 14px;
            font-weight: bold;
        }
        .card {
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px 14px;
            border-bottom: 1px solid #e5e7eb;
            text-align: left;
            white-space: nowrap;
            font-size: 14px;
        }
        th {
            background: #f8fafc;
            color: #334155;
        }
        .positive { color: #059669; }
        .negative { color: #dc2626; }
        .muted { color: #6b7280; font-size: 13px; }
        .symbol-link { color: #1d4ed8; text-decoration: none; font-weight: bold; }
        .symbol-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
<div class="container">
    <div class="top">
        <div>
            <h2 style="margin:0 0 4px;"><?= h($pageTitle) ?></h2>
            <div class="muted">Simple scanner view. You can attach live market API data next.</div>
        </div>
        <a class="back" href="dashboard.php">Back to Dashboard</a>
    </div>

    <div class="card">
        <table>
            <thead>
            <?php if ($type === 'sector'): ?>
                <tr>
                    <th>Sector</th>
                    <th>No. of Stocks</th>
                    <th>Change %</th>
                </tr>
            <?php else: ?>
                <tr>
                    <th>Symbol</th>
                    <th>Exchange</th>
                    <th>Last Price</th>
                    <th>Change %</th>
                    <th>P&L</th>
                </tr>
            <?php endif; ?>
            </thead>
            <tbody>
            <?php if (empty($rows)): ?>
                <tr>
                    <td colspan="5">No data available.</td>
                </tr>
            <?php else: ?>
                <?php foreach ($rows as $row): ?>
                    <?php if ($type === 'sector'): ?>
                        <?php $c = (float) $row['change']; ?>
                        <tr>
                            <td><?= h($row['name']) ?></td>
                            <td><?= h($row['stocks']) ?></td>
                            <td class="<?= $c >= 0 ? 'positive' : 'negative' ?>"><?= formatAmount($c) ?>%</td>
                        </tr>
                    <?php else: ?>
                        <?php $ch = (float) $row['change_pct']; ?>
                        <?php $pnl = (float) $row['pnl']; ?>
                        <tr>
                            <td>
                                <a class="symbol-link" href="chart.php?exchange=<?= h($row['exchange']) ?>&symbol=<?= h($row['symbol']) ?>">
                                    <?= h($row['symbol']) ?>
                                </a>
                            </td>
                            <td><?= h($row['exchange']) ?></td>
                            <td>Rs <?= formatAmount($row['last_price']) ?></td>
                            <td class="<?= $ch >= 0 ? 'positive' : 'negative' ?>"><?= formatAmount($ch) ?>%</td>
                            <td class="<?= $pnl >= 0 ? 'positive' : 'negative' ?>">Rs <?= formatAmount($pnl) ?></td>
                        </tr>
                    <?php endif; ?>
                <?php endforeach; ?>
            <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
</body>
</html>
