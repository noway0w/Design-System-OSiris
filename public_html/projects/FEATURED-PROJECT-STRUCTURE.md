# Featured Project Structure – Gemini Agent Reference

This document describes the structure of a **Featured Project** in the OSiris map application. Featured projects appear as Points of Interest (POIs) on the map; when selected, they open a content panel with editorial copy, media gallery, and lightbox viewer.

---

## 1. High-Level Architecture

```
public_html/
├── projects/
│   ├── [ProjectSlug]/           # e.g. "Mazars", "Blue Ocean sailing", "Diasys"
│   │   ├── content.json        # Editorial content + galleryMetadata
│   │   ├── content/            # Media folder (images + videos)
│   │   │   ├── ImageName.jpg
│   │   │   ├── AnotherImage.png
│   │   │   └── video.mp4
│   │   └── [BrandIcon].png     # POI marker icon (in project root)
│   └── FEATURED-PROJECT-STRUCTURE.md
├── points-of-interest.php      # POI list API (brand → slug mapping via DB)
├── projects-content.php        # Project content API (?brand=... or ?slug=...)
└── js/map-app.js               # Renders POI panel, gallery, lightbox
```

**Brand ↔ Slug mapping:** The POI DB stores `brand` (e.g. "Biosens Numerique"). `projects-content.php` maps brand → folder slug via `$slugMap` (e.g. "Biosens Numerique" → "Diasys"). The project folder name is the **slug**.

---

## 2. Folder Structure

| Path | Purpose |
|------|---------|
| `public_html/projects/[Slug]/` | Project root |
| `public_html/projects/[Slug]/content.json` | Editorial content, mission, galleryMetadata, heroImage |
| `public_html/projects/[Slug]/content/` | Images (.jpg, .jpeg, .png, .gif, .webp) and videos (.mp4, .webm) |
| `public_html/projects/[Slug]/[Icon].png` | Icon shown on map marker (referenced in POI DB) |

**Media scanning:** `projects-content.php` recursively scans the `content/` folder (and optional subfolders, e.g. for Autodesk). File order depends on `scandir()`. Images with `hero` in the filename are preferred as hero; otherwise `heroImage` in `content.json` overrides.

---

## 3. content.json Schema

All keys are optional except those required for a complete panel. Projects without `content.json` still show the gallery from scanned media.

| Key | Type | Description |
|-----|------|-------------|
| `featuredLabel` | string | Badge label (e.g. "Brand Redesign") |
| `heroStatement` | string | Main title under brand name |
| `quote` | string | Pull quote text |
| `quoteAuthor` | string | Quote attribution |
| `quoteRole` | string | Quote author role |
| `tags` | string[] | Tags for the panel |
| `heroCaption` | string | Caption under hero image |
| `heroSubcaption` | string | Secondary caption |
| `mission` | string[] | Mission bullets |
| `process` | string[] | Process bullets |
| `kpi` | string[] | KPI / results bullets |
| `keyFigures` | object[] | Key facts – `{ label, value, icon }` – e.g. `{ "label": "Project Year", "value": "2016", "icon": "calendar_today" }` |
| `websiteUrl` | string | External link; empty `""` hides the website button |
| `facts` | string[] | Additional facts |
| `intro` | string | Introductory paragraph |
| `heroImage` | string | **Filename** of hero image (e.g. `"Digital Booking Experience.jpg"`). Overrides default hero selection. |
| `galleryMetadata` | array | Per-image descriptions for the lightbox |

### galleryMetadata Structure

Each item maps a **filename** to a **description** shown in the lightbox:

```json
"galleryMetadata": [
  {
    "filename": "Desktop 3D Application.jpg",
    "description": "A high-fidelity 3D digital twin of Diasys medical equipment..."
  },
  {
    "filename": "Tablet UI Experience.png",
    "description": "Responsive tablet view of the 3D application..."
  }
]
```

- `filename`: exact file name (including extension) as stored in `content/`
- `description`: editorial caption shown at the bottom of the lightbox

**Matching:** The frontend extracts the filename from the image URL and looks it up in `galleryMetadata`. If found, it displays the description; otherwise it falls back to a generated label.

---

## 4. Image Viewer (Lightbox)

When a user clicks a gallery **image** thumbnail, a full-screen lightbox opens.

| Element | Purpose |
|---------|---------|
| `#poi-image-overlay` | Full-screen overlay (dark backdrop) |
| `#poi-image-viewer-img` | Displayed image |
| `.poi-media-viewer-caption` | Caption bar at bottom |
| `.poi-media-viewer-caption-text` | Description from `galleryMetadata` or fallback |
| `.poi-viewer-prev` / `.poi-viewer-next` | Navigate between images in the gallery set |

**Behavior:**
- Caption comes from `galleryMetadata[filename].description` when available
- Prev/next buttons cycle through the same images shown in the gallery (up to 6, or 12 for Renault)
- ESC or click outside closes the overlay
- Glassmorphic caption styling (Avenir Next, semi-transparent bar)

---

## 5. Playable Video

Videos (`.mp4`, `.webm`) in `content/` are scanned and returned as `videos[]` by the API.

### Hero Video

- If the project has at least one video, the **first video** can optionally be used as the hero instead of an image
- The hero area displays the video with `autoplay`, `muted`, `loop`, `playsinline`
- This replaces the hero image when `content.videos[0]` exists

### Gallery Video Tiles

- Up to **2 videos** are shown as tiles in the gallery (after images)
- Each tile displays a poster frame (first frame) with a play icon overlay
- Clicking a video tile opens the **video overlay**

### Video Overlay (Full-Screen Player)

| Element | Purpose |
|---------|---------|
| `#poi-video-overlay` | Full-screen overlay (dark backdrop) |
| `#poi-video-player` | `<video>` element with native `controls` |
| `.poi-video-overlay-close` | Close button (top-right) |

**Behavior:**
- Click video tile → `openPOIVideoPlayer(url)` → overlay opens, video loads and autoplays
- Native video controls (play/pause, seek, volume, fullscreen)
- ESC or click outside overlay closes and stops the video
- No `galleryMetadata` for videos—captions apply to images only

### Video Format Support

- **Extensions:** `.mp4`, `.webm`
- Recommended: H.264/MP4 for broad compatibility
- `playsinline` and `crossorigin="anonymous"` used for gallery previews

---

## 6. POI (Points of Interest) Data

POIs are stored in `api/points-of-interest.db` (SQLite). Each row:

| Column | Description |
|--------|--------------|
| `brand` | Display name, used to resolve project slug via `projects-content.php` |
| `location` | Address text |
| `type` | Category (e.g. "Product Work", "Freelance Work") |
| `lat` | Latitude |
| `lng` | Longitude |
| `icon` | Path to icon image (e.g. `projects/Mazars/Mazars.png`) |

**Adding a new featured project:**

1. Create `public_html/projects/[Slug]/` and `content/` folder
2. Add `content.json` with editorial content and `galleryMetadata`
3. Add images/videos to `content/`
4. Add `$slugMap` entry in `projects-content.php` if brand ≠ slug
5. Insert POI row in `points-of-interest.db` (or add migration in `points-of-interest.php`)

**Autodesk Forma multi-location:** This project has two POIs (Autodesk University, Oslo) with different content. Each uses a subfolder and a location-specific content file:
- Autodesk University → `content/Ecosystem Autodesk Appstore in product ESRI/` + `content-ecosystem.json`
- Oslo / Tjuvholmen → `content/Contextual Data and Monetization/` + `content-monetization.json`

---

## 7. API Flow

1. **POI list:** `GET points-of-interest.php` → `[{ id, brand, location, type, lat, lng, icon }, ...]`
2. **Project content:** `GET projects-content.php?brand=[Brand]` (or `?slug=[Slug]`) → merged result:
   - Scanned media: `hero`, `images[]`, `videos[]`
   - Content from `content.json`: `featuredLabel`, `heroStatement`, `quote`, `mission`, `process`, `kpi`, `keyFigures` (Key Facts), `galleryMetadata`, `heroImage`, etc.

`heroImage` is applied after merge: if present, the API selects the matching image from `images[]` and sets `hero` to that URL.

**Media → UI mapping:**
- `hero`: Shown in hero area; if `videos[0]` exists, it can replace the hero as an autoplay video
- `images[]`: Gallery thumbnails; click opens **image lightbox** with `galleryMetadata` captions
- `videos[]`: First 2 shown as gallery tiles; click opens **video overlay** (full-screen player with controls)

---

## 8. Image Naming Conventions

- **Hero:** Either a filename containing `hero` (e.g. `hero-bg-3000-mazars.jpg`) or `heroImage` in `content.json`
- **Gallery:** Use descriptive, editorial-style names (e.g. `Desktop Immersive Application.jpg`, `After Effects HUD Tracking.jpeg`)
- **Extensions:** Preserve original extensions (`.jpg`, `.jpeg`, `.png`, etc.)
- **galleryMetadata:** `filename` must exactly match the file on disk

---

## 9. Summary Checklist for a New Featured Project

- [ ] `public_html/projects/[Slug]/content.json` with required keys + `galleryMetadata`
- [ ] `public_html/projects/[Slug]/content/` with images (and optional videos)
- [ ] `heroImage` in `content.json` if hero is not a `hero*`-prefixed file
- [ ] `galleryMetadata` entries for all images that should show descriptions in the lightbox
- [ ] Optional: `.mp4` or `.webm` videos for playable gallery tiles and/or video hero
- [ ] POI row with correct `brand`, `lat`, `lng`, `icon`
- [ ] `$slugMap` in `projects-content.php` if `brand` ≠ folder slug
