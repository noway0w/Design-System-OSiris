/* OSiris Location Service - IP (default) and GPS */

const LocationService = {
  currentLocation: null,
  currentIP: null,

  async getIPLocation() {
    /* ipinfo.io first: HTTPS support, reliable. ip-api free tier has no HTTPS (403) and rate limits */
    try {
      const res = await fetch('https://ipinfo.io/json');
      const data = await res.json();
      const [lat, lng] = data.loc ? data.loc.split(',').map(Number) : [];
      if (lat && lng) {
        this.currentLocation = { lat, lng, city: data.city, country: data.country, source: 'ip' };
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
        this.currentLocation = { lat: data.lat, lng: data.lon, city: data.city, country: data.country, source: 'ip' };
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
  }
};

window.LocationService = LocationService;
