const STORAGE_KEYS = {
  audits: "qa_audits_v2",
  appeals: "qa_appeals_v2",
  scorecard: "qa_scorecard_v2",
  users: "qa_users_v2",
};

const DEFAULT_SCORECARD = [
  { id: crypto.randomUUID(), name: "Soft Skills", weight: 14, requirements: ["Empathy", "Professional tone", "Active listening"] },
  { id: crypto.randomUUID(), name: "Communication with PH / Insurance / Subcontractors", weight: 14, requirements: ["Clear updates", "Accurate expectation setting"] },
  { id: crypto.randomUUID(), name: "SLA & Escalation Path", weight: 14, requirements: ["SLA monitored", "Correct escalation steps"] },
  { id: crypto.randomUUID(), name: "Ownership (Critical)", weight: 15, requirements: ["Takes accountability", "No avoidable handoff"] },
  { id: crypto.randomUUID(), name: "Company Values (Critical)", weight: 10, requirements: ["Values demonstrated in communication"] },
  { id: crypto.randomUUID(), name: "Resolution / Knowledge (Critical)", weight: 12, requirements: ["Correct claim handling", "Policy understanding"] },
  { id: crypto.randomUUID(), name: "Documentation Accuracy (Critical)", weight: 10, requirements: ["Detailed notes", "Timeline and actions logged"] },
  { id: crypto.randomUUID(), name: "Language Quality", weight: 8, requirements: ["Grammar and clarity"] },
  { id: crypto.randomUUID(), name: "Options / Alternatives Offered", weight: 7, requirements: ["Options explained clearly"] },
  { id: crypto.randomUUID(), name: "ClickUp Task Updates", weight: 6, requirements: ["Tasks current and complete"] },
];

const criticalKeyword = "(Critical)";
const PERMANENT_ADMIN_EMAIL = "wayne.freddie@disastercarecapital.co.uk";

let firebaseMode = false;
let authRef = null;
let dbRef = null;
let providerFns = null;

function readJson(key, fallback = []) {
  return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function resolveRoleByEmail(email, fallbackRole = "handler") {
  const normalized = String(email || "").toLowerCase();
  if (normalized === PERMANENT_ADMIN_EMAIL.toLowerCase()) return "admin";
  return fallbackRole;
}

function buildUserPayload(user, role) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email,
    role,
  };
}

export function isFirebaseConfigured() {
  return firebaseMode;
}

export async function initFirebase() {
  const config = window.__FIREBASE_CONFIG__;
  if (!config || !config.apiKey) {
    seedLocalUsers();
    seedScorecard();
    return;
  }

  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js");
  const authMod = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js");
  const dbMod = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js");

  const app = appMod.initializeApp(config);
  authRef = authMod.getAuth(app);
  dbRef = dbMod.getFirestore(app);
  providerFns = { authMod, dbMod };
  firebaseMode = true;
}

function seedLocalUsers() {
  const users = readJson(STORAGE_KEYS.users, []);
  if (users.length) return;

  writeJson(STORAGE_KEYS.users, [
    { uid: "local-admin", email: "admin@demo.com", password: "admin123", role: "admin", displayName: "QA Admin" },
    { uid: "local-permanent-admin", email: PERMANENT_ADMIN_EMAIL, password: "admin123", role: "admin", displayName: "Wayne Freddie" },
    { uid: "local-handler", email: "handler@demo.com", password: "handler123", role: "handler", displayName: "Sample Handler" },
  ]);
}

function seedScorecard() {
  const existing = readJson(STORAGE_KEYS.scorecard, []);
  if (!existing.length) writeJson(STORAGE_KEYS.scorecard, DEFAULT_SCORECARD);
}

export async function signup({ email, password, displayName }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanDisplayName = String(displayName || "").trim() || cleanEmail;

  if (!firebaseMode) {
    const users = readJson(STORAGE_KEYS.users, []);
    if (users.some((item) => item.email.toLowerCase() === cleanEmail)) {
      throw new Error("An account with this email already exists.");
    }

    const role = resolveRoleByEmail(cleanEmail, "handler");
    const localUser = {
      uid: crypto.randomUUID(),
      email: cleanEmail,
      password,
      role,
      displayName: cleanDisplayName,
      createdAt: new Date().toISOString(),
    };

    users.push(localUser);
    writeJson(STORAGE_KEYS.users, users);
    localStorage.setItem("qa_active_user", JSON.stringify({ uid: localUser.uid, email: localUser.email, displayName: localUser.displayName }));

    return { uid: localUser.uid, email: localUser.email, displayName: localUser.displayName, role: localUser.role };
  }

  const { createUserWithEmailAndPassword, updateProfile } = providerFns.authMod;
  const { doc, setDoc } = providerFns.dbMod;

  const credential = await createUserWithEmailAndPassword(authRef, cleanEmail, password);

  if (cleanDisplayName) {
    await updateProfile(credential.user, { displayName: cleanDisplayName });
  }

  const role = resolveRoleByEmail(cleanEmail, "handler");
  await setDoc(
    doc(dbRef, "users", credential.user.uid),
    {
      displayName: cleanDisplayName,
      email: cleanEmail,
      role,
      createdAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return buildUserPayload({ ...credential.user, displayName: cleanDisplayName }, role);
}

export async function login(email, password) {
  if (!firebaseMode) {
    const users = readJson(STORAGE_KEYS.users, []);
    const user = users.find((item) => item.email.toLowerCase() === String(email || "").toLowerCase() && item.password === password);
    if (!user) throw new Error("Invalid credentials");

    localStorage.setItem("qa_active_user", JSON.stringify({ uid: user.uid, email: user.email, displayName: user.displayName }));
    const role = resolveRoleByEmail(user.email, user.role);
    return { uid: user.uid, email: user.email, displayName: user.displayName, role };
  }

  const { signInWithEmailAndPassword } = providerFns.authMod;
  const { doc, getDoc } = providerFns.dbMod;
  const credential = await signInWithEmailAndPassword(authRef, email, password);

  const normalizedEmail = String(credential.user.email || "").toLowerCase();
  const permanentRole = resolveRoleByEmail(normalizedEmail, null);

  let role = "handler";
  if (permanentRole) {
    role = permanentRole;
  } else {
    const profile = await getDoc(doc(dbRef, "users", credential.user.uid));
    role = profile.exists() ? profile.data().role || "handler" : "handler";
  }

  return buildUserPayload(credential.user, role);
}

export async function logout() {
  if (!firebaseMode) {
    localStorage.removeItem("qa_active_user");
    return;
  }
  const { signOut } = providerFns.authMod;
  await signOut(authRef);
}

export function getLocalSessionUser() {
  if (firebaseMode) return null;
  const user = localStorage.getItem("qa_active_user");
  if (!user) return null;
  const parsed = JSON.parse(user);
  const profile = readJson(STORAGE_KEYS.users, []).find((item) => item.uid === parsed.uid);
  if (!profile) return null;
  return { ...parsed, role: resolveRoleByEmail(parsed.email, profile.role) };
}

export async function getScorecardTemplate() {
  if (!firebaseMode) {
    seedScorecard();
    return readJson(STORAGE_KEYS.scorecard, DEFAULT_SCORECARD);
  }

  const { collection, getDocs, query, orderBy } = providerFns.dbMod;
  const q = query(collection(dbRef, "scorecardTemplate"), orderBy("order", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveScorecardTemplate(template) {
  if (!firebaseMode) {
    writeJson(STORAGE_KEYS.scorecard, template);
    return;
  }

  const { collection, getDocs, writeBatch, doc } = providerFns.dbMod;
  const existing = await getDocs(collection(dbRef, "scorecardTemplate"));
  const batch = writeBatch(dbRef);
  existing.docs.forEach((d) => batch.delete(d.ref));
  template.forEach((item, index) => {
    const ref = doc(collection(dbRef, "scorecardTemplate"));
    batch.set(ref, { ...item, order: index });
  });
  await batch.commit();
}

export async function getAudits() {
  if (!firebaseMode) return readJson(STORAGE_KEYS.audits, []);

  const { collection, getDocs, query, orderBy } = providerFns.dbMod;
  const q = query(collection(dbRef, "audits"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertAudit(audit) {
  if (!firebaseMode) {
    const audits = readJson(STORAGE_KEYS.audits, []);
    const index = audits.findIndex((a) => a.id === audit.id);
    if (index >= 0) audits[index] = audit;
    else audits.unshift(audit);
    writeJson(STORAGE_KEYS.audits, audits);
    return;
  }

  const { doc, setDoc } = providerFns.dbMod;
  await setDoc(doc(dbRef, "audits", audit.id), audit, { merge: true });
}

export async function deleteAudit(auditId) {
  if (!firebaseMode) {
    const audits = readJson(STORAGE_KEYS.audits, []).filter((a) => a.id !== auditId);
    writeJson(STORAGE_KEYS.audits, audits);
    return;
  }

  const { doc, deleteDoc } = providerFns.dbMod;
  await deleteDoc(doc(dbRef, "audits", auditId));
}

export async function saveAppeal(appeal) {
  if (!firebaseMode) {
    const appeals = readJson(STORAGE_KEYS.appeals, []);
    appeals.unshift(appeal);
    writeJson(STORAGE_KEYS.appeals, appeals);
    return;
  }

  const { doc, setDoc } = providerFns.dbMod;
  await setDoc(doc(dbRef, "auditAppeals", appeal.id), appeal);
}

export function isCriticalAttribute(name) {
  return name.includes(criticalKeyword);
}
