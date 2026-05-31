# Security Specification & Threat Model - IvorySourcing

## Data Invariants
1. **User Profiles (`/users/{userId}`)**:
   - Primary identifier must match the authenticated `uid`.
   - Immutable keys after creation: `uid`, `email`, `createdAt`.
   - System/Admin-only keys: `isVerified`, `isPremium`, and `role`. Users cannot self-escalate their `role` to `'admin'`.
   - Structural sizes: `displayName` <= 150 characters, `bio` <= 1000 characters.

2. **Job Postings (`/jobs/{jobId}`)**:
   - `employerId` must match the creator's logged-in `uid`.
   - Initial status must be `'pending'`. Non-admins cannot set state to `'approved'` or `'rejected'`.
   - Only admins or the job owner can manage postings; only admins can approve postings or toggle premium.

3. **Applications (`/applications/{appId}`)**:
   - Must link to an existing job document in the `/jobs` collection.
   - Initial status must be `'pending'`.
   - A candidate can only write applications where `candidateId` is their own `uid`. They cannot create applications for others.
   - Candidates cannot approve/accept their own applications. Only the job employer or an admin can update the application status to `'accepted'` or `'rejected'`.

4. **Reviews (`/reviews/{reviewId}`)**:
   - Must be authored by the logged-in user (`authorId == request.auth.uid`).
   - Must target an existing candidate profile.
   - Rating must be constrained between `1` and `5`.

5. **Profile Unlocks (`/unlocks/{unlockId}`)**:
   - Contact unlock documents are completely private. Only the purchasing employer (`employerId == request.auth.uid`) or an admin can read or write individual records. No blanket reads.

---

## The "Dirty Dozen" Malicious Payloads

### Payload 1: Privilege Escalation on Register
*   **Target Path**: `/users/attacker_user`
*   **Attack**: Attacker attempts to set their own role to `'admin'`.
```json
{
  "uid": "attacker_user",
  "displayName": "Hacker Chef",
  "email": "hacker@domain.ci",
  "role": "admin",
  "isVerified": false,
  "isPremium": false,
  "createdAt": "2026-05-31T01:26:00Z"
}
```

### Payload 2: Profile Hijacking (Identity Spoofing)
*   **Target Path**: `/users/victim_user`
*   **Attack**: Logged-in attacker attempts to overwrite `victim_user`'s profile.
```json
{
  "uid": "victim_user",
  "displayName": "Impostor Candidate",
  "email": "victim@domain.ci",
  "role": "candidate",
  "isVerified": true,
  "isPremium": false,
  "createdAt": "2026-05-31T01:26:00Z"
}
```

### Payload 3: Illegal Self-Verification
*   **Target Path**: `/users/attacker_user` (Update)
*   **Attack**: Candidate attempts to self-approve verification status (`isVerified = true`).
```json
{
  "isVerified": true
}
```

### Payload 4: Resource Poisoning / Wallet Exhaustion
*   **Target Path**: `/users/attacker_user`
*   **Attack**: Injection of a massive payload (e.g. 1MB string size) to exhaust server quotas or trigger memory issues.
```json
{
  "displayName": "AAAA...[1.2MB String]...AAAA"
}
```

### Payload 5: Job Creation Approval Bypass
*   **Target Path**: `/jobs/illegal_approved_job`
*   **Attack**: Employer creates a job posting and directly sets status to `"approved"`, skipping moderation.
```json
{
  "employerId": "employer_user",
  "title": "Chauffeur de Maître",
  "description": "Recrutement urgent à Cocody",
  "category": "chauffeur",
  "location": "Abidjan",
  "salaryRange": "150000 FCFA",
  "status": "approved",
  "isPremium": false,
  "createdAt": "2026-05-31T01:26:00Z"
}
```

### Payload 6: Job Employer Identity Hijacking
*   **Target Path**: `/jobs/hijacked_employer_job`
*   **Attack**: Attacker posts a job listing under a reputable employer's `employerId`.
```json
{
  "employerId": "reputable_employer_uid_123",
  "title": "Nounou Privée",
  "status": "pending"
}
```

### Payload 7: Unauthorized Job Modification
*   **Target Path**: `/jobs/legit_job_id` (Update)
*   **Attack**: Non-owner attempts to modify or delete a job's details.
```json
{
  "title": "Modified Title By Hacker"
}
```

### Payload 8: Candidate Self-Acceptance
*   **Target Path**: `/applications/app_id_1`
*   **Attack**: Candidate changes their application status directly from `'pending'` to `'accepted'` without employer consent.
```json
{
  "status": "accepted"
}
```

### Payload 9: Orphaned Application Registry
*   **Target Path**: `/applications/orphan_app`
*   **Attack**: Candidate submits an application linked to a non-existent job ID `fake_job_id_999`.
```json
{
  "jobId": "fake_job_id_999",
  "candidateId": "candidate_user",
  "status": "pending"
}
```

### Payload 10: Out-of-bounds Review Score
*   **Target Path**: `/reviews/toxic_review`
*   **Attack**: User leaves a rating of `999` or `-50` with offensive comments.
```json
{
  "targetUserId": "candidate_user",
  "authorId": "attacker_user",
  "rating": 999,
  "comment": "Abusive review rating score."
}
```

### Payload 11: PII Bulk Retrieval Attempt
*   **Target Path**: `/users` (List)
*   **Attack**: Malicious actor runs a script to retrieve the private list of candidate email addresses from profiles.
```javascript
// Querying collection with no owner filter:
const query = collection(db, 'users');
```

### Payload 12: Unlock Harvesting
*   **Target Path**: `/unlocks/any_active_unlock_document`
*   **Attack**: Unauthorized user attempts to search/read purchase list to scrape candidate contact phones.
```javascript
// Reading arbitrary unlock
const docRef = doc(db, 'unlocks', 'some_other_employer_uid_candidate_123');
await getDoc(docRef);
```

---

## Test Runner Verification (firestore.rules.test.ts template)

```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

describe("IvorySourcing Firebase Rule Verification", () => {
  let testEnv: any;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "ivoire-sourcing-db",
      firestore: {
        rules: require("fs").readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it("should block privilege escalation (Payload 1)", async () => {
    const context = testEnv.authenticatedContext("attacker_user", { email: "hacker@domain.ci", email_verified: true });
    const db = context.firestore();
    await assertFails(
      db.doc("users/attacker_user").set({
        uid: "attacker_user",
        displayName: "Hacker Chef",
        email: "hacker@domain.ci",
        role: "admin",
        isVerified: false,
        isPremium: false,
        createdAt: "2026-05-31T01:26:00Z"
      })
    );
  });

  it("should block victim user profile hijacking (Payload 2)", async () => {
    const context = testEnv.authenticatedContext("attacker_user", { email: "hacker@domain.ci", email_verified: true });
    const db = context.firestore();
    await assertFails(
      db.doc("users/victim_user").set({
        uid: "victim_user",
        displayName: "Impostor Candidate",
        email: "victim@domain.ci",
        role: "candidate",
        isVerified: true,
        isPremium: false
      })
    );
  });

  it("should block self-verification (Payload 3)", async () => {
    const context = testEnv.authenticatedContext("attacker_user", { email: "hacker@domain.ci", email_verified: true });
    const db = context.firestore();
    // Setup pre-existing user profile as candidate
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().doc("users/attacker_user").set({
        uid: "attacker_user",
        displayName: "Chef Cooker",
        email: "hacker@domain.ci",
        role: "candidate",
        isVerified: false,
        isPremium: false
      });
    });

    await assertFails(
      db.doc("users/attacker_user").update({
        isVerified: true
      })
    );
  });

  it("should enforce status moderation on job creation (Payload 5)", async () => {
    const context = testEnv.authenticatedContext("employer_user", { email: "employer@domain.ci", email_verified: true });
    const db = context.firestore();
    await assertFails(
      db.doc("jobs/illegal_approved_job").set({
        employerId: "employer_user",
        title: "Chauffeur",
        description: "Recrutement urgent",
        category: "chauffeur",
        location: "Abidjan",
        status: "approved"
      })
    );
  });

  it("should prevent candidates from approving their own job application (Payload 8)", async () => {
    const context = testEnv.authenticatedContext("candidate_user", { email: "candidate@domain.ci", email_verified: true });
    const db = context.firestore();
    // Seed application
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().doc("applications/app_id_1").set({
        id: "app_id_1",
        jobId: "job_xyz",
        candidateId: "candidate_user",
        employerId: "employer_user",
        status: "pending"
      });
    });

    await assertFails(
      db.doc("applications/app_id_1").update({
        status: "accepted"
      })
    );
  });
});
```
