<?php
include 'kite.php';

if (!isset($_SESSION['access_token'])) {
    header("Location: index.php");
    exit;
}

function h($value) {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

$exchange = $_GET['exchange'] ?? 'NSE';
$symbol = $_GET['symbol'] ?? '';
$scanDate = $_GET['date'] ?? date('Y-m-d');

$exchange = preg_replace('/[^A-Z]/', '', strtoupper($exchange));
$symbol = preg_replace('/[^A-Z0-9&\-.]/', '', strtoupper($symbol));

if ($exchange === '') {
    $exchange = 'NSE';
}

$tvSymbol = $symbol !== '' ? "{$exchange}:{$symbol}" : "NSE:NIFTY";
?>
<!DOCTYPE html>
<html>
<head>
    <title>Chart - <?= h($tvSymbol) ?></title>
    <style>
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f4f7fb; color: #1f2937; }
        .container { max-width: 1200px; margin: 24px auto; padding: 0 16px; }
        .top { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 8px 24px rgba(15,23,42,0.06); padding: 12px; }
        .back { text-decoration: none; color: #1d4ed8; font-weight: bold; }
        .muted { color: #6b7280; font-size: 13px; }
        #tvchart { height: 640px; }
    </style>
</head>
<body>
<div class="container">
    <div class="top">
        <div>
            <h2 style="margin:0 0 4px;">Chart: <?= h($tvSymbol) ?></h2>
            <div class="muted">Scan Date: <?= h($scanDate) ?> | Click other symbols from list to switch chart</div>
        </div>
        <a class="back" href="javascript:history.back()">Back</a>
    </div>

    <div class="card">
        <div id="tvchart"></div>
    </div>
</div>

<script src="https://s3.tradingview.com/tv.js"></script>
<script>
new TradingView.widget({
    "width": "100%",
    "height": 640,
    "symbol": "<?= h($tvSymbol) ?>",
    "interval": "1",
    "timezone": "Asia/Kolkata",
    "theme": "light",
    "style": "1",
    "locale": "en",
    "toolbar_bg": "#f1f3f6",
    "enable_publishing": false,
    "allow_symbol_change": true,
    "container_id": "tvchart"
});
</script>
</body>
</html>
