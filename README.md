# DCC QA Command Center (Role-Based MVP)

This version includes:

- **Authentication-first login flow** (no dashboard access before sign-in).
- **Strict role views**:
  - `admin`: full scorecard control + audit CRUD + global analytics.
  - `handler`: personal trend, personal scores, appeal submission only.
- **Modern AI-style UI** with light/dark mode, glass panels, subtle animation, and clickable button feedback.
- **Pass/Fail weighted scoring** with critical auto-fail attributes.
- **Permanent admin override** for `wayne.freddie@disastercarecapital.co.uk`.

---

## Firebase setup (your project)

Project provided:

- **Project name:** `DCC-QA-Tool-Codex`
- **Project ID:** `dcc-qa-tool`
- **Project number:** `1020064882955`

### 1) Add web app config

In `index.html`, before `app.js`, add your Firebase config:

```html
<script>
  window.__FIREBASE_CONFIG__ = {
    apiKey: "...",
    authDomain: "dcc-qa-tool.firebaseapp.com",
    projectId: "dcc-qa-tool",
    storageBucket: "dcc-qa-tool.appspot.com",
    messagingSenderId: "1020064882955",
    appId: "..."
  };
</script>
```

If omitted, app runs in **Demo Local Mode**.

### 2) Authentication requirements

Yes — for **Authentication**, there are no “rules” like Firestore rules. You must:

1. Go to **Firebase Console → Authentication → Sign-in method**.
2. Enable **Email/Password**.
3. Create users (admin + handlers).

### 3) Permanent admin user

- Create this auth user in Firebase Authentication:
  - `wayne.freddie@disastercarecapital.co.uk`
- The app now forces this exact email to `admin` role at login (permanent admin override).

> Recommended: still create a matching Firestore user profile document for consistency.

### 4) Firestore collections

Create collections:

- `users`
- `scorecardTemplate`
- `audits`
- `auditAppeals`

For `users`, document id should be the user UID:

```json
{
  "displayName": "Wayne Freddie",
  "role": "admin"
}
```

Handlers should use:

```json
{
  "displayName": "Handler Name",
  "role": "handler"
}
```

### 5) Firestore security rules (required)

Use this baseline, then tighten further for production:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isPermanentAdmin() {
      return signedIn() && request.auth.token.email == 'wayne.freddie@disastercarecapital.co.uk';
    }
    function role() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }
    function isAdmin() {
      return signedIn() && (isPermanentAdmin() || role() == 'admin');
    }

    match /users/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || isAdmin());
      allow write: if isAdmin();
    }

    match /scorecardTemplate/{docId} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    match /audits/{docId} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    match /auditAppeals/{docId} {
      allow create: if signedIn();
      allow read, update, delete: if isAdmin();
    }
  }
}
```

### 6) Verify integration

After login, top panel should show:

- **Connected** = Firebase loaded.
- **Demo Local Mode** = local fallback only.

---

## Demo login (local mode only)

- Admin: `admin@demo.com` / `admin123`
- Permanent admin demo seed: `wayne.freddie@disastercarecapital.co.uk` / `admin123`
- Handler: `handler@demo.com` / `handler123`

---

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.


## Sign up flow

- Users can now create accounts directly from the login page using **work email + password**.
- On sign up, the app automatically creates:
  - Firebase Auth user (email/password)
  - Firestore `users/{uid}` profile document with default role `handler`
- Permanent admin email `wayne.freddie@disastercarecapital.co.uk` is auto-assigned `admin`.

If you still see login errors, confirm:
1. `window.__FIREBASE_CONFIG__` is present in `index.html`
2. Firebase Authentication has **Email/Password** enabled
3. User exists (or use Sign Up to create it)
