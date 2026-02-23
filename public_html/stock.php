<?php
/**
 * OSiris Stock API - Proxy to Yahoo Finance (no API key required)
 * - action=search: Symbol search
 * - action=quote: Real-time quote (price, change)
 * - action=chart: Daily candles (last 1 month)
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate');

$action = $_GET['action'] ?? '';
$q = trim($_GET['q'] ?? $_GET['symbol'] ?? '');
$symbol = strtoupper($q);

if ($action === 'search') {
    if (strlen($q) < 1) {
        http_response_code(400);
        echo json_encode(['error' => 'q required']);
        exit;
    }
    $url = 'https://query1.finance.yahoo.com/v1/finance/search?' . http_build_query([
        'q' => $q,
        'quotesCount' => 10,
        'newsCount' => 0
    ]);
} elseif ($action === 'quote' || $action === 'chart') {
    if ($symbol === '') {
        http_response_code(400);
        echo json_encode(['error' => 'symbol required']);
        exit;
    }
    // Yahoo chart API returns both quote (meta) and historical data
    $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . rawurlencode($symbol) . '?' . http_build_query([
        'interval' => '1d',
        'range' => '1mo'
    ]);
} else {
    http_response_code(400);
    echo json_encode(['error' => 'action must be search, quote, or chart']);
    exit;
}

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]);
$raw = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($raw === false || $code >= 400) {
    http_response_code(502);
    echo json_encode(['error' => 'Stock service unavailable']);
    exit;
}

$data = json_decode($raw, true);
if ($data === null) {
    http_response_code(502);
    echo json_encode(['error' => 'Invalid response from stock service']);
    exit;
}

if ($action === 'search') {
    $quotes = $data['quotes'] ?? [];
    $results = array_slice(array_map(function ($m) {
        return [
            'symbol' => $m['symbol'] ?? '',
            'description' => $m['longname'] ?? $m['shortname'] ?? $m['symbol'] ?? '',
            'type' => $m['quoteType'] ?? 'EQUITY'
        ];
    }, array_filter($quotes, function ($m) {
        return !empty($m['symbol']) && ($m['quoteType'] ?? '') !== 'CRYPTOCURRENCY';
    })), 0, 8);
    echo json_encode(['results' => $results]);
} elseif ($action === 'quote') {
    $result = $data['chart']['result'][0] ?? null;
    if ($result === null) {
        echo json_encode(['price' => null, 'change' => null, 'changePercent' => null]);
        exit;
    }
    $meta = $result['meta'] ?? [];
    $price = isset($meta['regularMarketPrice']) ? (float)$meta['regularMarketPrice'] : null;
    $prevClose = isset($meta['previousClose']) ? (float)$meta['previousClose'] : (float)($meta['chartPreviousClose'] ?? 0);
    $change = ($price !== null && $prevClose > 0) ? $price - $prevClose : null;
    $changePercent = ($change !== null && $prevClose > 0) ? round(($change / $prevClose) * 100, 2) : null;

    $quote = $result['indicators']['quote'][0] ?? [];
    $opens = $quote['open'] ?? [];
    $highs = $quote['high'] ?? [];
    $lows = $quote['low'] ?? [];
    $closes = $quote['close'] ?? [];
    $lastIdx = count($closes) - 1;

    echo json_encode([
        'price' => $price,
        'open' => ($lastIdx >= 0 && isset($opens[$lastIdx])) ? (float)$opens[$lastIdx] : null,
        'high' => ($lastIdx >= 0 && isset($highs[$lastIdx])) ? (float)$highs[$lastIdx] : null,
        'low' => ($lastIdx >= 0 && isset($lows[$lastIdx])) ? (float)$lows[$lastIdx] : null,
        'prevClose' => $prevClose,
        'change' => $change,
        'changePercent' => $changePercent
    ]);
} elseif ($action === 'chart') {
    $result = $data['chart']['result'][0] ?? null;
    if ($result === null) {
        echo json_encode(['data' => []]);
        exit;
    }
    $timestamps = $result['timestamp'] ?? [];
    $quote = $result['indicators']['quote'][0] ?? [];
    $closes = $quote['close'] ?? [];
    $points = [];
    $len = min(count($timestamps), count($closes));
    for ($i = 0; $i < $len; $i++) {
        $c = (float)($closes[$i] ?? 0);
        if ($c > 0) {
            $points[] = ['t' => (int)$timestamps[$i], 'c' => $c];
        }
    }
    $points = array_slice($points, -20); // last 20 days
    echo json_encode(['data' => $points]);
}
