<?php
include 'kite.php';

if (!isset($_SESSION['access_token'])) {
    header("Location: index.php");
    exit;
}

date_default_timezone_set('Asia/Kolkata');

function h($value) {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function formatAmount($value) {
    return number_format((float) $value, 2);
}

function getCandleValue(array $candles, string $time, int $index) {
    foreach ($candles as $candle) {
        $stamp = $candle[0] ?? '';
        if (strpos($stamp, $time) !== false) {
            return (float) ($candle[$index] ?? 0);
        }
    }
    return null;
}

$nifty50Symbols = [
    'ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK',
    'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV', 'BEL', 'BHARTIARTL',
    'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL',
    'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HEROMOTOCO',
    'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDUSINDBK', 'INFY',
    'ITC', 'JIOFIN', 'JSWSTEEL', 'KOTAKBANK', 'LT',
    'M&M', 'MARUTI', 'NESTLEIND', 'NTPC', 'ONGC',
    'POWERGRID', 'RELIANCE', 'SBILIFE', 'SHRIRAMFIN', 'SBIN',
    'SUNPHARMA', 'TATACONSUM', 'TATAMOTORS', 'TATASTEEL', 'TCS',
    'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO'
];

$today = date('Y-m-d');
$selectedDate = $_GET['date'] ?? $today;
$currentTime = date('H:i');
$isAfterScanTime = ($selectedDate < $today) || ($selectedDate === $today && $currentTime >= '09:21');

$scanRows = [];
$errorRows = [];

if ($isAfterScanTime) {
    $instruments = [];
    foreach ($nifty50Symbols as $symbol) {
        $instruments[] = 'NSE:' . $symbol;
    }

    $quoteEndpoint = 'quote?i=' . implode('&i=', array_map('rawurlencode', $instruments));
    $quoteResponse = kiteRequest($quoteEndpoint);
    $quoteData = $quoteResponse['data'] ?? [];

    $from = rawurlencode($selectedDate . ' 09:15:00');
    $to = rawurlencode($selectedDate . ' 09:22:00');

    foreach ($nifty50Symbols as $symbol) {
        $instrumentKey = 'NSE:' . $symbol;
        $instrumentToken = $quoteData[$instrumentKey]['instrument_token'] ?? null;

        if (empty($instrumentToken)) {
            $errorRows[] = ['symbol' => $symbol, 'reason' => 'Instrument token not found'];
            continue;
        }

        $history = kiteRequest("instruments/historical/{$instrumentToken}/minute?from={$from}&to={$to}");
        $candles = $history['data']['candles'] ?? [];

        if (empty($candles)) {
            $errorRows[] = ['symbol' => $symbol, 'reason' => 'No minute candles found'];
            continue;
        }

        $close920 = getCandleValue($candles, '09:20:00', 4);
        $open921 = getCandleValue($candles, '09:21:00', 1);

        if ($close920 === null || $open921 === null) {
            $errorRows[] = ['symbol' => $symbol, 'reason' => 'Missing 09:20 or 09:21 candle'];
            continue;
        }

        if ($close920 > $open921) {
            $scanRows[] = [
                'symbol' => $symbol,
                'close_920' => $close920,
                'open_921' => $open921,
                'gap' => $close920 - $open921
            ];
        }
    }

    usort($scanRows, function ($a, $b) {
        return $b['gap'] <=> $a['gap'];
    });
}
?>
<!DOCTYPE html>
<html>
<head>
    <title>NIFTY50 9:21 Scan</title>
    <style>
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f4f7fb; color: #1f2937; }
        .container { max-width: 1100px; margin: 28px auto; padding: 0 16px; }
        .top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
        .back { text-decoration: none; color: #1d4ed8; font-weight: bold; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 8px 24px rgba(15,23,42,0.06); padding: 14px; margin-bottom: 14px; }
        .muted { color: #6b7280; font-size: 13px; }
        .btn { border: 1px solid #dbeafe; background: #eff6ff; color: #1d4ed8; border-radius: 8px; padding: 8px 12px; font-size: 13px; text-decoration: none; }
        .btn:hover { background: #dbeafe; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 11px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; white-space: nowrap; font-size: 14px; }
        th { background: #f8fafc; color: #334155; }
        .positive { color: #059669; font-weight: bold; }
        .warning { color: #b45309; }
        .inline-form { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
        input[type="date"] { border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 10px; }
        button { border: 1px solid #dbeafe; background: #2563eb; color: #fff; border-radius: 8px; padding: 8px 12px; cursor: pointer; }
        .symbol-link { color: #1d4ed8; text-decoration: none; font-weight: bold; }
        .symbol-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
<div class="container">
    <div class="top">
        <div>
            <h2 style="margin:0;">NIFTY 50 Scan - 09:20 Close > 09:21 Open</h2>
            <div class="muted">Date: <?= h($selectedDate) ?> | Run after 09:21 AM IST</div>
            <form class="inline-form" method="get">
                <label for="date">Scan date:</label>
                <input type="date" id="date" name="date" value="<?= h($selectedDate) ?>">
                <button type="submit">Run Scan</button>
            </form>
        </div>
        <a class="back" href="dashboard.php">Back to Dashboard</a>
    </div>

    <?php if (!$isAfterScanTime): ?>
        <div class="card warning">
            Scan is available after <strong>09:21 AM IST</strong> for today's date.
        </div>
    <?php else: ?>
        <div class="card">
            <strong>Matched Stocks:</strong> <?= count($scanRows) ?> / <?= count($nifty50Symbols) ?>
        </div>

        <div class="card" style="overflow-x:auto;">
            <table>
                <thead>
                    <tr>
                        <th>Symbol</th>
                        <th>09:20 Close</th>
                        <th>09:21 Open</th>
                        <th>Difference (Close - Open)</th>
                    </tr>
                </thead>
                <tbody>
                <?php if (empty($scanRows)): ?>
                    <tr>
                        <td colspan="4">No matching stock found for selected date/time condition.</td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($scanRows as $row): ?>
                        <tr>
                            <td>
                                <a class="symbol-link" href="chart.php?exchange=NSE&symbol=<?= h($row['symbol']) ?>&date=<?= h($selectedDate) ?>">
                                    <?= h($row['symbol']) ?>
                                </a>
                            </td>
                            <td><?= formatAmount($row['close_920']) ?></td>
                            <td><?= formatAmount($row['open_921']) ?></td>
                            <td class="positive"><?= formatAmount($row['gap']) ?></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
                </tbody>
            </table>
        </div>

        <?php if (!empty($errorRows)): ?>
            <div class="card" style="overflow-x:auto;">
                <div class="muted" style="margin-bottom:8px;">Skipped/Errors (<?= count($errorRows) ?>)</div>
                <table>
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($errorRows as $err): ?>
                            <tr>
                                <td><?= h($err['symbol']) ?></td>
                                <td><?= h($err['reason']) ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    <?php endif; ?>
</div>
</body>
</html>
