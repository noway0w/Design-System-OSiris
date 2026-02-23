<?php
/**
 * OSiris config - copy to config.php and set your keys
 * Add config.php to .gitignore
 */
return [
    'GEMINI_API_KEY' => getenv('GEMINI_API_KEY') ?: 'YOUR_GEMINI_API_KEY_HERE',
    'ALPHAVANTAGE_API_KEY' => getenv('ALPHAVANTAGE_API_KEY') ?: 'YOUR_ALPHAVANTAGE_API_KEY',
];
