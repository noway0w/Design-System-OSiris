/**
 * Dashboard admin tabs: Projects, Home, Super Admin, Team.
 */
(function () {
  var dashCapabilities = {};

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
      return r.text().then(function (text) {
        var j = null;
        try {
          j = text ? JSON.parse(text) : {};
        } catch (e) {
          j = {
            ok: false,
            error: r.status >= 500 ? "Server error (" + r.status + ")" : "Invalid response from server",
          };
        }
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

  var modalEl = null;

  function closeModal() {
    if (modalEl && modalEl.parentNode) {
      modalEl.parentNode.removeChild(modalEl);
    }
    modalEl = null;
    document.body.classList.remove("dash-modal-open");
  }

  function openModal(title, bodyHtml, footerHtml) {
    closeModal();
    var overlay = document.createElement("div");
    overlay.className =
      "dash-modal-overlay fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    var footerBlock = footerHtml
      ? '<div class="dash-modal-footer px-5 py-4 border-t border-slate-200/60 flex flex-wrap gap-2 justify-end">' +
        footerHtml +
        "</div>"
      : "";

      overlay.innerHTML =
      '<div class="dash-modal dash-modal-panel rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-xl">' +
      '<div class="px-5 py-4 border-b border-slate-200/60 flex justify-between items-center gap-2">' +
      '<h3 class="text-lg font-semibold">' +
      escapeHtml(title) +
      "</h3>" +
      '<button type="button" class="dash-modal-close p-1 rounded-lg hover:bg-slate-100" aria-label="Close">' +
      '<span class="material-symbols-outlined">close</span></button></div>' +
      '<div class="dash-modal-body px-5 py-4 overflow-y-auto flex-1">' +
      bodyHtml +
      "</div>" +
      footerBlock;
    modalEl = overlay;
    document.body.appendChild(overlay);
    document.body.classList.add("dash-modal-open");
    overlay.querySelectorAll(".dash-modal-close").forEach(function (btn) {
      btn.addEventListener("click", closeModal);
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
    var onKey = function (e) {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
    return overlay;
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
          var roleOpts = state.roles
            .filter(function (r) {
              if (r.slug === "super_admin") {
                var em = (u.email || "").toLowerCase();
                return em === "g.lassiat@gmail.com" || em === "admin@localhost";
              }
              return true;
            })
            .map(function (r) {
              return "<option value=\"" + r.id + "\"" + (r.id == u.role_id ? " selected" : "") + ">" + escapeHtml(r.label) + "</option>";
            })
            .join("");
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
        var roleId = parseInt(roleSel.value, 10);
        if (!roleId) {
          document.getElementById("admin-status").textContent = "Select a role";
          return;
        }
        api("/api/iris-admin-users.php", {
          method: "PATCH",
          body: {
            user_id: parseInt(uid, 10),
            role_id: roleId,
            company_id: coSel.value === "" ? null : parseInt(coSel.value, 10),
          },
        }).then(function (res) {
          var msg = res.data.ok ? "Saved." : (res.data.error || "Error " + res.status);
          document.getElementById("admin-status").textContent = msg;
          if (res.data.ok) load();
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


  function teamRoleOptions(roles, selectedId, forInvite) {
    var isOwner = !!dashCapabilities.company_owner;
    return (roles || [])
      .filter(function (r) {
        if (r.slug === "company_owner" && !isOwner) return false;
        if (forInvite) {
          var ok = ["company_admin", "company_manager", "company_user", "company_owner"];
          return ok.indexOf(r.slug) !== -1;
        }
        return true;
      })
      .map(function (r) {
        return (
          "<option value=\"" + r.id + "\" data-slug=\"" + escapeHtml(r.slug) + "\"" +
          (r.id == selectedId ? " selected" : "") + ">" + escapeHtml(r.label) + "</option>"
        );
      })
      .join("");
  }

  function projectInviteRoleOptions(roles) {
    return (roles || [])
      .filter(function (r) {
        return ["company_admin", "company_manager", "company_user"].indexOf(r.slug) !== -1;
      })
      .map(function (r) {
        return (
          '<option value="' +
          escapeHtml(r.slug) +
          '"' +
          (r.slug === "company_user" ? " selected" : "") +
          ">" +
          escapeHtml(r.label) +
          "</option>"
        );
      })
      .join("");
  }

  function renderTeam(root) {
    var teamState = { roles: [], includeDeleted: false, canRemoveUsers: false, canPurgeUsers: false };
    var isSuperAdmin = !!dashCapabilities.super_admin;
    var canRemoveUsers = !!dashCapabilities.can_delete_team_users;
    var canPurgeUsers = !!dashCapabilities.can_purge_team_users;
    var canInviteToProject = !!dashCapabilities.can_manage_project_roster;
    var showTeamActions = canRemoveUsers || canPurgeUsers;
    var inviteProjectBtn = canInviteToProject
      ? '<button type="button" id="team-project-invite-open" class="px-4 py-1.5 rounded-lg border border-violet-300 text-violet-800 bg-violet-50 hover:bg-violet-100 text-sm font-medium">Invite to project</button>'
      : "";
    root.innerHTML =
      '<div class="dash-section-head flex flex-wrap justify-between items-start gap-3">' +
      '<div><h3 class="dash-section-title">Team</h3>' +
      '<p class="dash-section-desc">Manage users, roles, and app access for your company.</p></div>' +
      '<div class="flex flex-wrap gap-2">' +
      inviteProjectBtn +
      '<button type="button" id="team-invite-open" class="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm">Invite user</button></div></div>' +
      (canPurgeUsers
        ? '<label class="mt-4 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" id="team-show-deleted" class="rounded border-slate-300"/> Show removed users</label>'
        : "") +
      '<div class="mt-4 overflow-x-auto glass-panel rounded-xl p-4">' +
      '<table class="w-full text-sm text-left" id="team-table">' +
      '<thead><tr class="border-b"><th class="py-2 pr-2">Name</th><th class="py-2 pr-2">Email</th>' +
      '<th class="py-2 pr-2">Status</th><th class="py-2 pr-2">Role</th><th class="py-2 pr-2">App access</th>' +
      (showTeamActions ? '<th class="py-2 pr-2 min-w-[8rem]">Actions</th>' : "") +
      "</tr></thead>" +
      '<tbody></tbody></table></div>' +
      '<p id="team-status" class="text-sm mt-3 text-slate-600"></p>';

    function load() {
      var url = "/api/iris-team-members.php";
      if (teamState.includeDeleted) url += "?include_deleted=1";
      api(url).then(function (res) {
        if (!res.data.ok) {
          document.getElementById("team-status").textContent = res.data.error || "Failed to load";
          return;
        }
        teamState.roles = res.data.roles || [];
        teamState.canRemoveUsers = !!res.data.can_remove_users;
        teamState.canPurgeUsers = !!res.data.can_purge_users;
        var tbody = document.querySelector("#team-table tbody");
        tbody.innerHTML = "";
        (res.data.members || []).forEach(function (m) {
          var tr = document.createElement("tr");
          tr.className = "border-b border-slate-100 align-top" + (m.is_deleted ? " opacity-60" : "");
          var roleOpts = teamRoleOptions(teamState.roles, m.role_id, false);
          var toggles = (m.services || []).map(function (s) {
            return (
              '<label class="inline-flex items-center gap-1 mr-2 mb-1 text-xs"><input type="checkbox" class="team-svc" data-uid="' +
              m.id +
              '" data-svc="' +
              s.service_name +
              '"' +
              (s.enabled ? " checked" : "") +
              (m.is_deleted ? " disabled" : "") +
              "/> " +
              escapeHtml(s.label) +
              "</label>"
            );
          }).join("");
          var actions = "";
          if (showTeamActions) {
            if (m.can_remove) {
              actions +=
                '<button type="button" class="team-del text-xs text-red-600 font-medium" data-uid="' +
                m.id +
                '" data-email="' +
                escapeHtml(m.email) +
                '">Remove</button>';
            }
            if (m.can_purge) {
              actions +=
                (actions ? " " : "") +
                '<button type="button" class="team-purge text-xs text-red-700 font-medium underline" data-uid="' +
                m.id +
                '" data-email="' +
                escapeHtml(m.email) +
                '">Delete permanently</button>';
            }
            if (m.can_reactivate) {
              actions +=
                (actions ? " " : "") +
                '<button type="button" class="team-reactivate text-xs text-violet-700 font-medium" data-uid="' +
                m.id +
                '">Reactivate</button>';
            }
            if (!actions) {
              actions = '<span class="text-xs text-slate-400">—</span>';
            }
          }
          tr.innerHTML =
            '<td class="py-2 pr-2">' +
            escapeHtml(m.name) +
            '</td><td class="py-2 pr-2">' +
            escapeHtml(m.email) +
            '</td><td class="py-2 pr-2">' +
            escapeHtml(m.is_deleted ? "removed" : m.account_status) +
            '</td><td class="py-2 pr-2"><select class="team-role text-xs px-2 py-1 rounded border" data-uid="' +
            m.id +
            '"' +
            (m.is_deleted ? " disabled" : "") +
            ">" +
            roleOpts +
            '</select></td><td class="py-2"><div class="flex flex-wrap max-w-md">' +
            toggles +
            "</div></td>" +
            (showTeamActions ? '<td class="py-2 pr-2 whitespace-nowrap">' + actions + "</td>" : "");
          tbody.appendChild(tr);
        });
        var active = (res.data.members || []).filter(function (m) { return !m.is_deleted; }).length;
        var removed = (res.data.members || []).filter(function (m) { return m.is_deleted; }).length;
        var statusMsg = active + " active member(s)";
        if (teamState.includeDeleted && removed) statusMsg += ", " + removed + " removed";
        document.getElementById("team-status").textContent = statusMsg;
      });
    }

    function openProjectInviteModal() {
      Promise.all([
        api("/api/iris-projects.php"),
        api("/api/iris-team-members.php"),
      ]).then(function (results) {
        var projRes = results[0];
        var teamRes = results[1];
        var msgEl;
        if (!projRes.data.ok) {
          document.getElementById("team-status").textContent = projRes.data.error || "Could not load projects";
          return;
        }
        if (teamRes.data.ok) teamState.roles = teamRes.data.roles || [];
        var projects = projRes.data.projects || [];
        if (!projects.length) {
          document.getElementById("team-status").textContent = "No projects available. Create a project first.";
          return;
        }
        var isSuper = !!dashCapabilities.super_admin;
        var projectOpts = projects
          .map(function (p) {
            var label = escapeHtml(p.name);
            if (isSuper && p.company_name) label += " (" + escapeHtml(p.company_name) + ")";
            return '<option value="' + p.id + '">' + label + "</option>";
          })
          .join("");
        var body =
          '<p class="text-sm text-slate-600 mb-4">Invite someone by email. They will create an account (if needed) and join the selected project automatically.</p>' +
          '<label class="block text-sm mb-3"><span class="font-medium">Project</span>' +
          '<select id="team-proj-invite-project" class="mt-1 w-full px-3 py-1.5 rounded-lg border text-sm">' +
          projectOpts +
          "</select></label>" +
          '<label class="block text-sm mb-3"><span class="font-medium">Email</span>' +
          '<input id="team-proj-invite-email" type="email" class="mt-1 w-full px-3 py-1.5 rounded-lg border" placeholder="colleague@company.com"/></label>' +
          '<label class="block text-sm mb-3"><span class="font-medium">First name</span>' +
          '<input id="team-proj-invite-name" type="text" class="mt-1 w-full px-3 py-1.5 rounded-lg border"/></label>' +
          '<label class="block text-sm mb-3"><span class="font-medium">Last name</span>' +
          '<input id="team-proj-invite-surname" type="text" class="mt-1 w-full px-3 py-1.5 rounded-lg border"/></label>' +
          '<label class="block text-sm mb-1"><span class="font-medium">Role</span>' +
          '<select id="team-proj-invite-role" class="mt-1 w-full px-3 py-1.5 rounded-lg border text-sm">' +
          projectInviteRoleOptions(teamState.roles) +
          "</select></label>" +
          '<p id="team-proj-invite-msg" class="text-sm mt-2 text-slate-600"></p>' +
          '<p id="team-proj-invite-link" class="hidden text-xs mt-2 break-all text-slate-600"></p>';
        var footer =
          '<button type="button" class="dash-modal-close px-4 py-1.5 rounded-lg border text-sm">Cancel</button>' +
          '<button type="button" id="team-proj-invite-submit" class="px-4 py-1.5 rounded-lg bg-violet-700 text-white text-sm">Send invite</button>';
        var modal = openModal("Invite to project", body, footer);
        msgEl = modal.querySelector("#team-proj-invite-msg");
        var teamLinkEl = modal.querySelector("#team-proj-invite-link");
        modal.querySelector("#team-proj-invite-submit").addEventListener("click", function () {
          var projectId = parseInt(modal.querySelector("#team-proj-invite-project").value, 10);
          var email = modal.querySelector("#team-proj-invite-email").value.trim();
          if (!email) {
            if (msgEl) msgEl.textContent = "Email is required.";
            return;
          }
          api("/api/iris-project-invite.php", {
            method: "POST",
            body: {
              project_id: projectId,
              email: email,
              name: modal.querySelector("#team-proj-invite-name").value.trim() || "Invited",
              surname: modal.querySelector("#team-proj-invite-surname").value.trim() || "User",
              role_slug: modal.querySelector("#team-proj-invite-role").value || "company_user",
            },
          }).then(function (res) {
            if (!res.data.ok) {
              if (msgEl) msgEl.textContent = res.data.error || "Invite failed";
              return;
            }
            if (msgEl) {
              msgEl.textContent =
                res.data.message || (res.data.emailSent ? "Invitation sent." : "Invite created.");
              if (res.data.emailSent) {
                msgEl.textContent += " Ask them to check spam if needed.";
              }
              if (!res.data.emailSent && res.data.mailConfigured === false) {
                msgEl.textContent += " Server mail is not configured.";
              }
            }
            if (teamLinkEl && res.data.signupUrl) {
              teamLinkEl.classList.remove("hidden");
              teamLinkEl.innerHTML =
                'Signup link: <a href="' +
                escapeHtml(res.data.signupUrl) +
                '" class="text-violet-700 underline" target="_blank" rel="noopener">' +
                escapeHtml(res.data.signupUrl) +
                "</a>";
            }
            load();
            setTimeout(closeModal, res.data.emailSent ? 1400 : 5000);
          }).catch(function (err) {
            if (msgEl) msgEl.textContent = err && err.message ? err.message : "Invite request failed";
          });
        });
      });
    }

    function openInviteModal() {
      var roleSelect = '<select id="invite-role" class="w-full px-3 py-1.5 rounded-lg border text-sm">' + teamRoleOptions(teamState.roles, null, true) + '</select>';
      var body = '<label class="block text-sm mb-3"><span class="font-medium">Email</span><input id="invite-email" type="email" class="mt-1 w-full px-3 py-1.5 rounded-lg border" placeholder="user@company.com"/></label>' +
        '<label class="block text-sm mb-3"><span class="font-medium">First name</span><input id="invite-name" type="text" class="mt-1 w-full px-3 py-1.5 rounded-lg border"/></label>' +
        '<label class="block text-sm mb-3"><span class="font-medium">Last name</span><input id="invite-surname" type="text" class="mt-1 w-full px-3 py-1.5 rounded-lg border"/></label>' +
        '<label class="block text-sm mb-1"><span class="font-medium">Role</span><div class="mt-1">' + roleSelect + '</div></label><p id="invite-msg" class="text-sm mt-2 text-slate-600"></p>';
      var footer = '<button type="button" class="dash-modal-close px-4 py-1.5 rounded-lg border text-sm">Cancel</button><button type="button" id="invite-submit" class="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm">Send invite</button>';
      var modal = openModal("Invite user", body, footer);
      modal.querySelector("#invite-submit").addEventListener("click", function () {
        var sel = modal.querySelector("#invite-role");
        var slug = sel.options[sel.selectedIndex].getAttribute("data-slug") || "company_user";
        api("/api/iris-team-invite.php", {
          method: "POST",
          body: {
            email: modal.querySelector("#invite-email").value.trim(),
            name: modal.querySelector("#invite-name").value.trim() || "Invited",
            surname: modal.querySelector("#invite-surname").value.trim() || "User",
            role_slug: slug,
          },
        }).then(function (res) {
          var imsg = modal.querySelector("#invite-msg");
          if (!res.data.ok) {
            if (imsg) imsg.textContent = res.data.error || "Failed";
            return;
          }
          if (imsg) {
            imsg.textContent = res.data.message || (res.data.emailSent ? "Invite sent." : "User created; check email or use signup link.");
          }
          if (res.data.signupUrl && imsg) {
            imsg.innerHTML =
              escapeHtml(res.data.message || "Invite created.") +
              '<br><span class="break-all">Signup: <a class="text-violet-700 underline" href="' +
              escapeHtml(res.data.signupUrl) +
              '" target="_blank" rel="noopener">' +
              escapeHtml(res.data.signupUrl) +
              "</a></span>";
          }
          if (res.data.ok) {
            load();
            setTimeout(closeModal, res.data.emailSent ? 1400 : 5000);
          }
        });
      });
    }

    root.addEventListener("change", function (e) {
      if (e.target.id === "team-show-deleted") {
        teamState.includeDeleted = e.target.checked;
        load();
        return;
      }
      if (e.target.classList.contains("team-svc")) {
        api("/api/iris-team-permissions.php", { method: "PATCH", body: { user_id: parseInt(e.target.getAttribute("data-uid"), 10), service_name: e.target.getAttribute("data-svc"), enabled: e.target.checked } });
      }
      if (e.target.classList.contains("team-role")) {
        api("/api/iris-team-members.php", { method: "PATCH", body: { user_id: parseInt(e.target.getAttribute("data-uid"), 10), role_id: parseInt(e.target.value, 10) } }).then(function (res) {
          if (!res.data.ok) { document.getElementById("team-status").textContent = res.data.error || "Role update failed"; load(); }
        });
      }
    });

    root.addEventListener("click", function (e) {
      var del = e.target.closest(".team-del");
      if (del && confirm("Remove " + (del.getAttribute("data-email") || "this user") + " from the team? They will lose access until reactivated.")) {
        api("/api/iris-team-members.php", {
          method: "DELETE",
          body: { user_id: parseInt(del.getAttribute("data-uid"), 10) },
        }).then(function (res) {
          document.getElementById("team-status").textContent = res.data.ok
            ? res.data.message || "User removed."
            : res.data.error || "Could not remove user";
          if (res.data.ok) {
            if (canPurgeUsers) {
              teamState.includeDeleted = true;
              var showDel = document.getElementById("team-show-deleted");
              if (showDel) showDel.checked = true;
            }
            load();
          }
        });
        return;
      }
      var purge = e.target.closest(".team-purge");
      if (
        purge &&
        confirm(
          "Permanently delete " +
            (purge.getAttribute("data-email") || "this user") +
            "? This cannot be undone."
        )
      ) {
        api("/api/iris-team-members.php", {
          method: "DELETE",
          body: { user_id: parseInt(purge.getAttribute("data-uid"), 10), permanent: true },
        }).then(function (res) {
          document.getElementById("team-status").textContent = res.data.ok
            ? res.data.message || "User permanently deleted."
            : res.data.error || "Could not delete user";
          if (res.data.ok) load();
        });
        return;
      }
      var react = e.target.closest(".team-reactivate");
      if (react && confirm("Reactivate this user?")) {
        api("/api/iris-team-members.php", {
          method: "POST",
          body: { user_id: parseInt(react.getAttribute("data-uid"), 10), action: "reactivate" },
        }).then(function (res) {
          document.getElementById("team-status").textContent = res.data.ok
            ? res.data.message || "User reactivated."
            : res.data.error || "Could not reactivate user";
          if (res.data.ok) load();
        });
      }
    });

    document.getElementById("team-invite-open").addEventListener("click", function () {
      if (!teamState.roles.length) {
        api("/api/iris-team-members.php").then(function (res) { if (res.data.ok) teamState.roles = res.data.roles || []; openInviteModal(); });
      } else openInviteModal();
    });
    var projInviteBtn = document.getElementById("team-project-invite-open");
    if (projInviteBtn) {
      projInviteBtn.addEventListener("click", openProjectInviteModal);
    }
    load();
  }

  function renderProjects(root) {
    var projectsState = { view: "list", projectId: null, detail: null };
    var canManageRoster = !!dashCapabilities.can_manage_project_roster;
    var canManageServices = !!dashCapabilities.can_manage_project_services;
    var canDeleteProject = !!dashCapabilities.can_delete_project;
    var canCreateProject = !!dashCapabilities.can_create_project;
    var isSuperAdmin = !!dashCapabilities.super_admin;

    function renderListShell() {
      var createBtn = canCreateProject
        ? '<button type="button" id="projects-new-btn" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-sm font-semibold shadow-sm"><span class="material-symbols-outlined text-lg" aria-hidden="true">add</span>Create Project</button>'
        : "";
      root.innerHTML =
        '<div class="dash-section-head flex flex-wrap justify-between items-start gap-3">' +
        '<div><h3 class="dash-section-title">Projects</h3>' +
        '<p class="dash-section-desc">Open a project workspace to manage services, team, and files.</p></div>' +
        createBtn +
        "</div>" +
        '<div id="projects-empty-cta" class="hidden mt-6 glass-panel rounded-xl p-8 text-center"><p class="text-slate-600 mb-4">No projects yet. Create your first workspace.</p></div>' +
        '<div id="projects-list-grid" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"></div>' +
        '<p id="projects-status" class="text-sm mt-3 text-slate-600"></p>';
    }

    function loadList() {
      projectsState.view = "list";
      projectsState.projectId = null;
      renderListShell();
      api("/api/iris-projects.php").then(function (res) {
        var grid = document.getElementById("projects-list-grid");
        var status = document.getElementById("projects-status");
        if (!grid || !status) return;
        grid.innerHTML = "";
        if (!res.data.ok) {
          status.textContent = res.data.error || "Failed to load";
          return;
        }
        var list = res.data.projects || [];
        var emptyCta = document.getElementById("projects-empty-cta");
        var newBtn = document.getElementById("projects-new-btn");
        if (newBtn) {
          newBtn.style.display = canCreateProject ? "" : "none";
          newBtn.addEventListener("click", showCreatePanel);
        }
        if (!list.length) {
          if (emptyCta) {
            emptyCta.classList.remove("hidden");
            if (canCreateProject) {
              var ctaBtn = document.createElement("button");
              ctaBtn.type = "button";
              ctaBtn.className =
                "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-700 text-white text-sm font-semibold";
              ctaBtn.innerHTML =
                '<span class="material-symbols-outlined text-lg">add</span>Create Project';
              ctaBtn.addEventListener("click", showCreatePanel);
              emptyCta.appendChild(ctaBtn);
            }
          }
          status.textContent = "";
          return;
        }
        if (emptyCta) emptyCta.classList.add("hidden");
        list.forEach(function (p) {
          var card = document.createElement("button");
          card.type = "button";
          card.className =
            "proj-open glass-panel rounded-xl p-4 text-left hover:ring-2 hover:ring-violet-300/50 transition";
          card.setAttribute("data-id", String(p.id));
          var desc = p.description ? escapeHtml(String(p.description).slice(0, 120)) : "No description";
          var coLine = isSuperAdmin && p.company_name
            ? '<p class="text-xs text-violet-600 mt-1">' + escapeHtml(p.company_name) + "</p>"
            : "";
          card.innerHTML =
            '<h4 class="font-semibold text-base">' + escapeHtml(p.name) + "</h4>" +
            coLine +
            '<p class="text-sm text-slate-600 mt-1 line-clamp-2">' + desc + "</p>" +
            '<p class="text-xs text-slate-500 mt-3">' + (p.member_count || 0) + " member(s)</p>";
          grid.appendChild(card);
        });
        status.textContent = list.length + " project(s)";
      });
    }

    function showCreatePanel() {
      projectsState.view = "create";
      projectsState.projectId = null;
      root.innerHTML =
        '<div class="mb-6 flex flex-wrap items-center gap-3">' +
        '<button type="button" id="projects-create-cancel" class="text-sm text-violet-700 hover:underline flex items-center gap-1">' +
        '<span class="material-symbols-outlined text-base">arrow_back</span> Cancel</button>' +
        '<h3 class="dash-section-title flex-1">Create project</h3></div>' +
        '<div class="glass-panel rounded-2xl p-6 max-w-2xl">' +
        '<label class="block text-sm mb-4"><span class="font-medium">Project name <span class="text-red-600">*</span></span>' +
        '<input id="proj-create-name" type="text" required maxlength="120" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200" placeholder="e.g. Site survey Q2"/></label>' +
        '<label class="block text-sm mb-4"><span class="font-medium">Description</span>' +
        '<textarea id="proj-create-desc" rows="3" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200" placeholder="Optional"></textarea></label>' +
        '<div id="proj-create-team-block" class="mb-4 hidden">' +
        '<h4 class="text-sm font-semibold mb-2">Invite team members</h4>' +
        '<p class="text-xs text-slate-500 mb-3">Select colleagues to add to this project. You are added automatically as creator.</p>' +
        '<div id="proj-create-members" class="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3 mb-4"></div>' +
        '<h4 class="text-sm font-semibold mb-2">Invite by email</h4>' +
        '<div class="grid gap-3 sm:grid-cols-2">' +
        '<label class="block text-xs sm:col-span-2"><span class="font-medium">Email</span>' +
        '<input id="proj-create-invite-email" type="email" class="mt-1 w-full px-3 py-1.5 rounded-lg border text-sm" placeholder="colleague@company.com"/></label>' +
        '<label class="block text-xs"><span class="font-medium">First name</span>' +
        '<input id="proj-create-invite-name" type="text" class="mt-1 w-full px-3 py-1.5 rounded-lg border text-sm"/></label>' +
        '<label class="block text-xs"><span class="font-medium">Last name</span>' +
        '<input id="proj-create-invite-surname" type="text" class="mt-1 w-full px-3 py-1.5 rounded-lg border text-sm"/></label>' +
        '<label class="block text-xs sm:col-span-2"><span class="font-medium">Role</span>' +
        '<select id="proj-create-invite-role" class="mt-1 w-full px-3 py-1.5 rounded-lg border text-sm"></select></label></div>' +
        '<p class="text-xs text-slate-500 mt-1 sm:col-span-2">Invites are sent when you click <strong>Create project</strong>.</p>' +
        '<button type="button" id="proj-create-invite-add" class="mt-2 text-sm text-violet-700 font-medium sm:col-span-2">+ Add to invite list</button>' +
        '<ul id="proj-create-pending-invites" class="mt-3 space-y-2"></ul></div>' +
        '<p id="proj-create-no-team" class="text-sm text-slate-500 mb-4 hidden">You can invite teammates from the project workspace after creation.</p>' +
        '<p id="proj-create-error" class="text-sm text-red-600 mb-3 hidden" role="alert"></p>' +
        '<div class="flex flex-wrap gap-3 pt-2 border-t border-slate-200">' +
        '<button type="button" id="projects-create-cancel-2" class="px-5 py-2 rounded-lg border border-slate-300 text-sm">Cancel</button>' +
        '<button type="button" id="proj-create-submit" class="px-5 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-semibold">Create project</button></div></div>';

      var pendingInvites = [];
      var createRoles = [];

      function setError(msg) {
        var el = document.getElementById("proj-create-error");
        if (!el) return;
        if (msg) {
          el.textContent = msg;
          el.classList.remove("hidden");
        } else {
          el.textContent = "";
          el.classList.add("hidden");
        }
      }

      function renderPendingInvites() {
        var ul = document.getElementById("proj-create-pending-invites");
        if (!ul) return;
        ul.innerHTML = "";
        pendingInvites.forEach(function (inv, idx) {
          var li = document.createElement("li");
          li.className = "flex justify-between items-center text-sm glass-panel rounded-lg px-3 py-2";
          li.innerHTML =
            "<span>" +
            escapeHtml(inv.email) +
            ' <span class="text-slate-500">(' +
            escapeHtml(inv.role_label || inv.role_slug) +
            ")</span></span>";
          var rm = document.createElement("button");
          rm.type = "button";
          rm.className = "text-red-600 text-xs";
          rm.textContent = "Remove";
          rm.addEventListener("click", function () {
            pendingInvites.splice(idx, 1);
            renderPendingInvites();
          });
          li.appendChild(rm);
          ul.appendChild(li);
        });
      }

      function bindCancel() {
        function goBack() {
          loadList();
        }
        document.getElementById("projects-create-cancel").addEventListener("click", goBack);
        document.getElementById("projects-create-cancel-2").addEventListener("click", goBack);
      }

      bindCancel();

      function flushCreateInviteDraft() {
        var draft = readInviteDraftFromForm(
          "#proj-create-invite-email",
          "#proj-create-invite-name",
          "#proj-create-invite-surname",
          "#proj-create-invite-role"
        );
        if (!draft) return;
        if (pendingInvites.some(function (i) { return i.email === draft.email; })) return;
        var roleSel = document.getElementById("proj-create-invite-role");
        var label = roleSel ? roleSel.options[roleSel.selectedIndex].text : draft.role_slug;
        pendingInvites.push({
          email: draft.email,
          name: draft.name,
          surname: draft.surname,
          role_slug: draft.role_slug,
          role_label: label,
        });
      }

      if (canManageRoster) {
        document.getElementById("proj-create-team-block").classList.remove("hidden");
        api("/api/iris-team-members.php").then(function (res) {
          if (!res.data.ok) return;
          createRoles = (res.data.roles || []).filter(function (r) {
            return ["company_admin", "company_manager", "company_user"].indexOf(r.slug) !== -1;
          });
          var roleSel = document.getElementById("proj-create-invite-role");
          if (roleSel) {
            roleSel.innerHTML = createRoles
              .map(function (r) {
                return (
                  '<option value="' +
                  escapeHtml(r.slug) +
                  '"' +
                  (r.slug === "company_user" ? " selected" : "") +
                  ">" +
                  escapeHtml(r.label) +
                  "</option>"
                );
              })
              .join("");
          }
          var box = document.getElementById("proj-create-members");
          if (!box) return;
          box.innerHTML = "";
          (res.data.members || []).forEach(function (m) {
            var row = document.createElement("label");
            row.className = "flex items-center gap-2 py-1.5 text-sm";
            row.innerHTML =
              '<input type="checkbox" class="proj-create-member-cb" value="' +
              m.id +
              '"/> ' +
              escapeHtml(m.name) +
              ' <span class="text-slate-500">(' +
              escapeHtml(m.email) +
              ")</span>";
            box.appendChild(row);
          });
        });
        document.getElementById("proj-create-invite-add").addEventListener("click", function () {
          setError("");
          var email = document.getElementById("proj-create-invite-email").value.trim().toLowerCase();
          if (!email || email.indexOf("@") < 1) {
            setError("Enter a valid email to invite.");
            return;
          }
          var roleSel = document.getElementById("proj-create-invite-role");
          var slug = roleSel ? roleSel.value : "company_user";
          var label = roleSel ? roleSel.options[roleSel.selectedIndex].text : slug;
          if (pendingInvites.some(function (i) { return i.email === email; })) {
            setError("This email is already in the invite list.");
            return;
          }
          pendingInvites.push({
            email: email,
            name: document.getElementById("proj-create-invite-name").value.trim(),
            surname: document.getElementById("proj-create-invite-surname").value.trim(),
            role_slug: slug,
            role_label: label,
          });
          document.getElementById("proj-create-invite-email").value = "";
          document.getElementById("proj-create-invite-name").value = "";
          var sn = document.getElementById("proj-create-invite-surname");
          if (sn) sn.value = "";
          renderPendingInvites();
        });
      } else {
        document.getElementById("proj-create-no-team").classList.remove("hidden");
      }

      document.getElementById("proj-create-submit").addEventListener("click", function () {
        setError("");
        var name = document.getElementById("proj-create-name").value.trim();
        if (name.length < 2) {
          setError("Project name is required (at least 2 characters).");
          document.getElementById("proj-create-name").focus();
          return;
        }
        var desc = document.getElementById("proj-create-desc").value.trim();
        flushCreateInviteDraft();
        var submitBtn = document.getElementById("proj-create-submit");
        submitBtn.disabled = true;
        submitBtn.textContent = "Creating…";

        api("/api/iris-projects.php", { method: "POST", body: { name: name, description: desc } }).then(function (res) {
          if (!res.data.ok) {
            setError(res.data.error || "Could not create project.");
            submitBtn.disabled = false;
            submitBtn.textContent = "Create project";
            return;
          }
          var pid = res.data.project && res.data.project.id;
          if (!pid) {
            loadList();
            return;
          }
          var memberIds = [];
          document.querySelectorAll(".proj-create-member-cb:checked").forEach(function (cb) {
            memberIds.push(parseInt(cb.value, 10));
          });
          var chain = Promise.resolve();
          memberIds.forEach(function (uid) {
            chain = chain.then(function () {
              return api("/api/iris-project-members.php", {
                method: "POST",
                body: { project_id: pid, user_id: uid },
              });
            });
          });
          var inviteFailures = [];
          var inviteMailWarnings = [];
          pendingInvites.forEach(function (inv) {
            chain = chain.then(function () {
              return inviteProjectUser(pid, inv).then(function (res) {
                if (!res.data.ok) {
                  inviteFailures.push((inv.email || "user") + ": " + (res.data.error || "invite failed"));
                  return;
                }
                if (!res.data.emailSent) {
                  inviteMailWarnings.push(
                    (inv.email || "user") + (res.data.signupUrl ? " — link: " + res.data.signupUrl : "")
                  );
                }
              });
            });
          });
          chain
            .then(function () {
              openProjectDetail(pid);
              if (inviteFailures.length) {
                window.alert("Project created, but some invites failed:\n" + inviteFailures.join("\n"));
              } else if (inviteMailWarnings.length) {
                window.alert(
                  "Project created. Invitation email could not be sent to:\n" +
                    inviteMailWarnings.join("\n") +
                    "\n\nCheck server mail settings or resend from Team / project settings."
                );
              }
            })
            .catch(function () {
              submitBtn.disabled = false;
              submitBtn.textContent = "Create project";
              setError("Project was created but finishing invites failed. Open the project and try again.");
            });
        });
      });
    }

    function openNewProjectModal() {
      showCreatePanel();
    }

    function inviteProjectUser(projectId, payload) {
      return api("/api/iris-project-invite.php", {
        method: "POST",
        body: {
          project_id: projectId,
          email: String(payload.email || "").trim().toLowerCase(),
          name: payload.name || "Invited",
          surname: payload.surname || "User",
          role_slug: payload.role_slug || "company_user",
        },
      });
    }

    function readInviteDraftFromForm(emailSel, nameSel, surnameSel, roleSel) {
      var emailEl = typeof emailSel === "string" ? document.querySelector(emailSel) : emailSel;
      if (!emailEl) return null;
      var email = emailEl.value.trim().toLowerCase();
      if (!email || email.indexOf("@") < 1) return null;
      var nameEl = typeof nameSel === "string" ? document.querySelector(nameSel) : nameSel;
      var surnameEl = typeof surnameSel === "string" ? document.querySelector(surnameSel) : surnameSel;
      var roleEl = typeof roleSel === "string" ? document.querySelector(roleSel) : roleSel;
      return {
        email: email,
        name: nameEl && nameEl.value.trim() ? nameEl.value.trim() : "Invited",
        surname: surnameEl && surnameEl.value.trim() ? surnameEl.value.trim() : "User",
        role_slug: roleEl && roleEl.value ? roleEl.value : "company_user",
      };
    }

    function projectRoleOptions(roles, selectedSlug) {
      return (roles || [])
        .map(function (r) {
          return (
            '<option value="' +
            escapeHtml(r.slug) +
            '"' +
            (r.slug === selectedSlug ? " selected" : "") +
            ">" +
            escapeHtml(r.label) +
            "</option>"
          );
        })
        .join("");
    }

    function openMembersModal(projectId, projectName, onDone) {
      api("/api/iris-project-members.php?project_id=" + projectId).then(function (res) {
        if (!res.data.ok) {
          window.alert(res.data.error || "Could not load project members (" + res.status + ").");
          return;
        }
        var roles = res.data.roles || [];
        var initialState = {};
        (res.data.users || []).forEach(function (u) {
          initialState[u.id] = { member: !!u.is_member, role: u.role_slug || "company_user" };
        });
        var list = (res.data.users || [])
          .map(function (u) {
            var roleSelect =
              '<select class="proj-member-role text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white" data-uid="' +
              u.id +
              '"' +
              (canManageRoster ? "" : " disabled") +
              ">" +
              projectRoleOptions(roles, u.role_slug || "company_user") +
              "</select>";
            return (
              '<div class="proj-member-row">' +
              '<label class="proj-member-row__check"><input type="checkbox" class="proj-member-cb" data-uid="' +
              u.id +
              '"' +
              (u.is_member ? " checked" : "") +
              (canManageRoster ? "" : " disabled") +
              "/>" +
              '<span class="proj-member-row__info"><span class="proj-member-row__name">' +
              escapeHtml(u.name) +
              '</span><span class="proj-member-row__email">' +
              escapeHtml(u.email) +
              "</span></span></label>" +
              roleSelect +
              "</div>"
            );
          })
          .join("");
        var inviteBlock = canManageRoster
          ? '<div class="mt-4 pt-4 border-t border-slate-200">' +
            '<p class="text-sm font-semibold mb-1">Invite someone new (not on OSiris yet)</p>' +
            '<p class="text-xs text-slate-500 mb-3">Same as <strong>Team → Invite to project</strong>: signup email for this project.</p>' +
            '<label class="block text-xs mb-2">Email<input id="proj-invite-email" type="email" class="mt-1 w-full px-3 py-1.5 rounded-lg border text-sm" placeholder="colleague@company.com"/></label>' +
            '<div class="grid gap-2 sm:grid-cols-2">' +
            '<label class="block text-xs">First name<input id="proj-invite-name" type="text" class="mt-1 w-full px-3 py-1.5 rounded-lg border text-sm"/></label>' +
            '<label class="block text-xs">Last name<input id="proj-invite-surname" type="text" class="mt-1 w-full px-3 py-1.5 rounded-lg border text-sm"/></label></div>' +
            '<label class="block text-xs mb-2">Role<select id="proj-invite-role" class="mt-1 w-full px-3 py-1.5 rounded-lg border text-sm">' +
            projectRoleOptions(roles, "company_user") +
            "</select></label>" +
            '<button type="button" id="proj-invite-submit" class="mt-2 px-4 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium">Send invite</button>' +
            '<p id="proj-invite-msg" class="text-xs text-slate-600 mt-2"></p>' +
            '<p id="proj-invite-link" class="hidden text-xs mt-2 break-all"></p></div>'
          : "";
        var body =
          '<p class="text-sm text-slate-600 mb-3">Add users to <strong>' +
          escapeHtml(projectName) +
          "</strong>. Existing colleagues: check boxes → <strong>Save members</strong>. New email: <strong>Send invite</strong> below.</p>" +
          '<p id="proj-members-status" class="text-xs text-slate-600 mb-2 hidden" role="status"></p>' +
          '<div class="dash-modal-member-list">' +
          (list || '<p class="text-sm text-slate-500 py-4 text-center">No company users found.</p>') +
          "</div>" +
          inviteBlock;
        var footer = canManageRoster
          ? '<button type="button" class="dash-modal-close px-4 py-1.5 rounded-lg border border-slate-300 text-sm">Cancel</button>' +
            '<button type="button" id="proj-members-validate" class="px-4 py-1.5 rounded-lg border border-violet-300 text-violet-800 bg-violet-50 text-sm font-medium">Save members</button>' +
            '<button type="button" class="dash-modal-close px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm">Done</button>'
          : '<button type="button" class="dash-modal-close px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm">Done</button>';
        var m = openModal("Add user to project", body, footer);

        function showInviteLink(url) {
          var linkEl = m.querySelector("#proj-invite-link");
          if (!linkEl || !url) return;
          linkEl.classList.remove("hidden");
          linkEl.innerHTML =
            'Signup link: <a href="' +
            escapeHtml(url) +
            '" class="text-violet-700 underline" target="_blank" rel="noopener">' +
            escapeHtml(url) +
            "</a>";
        }

        function readMemberModalInvite() {
          return readInviteDraftFromForm(
            m.querySelector("#proj-invite-email"),
            m.querySelector("#proj-invite-name"),
            m.querySelector("#proj-invite-surname"),
            m.querySelector("#proj-invite-role")
          );
        }

        function sendMemberModalInvite() {
          var draft = readMemberModalInvite();
          if (!draft) return Promise.resolve({ skipped: true });
          var msg = m.querySelector("#proj-invite-msg");
          var invBtn = m.querySelector("#proj-invite-submit");
          if (invBtn) {
            invBtn.disabled = true;
            invBtn.textContent = "Sending…";
          }
          return inviteProjectUser(projectId, draft).then(function (invRes) {
            if (!invRes.data.ok) {
              if (msg) msg.textContent = invRes.data.error || "Invite failed";
              throw new Error(invRes.data.error || "Invite failed");
            }
            if (msg) {
              msg.textContent =
                invRes.data.message ||
                (invRes.data.emailSent ? "Invitation sent." : "Invite saved but email could not be sent.");
            }
            if (invRes.data.signupUrl) {
              showInviteLink(invRes.data.signupUrl);
              if (invRes.data.emailSent && msg) {
                msg.textContent += " Ask them to check spam.";
              }
            }
            var emailEl = m.querySelector("#proj-invite-email");
            var nameEl = m.querySelector("#proj-invite-name");
            var surnameEl = m.querySelector("#proj-invite-surname");
            if (emailEl) emailEl.value = "";
            if (nameEl) nameEl.value = "";
            if (surnameEl) surnameEl.value = "";
            if (onDone) onDone();
            return invRes;
          }).finally(function () {
            if (invBtn) {
              invBtn.disabled = false;
              invBtn.textContent = "Send invite";
            }
          });
        }

        if (canManageRoster) {
          var validateBtn = m.querySelector("#proj-members-validate");
          if (validateBtn) {
            validateBtn.addEventListener("click", function () {
              var statusEl = m.querySelector("#proj-members-status");
              var ops = [];
              m.querySelectorAll(".proj-member-row").forEach(function (row) {
                var cb = row.querySelector(".proj-member-cb");
                var roleSel = row.querySelector(".proj-member-role");
                if (!cb) return;
                var uid = parseInt(cb.getAttribute("data-uid"), 10);
                var init = initialState[uid];
                if (!init) return;
                var nowMember = cb.checked;
                var nowRole = roleSel ? roleSel.value : init.role;
                if (nowMember !== init.member) {
                  ops.push({ method: nowMember ? "POST" : "DELETE", uid: uid, role: nowRole });
                } else if (nowMember && nowRole !== init.role) {
                  ops.push({ method: "POST", uid: uid, role: nowRole });
                }
              });
              validateBtn.disabled = true;
              validateBtn.textContent = "Saving…";
              var chain = sendMemberModalInvite().catch(function (err) {
                if (statusEl) {
                  statusEl.classList.remove("hidden");
                  statusEl.textContent = err && err.message ? err.message : "Invite failed";
                }
              });
              if (!ops.length) {
                chain = chain.then(function () {
                  if (statusEl && !readMemberModalInvite()) {
                    statusEl.classList.remove("hidden");
                    statusEl.textContent = "No member checkbox changes to apply.";
                  }
                });
                chain.finally(function () {
                  validateBtn.disabled = false;
                  validateBtn.textContent = "Save members";
                });
                return;
              }
              var mailWarnings = [];
              chain = chain.then(function () {
                return Promise.resolve();
              });
              ops.forEach(function (op) {
                chain = chain.then(function () {
                  var payload = { project_id: projectId, user_id: op.uid };
                  if (op.method === "POST" && op.role) payload.role_slug = op.role;
                  return api("/api/iris-project-members.php", { method: op.method, body: payload }).then(function (r) {
                    if (!r.data.ok) throw new Error(r.data.error || "Could not update members");
                    if (op.method === "POST" && r.data.emailSent === false) mailWarnings.push(op.uid);
                    initialState[op.uid] = { member: op.method === "POST", role: op.role || initialState[op.uid].role };
                  });
                });
              });
              chain
                .then(function () {
                  if (statusEl) {
                    statusEl.classList.remove("hidden");
                    statusEl.textContent = mailWarnings.length
                      ? "Members updated. Some notification emails could not be sent."
                      : "Members updated successfully.";
                  }
                  if (onDone) onDone();
                })
                .catch(function (err) {
                  if (statusEl) {
                    statusEl.classList.remove("hidden");
                    statusEl.textContent = err && err.message ? err.message : "Update failed";
                  }
                })
                .finally(function () {
                  validateBtn.disabled = false;
                  validateBtn.textContent = "Save members";
                });
            });
          }
          var invBtn = m.querySelector("#proj-invite-submit");
          if (invBtn) {
            invBtn.addEventListener("click", function () {
              var msg = m.querySelector("#proj-invite-msg");
              var linkEl = m.querySelector("#proj-invite-link");
              if (linkEl) {
                linkEl.classList.add("hidden");
                linkEl.innerHTML = "";
              }
              if (!readMemberModalInvite()) {
                if (msg) msg.textContent = "Enter a valid email address.";
                return;
              }
              sendMemberModalInvite().catch(function (err) {
                if (msg && !msg.textContent) {
                  msg.textContent = err && err.message ? err.message : "Invite request failed";
                }
              });
            });
          }
        }
      }).catch(function (err) {
        window.alert(err && err.message ? err.message : "Could not load member list.");
      });
    }

    function renderDetail(data) {
      projectsState.view = "detail";
      projectsState.detail = data;
      var p = data.project || {};
      var servicesHtml = (data.services || [])
        .map(function (s) {
          return (
            '<label class="flex items-center justify-between gap-2 py-2 border-b border-slate-100 text-sm">' +
            "<span>" +
            escapeHtml(s.label || s.service_name) +
            "</span>" +
            '<input type="checkbox" class="proj-svc" data-svc="' +
            escapeHtml(s.service_name) +
            '"' +
            (s.enabled ? " checked" : "") +
            (canManageServices ? "" : " disabled") +
            "/></label>"
          );
        })
        .join("");
      var detailCanManageRoster = data.can_manage_roster !== undefined ? !!data.can_manage_roster : canManageRoster;
      var membersHtml = (data.members || [])
        .map(function (m) {
          var statusNote =
            m.account_status === "pending"
              ? ' <span class="text-amber-600 font-medium">· Pending email verification</span>'
              : "";
          var removeBtn =
            detailCanManageRoster
              ? '<button type="button" class="proj-member-remove shrink-0 text-xs text-red-600 font-medium hover:underline" data-uid="' +
                m.id +
                '" data-name="' +
                escapeHtml(m.name) +
                '">Remove from project</button>'
              : "";
          return (
            '<li class="py-2 border-b border-slate-100 text-sm flex flex-wrap items-start justify-between gap-2">' +
            '<div class="min-w-0 flex-1"><span class="font-medium">' +
            escapeHtml(m.name) +
            '</span><span class="text-slate-500 block text-xs">' +
            escapeHtml(m.email) +
            (m.role_label ? " · " + escapeHtml(m.role_label) : "") +
            statusNote +
            "</span></div>" +
            removeBtn +
            "</li>"
          );
        })
        .join("");
      var pendingHtml = (data.pending_invites || [])
        .filter(function (p) {
          return !(data.members || []).some(function (m) {
            return m.id === p.id && m.account_status !== "pending";
          });
        })
        .map(function (p) {
          var cancelBtn =
            detailCanManageRoster
              ? '<button type="button" class="proj-member-remove shrink-0 text-xs text-red-600 font-medium hover:underline" data-uid="' +
                p.id +
                '" data-name="' +
                escapeHtml(p.name) +
                '" data-pending="1">Cancel invite</button>'
              : "";
          return (
            '<li class="py-2 border-b border-slate-100 text-sm flex flex-wrap items-start justify-between gap-2">' +
            '<div class="min-w-0 flex-1"><span class="font-medium">' +
            escapeHtml(p.name) +
            '</span><span class="text-slate-500 block text-xs">' +
            escapeHtml(p.email) +
            ' <span class="text-amber-600 font-medium">· Invite pending</span></span></div>' +
            cancelBtn +
            "</li>"
          );
        })
        .join("");
      var teamListHtml =
        membersHtml ||
        pendingHtml ||
        '<li class="text-sm text-slate-500 py-2">No members yet. Use Add user to project to invite someone.</li>';
      if (membersHtml && pendingHtml) {
        teamListHtml = membersHtml + pendingHtml;
      }
      var fileCount = (data.files || []).length;
      var filesHtml = (data.files || [])
        .map(function (f) {
          var sizeKb = Math.round((f.byte_size || 0) / 1024);
          return (
            '<li class="flex flex-wrap items-center justify-between gap-2 py-3 px-2">' +
            '<div class="flex items-center gap-3 min-w-0 flex-1">' +
            '<span class="material-symbols-outlined text-violet-600 shrink-0">insert_drive_file</span>' +
            '<div class="min-w-0"><p class="font-medium text-sm truncate">' +
            escapeHtml(f.original_name) +
            '</p><p class="text-xs text-slate-500">' +
            sizeKb +
            " KB</p></div></div>" +
            '<a class="shrink-0 px-3 py-1 rounded-lg border border-violet-200 text-violet-700 text-xs font-medium" href="/api/iris-files-download.php?id=' +
            f.id +
            '">Download</a></li>'
          );
        })
        .join("");

      root.innerHTML =
        '<div class="flex flex-wrap items-center gap-3 mb-6">' +
        '<button type="button" id="projects-back-btn" class="text-sm text-violet-700 hover:underline flex items-center gap-1">' +
        '<span class="material-symbols-outlined text-base">arrow_back</span> Back to Projects</button>' +
        '<h3 class="dash-section-title flex-1">' +
        escapeHtml(p.name || "Project") +
        (p.company_name ? ' <span class="text-sm font-normal text-violet-600">(' + escapeHtml(p.company_name) + ")</span>" : "") +
        "</h3>" +
        (canDeleteProject
          ? '<button type="button" id="projects-detail-del" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100"><span class="material-symbols-outlined text-base" aria-hidden="true">delete</span>Delete project</button>'
          : "") +
        "</div>" +
        (p.description
          ? '<p class="text-sm text-slate-600 mb-6">' + escapeHtml(p.description) + "</p>"
          : "") +
        '<div class="grid gap-6 lg:grid-cols-3">' +
        '<section class="glass-panel rounded-xl p-4"><h4 class="font-semibold text-sm mb-3">Allowed services</h4>' +
        '<div>' +
        (servicesHtml || '<p class="text-sm text-slate-500">No services configured.</p>') +
        "</div></section>" +
        '<section class="glass-panel rounded-xl p-4"><div class="flex justify-between items-center gap-2 mb-3">' +
        '<h4 class="font-semibold text-sm">Team members</h4>' +
        (detailCanManageRoster
          ? '<button type="button" id="projects-add-user" class="text-xs px-3 py-1.5 rounded-lg bg-slate-900 text-white font-medium">Add user to project</button>'
          : "") +
        "</div><ul class=\"max-h-80 overflow-y-auto\">" +
        teamListHtml +
        "</ul></section>" +
        '<section class="glass-panel rounded-xl p-4 lg:col-span-1">' +
        '<div class="flex justify-between items-center gap-2 mb-3">' +
        '<h4 class="font-semibold text-sm">Project files <span id="proj-file-count" class="text-slate-500 font-normal">(' +
        fileCount +
        ")</span></h4></div>" +
        '<input type="file" id="proj-file-input" class="hidden" accept=".jpeg,.jpg,.png,.iges,.step,.dxf,.ifc,.3dm,.dwg,.glb,video/*"/>' +
        '<div id="proj-file-drop" class="mb-4 rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/30 p-6 text-center">' +
        '<span class="material-symbols-outlined text-4xl text-violet-500">cloud_upload</span>' +
        '<p class="text-sm text-slate-600 mt-2">Add files to this project</p>' +
        '<p class="text-xs text-slate-500 mt-1">jpeg, png, iges, step, dxf, ifc, 3dm, dwg, glb, mp4, mov, avi · max 50 MB</p>' +
        '<button type="button" id="proj-file-import" class="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-sm font-semibold">' +
        '<span class="material-symbols-outlined text-lg">add</span>Add file</button></div>' +
        '<p id="proj-upload-msg" class="text-xs text-slate-600 mb-3"></p>' +
        '<ul id="proj-files-list" class="divide-y divide-slate-100 max-h-[24rem] overflow-y-auto rounded-lg border border-slate-100">' +
        (filesHtml || '<li class="py-6 text-center text-sm text-slate-500">No files uploaded yet. Click Add file to upload.</li>') +
        "</ul></section></div>";

      document.getElementById("projects-back-btn").addEventListener("click", loadList);
      var delBtn = document.getElementById("projects-detail-del");
      if (delBtn) {
        delBtn.addEventListener("click", function () {
          if (!confirm("Delete this project? Files stay stored but the project will be hidden for everyone.")) return;
          api("/api/iris-projects.php", {
            method: "DELETE",
            body: { project_id: projectsState.projectId },
          }).then(function (res) {
            if (!res.data.ok) {
              window.alert(res.data.error || "Could not delete project.");
              return;
            }
            loadList();
          });
        });
      }
      var addBtn = document.getElementById("projects-add-user");
      if (addBtn) {
        addBtn.addEventListener("click", function () {
          openMembersModal(projectsState.projectId, p.name, function () {
            openProjectDetail(projectsState.projectId);
          });
        });
      }
      function pickProjectFile() {
        var fileInput = document.getElementById("proj-file-input");
        if (fileInput) fileInput.click();
      }
      var fileBtn = document.getElementById("proj-file-import");
      var fileDrop = document.getElementById("proj-file-drop");
      var fileInput = document.getElementById("proj-file-input");
      if (fileBtn) fileBtn.addEventListener("click", function (e) { e.stopPropagation(); pickProjectFile(); });
      if (fileDrop) fileDrop.addEventListener("click", function (e) {
        if (!e.target.closest("#proj-file-import")) pickProjectFile();
      });
      if (fileInput) {
        fileInput.addEventListener("change", function () {
          var file = this.files && this.files[0];
          if (!file) return;
          var fd = new FormData();
          fd.append("file", file);
          fd.append("project_id", String(projectsState.projectId));
          var msg = document.getElementById("proj-upload-msg");
          if (msg) msg.textContent = "Uploading…";
          fetch("/api/iris-files-upload.php", { method: "POST", body: fd, credentials: "same-origin" })
            .then(function (r) {
              return r.json();
            })
            .then(function (j) {
              if (msg) msg.textContent = j.ok ? "Uploaded." : j.error || "Upload failed";
              if (j.ok) openProjectDetail(projectsState.projectId);
            });
          this.value = "";
        });
      }
    }

    function openProjectDetail(projectId) {
      projectsState.projectId = projectId;
      api("/api/iris-projects.php?project_id=" + projectId).then(function (res) {
        if (!res.data.ok) {
          window.alert(res.data.error || "Could not open project (" + res.status + ").");
          loadList();
          return;
        }
        renderDetail(res.data);
      });
    }

    root.addEventListener("click", function (e) {
      var openBtn = e.target.closest(".proj-open");
      if (openBtn) {
        openProjectDetail(parseInt(openBtn.getAttribute("data-id"), 10));
        return;
      }
      var removeBtn = e.target.closest(".proj-member-remove");
      if (removeBtn && projectsState.view === "detail" && projectsState.projectId) {
        var uid = parseInt(removeBtn.getAttribute("data-uid"), 10);
        var who = removeBtn.getAttribute("data-name") || "this user";
        var pending = removeBtn.getAttribute("data-pending") === "1";
        var confirmMsg = pending
          ? "Cancel the invite for " + who + "? They will not join this project."
          : "Remove " + who + " from this project? Their company account is not deleted.";
        if (!confirm(confirmMsg)) return;
        api("/api/iris-project-members.php", {
          method: "DELETE",
          body: { project_id: projectsState.projectId, user_id: uid },
        }).then(function (res) {
          if (!res.data.ok) {
            window.alert(res.data.error || "Could not update project membership.");
            return;
          }
          openProjectDetail(projectsState.projectId);
        });
      }
    });
    root.addEventListener("change", function (e) {
      if (!e.target.classList.contains("proj-svc") || !canManageServices) return;
      if (projectsState.view !== "detail" || !projectsState.projectId) return;
      api("/api/iris-project-services.php", {
        method: "PATCH",
        body: {
          project_id: projectsState.projectId,
          service_name: e.target.getAttribute("data-svc"),
          enabled: e.target.checked,
        },
      }).then(function (r) {
        if (!r.data.ok) e.target.checked = !e.target.checked;
      });
    });

    window.OSirisDashboardAdmin.openProject = openProjectDetail;
    loadList();
  }

  function renderTabButtons(container, tabs, compact) {
    if (!container) return 0;
    container.innerHTML = "";
    var tabDefs = [
      { id: "projects", label: "Projects", icon: "folder_shared" },
      { id: "home", label: "Home", icon: "home" },
      { id: "super_admin", label: "Super Admin", icon: "admin_panel_settings" },
      { id: "team", label: "Team", icon: "groups" },
    ];
    var count = 0;
    tabDefs.forEach(function (t) {
      if (tabs.indexOf(t.id) === -1) return;
      count += 1;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = compact ? "dash-nav-link" : "dash-nav-link w-full text-left";
      btn.setAttribute("data-dash-tab", t.id);
      if (tabs[0] === t.id) btn.classList.add("dash-nav-link--active");
      btn.innerHTML =
        "<span class=\"material-symbols-outlined\" aria-hidden=\"true\">" + t.icon + "</span>" +
        "<span>" + escapeHtml(t.label) + "</span>";
      btn.addEventListener("click", function () { showPanel(t.id); });
      container.appendChild(btn);
    });
    return count;
  }

  window.OSirisDashboardAdmin = {
    openProject: null,
    init: function (dash) {
      dashCapabilities = dash.capabilities || {};
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
      if (tabs.indexOf("projects") !== -1) renderProjects(document.getElementById("panel-projects"));

      var urlParams = new URLSearchParams(window.location.search);
      var urlProject = urlParams.get("project_id");
      if (urlProject) {
        sessionStorage.setItem("osiris_open_project_id", urlProject);
        if (window.history && window.history.replaceState) {
          urlParams.delete("project_id");
          var qs = urlParams.toString();
          var clean = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
          window.history.replaceState({}, "", clean);
        }
      }
      var pendingProject = sessionStorage.getItem("osiris_open_project_id");
      if (pendingProject && tabs.indexOf("projects") !== -1 && typeof window.OSirisDashboardAdmin.openProject === "function") {
        sessionStorage.removeItem("osiris_open_project_id");
        showPanel("projects");
        window.OSirisDashboardAdmin.openProject(parseInt(pendingProject, 10));
      } else {
        showPanel(tabs[0] || "home");
      }
    },
  };
})();
