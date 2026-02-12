# Design-System-OSiris

A modular, distributed Design System for the OSiris ecosystem. This system provides a consistent set of UI components, typography, and theming (Light/Dark mode) designed for modern web interfaces, including specialized components for Video Playback, Dashboards, and 3D/Map interactions.

## Quick Start

Include the main CSS file in your project's `<head>`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/noway0w/Design-System-OSiris@main/osiris.css" />
```

## Features

- **Typography**: Built on the **Parkinsans** variable font family.
- **Theming**: Native Light and Dark mode support.
  - Automatically respects system preference (`prefers-color-scheme`).
  - Manual toggle via `data-theme="dark"` or `data-theme="light"` on the `<html>` tag.
- **Responsiveness**: Mobile-first components with touch-friendly targets on smaller screens.

## Components

The design system is organized into modular categories:

### 1. Core Actions
Essential interactive elements for user input.
- **Primary Button**: Solid fill and Gradient variants. Full width on mobile.
- **Icon Button**: Ghost, Outlined, and Background-blur styles. Includes tooltips on desktop.
- **Toggle Switch**: Binary On/Off controls (Standard and Small sizes).
- **Context Menu**: Desktop popover menu that transforms into a Bottom Sheet on mobile.

### 2. Video Player
Specialized UI for video playback interfaces.
- **Playback Toggle**: Center screen overlay icon.
- **Control Bar**: Gradient overlay for controls.
- **Timeline Scrubber**: Progress bar with buffer indication and hover preview areas.
- **Volume Slider**: Horizontal slider (expands on hover).
- **Video Tile**: Thumbnail representation with hover states for preview and metadata.

### 3. Dashboard
Data visualization and management components.
- **Metric Tile (KPI)**: Display for single data points with trend indicators (up/down) and sparklines.
- **Filter Chip**: Removable tags for active filters. Horizontal scrolling on mobile.
- **Data Grid**: Zebra-striped tables with comfortable density.
- **Date Range Picker**: Calendar selection interface (Dual-pane desktop / Full-screen mobile).

### 4. 3D / Map
Controls for map-based and 3D interfaces.
- **Zoom Widget**: Vertical slider with +/- buttons.
- **Compass / Gizmo**: Rotatable orientation indicator (Click/Tap to reset North).
- **Floating Toolbar**: Glassmorphism dock for tools (Draw, Measure). Collapses to FAB on mobile.
- **Layer Panel**: List of toggleable layers with opacity sliders.
- **Map Pin / Marker**: Location indicators with tooltips/popups.

### 5. Feedback & Navigation
System status and wayfinding.
- **Toast / Snack**: Temporary success/error/info messages. Slide-in animation.
- **Skeleton Loader**: Shimmering placeholders for loading states.
- **Segmented Control**: Tab-like view switcher.
- **Search Input (Omni)**: Global search bar with shortcut hints (Ctrl+K) and suggestions dropdown.

## Usage

### Dark Mode Toggle
To manually toggle the theme, toggle the `data-theme` attribute on the root element:

```javascript
document.documentElement.setAttribute('data-theme', 'dark');
// or
document.documentElement.setAttribute('data-theme', 'light');
```

### Documentation
Open `index.html` to view the full interactive documentation and component demos.
