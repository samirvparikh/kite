<?php

$api_key = "3vfw0fydhmodthee";
$access_token = "X3O5eWcyVGImYF672Y1aLfrK7oqbKNnM";

// $url="https://api.kite.trade/user/profile";
$url = "https://api.kite.trade/quote/ltp?i=NSE:NIFTY%2050";
// $url = "https://api.kite.trade/quote/ltp?i=NSE:INFY";

$headers = array(
    "X-Kite-Version: 3",
    "Authorization: token " . $api_key . ":" . $access_token
);

$ch = curl_init();

curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

/* ADD THESE TWO LINES */
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

$result = curl_exec($ch);
$error = curl_error($ch);

if ($error) {
    echo "CURL Error: " . $error;
} else {
    // echo "API Response: " . $response . "\n";
}
echo "<pre>"; print_r(json_decode($result));
