<?php
include 'config.php';

if (!isset($_GET['request_token'])) {
    die("Request token missing");
}

$request_token = $_GET['request_token'];

// Generate checksum
$checksum = hash('sha256', API_KEY . $request_token . API_SECRET);

// API call
$url = "https://api.kite.trade/session/token";

$postfields = [
    "api_key" => API_KEY,
    "request_token" => $request_token,
    "checksum" => $checksum
];

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postfields));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
/* ADD THESE TWO LINES */
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);

if (!isset($data['data']['access_token'])) {
    echo "<pre>";
    print_r($data);
    exit;
}

// Store token
$_SESSION['access_token'] = $data['data']['access_token'];

header("Location: dashboard.php");
exit;