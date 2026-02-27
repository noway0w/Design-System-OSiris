/* OSiris Location Service - IP (default) and GPS */

function getMapboxToken() {
  if (typeof localStorage !== 'undefined') {
    const t = localStorage.getItem('mapbox_access_token');
    if (t) return t;
  }
  if (typeof window !== 'undefined' && typeof window.MAPBOX_DEFAULT_TOKEN === 'string') {
    return window.MAPBOX_DEFAULT_TOKEN;
  }
  return '';
}

const LocationService = {
  currentLocation: null,
  currentIP: null,

  async reverseGeocode(lat, lng) {
    const token = getMapboxToken();
    if (token) {
      try {
        const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${encodeURIComponent(lng)}&latitude=${encodeURIComponent(lat)}&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Mapbox API error: ' + res.status);
        const data = await res.json();
        const features = data?.features;
        if (features && features.length > 0) {
          const props = features[0]?.properties;
          const ctx = props?.context;
          let city = ctx?.place?.name ?? ctx?.locality?.name ?? ctx?.region?.name ?? ctx?.district?.name ?? null;
          let countryCode = ctx?.country?.country_code ?? null;
          if (!city && props) {
            const ft = props.feature_type;
            if (ft === 'place' || ft === 'locality') city = props.name;
            else if (props.place_formatted) {
              const parts = String(props.place_formatted).split(/,\s*/);
              if (parts.length > 0) city = parts[0].trim() || null;
            }
          }
          const country = countryCode || ctx?.country?.name || null;
          if (city || country) return { city: city || null, country: countryCode || country };
        }
      } catch (e) {
        console.warn('Mapbox reverse geocoding failed:', e);
      }
    }
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'OSiris-MapApp/1.0 (https://app.guillaumelassiat.com)' }
      });
      const data = await res.json();
      const addr = data?.address;
      if (addr) {
        const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.county ?? null;
        const countryCode = (addr.country_code || '').toUpperCase().slice(0, 2);
        if (city || countryCode) return { city, country: countryCode || addr.country || null };
      }
    } catch (e) {
      console.warn('Nominatim reverse geocoding failed:', e);
    }
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`;
      const res = await fetch(url);
      const data = await res.json();
      const city = data?.city ?? data?.locality ?? null;
      const countryCode = (data?.countryCode || '').toUpperCase().slice(0, 2);
      if (city || countryCode) return { city, country: countryCode || data?.countryName || null };
    } catch (e) {
      console.warn('BigDataCloud reverse geocoding failed:', e);
    }
    return null;
  },

  async getIPLocation() {
    /* ipinfo.io first: HTTPS support, reliable. ip-api free tier has no HTTPS (403) and rate limits */
    try {
      const res = await fetch('https://ipinfo.io/json');
      const data = await res.json();
      const [lat, lng] = data.loc ? data.loc.split(',').map(Number) : [];
      if (lat && lng) {
        this.currentLocation = { lat, lng, city: data.city, country: data.country, ip: data.ip, source: 'ip' };
        this.currentIP = data.ip;
        return this.currentLocation;
      }
    } catch (e) {
      console.warn('IP geolocation (ipinfo) failed:', e);
    }
    try {
      const res = await fetch('http://ip-api.com/json/?fields=lat,lon,city,country,query');
      const data = await res.json();
      if (data.lat && data.lon) {
        this.currentLocation = { lat: data.lat, lng: data.lon, city: data.city, country: data.country, ip: data.query, source: 'ip' };
        this.currentIP = data.query;
        return this.currentLocation;
      }
    } catch (e) {
      console.warn('IP geolocation (ip-api) failed:', e);
    }
    return null;
  },

  getGPSLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps' };
          resolve(this.currentLocation);
        },
        (err) => reject(err),
        { enableHighAccuracy: true }
      );
    });
  },

  /** Request the most accurate position: GPS if available, else browser geolocation. */
  getAccurateLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      };
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          this.currentLocation = {
            lat: latitude,
            lng: longitude,
            accuracy,
            source: 'gps'
          };
          try {
            const geo = await this.reverseGeocode(latitude, longitude);
            if (geo) {
              this.currentLocation.city = geo.city;
              this.currentLocation.country = geo.country;
            }
          } catch (_) {}
          resolve(this.currentLocation);
        },
        (err) => reject(err),
        options
      );
    });
  }
};

window.LocationService = LocationService;
