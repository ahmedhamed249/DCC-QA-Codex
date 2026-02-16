import {
  deleteAudit,
  getAudits,
  getLocalSessionUser,
  getScorecardTemplate,
  initFirebase,
  isCriticalAttribute,
  isFirebaseConfigured,
  login,
  logout,
  saveAppeal,
  saveScorecardTemplate,
  signup,
  upsertAudit,
} from "./firebase-service.js";

const state = {
  user: null,
  audits: [],
  scorecardTemplate: [],
  editScorecardMode: false,
  authMode: "login",
};

const el = {
  themeToggle: document.getElementById("themeToggle"),
  logoutBtn: document.getElementById("logoutBtn"),
  authView: document.getElementById("authView"),
  appView: document.getElementById("appView"),
  loginForm: document.getElementById("loginForm"),
  authState: document.getElementById("authState"),
  authModeLabel: document.getElementById("authModeLabel"),
  authModeHint: document.getElementById("authModeHint"),
  authActionBtn: document.getElementById("authActionBtn"),
  authToggleBtn: document.getElementById("authToggleBtn"),
  authNameWrap: document.getElementById("authNameWrap"),
  firebaseModePill: document.getElementById("firebaseModePill"),
  userLabel: document.getElementById("userLabel"),
  roleLabel: document.getElementById("roleLabel"),
  firebaseStatus: document.getElementById("firebaseStatus"),
  adminView: document.getElementById("adminView"),
  handlerView: document.getElementById("handlerView"),
  scorecardTemplateWrap: document.getElementById("scorecardTemplateWrap"),
  scorecardEditActions: document.getElementById("scorecardEditActions"),
  editScorecardBtn: document.getElementById("editScorecardBtn"),
  saveScorecardBtn: document.getElementById("saveScorecardBtn"),
  cancelScorecardBtn: document.getElementById("cancelScorecardBtn"),
  auditForm: document.getElementById("auditForm"),
  auditAttributesWrap: document.getElementById("auditAttributesWrap"),
  auditSaveState: document.getElementById("auditSaveState"),
  cancelEditAuditBtn: document.getElementById("cancelEditAuditBtn"),
  adminAuditTableWrap: document.getElementById("adminAuditTableWrap"),
  trendWrap: document.getElementById("trendWrap"),
  avgScore: document.getElementById("avgScore"),
  passRate: document.getElementById("passRate"),
  totalAudits: document.getElementById("totalAudits"),
  adminFilterHandler: document.getElementById("adminFilterHandler"),
  adminFilterFrom: document.getElementById("adminFilterFrom"),
  adminFilterTo: document.getElementById("adminFilterTo"),
  applyAdminFilters: document.getElementById("applyAdminFilters"),
  handlerAvgScore: document.getElementById("handlerAvgScore"),
  handlerPassRate: document.getElementById("handlerPassRate"),
  handlerTotalAudits: document.getElementById("handlerTotalAudits"),
  handlerTrendWrap: document.getElementById("handlerTrendWrap"),
  handlerAuditList: document.getElementById("handlerAuditList"),
};

function applyTheme() {
  const stored = localStorage.getItem("qa_theme") || "light";
  document.documentElement.classList.toggle("dark", stored === "dark");
}

function toggleTheme() {
  const dark = document.documentElement.classList.contains("dark");
  localStorage.setItem("qa_theme", dark ? "light" : "dark");
  applyTheme();
}


function animateButtonClick(button) {
  if (!button || button.dataset.noClickGreen === "true") return;
  button.classList.add("btn-clicked");
  window.setTimeout(() => button.classList.remove("btn-clicked"), 700);
}


function getFriendlyAuthError(error) {
  const code = String(error?.code || "");
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Invalid email or password.";
  }
  if (code.includes("email-already-in-use")) return "This work email is already registered.";
  if (code.includes("weak-password")) return "Password is too weak. Use at least 6 characters.";
  if (code.includes("invalid-email")) return "Please enter a valid work email address.";
  if (code.includes("operation-not-allowed")) return "Email/password sign-in is not enabled in Firebase Authentication.";
  if (String(error?.message || "").includes("Invalid credentials")) {
    return "Invalid email or password. If this is your first visit, create an account first.";
  }
  return error?.message || "Authentication failed. Please try again.";
}

function renderAuthMode() {
  const signupMode = state.authMode === "signup";
  el.authModeLabel.textContent = signupMode ? "Create your account" : "Welcome back";
  el.authModeHint.textContent = signupMode
    ? "Use your work email to create an account. Your user profile is automatically synced to Firebase."
    : "Sign in with your work email to access your QA dashboard.";
  el.authActionBtn.textContent = signupMode ? "Create Account" : "Sign In";
  el.authToggleBtn.textContent = signupMode ? "Already have an account? Sign in" : "New here? Create an account";
  el.authNameWrap.classList.toggle("hidden", !signupMode);
}

function toPct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function average(items, getValue) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + getValue(item), 0) / items.length;
}

function buildTemplateEditorCard(item, editable) {
  const requirementsText = item.requirements.join("\n");
  return `
    <article class="template-card" data-template-id="${item.id}">
      <div class="grid gap-2 md:grid-cols-2">
        <label class="text-sm font-medium">Attribute Name
          <input data-field="name" ${editable ? "" : "disabled"} value="${item.name}" class="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950" />
        </label>
        <label class="text-sm font-medium">Weight (%)
          <input data-field="weight" type="number" min="1" max="100" ${editable ? "" : "disabled"} value="${item.weight}" class="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950" />
        </label>
      </div>
      <label class="mt-2 block text-sm font-medium">Requirements (one point per line)
        <textarea data-field="requirements" rows="5" ${editable ? "" : "disabled"} class="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950">${requirementsText}</textarea>
      </label>
    </article>
  `;
}

function renderScorecardTemplate() {
  el.scorecardTemplateWrap.innerHTML = state.scorecardTemplate
    .map((item) => buildTemplateEditorCard(item, state.editScorecardMode))
    .join("");

  if (state.editScorecardMode) {
    el.scorecardEditActions.classList.remove("hidden");
    el.scorecardEditActions.classList.add("flex");
  } else {
    el.scorecardEditActions.classList.add("hidden");
    el.scorecardEditActions.classList.remove("flex");
  }
}

function collectEditedTemplate() {
  return Array.from(document.querySelectorAll("[data-template-id]"))
    .map((card) => {
      const id = card.dataset.templateId;
      const name = card.querySelector('[data-field="name"]').value.trim();
      const weight = Number(card.querySelector('[data-field="weight"]').value || 0);
      const requirements = card
        .querySelector('[data-field="requirements"]')
        .value.split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      return { id, name, weight, requirements };
    })
    .filter((entry) => entry.name);
}

function renderAuditAttributesForm() {
  el.auditAttributesWrap.innerHTML = state.scorecardTemplate
    .map(
      (attr) => `
      <article class="audit-attr-card" data-audit-attr="${attr.id}">
        <div class="mb-2 flex items-start justify-between gap-2">
          <div>
            <p class="font-semibold">${attr.name}</p>
            <p class="text-xs text-slate-500">Weight: ${attr.weight}%</p>
          </div>
          <label class="text-sm font-medium">Pass/Fail
            <select data-field="status" class="mt-1 rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950">
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
            </select>
          </label>
        </div>
        <div class="mb-2 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-900">
          <p class="font-medium">Quality points:</p>
          <ul class="list-disc pl-6">
            ${attr.requirements.map((req) => `<li>${req}</li>`).join("")}
          </ul>
        </div>
        <label class="text-sm font-medium">Auditor Comments (attribute specific)
          <textarea data-field="comments" rows="5" class="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950"></textarea>
        </label>
      </article>
    `,
    )
    .join("");
}

function calculateAuditResult(attributeResults) {
  let score = 0;
  const totalWeight = state.scorecardTemplate.reduce((sum, item) => sum + Number(item.weight || 0), 0);

  attributeResults.forEach((entry) => {
    const template = state.scorecardTemplate.find((attr) => attr.id === entry.attributeId);
    if (!template) return;
    if (entry.status === "pass") score += Number(template.weight || 0);
  });

  const normalized = totalWeight ? (score / totalWeight) * 100 : 0;
  const criticalFail = attributeResults.some((entry) => {
    const template = state.scorecardTemplate.find((attr) => attr.id === entry.attributeId);
    return template && isCriticalAttribute(template.name) && entry.status === "fail";
  });

  return {
    weightedScore: Number(normalized.toFixed(1)),
    finalResult: criticalFail ? "Fail" : "Pass",
  };
}

function gatherAttributeResultsFromForm() {
  return Array.from(document.querySelectorAll("[data-audit-attr]"))
    .map((card) => ({
      attributeId: card.dataset.auditAttr,
      status: card.querySelector('[data-field="status"]').value,
      comments: card.querySelector('[data-field="comments"]').value.trim(),
    }));
}

function setAuditFormData(audit) {
  const form = el.auditForm;
  form.auditId.value = audit.id;
  form.claimRef.value = audit.claimRef;
  form.auditDate.value = audit.auditDate;
  form.claimStatus.value = audit.claimStatus;
  form.handlerName.value = audit.handlerName;
  form.overallComments.value = audit.overallComments || "";

  audit.attributeResults.forEach((entry) => {
    const card = document.querySelector(`[data-audit-attr="${entry.attributeId}"]`);
    if (!card) return;
    card.querySelector('[data-field="status"]').value = entry.status;
    card.querySelector('[data-field="comments"]').value = entry.comments || "";
  });

  el.cancelEditAuditBtn.classList.remove("hidden");
  el.auditSaveState.textContent = `Editing audit ${audit.claimRef}`;
}

function clearAuditForm() {
  el.auditForm.reset();
  renderAuditAttributesForm();
  el.cancelEditAuditBtn.classList.add("hidden");
}

function renderTrend(targetEl, audits) {
  if (!audits.length) {
    targetEl.innerHTML = '<p class="text-sm text-slate-500">No trend data yet.</p>';
    return;
  }

  const sorted = [...audits].sort((a, b) => new Date(a.auditDate) - new Date(b.auditDate));
  targetEl.innerHTML = sorted
    .map(
      (audit) => `
      <div class="mb-2 grid gap-2 md:grid-cols-[120px_1fr_70px] md:items-center">
        <p class="text-sm text-slate-500">${audit.auditDate}</p>
        <div class="rounded-full bg-slate-200 p-1 dark:bg-slate-800"><div class="trend-bar" style="width:${audit.weightedScore}%;"></div></div>
        <p class="text-sm font-semibold">${toPct(audit.weightedScore)}</p>
      </div>
    `,
    )
    .join("");
}

function renderAdminTable(audits) {
  if (!audits.length) {
    el.adminAuditTableWrap.innerHTML = '<p class="text-sm text-slate-500">No audits found for selected filters.</p>';
    return;
  }

  el.adminAuditTableWrap.innerHTML = `
    <table class="min-w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left dark:border-slate-700">
          <th class="px-2 py-2">Claim</th>
          <th class="px-2 py-2">Handler</th>
          <th class="px-2 py-2">Auditor</th>
          <th class="px-2 py-2">Date</th>
          <th class="px-2 py-2">Score</th>
          <th class="px-2 py-2">Result</th>
          <th class="px-2 py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
      ${audits
        .map(
          (audit) => `
        <tr class="border-b border-slate-100 dark:border-slate-800">
          <td class="px-2 py-2">${audit.claimRef}</td>
          <td class="px-2 py-2">${audit.handlerName}</td>
          <td class="px-2 py-2">${audit.auditorName}</td>
          <td class="px-2 py-2">${audit.auditDate}</td>
          <td class="px-2 py-2">${toPct(audit.weightedScore)}</td>
          <td class="px-2 py-2 font-semibold ${audit.finalResult === "Pass" ? "text-emerald-600" : "text-rose-600"}">${audit.finalResult}</td>
          <td class="px-2 py-2">
            <div class="flex gap-2">
              <button class="btn btn-secondary" data-edit-audit="${audit.id}">Edit</button>
              <button class="btn border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-300" data-delete-audit="${audit.id}">Delete</button>
            </div>
          </td>
        </tr>
      `,
        )
        .join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll("[data-edit-audit]").forEach((button) => {
    button.addEventListener("click", () => {
      const audit = state.audits.find((a) => a.id === button.dataset.editAudit);
      if (audit) setAuditFormData(audit);
    });
  });

  document.querySelectorAll("[data-delete-audit]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteAudit(button.dataset.deleteAudit);
      await refreshData();
    });
  });
}

function filterAuditsForAdmin() {
  let filtered = [...state.audits];
  const handler = el.adminFilterHandler.value.trim().toLowerCase();
  const from = el.adminFilterFrom.value;
  const to = el.adminFilterTo.value;

  if (handler) filtered = filtered.filter((audit) => audit.handlerName.toLowerCase().includes(handler));
  if (from) filtered = filtered.filter((audit) => audit.auditDate >= from);
  if (to) filtered = filtered.filter((audit) => audit.auditDate <= to);

  return filtered;
}

function renderAdminAnalytics() {
  const audits = filterAuditsForAdmin();
  el.totalAudits.textContent = String(audits.length);
  el.avgScore.textContent = toPct(average(audits, (item) => item.weightedScore));
  el.passRate.textContent = toPct(average(audits, (item) => (item.finalResult === "Pass" ? 100 : 0)));

  renderTrend(el.trendWrap, audits);
  renderAdminTable(audits);
}

function renderHandlerView() {
  const mine = state.audits.filter((audit) => audit.handlerName.toLowerCase() === state.user.displayName.toLowerCase());
  el.handlerTotalAudits.textContent = String(mine.length);
  el.handlerAvgScore.textContent = toPct(average(mine, (item) => item.weightedScore));
  el.handlerPassRate.textContent = toPct(average(mine, (item) => (item.finalResult === "Pass" ? 100 : 0)));
  renderTrend(el.handlerTrendWrap, mine);

  if (!mine.length) {
    el.handlerAuditList.innerHTML = '<p class="text-sm text-slate-500">No audits available yet.</p>';
    return;
  }

  el.handlerAuditList.innerHTML = mine
    .map(
      (audit) => `
      <article class="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 class="font-bold">${audit.claimRef}</h4>
          <p class="text-sm font-semibold ${audit.finalResult === "Pass" ? "text-emerald-600" : "text-rose-600"}">${audit.finalResult} • ${toPct(audit.weightedScore)}</p>
        </div>
        <p class="text-sm">Date: ${audit.auditDate}</p>
        <p class="text-sm">Auditor: ${audit.auditorName}</p>
        <p class="mt-2 text-sm">${audit.overallComments || "No summary comments."}</p>
        <button class="btn btn-secondary mt-3" data-appeal-audit="${audit.id}">Appeal Audit</button>
        <div data-appeal-wrap="${audit.id}"></div>
      </article>
    `,
    )
    .join("");

  document.querySelectorAll("[data-appeal-audit]").forEach((button) => {
    button.addEventListener("click", () => {
      const wrap = document.querySelector(`[data-appeal-wrap="${button.dataset.appealAudit}"]`);
      wrap.innerHTML = `
        <form class="mt-3 space-y-2" data-appeal-form="${button.dataset.appealAudit}">
          <textarea required rows="4" class="w-full rounded-lg border border-slate-300 px-2 py-1 dark:border-slate-700 dark:bg-slate-950" placeholder="State reason for appeal"></textarea>
          <button class="btn btn-primary">Submit Appeal</button>
        </form>
      `;

      const form = wrap.querySelector("form");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const reason = form.querySelector("textarea").value.trim();
        await saveAppeal({
          id: crypto.randomUUID(),
          auditId: button.dataset.appealAudit,
          handlerName: state.user.displayName,
          reason,
          status: "Open",
          createdAt: new Date().toISOString(),
        });
        wrap.innerHTML = '<p class="mt-2 text-sm text-emerald-600">Appeal submitted successfully.</p>';
      });
    });
  });
}

function renderByRole() {
  const isAdmin = state.user.role === "admin";
  el.adminView.classList.toggle("hidden", !isAdmin);
  el.handlerView.classList.toggle("hidden", isAdmin);

  if (isAdmin) renderAdminAnalytics();
  else renderHandlerView();
}

async function refreshData() {
  state.audits = await getAudits();
  renderByRole();
}

async function initAuthedUI(user) {
  state.user = user;
  el.authView.classList.add("hidden");
  el.appView.classList.remove("hidden");
  el.logoutBtn.classList.remove("hidden");

  el.userLabel.textContent = `${user.displayName} (${user.email})`;
  el.roleLabel.textContent = user.role;
  el.firebaseStatus.textContent = isFirebaseConfigured() ? "Connected" : "Demo Local Mode";

  state.scorecardTemplate = await getScorecardTemplate();
  renderScorecardTemplate();
  renderAuditAttributesForm();
  await refreshData();
}

function wireEvents() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    animateButtonClick(button);
  });

  el.themeToggle.addEventListener("click", toggleTheme);

  el.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(el.loginForm);
    const isSignup = state.authMode === "signup";
    const statusLabel = isSignup ? "Creating account..." : "Signing in...";
    el.authState.textContent = statusLabel;

    try {
      const payload = {
        email: String(fd.get("email") || "").trim(),
        password: String(fd.get("password") || ""),
        displayName: String(fd.get("displayName") || "").trim(),
      };

      const user = isSignup ? await signup(payload) : await login(payload.email, payload.password);
      el.authState.textContent = "";
      await initAuthedUI(user);
    } catch (error) {
      const message = getFriendlyAuthError(error);
      el.authState.textContent = `${isSignup ? "Sign up" : "Login"} failed: ${message}`;
    }
  });

  el.authToggleBtn.addEventListener("click", () => {
    state.authMode = state.authMode === "login" ? "signup" : "login";
    el.authState.textContent = "";
    renderAuthMode();
  });

  el.logoutBtn.addEventListener("click", async () => {
    await logout();
    window.location.reload();
  });

  el.editScorecardBtn.addEventListener("click", () => {
    state.editScorecardMode = true;
    renderScorecardTemplate();
  });

  el.cancelScorecardBtn.addEventListener("click", async () => {
    state.editScorecardMode = false;
    state.scorecardTemplate = await getScorecardTemplate();
    renderScorecardTemplate();
  });

  el.saveScorecardBtn.addEventListener("click", async () => {
    const edited = collectEditedTemplate();
    const totalWeight = edited.reduce((sum, item) => sum + item.weight, 0);
    if (edited.length !== 10) {
      alert("Scorecard must contain exactly 10 attributes.");
      return;
    }
    if (totalWeight <= 0) {
      alert("Total weight must be greater than zero.");
      return;
    }

    await saveScorecardTemplate(edited);
    state.scorecardTemplate = edited;
    state.editScorecardMode = false;
    renderScorecardTemplate();
    renderAuditAttributesForm();
  });

  el.auditForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fd = new FormData(el.auditForm);
    const attributeResults = gatherAttributeResultsFromForm();
    const calc = calculateAuditResult(attributeResults);

    const auditId = fd.get("auditId") || crypto.randomUUID();
    const audit = {
      id: auditId,
      claimRef: fd.get("claimRef"),
      auditDate: fd.get("auditDate"),
      claimStatus: fd.get("claimStatus"),
      handlerName: fd.get("handlerName"),
      auditorName: state.user.displayName,
      overallComments: fd.get("overallComments"),
      attributeResults,
      weightedScore: calc.weightedScore,
      finalResult: calc.finalResult,
      createdAt: new Date().toISOString(),
    };

    await upsertAudit(audit);
    el.auditSaveState.textContent = `Saved ${audit.claimRef} (${calc.finalResult} ${toPct(calc.weightedScore)})`;
    clearAuditForm();
    await refreshData();
  });

  el.cancelEditAuditBtn.addEventListener("click", () => {
    clearAuditForm();
    el.auditSaveState.textContent = "";
  });

  el.applyAdminFilters.addEventListener("click", renderAdminAnalytics);
}

async function bootstrap() {
  applyTheme();
  wireEvents();
  renderAuthMode();
  await initFirebase();

  el.firebaseModePill.textContent = isFirebaseConfigured() ? "Firebase Connected" : "Demo Local Mode";

  const localSession = getLocalSessionUser();
  if (localSession) await initAuthedUI(localSession);

  lucide.createIcons();
}

bootstrap();
