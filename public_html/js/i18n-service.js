/**
 * OSiris i18n Service - Localization with i18next, localStorage persistence
 * Requires: i18next, i18next-http-backend, i18next-browser-languagedetector (loaded before this script)
 */
(function (global) {
  const STORAGE_KEY = 'osiris_lang';
  const SUPPORTED_LANGS = ['en'];

  function getStoredLanguage() {
    return 'en';
  }

  function getBrowserLanguage() {
    return null;
  }

  function getInitialLanguage() {
    return 'en';
  }

  function setStoredLanguage(lng) {
    try {
      localStorage.setItem(STORAGE_KEY, lng);
    } catch (_) {}
  }

  function applyTranslations() {
    if (typeof global.i18next === 'undefined') return;
    const i18n = global.i18next;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const translation = i18n.t(key);
      if (translation && translation !== key) {
        var tag = el.tagName && el.tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          el.textContent = translation;
        }
      }
      const attrKey = el.getAttribute('data-i18n-attr');
      if (attrKey) {
        const attrs = attrKey.split(',').map(function (a) { return a.trim(); });
        attrs.forEach(function (attr) {
          const val = i18n.t(key);
          if (val && val !== key) el.setAttribute(attr, val);
        });
      }
    });
  }

  var DEFAULT_RESOURCES = (function () {
    var mapEn = {"loadingProject":"Loading project…","visitWebsite":"Visit Website","pleaseEnterName":"Please enter your name.","somethingWrongTryAgain":"Something went wrong. Please try again.","featuredProject":"Featured Project","ourMission":"Our Mission","keyFigures":"Key Figures","process":"Process","kpi":"KPI","pictureWorth":"A picture worth a thousand words","discoverMore":"Discover more","theme":"Theme","light":"Light","dark":"Dark","system":"System","guillaumeResume":"Guillaume's Resume","designSystem":"Design System","cityImageProcessor":"City Image Processor","locationActive":"Location Active","discoverMyWorld":"Discover my world","techEnthusiasts":"Tech enthusiasts","featuredProjects":"Featured Projects","mapData":"Map Data","widgets":"Widgets","linkedInRecommendations":"LinkedIn Recommendations","addWeatherWidget":"Add weather Widget","addStockWidget":"Add Stock Widget","discoverMoreTooltip":"Discover More","tooltipDesc":"Click the arrow below to open your toolkit. This section holds all your essential features, including different map tiles, interactive widgets, and user management tools.","addStockWidgetTitle":"Add Stock Widget","addWeatherWidgetTitle":"Add Weather Widget","searchSymbolPlaceholder":"Search symbol (e.g. AAPL, MSFT)...","add":"Add","addingWidget":"Adding widget...","byLocation":"By location","byCity":"By city","useCurrentLocation":"Use your current GPS or IP location","validate":"Validate","searchCityPlaceholder":"Search city...","success":"Success","featureNotImplemented":"Feature not yet implemented","gatePlaceholder":"create your profile name here","continue":"Continue","mapboxTokenRequired":"Mapbox Token Required","mapboxTokenDesc":"Enter your Mapbox Access Token to view the map.","mapboxTokenPlaceholder":"Paste your Mapbox Access Token (pk....)","loadMap":"Load Map"};
    var mapFr = {"loadingProject":"Chargement du projet…","visitWebsite":"Visiter le site","pleaseEnterName":"Veuillez entrer votre nom.","somethingWrongTryAgain":"Une erreur s'est produite. Veuillez réessayer.","featuredProject":"Projet mis en avant","ourMission":"Notre mission","keyFigures":"Chiffres clés","process":"Processus","kpi":"Indicateurs","pictureWorth":"Une image vaut mille mots","discoverMore":"Découvrir plus","theme":"Thème","light":"Clair","dark":"Sombre","system":"Système","guillaumeResume":"CV de Guillaume","designSystem":"Système de design","cityImageProcessor":"Processeur d'images","locationActive":"Localisation active","discoverMyWorld":"Découvrez mon univers","techEnthusiasts":"Passionnés de tech","featuredProjects":"Projets mis en avant","mapData":"Données carte","widgets":"Widgets","linkedInRecommendations":"Recommandations LinkedIn","addWeatherWidget":"Ajouter widget météo","addStockWidget":"Ajouter widget Bourse","discoverMoreTooltip":"Découvrir plus","tooltipDesc":"Cliquez sur la flèche ci-dessous pour ouvrir votre boîte à outils. Cette section contient toutes les fonctionnalités essentielles : tuiles de carte, widgets interactifs et gestion des utilisateurs.","addStockWidgetTitle":"Ajouter widget Bourse","addWeatherWidgetTitle":"Ajouter widget météo","searchSymbolPlaceholder":"Rechercher un symbole (ex. AAPL, MSFT)...","add":"Ajouter","addingWidget":"Ajout du widget...","byLocation":"Par localisation","byCity":"Par ville","useCurrentLocation":"Utilisez votre position GPS ou IP actuelle","validate":"Valider","searchCityPlaceholder":"Rechercher une ville...","success":"Succès","featureNotImplemented":"Fonctionnalité pas encore implémentée","gatePlaceholder":"créez votre nom de profil ici","continue":"Continuer","mapboxTokenRequired":"Jeton Mapbox requis","mapboxTokenDesc":"Entrez votre jeton d'accès Mapbox pour afficher la carte.","mapboxTokenPlaceholder":"Collez votre jeton Mapbox (pk....)","loadMap":"Charger la carte"};
    var en = {"header":{"title":"Design System","subtitle":"A modular design system for modern web interfaces.","theme":{"light":"Light","dark":"Dark"}},"mapApp":{"title":"OSiris Map App","description":"Access the map with location by IP (default) and GPS. Enter your name to get started.","openMap":"Open Map App"},"resume":{"title":"Resume","description":"Guillaume Lassiat – Senior UI/UX Designer. View online or download as PDF.","viewResume":"View Resume"},"quickStart":{"title":"Quick Start","includeCss":"Include the CSS in your project:","note":"Note: For production, consider using a CDN like jsDelivr or GitHub Pages once deployed."},"colourPalette":{"title":"Colour Palette","midnightNavy":"Midnight Navy","slateBlue":"Slate Blue","oceanBlue":"Ocean Blue","deepTeal":"Deep Teal","bronzeEarth":"Bronze Earth","darkGreyBg":"Dark Grey BG","darkModeBg":"Dark Mode BG","lightTitle":"Light Title"},"coreActions":{"title":"Core Actions","primaryButton":"Primary Button","solidButton":"Solid Button","gradientButton":"Gradient Button","iconButton":"Icon Button","toggleSwitches":"Toggle Switches","toggle1":"Toggle 1","toggle2":"Toggle 2","toggle3":"Toggle 3","toggle3Usage":"Toggle 3 Usage","toggle3Desc":"The animated toggle requires specific HTML structure and dependency on core-actions.css."},"videoPlayer":{"title":"Video Player","videoContent":"Video Content"},"dashboard":{"title":"Dashboard","metricTile":"Metric Tile (KPI)","totalRevenue":"Total Revenue","activeUsers":"Active Users","filterChips":"Filter Chips","statusActive":"Status: Active","roleAdmin":"Role: Admin","dateToday":"Date: Today","tiles":"Tiles","currentSettings":"Current settings","recordNewGuest":"Record new guest","securityMode":"Security mode","addNewUser":"Add new user","currentOsirisState":"Current OSiris state","ipDetected":"IP detected","fpsClient":"FPS client","ramInUsage":"RAM in usage","serverLoad":"Server load","currentLocalWeather":"Current local weather","temperature":"Temperature","humidity":"Humidity","memoryOfTheDay":"Memory of the Day","userDetected":"User detected","settings":"Settings","systemPrefs":"System & Prefs","gradientCard":"Gradient Card","adaptsToTheme":"Adapts to theme","tilesUsage":"Tiles Usage","tilesUsageDesc":"The dashboard tiles are modular components designed for various content types.","contentTileTitle":"Content Tile (Image Background)","contentTileDesc":"Use for immersive content like \"Memory of the Day\". The image acts as a full-bleed background.","titleHere":"Title Here","userProfileTile":"User Profile Tile","userProfileDesc":"Designed for user status. Set the background image via inline styles or a custom class."},"weatherIcons":{"title":"Weather Icons","usage":"Usage:","clearDay":"Clear Day","cloudy":"Cloudy","coolToDry":"Cool to Dry","cyclone":"Cyclone","thermostat":"Thermostat","flood":"Flood","foggy":"Foggy","humidityLow":"Humidity Low","humidityMid":"Humidity Mid","humidityPct":"Humidity %","mist":"Mist","moonStars":"Moon Stars","partlyCloudy":"Partly Cloudy","rainyHeavy":"Rainy Heavy","rainyLight":"Rainy Light","rainySnow":"Rainy Snow","snowing":"Snowing","snowingHeavy":"Snowing Heavy","sunny":"Sunny","thunderstorm":"Thunderstorm","hail":"Hail","mix":"Mix","snowy":"Snowy"},"map3d":{"title":"3D / Map Components","mapboxConfig":"Mapbox Configuration","mapboxDesc":"Enter your Mapbox Access Token to render the map.","mapboxPlaceholder":"Paste your Mapbox Access Token (pk....)","loadMap":"Load Map","tokenNote":"Token will be saved locally for this session."},"mapAppComponents":{"title":"Map App Components","desc":"UI components from the OSiris Map App: POI panel, bottom tiles, recommendations, tooltips.","glassPanel":"Glass Panel / POI Content Panel","bottomSectionTiles":"Bottom Section Tiles","discoverMore":"Discover more","linkedInTray":"LinkedIn Recommendations Tray","skeletonLoader":"Skeleton Loader","discoverMoreTooltip":"Discover More Tooltip","discoverMoreDesc":"Explore the toolkit and featured projects on the map."},"feedbackNav":{"title":"Feedback & Navigation","toasts":"Toasts","operationSuccess":"Operation successful!","somethingWrong":"Something went wrong.","searchPlaceholder":"Search..."}};
    var fr = {"header":{"title":"Système de design","subtitle":"Un système de design modulaire pour les interfaces web modernes.","theme":{"light":"Clair","dark":"Sombre"}},"mapApp":{"title":"Application Carte OSiris","description":"Accédez à la carte par localisation IP (par défaut) et GPS. Entrez votre nom pour commencer.","openMap":"Ouvrir la carte"},"resume":{"title":"CV","description":"Guillaume Lassiat – Designer UI/UX senior. Voir en ligne ou télécharger en PDF.","viewResume":"Voir le CV"},"quickStart":{"title":"Démarrage rapide","includeCss":"Incluez le CSS dans votre projet :","note":"Note : Pour la production, envisagez d'utiliser un CDN comme jsDelivr ou GitHub Pages une fois déployé."},"colourPalette":{"title":"Palette de couleurs","midnightNavy":"Bleu nuit","slateBlue":"Bleu ardoise","oceanBlue":"Bleu océan","deepTeal":"Sarcelle profond","bronzeEarth":"Bronze terre","darkGreyBg":"Gris foncé fond","darkModeBg":"Fond mode sombre","lightTitle":"Titre clair"},"coreActions":{"title":"Actions principales","primaryButton":"Bouton principal","solidButton":"Bouton plein","gradientButton":"Bouton dégradé","iconButton":"Bouton icône","toggleSwitches":"Interrupteurs","toggle1":"Interrupteur 1","toggle2":"Interrupteur 2","toggle3":"Interrupteur 3","toggle3Usage":"Utilisation interrupteur 3","toggle3Desc":"L'interrupteur animé nécessite une structure HTML spécifique et la dépendance core-actions.css."},"videoPlayer":{"title":"Lecteur vidéo","videoContent":"Contenu vidéo"},"dashboard":{"title":"Tableau de bord","metricTile":"Tuile indicateur (KPI)","totalRevenue":"Revenu total","activeUsers":"Utilisateurs actifs","filterChips":"Filtres","statusActive":"Statut : Actif","roleAdmin":"Rôle : Admin","dateToday":"Date : Aujourd'hui","tiles":"Tuiles","currentSettings":"Paramètres actuels","recordNewGuest":"Enregistrer un nouvel invité","securityMode":"Mode sécurité","addNewUser":"Ajouter un utilisateur","currentOsirisState":"État actuel OSiris","ipDetected":"IP détectée","fpsClient":"FPS client","ramInUsage":"RAM utilisée","serverLoad":"Charge serveur","currentLocalWeather":"Météo locale actuelle","temperature":"Température","humidity":"Humidité","memoryOfTheDay":"Souvenir du jour","userDetected":"Utilisateur détecté","settings":"Paramètres","systemPrefs":"Système et préférences","gradientCard":"Carte dégradé","adaptsToTheme":"S'adapte au thème","tilesUsage":"Utilisation des tuiles","tilesUsageDesc":"Les tuiles du tableau de bord sont des composants modulaires pour différents types de contenu.","contentTileTitle":"Tuile contenu (image de fond)","contentTileDesc":"Pour du contenu immersif comme « Souvenir du jour ». L'image sert de fond pleine largeur.","titleHere":"Titre ici","userProfileTile":"Tuile profil utilisateur","userProfileDesc":"Pour le statut utilisateur. Définissez l'image de fond via les styles inline ou une classe personnalisée."},"weatherIcons":{"title":"Icônes météo","usage":"Utilisation :","clearDay":"Ciel dégagé","cloudy":"Nuageux","coolToDry":"Frais à sec","cyclone":"Cyclone","thermostat":"Thermostat","flood":"Inondation","foggy":"Brouillard","humidityLow":"Humidité basse","humidityMid":"Humidité moyenne","humidityPct":"Humidité %","mist":"Brouillard","moonStars":"Lune et étoiles","partlyCloudy":"Partiellement nuageux","rainyHeavy":"Pluie forte","rainyLight":"Pluie légère","rainySnow":"Pluie et neige","snowing":"Neige","snowingHeavy":"Neige abondante","sunny":"Ensoleillé","thunderstorm":"Orage","hail":"Grêle","mix":"Mixte","snowy":"Neigeux"},"map3d":{"title":"Composants 3D / Carte","mapboxConfig":"Configuration Mapbox","mapboxDesc":"Entrez votre jeton d'accès Mapbox pour afficher la carte.","mapboxPlaceholder":"Collez votre jeton Mapbox (pk....)","loadMap":"Charger la carte","tokenNote":"Le jeton sera enregistré localement pour cette session."},"mapAppComponents":{"title":"Composants carte","desc":"Composants UI de l'application carte OSiris : panneau POI, tuiles, recommandations, infobulles.","glassPanel":"Panneau verre / contenu POI","bottomSectionTiles":"Tuiles de section","discoverMore":"Découvrir plus","linkedInTray":"Recommandations LinkedIn","skeletonLoader":"Chargement squelette","discoverMoreTooltip":"Infobulle Découvrir plus","discoverMoreDesc":"Explorez la boîte à outils et les projets mis en avant sur la carte."},"feedbackNav":{"title":"Feedback et navigation","toasts":"Notifications","operationSuccess":"Opération réussie !","somethingWrong":"Une erreur s'est produite.","searchPlaceholder":"Rechercher..."}};
    return { en: { common: en, map: mapEn }, fr: { common: fr, map: mapFr } };
  })();

  function init() {
    if (typeof global.i18next === 'undefined') {
      console.warn('i18next not loaded. Add i18next scripts before i18n-service.js');
      return;
    }

    const i18n = global.i18next;
    const HttpBackend = global.i18nextHttpBackend || global.HttpBackend;

    if (HttpBackend) i18n.use(HttpBackend);
    /* Use our own getInitialLanguage() for detection; skip LanguageDetector to avoid conflicts */

    var initialLng = getInitialLanguage();

    var opts = {
      lng: initialLng,
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_LANGS,
      ns: ['common', 'map'],
      defaultNS: 'common',
      interpolation: { escapeValue: false },
      resources: DEFAULT_RESOURCES
    };
    if (HttpBackend) {
      opts.backend = { loadPath: 'locales/{{lng}}/{{ns}}.json' };
    }

    i18n.init(opts).then(function () {
      applyTranslations();
      i18n.on('languageChanged', function () {
        setStoredLanguage(i18n.language);
        if (document.documentElement) document.documentElement.setAttribute('lang', i18n.language);
        applyTranslations();
        try {
          document.dispatchEvent(new CustomEvent('osiris-lang-change', { detail: { lang: i18n.language } }));
        } catch (_) {}
      });
    });
  }

  function changeLanguage(lng) {
    if (typeof global.i18next !== 'undefined' && SUPPORTED_LANGS.includes(lng)) {
      global.i18next.changeLanguage(lng);
    }
  }

  function t(key) {
    return typeof global.i18next !== 'undefined' ? global.i18next.t(key) : key;
  }

  const I18nService = {
    init,
    changeLanguage,
    t,
    applyTranslations,
    getStoredLanguage,
    setStoredLanguage,
    SUPPORTED_LANGS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18nService;
  } else {
    global.I18nService = I18nService;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : this);
