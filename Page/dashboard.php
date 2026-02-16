<?php
$API_URL = 'http://192.168.1.62:3000/api/countries';

$data = [];
$error = null;
$totalIps = 0;
$countryCount = 0;

try {
    $response = file_get_contents($API_URL);
    if ($response === false) {
        throw new Exception('Failed to fetch data');
    }
    $json = json_decode($response, true);
    $allData = $json['data'] ?? [];
    $countryCount = count($allData);
    foreach ($allData as $row) {
        $totalIps += $row['count'] ?? 0;
    }
    // Top 10 only
    $data = array_slice($allData, 0, 10);
} catch (Exception $e) {
    $error = $e->getMessage();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BanTracker Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e5e5e5;
      min-height: 100vh;
      padding: 2rem;
    }

    .container {
      max-width: 600px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #a78bfa;
      margin-bottom: 0.25rem;
    }

    .subtitle {
      font-size: 0.875rem;
      color: #888;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #1a1a1a;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    }

    th {
      background: #7c3aed;
      color: white;
      font-weight: 500;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.75rem 1rem;
      text-align: left;
    }

    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #2a2a2a;
      font-size: 0.875rem;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: #252525;
    }

    .percentage-cell {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .bar {
      flex: 1;
      height: 6px;
      background: #333;
      border-radius: 3px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #7c3aed, #a78bfa);
      border-radius: 3px;
    }

    .percentage-value {
      min-width: 3.5rem;
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: #a78bfa;
    }

    .error {
      text-align: center;
      padding: 3rem;
      color: #f87171;
    }

    .stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
      color: #888;
    }

    .stat-value {
      font-weight: 600;
      color: #a78bfa;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>BanTracker</h1>
      <p class="subtitle">Banned IPs by Country</p>
    </header>

    <div class="stats">
      <div>Total IPs: <span class="stat-value"><?= number_format($totalIps) ?></span></div>
      <div>Countries: <span class="stat-value"><?= $countryCount ?></span></div>
    </div>

    <?php if ($error): ?>
      <div class="error">Failed to load data. Is the API running?</div>
    <?php else: ?>
      <table>
        <thead>
          <tr>
            <th>Country</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($data as $row): ?>
          <tr>
            <td><?= htmlspecialchars($row['country'] ?? 'Unknown') ?></td>
            <td>
              <div class="percentage-cell">
                <div class="bar">
                  <div class="bar-fill" style="width: <?= $row['percentage'] ?>%"></div>
                </div>
                <span class="percentage-value"><?= number_format($row['percentage'], 1) ?>%</span>
              </div>
            </td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    <?php endif; ?>
  </div>
</body>
</html>
