<?php
include 'config.php';

$login_url = "https://kite.zerodha.com/connect/login?v=3&api_key=" . API_KEY;

header("Location: $login_url");
exit;