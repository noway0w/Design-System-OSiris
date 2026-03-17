# Corintis CAD AI Assistant Panel — Specification

This document describes the CAD AI Assistant floating panel in the Corintis 3D CAD Explorer. Use it when modifying, extending, or debugging the AI chat interface.

**File:** `public_html/corintis/index.html`  
**Panel ID:** `ai`  
**Default width:** 460px (overrides base 16rem for this panel)  
**Related spec:** [CORINTIS_FLOATING_PANELS_SPEC.md](CORINTIS_FLOATING_PANELS_SPEC.md)

---

## 1. Overview

The CAD AI Assistant panel is a chat interface that lets users ask questions about the current CAD scene. Messages are sent to the OpenClaw API (`../api/openclaw-chat.php`), which returns AI-generated replies. The panel uses the same floating panel infrastructure as other panels (drag, resize, close) and follows the project's glassmorphism design system.

---

## 2. Layout Structure

The AI panel body uses a three-section flex layout:

```
┌─────────────────────────────────────┐
│ Sticky Header (avatar, title, btns)  │
├─────────────────────────────────────┤
│ Chat Window (flex-1, scrollable)    │
│   • Welcome message                  │
│   • AI bubbles (left)                │
│   • User bubbles (right)             │
├─────────────────────────────────────┤
│ Sticky Footer (input + send)         │
└─────────────────────────────────────┘
```

---

## 3. Section 1: Sticky Header

**Position:** Top of panel body, `sticky top-0 z-10`, `backdrop-blur-md`, `border-b`.

**Left side:**
- **AI Avatar:** Circular `size-10`, `border-2 border-primary`, `bg-white/10 dark:bg-slate-800/30`
- **Status dot:** `absolute bottom-0 right-0 size-2.5 rounded-full bg-green-500 ring-2 ring-white/20 dark:ring-slate-800/50`
- **Title:** "AI Assistant" (bold)
- **Subtitle:** "Always active" (small, gray)

**Right side:** None. Search and More options buttons have been removed.

---

## 4. Section 2: Chat Window

**Container:** `#corintis-ai-messages`, `flex-1 overflow-y-auto space-y-4 p-3 pr-2 min-h-0`

### AI Message Bubble (left-aligned)

- Max width 85%
- Avatar: circular `size-8`, `border border-primary/30`, robot icon (`smart_toy`)
- Bubble: `bg-primary/10 dark:bg-primary/20 backdrop-blur-md`, `rounded-xl rounded-bl-none`, `px-5 py-3.5`
- Timestamp: `text-[10px] text-slate-400` below bubble

### User Message Bubble (right-aligned)

- Max width 85%, `ml-auto`
- Bubble: `bg-primary text-white`, `shadow-lg shadow-primary/20`, `rounded-xl rounded-br-none`, `px-5 py-3.5`
- Avatar: circular `size-8`, person icon, on right
- Timestamp: `text-[10px] text-slate-400` below bubble

### Welcome Message

Static message in `aiBodyHtml`: "Ask questions about the current CAD scene. I will include basic context (selection, camera, layers) with each message." Uses same AI bubble styling.

---

## 5. Section 3: Sticky Footer

**Input area:**
- Container: `bg-white/10 dark:bg-slate-800/30 backdrop-blur-md`, `rounded-xl`, `border border-white/20 dark:border-slate-600/50`, `focus-within:border-primary/50`
- Textarea: `#corintis-ai-input`, placeholder "Ask me anything..."
- Send button: `size-12 rounded-xl`, `bg-primary`, `shadow-lg shadow-primary/20`, `active:scale-95`

**Disabled / removed:**
- Action chips (Summarize document, Draft an email, Search files) — not present
- Attach file button — not present
- Microphone button — not present

---

## 6. Design System

### Glass Effect

The AI panel uses the same glassmorphism as other panels:

- **Wrapper:** `bg-white/10 dark:bg-slate-800/30 backdrop-blur-md`
- **Input container:** Same glass treatment
- **Borders:** `border-white/20 dark:border-slate-600/50`

### Primary Color

Uses the project primary color (`#1392ec`) via Tailwind `primary`:

- Avatar border, icons, bubbles, send button
- `bg-primary`, `text-primary`, `border-primary`, `shadow-primary/20`

### Dark Mode

All elements support `html.dark` / `.dark` with appropriate variants (`dark:bg-slate-800/30`, `dark:text-slate-100`, etc.).

---

## 7. Element IDs (for wiring)

| ID | Purpose |
|----|---------|
| `#corintis-ai-messages` | Scrollable container for chat messages |
| `#corintis-ai-form` | Form wrapping input and send button |
| `#corintis-ai-input` | Textarea for user input |
| `#corintis-ai-status` | Status text (e.g. "Contacting OpenClaw...", errors) |

---

## 8. JavaScript Behavior

### `appendMessage(role, text)`

Appends a message row to `#corintis-ai-messages`:

- **role:** `'user'` or `'assistant'`
- **text:** Message content (HTML-escaped)
- Timestamp: `new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`
- Scrolls to bottom after append

### Form Submit

- Prevents default, trims input
- Calls `appendMessage('user', value)`
- Calls `sendAiMessage(value)` → `../api/openclaw-chat.php`
- On success: `appendMessage('assistant', reply)`
- Status shown in `#corintis-ai-status`

### `sendAiMessage(message)`

- POST to `../api/openclaw-chat.php` with `{ message, context: getCurrentCadContext() }`
- Returns `data.reply` on success
- Sets status text on error

---

## 9. Body Wrapper Class

The AI panel uses `corintis-ai-body-wrapper` (set in `createFloatingPanel` when `id === 'ai'`). The panel body has `padding: 0` for the AI panel so the inner content controls its own spacing.

---

## 10. Dependencies

- Tailwind CSS (`tailwind.css`) — `primary`, glass utilities
- Material Symbols Outlined (Google Fonts) — `smart_toy`, `person`, `send`
- `ThemeService` for dark mode
- OpenClaw API: `../api/openclaw-chat.php`
