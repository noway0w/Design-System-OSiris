<?php
/**
 * OSiris Country Name → ISO 3166-1 alpha-2 code mapping
 * Used by city-image-batch.php for renaming city,country.png to City-CountryCode.png
 */

if (!function_exists('countryToIso')) {
    function countryToIso(string $name): string {
        static $map = null;
        if ($map === null) {
            $map = getCountryCodeMap();
        }
        $key = strtolower(trim(str_replace(['-', '_'], ' ', $name)));
        $key = preg_replace('/\s+/', ' ', $key);
        if ($key === '') return 'XX';
        if (isset($map[$key])) return $map[$key];
        $compact = preg_replace('/\s+/', '', $key);
        if (strlen($compact) >= 2) {
            return strtoupper(substr($compact, 0, 2));
        }
        return 'XX';
    }

    function getCountryCodeMap(): array {
        return [
            'afghanistan' => 'AF', 'albania' => 'AL', 'algeria' => 'DZ', 'andorra' => 'AD', 'angola' => 'AO',
            'antigua and barbuda' => 'AG', 'argentina' => 'AR', 'armenia' => 'AM', 'australia' => 'AU',
            'austria' => 'AT', 'azerbaijan' => 'AZ', 'bahamas' => 'BS', 'bahrain' => 'BH', 'bangladesh' => 'BD',
            'barbados' => 'BB', 'belarus' => 'BY', 'belgium' => 'BE', 'belize' => 'BZ', 'benin' => 'BJ',
            'bhutan' => 'BT', 'bolivia' => 'BO', 'bosnia and herzegovina' => 'BA', 'bosnia' => 'BA',
            'botswana' => 'BW', 'brazil' => 'BR', 'brunei' => 'BN', 'bulgaria' => 'BG', 'burkina faso' => 'BF',
            'burundi' => 'BI', 'cabo verde' => 'CV', 'cape verde' => 'CV', 'cambodia' => 'KH',
            'cameroon' => 'CM', 'canada' => 'CA', 'central african republic' => 'CF', 'chad' => 'TD',
            'chile' => 'CL', 'china' => 'CN', 'colombia' => 'CO', 'comoros' => 'KM', 'congo' => 'CG',
            'costa rica' => 'CR', 'croatia' => 'HR', 'cuba' => 'CU', 'cyprus' => 'CY', 'czech republic' => 'CZ',
            'czechia' => 'CZ', 'denmark' => 'DK', 'djibouti' => 'DJ', 'dominica' => 'DM',
            'dominican republic' => 'DO', 'ecuador' => 'EC', 'egypt' => 'EG', 'el salvador' => 'SV',
            'equatorial guinea' => 'GQ', 'eritrea' => 'ER', 'estonia' => 'EE', 'eswatini' => 'SZ',
            'swaziland' => 'SZ', 'ethiopia' => 'ET', 'fiji' => 'FJ', 'finland' => 'FI', 'france' => 'FR',
            'gabon' => 'GA', 'gambia' => 'GM', 'georgia' => 'GE', 'germany' => 'DE', 'ghana' => 'GH',
            'greece' => 'GR', 'grenada' => 'GD', 'guatemala' => 'GT', 'guinea' => 'GN', 'guinea bissau' => 'GW',
            'guyana' => 'GY', 'haiti' => 'HT', 'honduras' => 'HN', 'hungary' => 'HU', 'iceland' => 'IS',
            'india' => 'IN', 'indonesia' => 'ID', 'iran' => 'IR', 'iraq' => 'IQ', 'ireland' => 'IE',
            'israel' => 'IL', 'italy' => 'IT', 'jamaica' => 'JM', 'japan' => 'JP', 'jordan' => 'JO',
            'kazakhstan' => 'KZ', 'kenya' => 'KE', 'kiribati' => 'KI', 'north korea' => 'KP',
            'south korea' => 'KR', 'korea' => 'KR', 'kuwait' => 'KW', 'kyrgyzstan' => 'KG', 'laos' => 'LA',
            'latvia' => 'LV', 'lebanon' => 'LB', 'lesotho' => 'LS', 'liberia' => 'LR', 'libya' => 'LY',
            'liechtenstein' => 'LI', 'lithuania' => 'LT', 'luxembourg' => 'LU', 'madagascar' => 'MG',
            'malawi' => 'MW', 'malaysia' => 'MY', 'maldives' => 'MV', 'mali' => 'ML', 'malta' => 'MT',
            'marshall islands' => 'MH', 'mauritania' => 'MR', 'mauritius' => 'MU', 'mexico' => 'MX',
            'micronesia' => 'FM', 'moldova' => 'MD', 'monaco' => 'MC', 'mongolia' => 'MN',
            'montenegro' => 'ME', 'morocco' => 'MA', 'mozambique' => 'MZ', 'myanmar' => 'MM',
            'burma' => 'MM', 'namibia' => 'NA', 'nauru' => 'NR', 'nepal' => 'NP', 'netherlands' => 'NL',
            'holland' => 'NL', 'new zealand' => 'NZ', 'nicaragua' => 'NI', 'niger' => 'NE',
            'nigeria' => 'NG', 'north macedonia' => 'MK', 'macedonia' => 'MK', 'norway' => 'NO',
            'oman' => 'OM', 'pakistan' => 'PK', 'palau' => 'PW', 'palestine' => 'PS', 'panama' => 'PA',
            'papua new guinea' => 'PG', 'paraguay' => 'PY', 'peru' => 'PE', 'philippines' => 'PH',
            'poland' => 'PL', 'portugal' => 'PT', 'qatar' => 'QA', 'romania' => 'RO', 'russia' => 'RU',
            'rwanda' => 'RW', 'saint kitts and nevis' => 'KN', 'saint lucia' => 'LC',
            'saint vincent and the grenadines' => 'VC', 'samoa' => 'WS', 'san marino' => 'SM',
            'sao tome and principe' => 'ST', 'saudi arabia' => 'SA', 'senegal' => 'SN', 'serbia' => 'RS',
            'seychelles' => 'SC', 'sierra leone' => 'SL', 'singapore' => 'SG', 'slovakia' => 'SK',
            'slovenia' => 'SI', 'solomon islands' => 'SB', 'somalia' => 'SO', 'south africa' => 'ZA',
            'south sudan' => 'SS', 'spain' => 'ES', 'sri lanka' => 'LK', 'sudan' => 'SD', 'suriname' => 'SR',
            'sweden' => 'SE', 'switzerland' => 'CH', 'syria' => 'SY', 'taiwan' => 'TW', 'tajikistan' => 'TJ',
            'tanzania' => 'TZ', 'thailand' => 'TH', 'timor leste' => 'TL', 'east timor' => 'TL',
            'togo' => 'TG', 'tonga' => 'TO', 'trinidad and tobago' => 'TT', 'tunisia' => 'TN',
            'turkey' => 'TR', 'türkiye' => 'TR', 'turkmenistan' => 'TM', 'tuvalu' => 'TV',
            'uganda' => 'UG', 'ukraine' => 'UA', 'united arab emirates' => 'AE', 'uae' => 'AE',
            'united kingdom' => 'GB', 'uk' => 'GB', 'great britain' => 'GB', 'england' => 'GB',
            'united states' => 'US', 'usa' => 'US', 'united states of america' => 'US', 'america' => 'US',
            'us' => 'US', 'uruguay' => 'UY', 'uzbekistan' => 'UZ', 'vanuatu' => 'VU',
            'vatican city' => 'VA', 'venezuela' => 'VE', 'vietnam' => 'VN', 'viet nam' => 'VN',
            'yemen' => 'YE', 'zambia' => 'ZM', 'zimbabwe' => 'ZW',
        ];
    }
}
