# Claims QA Command Center (Role-Based MVP)

This version upgrades the QA tool into an authentication-first app with:

- **Login required** before any view is accessible.
- **Role-based interfaces**:
  - `admin`: full controls (scorecard editing, audit creation, edit/delete, global analytics).
  - `handler`: only personal trend/performance, own audit results, and appeal submission.
- **Pass/Fail per attribute scoring** with editable weights.
- **10-attribute template** with large requirement + comments fields per attribute.
- **Light/Dark mode** and premium enterprise UI built with Tailwind.

---

## Core workflows

### Admin capabilities
- Edit scorecard template only after pressing **Edit Scorecard**.
- Change attribute names, weights, and quality requirement points.
- Create audits with pass/fail for each attribute.
- See all agent performance trends and filter by:
  - handler name
  - date range
- Edit and delete audits.

### Handler capabilities
- No admin switch or admin controls.
- View only own trends and audit history.
- Submit appeal for any audit.

---

## Firebase integration steps (Auth + Firestore)

### 1) Create Firebase project
1. Go to Firebase Console → Create Project.
2. Add a **Web App** and copy config.

### 2) Enable Authentication
1. Authentication → Sign-in method → Enable **Email/Password**.
2. Create users for admin/handlers.

### 3) Create Firestore database
1. Firestore Database → Create database.
2. Start in production mode.

### 4) Add config to app
In `index.html`, before `app.js`, add:

```html
<script>
  window.__FIREBASE_CONFIG__ = {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  };
</script>
```

If omitted, app runs in **Demo Local Mode** with seeded users.

### 5) Seed `users` role documents
Create Firestore `users` collection where document id = Firebase `uid`:

```json
{
  "displayName": "QA Admin",
  "role": "admin"
}
```

Handler documents should use `"role": "handler"`.

### 6) Create data collections
- `scorecardTemplate`
- `audits`
- `auditAppeals`

### 7) Firestore rules baseline

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function userRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }

    match /users/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
      allow write: if false;
    }

    match /audits/{docId} {
      allow read: if signedIn() && (userRole() == 'admin' || resource.data.handlerUid == request.auth.uid);
      allow write: if signedIn() && userRole() == 'admin';
    }

    match /scorecardTemplate/{docId} {
      allow read: if signedIn();
      allow write: if signedIn() && userRole() == 'admin';
    }

    match /auditAppeals/{docId} {
      allow create: if signedIn();
      allow read: if signedIn() && userRole() == 'admin';
      allow update, delete: if signedIn() && userRole() == 'admin';
    }
  }
}
```

### 8) Verify Firebase status
After login, dashboard shows:
- **Connected** → Firebase config loaded.
- **Demo Local Mode** → local fallback.

---

## Demo login (local mode only)

- Admin: `admin@demo.com` / `admin123`
- Handler: `handler@demo.com` / `handler123`

---

## Run locally

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.
