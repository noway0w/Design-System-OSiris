# OSiris Design System

A modular, distributed Design System for the OSiris ecosystem. This system provides a consistent set of UI components, typography, and theming (Light/Dark mode) designed for modern web interfaces. It features specialized components for Video Playback, Dashboards, Weather visualization, and 3D/Map interactions.

## 🚀 Quick Start

### CDN Usage
The fastest way to get started is by including the compiled CSS in your project's `<head>`.

```html
<!-- Use jsDelivr for a reliable CDN -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/noway0w/Design-System-OSiris@main/osiris.css" />
```

### Local Installation
To host the assets yourself or contribute to the system:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/noway0w/Design-System-OSiris.git
    ```
2.  **Include the CSS:**
    Link to the local `osiris.css` file in your HTML.
    ```html
    <link rel="stylesheet" href="path/to/Design-System-OSiris/osiris.css" />
    ```

---

## 📂 File Structure

The project is organized to be modular. You can import the full system via `osiris.css` or individual components as needed.

```
Design-System-OSiris/
├── osiris.css              # Main entry point (imports everything)
├── css/
│   ├── variables.css       # Design tokens (Colors, Spacing, Typography)
│   ├── typography.css      # Font definitions (@font-face for Parkinsans)
│   ├── reset.css           # Modern CSS reset
│   └── components/         # Modular component styles
│       ├── core-actions.css
│       ├── dashboard.css
│       ├── weather.css
│       ├── video-player.css
│       ├── map-3d.css
│       ├── feedback.css
│       └── navigation.css
├── weather_icons/          # SVG icons for weather components
├── visuals-for-tiles/      # Background assets for dashboard tiles
└── logo-OSiris/            # Official brand logos
```

---

## 🎨 Theming & Customization

The system relies heavily on **CSS Variables** defined in `css/variables.css`.

### Color Palette
The brand colors are available as variables. These automatically adapt when Dark Mode is active.

| Color Name | Variable | Light Mode (Hex) | Dark Mode (Hex) |
| :--- | :--- | :--- | :--- |
| **Primary (Ocean)** | `--primary-color` | `#03588C` | `#03588C` |
| **Background** | `--bg-color` | `#f8f9fa` | `#141414` |
| **Surface** | `--surface-color` | `#ffffff` | `#181818` |
| **Text Main** | `--text-color` | `#212529` | `#e9ecef` |
| **Text Secondary** | `--text-secondary` | `#5E778C` | `#5E778C` |

### Dark Mode
The system supports both automatic (system preference) and manual dark mode.

**Automatic:**
The system uses `@media (prefers-color-scheme: dark)` by default.

**Manual Toggle:**
Add `data-theme="dark"` or `data-theme="light"` to the `<html>` tag.

```javascript
// JavaScript to toggle theme
const root = document.documentElement;
root.setAttribute('data-theme', 'dark'); // Force Dark Mode
```

**Adaptive Assets:**
Logos and Icons automatically adjust their brightness/color in Light Mode to ensure visibility against light backgrounds, while reverting to their native white in Dark Mode using CSS filters.

---

## 🧩 Components

### 1. Core Actions

**Primary Button**
```html
<button class="btn-primary">Action</button>
<button class="btn-primary gradient">Gradient Action</button>
```

**Animated Toggle (Toggle 3)**
A custom SVG-animated toggle switch.
```html
<div class="checkbox-wrapper-44">
  <label class="toggleButton">
    <input type="checkbox">
    <div>
      <svg viewBox="1 4 37 37">
        <path d="M14,24 L21,31 L39.7428882,11.5937758 C35.2809627,6.53125861 30.0333333,4 24,4 C12.95,4 4,12.95 4,24 C4,35.05 12.95,44 24,44 C35.05,44 44,35.05 44,24 C44,19.3 42.5809627,15.1645919 39.7428882,11.5937758" transform="translate(-2.000000, -2.000000)"></path>
      </svg>
    </div>
  </label>
</div>
```

### 2. Dashboard Tiles

Modular cards for building dashboards.

**Weather Tile**
Includes specific slots for icons (Temperature, Humidity).
```html
<div class="weather-tile">
  <div class="weather-header">Location</div>
  <div class="weather-main-visual">
    <div class="weather-icon-large">
      <img src="weather_icons/partly_cloudy_day_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg" style="width:100%; height:100%;">
    </div>
  </div>
  <!-- Metrics Row -->
  <div class="weather-metrics">
    <div class="weather-metric-item">
      <span class="weather-metric-label">Temp</span>
      <div class="weather-metric-value-row">
        <img src="weather_icons/device_thermostat_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg" class="weather-metric-icon">
        <span>24°C</span>
      </div>
    </div>
  </div>
</div>
```

**User Profile Tile**
Full-bleed background image with status indicator.
```html
<div class="user-profile-tile" style="background-image: url('visuals-for-tiles/Oslo_tile_5.png'); background-size: cover;">
  <div class="user-status-header">
    <span class="user-status-text">Online</span>
    <div class="user-status-dot"></div>
  </div>
  <div class="user-name">John Doe</div>
</div>
```

### 3. Weather Icons
A comprehensive set of 23 weather condition icons is located in `weather_icons/`.
*   **Path:** `weather_icons/icon_name.svg`
*   **Class:** Use `.weather-icon-svg` for the grid view or `.weather-metric-icon` for small inline metrics.
*   **Note:** These icons adapt color based on the active theme.

---

## 🛠 Best Practices

1.  **Typography**: The system uses **Parkinsans** as a variable font. Ensure `typography.css` is loaded to access the font family.
2.  **Responsiveness**:
    *   Dashboard tiles use `min-width` to reflow naturally.
    *   Tables and lists have specific mobile optimizations.
3.  **Accessibility**:
    *   Use semantic HTML (`<button>`, `<header>`, `<section>`).
    *   Colors are chosen to maintain contrast ratios in both Light and Dark modes.

---

## 📄 License

This project is licensed under the terms of the included LICENSE file.
