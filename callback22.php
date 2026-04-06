<?php

$api_key = "3vfw0fydhmodthee";
$api_secret = "avpk1exkvzzb7cc3gjzzzk8y3rc0a6ry";

$request_token = $_GET['request_token'];

$checksum = hash("sha256", $api_key.$request_token.$api_secret);

$post_data = array(
    "api_key"=>$api_key,
    "request_token"=>$request_token,
    "checksum"=>$checksum
);

$ch = curl_init();

curl_setopt($ch, CURLOPT_URL, "https://api.kite.trade/session/token");
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($post_data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
/* ADD THESE TWO LINES */
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

$response = curl_exec($ch);
$error = curl_error($ch);

if ($error) {
    echo "CURL Error: " . $error;
} else {
    // echo "API Response: " . $response . "\n";
}

echo $response;
?>