<?php
include 'kite.php';

if (!isset($_SESSION['access_token'])) {
    header("Location: index.php");
    exit;
}

// Example 1: Get Profile
$profile = kiteRequest("user/profile");

// Example 2: Get Margins
$margins = kiteRequest("user/margins");

// Example 3: Get Holdings
$holdings = kiteRequest("portfolio/holdings");

$profileData = $profile['data'] ?? [];
$marginData = $margins['data'] ?? [];
$equityData = $marginData['equity'] ?? [];
$commodityData = $marginData['commodity'] ?? [];
$holdingsData = $holdings['data'] ?? [];

function h($value) {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function formatAmount($value) {
    return number_format((float) $value, 2);
}

$equityAvailable = (float) ($equityData['available']['live_balance'] ?? 0);
$equityUtilised = (float) ($equityData['utilised']['debits'] ?? 0);
$totalPnl = 0.0;
$totalHoldingValue = 0.0;

foreach ($holdingsData as $item) {
    $quantity = (float) ($item['quantity'] ?? 0);
    $lastPrice = (float) ($item['last_price'] ?? 0);
    $pnl = (float) ($item['pnl'] ?? 0);
    $totalHoldingValue += ($quantity * $lastPrice);
    $totalPnl += $pnl;
}
?>

<!DOCTYPE html>
<html>
<head>
    <title>Dashboard</title>
    <style>
        :root {
            --bg: #f4f7fb;
            --card: #ffffff;
            --text: #1f2937;
            --muted: #6b7280;
            --primary: #2563eb;
            --border: #e5e7eb;
            --success: #059669;
            --danger: #dc2626;
            --shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: var(--bg);
            color: var(--text);
        }

        .container {
            max-width: 1100px;
            margin: 30px auto;
            padding: 0 16px;
        }

        .topbar {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 12px;
            box-shadow: var(--shadow);
            padding: 18px 20px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }

        .topbar h1 {
            margin: 0;
            font-size: 22px;
        }

        .actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 12px;
        }

        .btn {
            display: inline-block;
            border: 1px solid #dbeafe;
            background: #eff6ff;
            color: #1d4ed8;
            text-decoration: none;
            font-size: 13px;
            padding: 8px 12px;
            border-radius: 8px;
            font-weight: bold;
        }

        .btn:hover {
            background: #dbeafe;
        }

        .muted {
            color: var(--muted);
            font-size: 13px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 14px;
            margin-bottom: 20px;
        }

        .card {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 12px;
            box-shadow: var(--shadow);
            padding: 16px;
        }

        .label {
            color: var(--muted);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin-bottom: 8px;
        }

        .value {
            font-size: 24px;
            font-weight: bold;
        }

        .positive {
            color: var(--success);
        }

        .negative {
            color: var(--danger);
        }

        .section-title {
            margin: 26px 0 10px;
            font-size: 18px;
        }

        .table-wrap {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 12px;
            box-shadow: var(--shadow);
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 12px 14px;
            border-bottom: 1px solid var(--border);
            text-align: left;
            white-space: nowrap;
            font-size: 14px;
        }

        th {
            background: #f8fafc;
            color: #334155;
        }

        tr:last-child td {
            border-bottom: 0;
        }

        .pill {
            background: #eff6ff;
            color: #1d4ed8;
            border-radius: 999px;
            padding: 3px 10px;
            font-size: 12px;
            display: inline-block;
            margin-right: 6px;
            margin-bottom: 6px;
        }
    </style>
</head>
<body>
<div class="container">
    <div class="topbar">
        <div>
            <h1><?= h($profileData['user_name'] ?? 'Trader Dashboard') ?></h1>
            <div class="muted">
                <?= h($profileData['user_id'] ?? '-') ?> | <?= h($profileData['broker'] ?? '-') ?> | <?= h($profileData['email'] ?? '-') ?>
            </div>
            <div class="actions">
                <a class="btn" href="scanner.php?type=sector">Sector</a>
                <a class="btn" href="scanner.php?type=5min-breakout">5 Min Breakout</a>
                <a class="btn" href="nifty50_921.php">NIFTY50 9:21 Scan</a>
                <a class="btn" href="scanner.php?type=top-gainers">Top Gainers</a>
                <a class="btn" href="scanner.php?type=top-losers">Top Losers</a>
            </div>
        </div>
        <div class="muted">Session active</div>
    </div>

    <div class="grid">
        <div class="card">
            <div class="label">Equity Available</div>
            <div class="value">Rs <?= formatAmount($equityAvailable) ?></div>
        </div>
        <div class="card">
            <div class="label">Holdings Value</div>
            <div class="value">Rs <?= formatAmount($totalHoldingValue) ?></div>
        </div>
        <div class="card">
            <div class="label">Total P&L</div>
            <div class="value <?= $totalPnl >= 0 ? 'positive' : 'negative' ?>">
                Rs <?= formatAmount($totalPnl) ?>
            </div>
        </div>
        <div class="card">
            <div class="label">Equity Utilised</div>
            <div class="value">Rs <?= formatAmount($equityUtilised) ?></div>
        </div>
    </div>

    <h3 class="section-title">Profile</h3>
    <div class="card">
        <div><strong>Short name:</strong> <?= h($profileData['user_shortname'] ?? '-') ?></div>
        <div><strong>User type:</strong> <?= h($profileData['user_type'] ?? '-') ?></div>
        <div style="margin-top:10px;">
            <strong>Exchanges:</strong><br>
            <?php foreach (($profileData['exchanges'] ?? []) as $exchange): ?>
                <span class="pill"><?= h($exchange) ?></span>
            <?php endforeach; ?>
        </div>
        <div style="margin-top:10px;">
            <strong>Products:</strong><br>
            <?php foreach (($profileData['products'] ?? []) as $product): ?>
                <span class="pill"><?= h($product) ?></span>
            <?php endforeach; ?>
        </div>
    </div>

    <h3 class="section-title">Margins</h3>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Segment</th>
                    <th>Enabled</th>
                    <th>Net</th>
                    <th>Live Balance</th>
                    <th>Opening Balance</th>
                    <th>Intraday Payin</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Equity</td>
                    <td><?= !empty($equityData['enabled']) ? 'Yes' : 'No' ?></td>
                    <td>Rs <?= formatAmount($equityData['net'] ?? 0) ?></td>
                    <td>Rs <?= formatAmount($equityData['available']['live_balance'] ?? 0) ?></td>
                    <td>Rs <?= formatAmount($equityData['available']['opening_balance'] ?? 0) ?></td>
                    <td>Rs <?= formatAmount($equityData['available']['intraday_payin'] ?? 0) ?></td>
                </tr>
                <tr>
                    <td>Commodity</td>
                    <td><?= !empty($commodityData['enabled']) ? 'Yes' : 'No' ?></td>
                    <td>Rs <?= formatAmount($commodityData['net'] ?? 0) ?></td>
                    <td>Rs <?= formatAmount($commodityData['available']['live_balance'] ?? 0) ?></td>
                    <td>Rs <?= formatAmount($commodityData['available']['opening_balance'] ?? 0) ?></td>
                    <td>Rs <?= formatAmount($commodityData['available']['intraday_payin'] ?? 0) ?></td>
                </tr>
            </tbody>
        </table>
    </div>

    <h3 class="section-title">Holdings</h3>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Symbol</th>
                    <th>Exchange</th>
                    <th>Quantity</th>
                    <th>Avg Price</th>
                    <th>Last Price</th>
                    <th>Value</th>
                    <th>P&L</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($holdingsData)): ?>
                    <tr>
                        <td colspan="7">No holdings found.</td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($holdingsData as $item): ?>
                        <?php
                            $qty = (float) ($item['quantity'] ?? 0);
                            $avg = (float) ($item['average_price'] ?? 0);
                            $ltp = (float) ($item['last_price'] ?? 0);
                            $value = $qty * $ltp;
                            $pnl = (float) ($item['pnl'] ?? 0);
                        ?>
                        <tr>
                            <td><?= h($item['tradingsymbol'] ?? '-') ?></td>
                            <td><?= h($item['exchange'] ?? '-') ?></td>
                            <td><?= h($item['quantity'] ?? 0) ?></td>
                            <td>Rs <?= formatAmount($avg) ?></td>
                            <td>Rs <?= formatAmount($ltp) ?></td>
                            <td>Rs <?= formatAmount($value) ?></td>
                            <td class="<?= $pnl >= 0 ? 'positive' : 'negative' ?>">Rs <?= formatAmount($pnl) ?></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

</body>
</html>