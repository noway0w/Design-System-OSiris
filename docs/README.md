# OSiris – Documentation Index

Documentation for the OSiris platform. For AI agents: follow [AGENT_RULES.md](AGENT_RULES.md) for all non-trivial work.

**3D CAD Explorer:** Deployed at `public_html/disable/` (URL `/disable/index.html`). Import formats include IGES, STEP, DXF, IFC, 3DM, DWG, and **GLB** (binary glTF via Three.js `GLTFLoader`, including Draco-compressed meshes). Docs that say “Corintis” refer to the same app; `corintis-*` in code is legacy CSS/DOM naming.

---

## Structure

| File | Purpose |
|------|---------|
| [AGENT_RULES.md](AGENT_RULES.md) | Agent rules: plan mode, subagents, verification, task management, lessons. |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | Project definition, architecture, Corintis, map app, conventions. |
| [GEMINI_AGENT_SPECS.md](GEMINI_AGENT_SPECS.md) | Technical specs: API, database, integration, code review. |
| [CORINTIS_FLOATING_PANELS_SPEC.md](CORINTIS_FLOATING_PANELS_SPEC.md) | Floating panel system: structure, functions, interactions. |
| [CORINTIS_AI_PANEL_SPEC.md](CORINTIS_AI_PANEL_SPEC.md) | CAD AI Assistant panel: layout, styling, element IDs, behavior. |
| [CORINTIS_FEEDBACK_AND_TOASTS.md](CORINTIS_FEEDBACK_AND_TOASTS.md) | Toast-only feedback: success, error, info; no error overlay. |
| [PLATFORM_AUTH_AND_SSO.md](PLATFORM_AUTH_AND_SSO.md) | App host login, dashboard, PHP session, signed `OSIRIS_PLATFORM_AUTH` cookie, Google SSO, env file, nginx; **shared top bar** (`public_html/js/platform-shell-topbar.js`, §8–9). |
| [tasks/todo.md](tasks/todo.md) | Plans with checkable items. Write here before implementation. |
| [tasks/lessons.md](tasks/lessons.md) | Lessons learned. Update after corrections. |

---

## Task Management (per AGENT_RULES)

1. **Plan first** → `docs/tasks/todo.md`
2. **Verify** → Check in before starting
3. **Track** → Mark items complete as you go
4. **Document** → Add review section to todo.md
5. **Capture lessons** → Update `docs/tasks/lessons.md` after corrections

---

*End of Docs Index*
