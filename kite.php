<?php
include 'config.php';

function kiteRequest($endpoint, $method = 'GET', $postData = []) {
    $access_token = $_SESSION['access_token'];

    $url = "https://api.kite.trade/" . $endpoint;

    $headers = [
        "X-Kite-Version: 3",
        "Authorization: token " . API_KEY . ":" . $access_token
    ];

    $ch = curl_init();

    if ($method == 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
    }

    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    /* ADD THESE TWO LINES FOR SSL VERIFICATION*/
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true);
}