/**
 * Dashboard admin tabs: Super Admin, Team Permissions, Import Files.
 */
(function () {
  function escapeHtml(t) {
    var d = document.createElement("div");
    d.textContent = t;
    return d.innerHTML;
  }

  function api(path, opts) {
    opts = opts || {};
    opts.credentials = "same-origin";
    if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
      opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        return { status: r.status, data: j };
      });
    });
  }

  function showPanel(id) {
    document.querySelectorAll("[data-dash-panel]").forEach(function (el) {
      el.classList.toggle("hidden", el.getAttribute("data-dash-panel") !== id);
    });
    document.querySelectorAll("[data-dash-tab]").forEach(function (btn) {
      btn.classList.toggle("dash-nav-link--active", btn.getAttribute("data-dash-tab") === id);
    });
  }

  function renderSuperAdmin(root) {
    root.innerHTML =
      '<div class="dash-section-head"><div><h3 class="dash-section-title">Super Admin</h3>' +
      '<p class="dash-section-desc">Manage users, roles, and companies.</p></div></div>' +
      '<div class="mt-4 flex flex-wrap gap-2 items-end">' +
      '<label class="text-sm">Search<input type="search" id="admin-q" class="ml-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white/60" placeholder="email or name"/></label>' +
      '<button type="button" id="admin-refresh" class="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm">Refresh</button></div>' +
      '<div class="mt-4 glass-panel rounded-xl p-4">' +
      '<h4 class="text-sm font-semibold mb-2">Promote platform owner to Super Admin</h4>' +
      '<div class="flex flex-wrap gap-2"><input type="email" id="admin-promote-email" class="flex-1 min-w-[12rem] px-3 py-1.5 rounded-lg border" placeholder="owner email"/>' +
      '<button type="button" id="admin-promote-btn" class="px-4 py-1.5 rounded-lg bg-violet-700 text-white text-sm">Promote</button></div>' +
      '<p id="admin-promote-msg" class="text-sm mt-2 text-slate-600"></p></div>' +
      '<div class="mt-6 overflow-x-auto"><table class="w-full text-sm text-left" id="admin-users-table">' +
      '<thead><tr class="border-b"><th class="py-2 pr-2">ID</th><th class="py-2 pr-2">Name</th><th class="py-2 pr-2">Email</th>' +
      '<th class="py-2 pr-2">Status</th><th class="py-2 pr-2">Company</th><th class="py-2 pr-2">Role</th>' +
      '<th class="py-2 pr-2">Auth</th><th class="py-2">Actions</th></tr></thead><tbody></tbody></table></div>' +
      '<p id="admin-status" class="text-sm mt-3 text-slate-600"></p>';

    var state = { roles: [], companies: [] };

    function load() {
      var q = document.getElementById("admin-q").value.trim();
      var url = "/api/iris-admin-users.php?page=1&limit=50" + (q ? "&q=" + encodeURIComponent(q) : "");
      api(url).then(function (res) {
        if (!res.data.ok) {
          document.getElementById("admin-status").textContent = res.data.error || "Failed to load";
          return;
        }
        state.roles = res.data.roles || [];
        state.companies = res.data.companies || [];
        var tbody = document.querySelector("#admin-users-table tbody");
        tbody.innerHTML = "";
        (res.data.users || []).forEach(function (u) {
          var tr = document.createElement("tr");
          tr.className = "border-b border-slate-100";
          var roleOpts = state.roles.map(function (r) {
            return "<option value=\"" + r.id + "\"" + (r.id == u.role_id ? " selected" : "") + ">" + escapeHtml(r.label) + "</option>";
          }).join("");
          var coOpts = "<option value=\"\">—</option>" + state.companies.map(function (c) {
            return "<option value=\"" + c.id + "\"" + (c.id == u.company_id ? " selected" : "") + ">" + escapeHtml(c.name) + "</option>";
          }).join("");
          tr.innerHTML =
            "<td class=\"py-2 pr-2\">" + u.id + "</td>" +
            "<td class=\"py-2 pr-2\">" + escapeHtml(u.name) + "</td>" +
            "<td class=\"py-2 pr-2\">" + escapeHtml(u.email) + "</td>" +
            "<td class=\"py-2 pr-2\">" + escapeHtml(u.account_status) + "</td>" +
            "<td class=\"py-2 pr-2\"><select class=\"admin-co text-xs\" data-uid=\"" + u.id + "\">" + coOpts + "</select></td>" +
            "<td class=\"py-2 pr-2\"><select class=\"admin-role text-xs\" data-uid=\"" + u.id + "\">" + roleOpts + "</select></td>" +
            "<td class=\"py-2 pr-2\">" + escapeHtml(u.auth_provider) + "</td>" +
            "<td class=\"py-2\"><button type=\"button\" class=\"admin-save text-xs text-violet-700 mr-2\" data-uid=\"" + u.id + "\">Save</button>" +
            "<button type=\"button\" class=\"admin-del text-xs text-red-600\" data-uid=\"" + u.id + "\">Delete</button></td>";
          tbody.appendChild(tr);
        });
        document.getElementById("admin-status").textContent =
          "Showing " + (res.data.users || []).length + " of " + (res.data.total || 0);
      });
    }

    root.addEventListener("click", function (e) {
      var save = e.target.closest(".admin-save");
      if (save) {
        var uid = save.getAttribute("data-uid");
        var roleSel = root.querySelector(".admin-role[data-uid=\"" + uid + "\"]");
        var coSel = root.querySelector(".admin-co[data-uid=\"" + uid + "\"]");
        api("/api/iris-admin-users.php", {
          method: "PATCH",
          body: {
            user_id: parseInt(uid, 10),
            role_id: parseInt(roleSel.value, 10),
            company_id: coSel.value === "" ? null : parseInt(coSel.value, 10),
          },
        }).then(function (res) {
          document.getElementById("admin-status").textContent = res.data.ok ? "Saved" : (res.data.error || "Error");
        });
        return;
      }
      var del = e.target.closest(".admin-del");
      if (del && confirm("Soft-delete this user?")) {
        api("/api/iris-admin-users.php", {
          method: "DELETE",
          body: { user_id: parseInt(del.getAttribute("data-uid"), 10) },
        }).then(function () { load(); });
      }
    });

    document.getElementById("admin-refresh").addEventListener("click", load);
    document.getElementById("admin-q").addEventListener("keydown", function (e) {
      if (e.key === "Enter") load();
    });
    document.getElementById("admin-promote-btn").addEventListener("click", function () {
      var email = document.getElementById("admin-promote-email").value.trim();
      api("/api/iris-admin-promote-super-admin.php", { method: "POST", body: { email: email } }).then(function (res) {
        document.getElementById("admin-promote-msg").textContent = res.data.ok ? "Promoted." : (res.data.error || "Failed");
        if (res.data.ok) load();
      });
    });
    load();
  }

  function renderTeam(root) {
    root.innerHTML =
      '<div class="dash-section-head"><div><h3 class="dash-section-title">Team Permissions</h3>' +
      '<p class="dash-section-desc">Manage roles and app access for your company.</p></div></div>' +
      '<div class="mt-4 glass-panel rounded-xl p-4"><h4 class="text-sm font-semibold mb-2">Invite member</h4>' +
      '<div class="grid gap-2 sm:grid-cols-3">' +
      '<input id="team-email" type="email" placeholder="Email" class="px-3 py-1.5 rounded-lg border"/>' +
      '<input id="team-name" type="text" placeholder="First name" class="px-3 py-1.5 rounded-lg border"/>' +
      '<input id="team-surname" type="text" placeholder="Last name" class="px-3 py-1.5 rounded-lg border"/></div>' +
      '<button type="button" id="team-invite-btn" class="mt-2 px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm">Send invite</button>' +
      '<p id="team-invite-msg" class="text-sm mt-2"></p></div>' +
      '<div id="team-members" class="mt-6 space-y-4"></div>';

    function load() {
      api("/api/iris-team-members.php").then(function (res) {
        if (!res.data.ok) return;
        var wrap = document.getElementById("team-members");
        wrap.innerHTML = "";
        (res.data.members || []).forEach(function (m) {
          var card = document.createElement("div");
          card.className = "glass-panel rounded-xl p-4";
          var roleOpts = (res.data.roles || []).map(function (r) {
            return "<option value=\"" + r.id + "\"" + (r.id == m.role_id ? " selected" : "") + ">" + escapeHtml(r.label) + "</option>";
          }).join("");
          var toggles = (m.services || []).map(function (s) {
            return "<label class=\"inline-flex items-center gap-1 mr-3 text-xs\"><input type=\"checkbox\" class=\"team-svc\" data-uid=\"" + m.id + "\" data-svc=\"" + s.service_name + "\"" + (s.enabled ? " checked" : "") + "/> " + escapeHtml(s.label) + "</label>";
          }).join("");
          card.innerHTML =
            "<div class=\"flex flex-wrap justify-between gap-2\"><div><strong>" + escapeHtml(m.name) + "</strong> " +
            "<span class=\"text-slate-500\">" + escapeHtml(m.email) + "</span></div>" +
            "<select class=\"team-role text-xs\" data-uid=\"" + m.id + "\">" + roleOpts + "</select></div>" +
            "<div class=\"mt-3 flex flex-wrap gap-1\">" + toggles + "</div>";
          wrap.appendChild(card);
        });
      });
    }

    root.addEventListener("change", function (e) {
      if (e.target.classList.contains("team-svc")) {
        api("/api/iris-team-permissions.php", {
          method: "PATCH",
          body: {
            user_id: parseInt(e.target.getAttribute("data-uid"), 10),
            service_name: e.target.getAttribute("data-svc"),
            enabled: e.target.checked,
          },
        });
      }
      if (e.target.classList.contains("team-role")) {
        api("/api/iris-team-members.php", {
          method: "PATCH",
          body: {
            user_id: parseInt(e.target.getAttribute("data-uid"), 10),
            role_id: parseInt(e.target.value, 10),
          },
        });
      }
    });

    document.getElementById("team-invite-btn").addEventListener("click", function () {
      api("/api/iris-team-invite.php", {
        method: "POST",
        body: {
          email: document.getElementById("team-email").value.trim(),
          name: document.getElementById("team-name").value.trim(),
          surname: document.getElementById("team-surname").value.trim(),
        },
      }).then(function (res) {
        document.getElementById("team-invite-msg").textContent = res.data.ok
          ? (res.data.emailSent ? "Invite sent." : "User created; verification email may have failed.")
          : (res.data.error || "Failed");
        if (res.data.ok) load();
      });
    });
    load();
  }

  function renderFiles(root) {
    root.innerHTML =
      '<div class="dash-section-head"><div><h3 class="dash-section-title">Import Files</h3>' +
      '<p class="dash-section-desc">Upload and manage your private files (max 50 MB).</p></div></div>' +
      '<div class="mt-4 glass-panel rounded-xl p-6 border-2 border-dashed border-slate-300 text-center">' +
      '<input type="file" id="files-input" class="hidden"/>' +
      '<button type="button" id="files-pick" class="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm">Choose file</button>' +
      '<p id="files-upload-msg" class="text-sm mt-2 text-slate-600"></p></div>' +
      '<ul id="files-list" class="mt-6 space-y-2"></ul>';

    function load() {
      api("/api/iris-files.php").then(function (res) {
        var ul = document.getElementById("files-list");
        ul.innerHTML = "";
        if (!res.data.ok) return;
        (res.data.files || []).forEach(function (f) {
          var li = document.createElement("li");
          li.className = "glass-panel rounded-lg px-4 py-3 flex flex-wrap justify-between items-center gap-2";
          var sizeKb = Math.round((f.byte_size || 0) / 1024);
          li.innerHTML =
            "<span><strong>" + escapeHtml(f.original_name) + "</strong> " +
            "<span class=\"text-xs text-slate-500\">" + sizeKb + " KB</span></span>" +
            "<span class=\"flex gap-2\">" +
            "<a class=\"text-sm text-violet-700\" href=\"/api/iris-files-download.php?id=" + f.id + "\">Download</a>" +
            "<button type=\"button\" class=\"files-del text-sm text-red-600\" data-id=\"" + f.id + "\">Delete</button></span>";
          ul.appendChild(li);
        });
      });
    }

    document.getElementById("files-pick").addEventListener("click", function () {
      document.getElementById("files-input").click();
    });
    document.getElementById("files-input").addEventListener("change", function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var fd = new FormData();
      fd.append("file", file);
      fetch("/api/iris-files-upload.php", { method: "POST", body: fd, credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          document.getElementById("files-upload-msg").textContent = j.ok ? "Uploaded." : (j.error || "Upload failed");
          if (j.ok) load();
        });
      this.value = "";
    });
    root.addEventListener("click", function (e) {
      if (e.target.classList.contains("files-del")) {
        api("/api/iris-files.php", {
          method: "DELETE",
          body: { id: parseInt(e.target.getAttribute("data-id"), 10) },
        }).then(function () { load(); });
      }
    });
    load();
  }

  function renderTabButtons(container, tabs, compact) {
    if (!container) return 0;
    container.innerHTML = "";
    var tabDefs = [
      { id: "home", label: "Home", icon: "home" },
      { id: "super_admin", label: "Super Admin", icon: "admin_panel_settings" },
      { id: "team", label: "Team", icon: "groups" },
      { id: "files", label: "Import Files", icon: "upload_file" },
    ];
    var count = 0;
    tabDefs.forEach(function (t) {
      if (tabs.indexOf(t.id) === -1) return;
      count += 1;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = compact ? "dash-nav-link" : "dash-nav-link w-full text-left";
      btn.setAttribute("data-dash-tab", t.id);
      if (t.id === "home") btn.classList.add("dash-nav-link--active");
      btn.innerHTML =
        "<span class=\"material-symbols-outlined\" aria-hidden=\"true\">" + t.icon + "</span>" +
        "<span>" + escapeHtml(t.label) + "</span>";
      btn.addEventListener("click", function () { showPanel(t.id); });
      container.appendChild(btn);
    });
    return count;
  }

  window.OSirisDashboardAdmin = {
    init: function (dash) {
      var tabs = dash.nav_tabs || ["home"];
      var nav = document.getElementById("dash-dynamic-nav");
      var mobileNav = document.getElementById("dash-mobile-tabs");
      if (!nav && !mobileNav) return;

      var count = renderTabButtons(nav, tabs, false);
      if (mobileNav) {
        var mobileCount = renderTabButtons(mobileNav, tabs, true);
        if (mobileCount > 1) {
          mobileNav.hidden = false;
        } else {
          mobileNav.hidden = true;
          mobileNav.innerHTML = "";
        }
      }

      if (tabs.indexOf("super_admin") !== -1) renderSuperAdmin(document.getElementById("panel-super-admin"));
      if (tabs.indexOf("team") !== -1) renderTeam(document.getElementById("panel-team"));
      if (tabs.indexOf("files") !== -1) renderFiles(document.getElementById("panel-files"));

      showPanel("home");
    },
  };
})();
