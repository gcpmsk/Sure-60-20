# Sure60 — complete setup guide / poora setup

## जल्दी शुरू करें — आपके लिए जरूरी जानकारी

**पूरा updated code:** https://github.com/gcpmsk/Sure-60-20/tree/genspark_ai_developer  
**Changes / PR:** https://github.com/gcpmsk/Sure-60-20/pull/2

1. Supabase पर नया project बनाइए। नीचे section 1 में दिए `supabase/setup.sql` का **पूरा code** SQL Editor में paste करके Run कीजिए। Raw file: https://raw.githubusercontent.com/gcpmsk/Sure-60-20/genspark_ai_developer/supabase/setup.sql
2. Supabase → Authentication → Providers → Email में **Confirm email OFF** रखिए, क्योंकि students roll number से register करेंगे। Unverified students का login application reject करती है; database भी उनका classes/tests access block करता है।
3. Authentication → Users → Add user में अपना **वास्तविक admin email** और **अपना नया private password (12+ characters)** सेट कीजिए। फिर section 2 का SQL अपने email के साथ चलाइए। कोई default working password नहीं रखा गया है।
4. Cloudflare → Workers & Pages → Create application → **Pages → Connect to Git** → इस GitHub repository को चुनिए। अभी production branch `genspark_ai_developer` रखिए। PR #2 merge करने के बाद `main` भी चुन सकते हैं।
5. Build command `npm run build`, output `dist`, root खाली, framework Vite, `NODE_VERSION=22`। अपनी `VITE_SUPABASE_URL` और `VITE_SUPABASE_ANON_KEY` section 3 के अनुसार डालिए। Service-role/secret key कभी नहीं डालनी है।
6. Deploy के बाद असली Cloudflare URL पर `/Avinash` जोड़कर admin panel खोलिए, जैसे `https://YOUR_PROJECT.pages.dev/Avinash`। यह केवल format का उदाहरण है, बनाई गई live site का दावा नहीं। Footer में भी **Avinash** ही दिखाई देगा।
7. Students → Verify; Batches → Create; Students → Batches → assign; Classes & notes → subject/topic, video और PDF links; Tests & answers → question PDF + answer PDF → review → publish। Website settings में logo, तीनों hero slides, social links और पूरा Karnal campus address बदलिए।

**Admin username:** आपके द्वारा Supabase Auth में बनाया गया email। **Password:** आपका निजी चुना हुआ password। वास्तविक Supabase values के बिना preview में कोई working login नहीं होता। Credentials Supabase Auth से बदलते हैं; profile का display username बदलने से login email नहीं बदलता।

**वीडियो सीमा:** YouTube link पूरी तरह छिपाना, encrypted करके extraction रोकना या screen recording/download की 100% रोकथाम संभव नहीं है। Unlisted embedding समर्थित है; DRM video hosting अलग integration है।

## What is ready

React + Vite responsive website, a three-slide animated hero, batch filters, student signup/sign-in, admin verification, assigned subject-wise lessons and PDF links, timed MCQ practice, automatic/server-side grading, result cards, full searchable rankings, and an admin workspace linked as **Avinash** in the footer. Branding, campus address, photo/logo URLs, social links, courses, lessons and tests are editable from admin.

**Without environment values, the site is a clearly labelled preview:** three sample batches and one local five-question practice test. Demo answers are intentionally in the browser; production answer keys are in a private database schema. No production accounts, admissions, results, phone numbers or claims are invented.

## 1. Create Supabase and paste the SQL

1. Open https://supabase.com/dashboard and create a **new project**. Save the database password privately.
2. Wait for project provisioning.
3. Open **SQL Editor → New query**.
4. Open [`supabase/setup.sql`](supabase/setup.sql) in this repository, click **Raw**, copy the **entire file**, paste it into SQL Editor, then **Run**.
5. Check success. The final block installs a once-per-minute job named `sure60-expire-tests`. If a cron warning appears, open **Database → Extensions → pg_cron**, enable it and rerun the final `do $cron_setup$ ...` block. Do not ignore this if automatic closed-browser submission is required.
6. Under **Project Settings → Data API / API**, copy the **Project URL** (format `https://YOUR_PROJECT_REF.supabase.co`). Under **API Keys**, copy the **publishable key** (`sb_publishable_...`) or legacy **anon public** key (`eyJ...`). Both are supported.
7. **Never** put a `service_role`, `sb_secret_...`, database password, or admin password into `VITE_` variables or GitHub.
8. Keep `private` OUT of exposed API schemas. Only the default `public` API schema is needed. Do not disable RLS.

### Student authentication setting — important

Students use roll numbers rather than real emails. The application maps `S60001` to the internal authentication identifier `s60001@students.sure60.app`. This is not an email inbox.

In **Authentication → Sign In / Providers → Email**, enable email/password signup and **turn OFF Confirm email**. Otherwise the placeholder student email cannot receive confirmation and login will fail. Admin approval is separate: every new profile is unverified by default, enforced in SQL. After signup the application signs students out. Sign-in is rejected until verification. Even if someone directly obtains an Auth session, SQL blocks all lessons, questions, test attempts and rankings until verified.

Roll numbers must be unique: 3–30 letters, digits, dots, underscores or hyphens. They are stored lowercase. Give students their roll numbers before signup and verify their identity before approving them. There is no self-service email recovery for roll-number accounts; an administrator must perform password resets. Use a trusted private workflow for resets. Enable suitable Supabase Auth rate limits. If you later enable CAPTCHA in Supabase, add a matching CAPTCHA widget before launch (not included in this version).

## 2. Create your administrator (Avinash)

No default password is hardcoded or committed. A working administrator requires your own Supabase project.

1. **Authentication → Users → Add user → Create new user**.
2. Email: use **your real email address**. This email is the admin login username.
3. Password: choose a **new unique password, at least 12 characters**. Save it in your password manager. Enable **Auto Confirm User**.
4. The database trigger creates a profile automatically.
5. In SQL Editor run the following, replacing the email with the exact address you just created:

```sql
update public.profiles
set role = 'admin', verified = true, full_name = 'Avinash'
where id = (
  select id from auth.users
  where lower(email) = lower('YOUR_REAL_ADMIN_EMAIL')
);
```

6. Confirm exactly one account was updated:

```sql
select id, full_name, username, role, verified
from public.profiles
where role = 'admin';
```

7. Open **`https://YOUR_ACTUAL_PROJECT_NAME.pages.dev/Avinash`**, or scroll to the footer and click **Avinash**. Reloading this route works on Cloudflare Pages through the included SPA redirect.
8. **Username:** your real admin email from step 2. **Password:** the private password you set in step 3.
9. Only accounts with database `role='admin' AND verified=true` get admin privileges. Merely knowing the footer entry does not grant access.

### Change admin username/password using Supabase

Admin login username is the Supabase Auth **email**, not `profiles.username`. Change email/password from the signed-in **Website settings → Update your admin credentials**. Supabase may require email confirmation/re-authentication.

You can also reset from Supabase Authentication → Users using the supported user-management/recovery controls for your dashboard version. If the dashboard does not expose direct password changes, use the server-side Auth Admin API `auth.admin.updateUserById(userId, { email, password })` from a trusted local administrative script with a service-role key kept exclusively server-side. Never add that key to this frontend. Do not edit `auth.users.encrypted_password` manually. Updating a display username in `profiles` alone does not change the login email.

Hiding the footer entry does not disable the secure `/Avinash` route. To show the footer link again, use SQL Editor:

```sql
update public.site_settings
set data = jsonb_set(data, '{admin_enabled}', 'true'::jsonb, true)
where id = 1;
```

## 3. Cloudflare Pages — connect GitHub

The complete code is in https://github.com/gcpmsk/Sure-60-20.

1. Open https://dash.cloudflare.com → **Workers & Pages**.
2. Choose **Create application → Pages → Connect to Git / Import an existing Git repository**. The labels vary slightly; choose **Pages**, not a Worker with a `wrangler deploy` command.
3. Authorize GitHub and allow Cloudflare access to **gcpmsk/Sure-60-20**.
4. Select repository **Sure-60-20**.
5. Use these exact build values:

| Cloudflare field | Value |
| --- | --- |
| Project name | `sure60` (or an available name you choose) |
| Production branch | `genspark_ai_developer` — contains the completed code |
| Framework preset | `Vite` (or `React (Vite)` if offered) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Leave blank (repository root) |
| Node version variable | `NODE_VERSION` = `22` |

6. **Environment variables**: add these to **Production**, and also Preview if you want branch previews to connect:

| Variable name | Exact value to supply |
| --- | --- |
| `VITE_SUPABASE_URL` | Your actual `https://YOUR_PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your actual Supabase publishable/anon public key |
| `NODE_VERSION` | `22` |

7. Click **Save and Deploy**. No deploy command, Node server, Worker secret, build token or Supabase service-role key is needed for Pages.
8. Cloudflare gives you `https://YOUR_ACTUAL_PROJECT_NAME.pages.dev`. Use the actual generated address, not a guessed link.
9. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://YOUR_ACTUAL_PROJECT_NAME.pages.dev`
   - **Redirect URLs**: `https://YOUR_ACTUAL_PROJECT_NAME.pages.dev/**`
   - If using a custom domain, add its exact URL and redirect pattern too.
10. Open the site, sign in as admin, create your real batches and verify a test student.
11. After changing any `VITE_` variable, **rebuild/redeploy**. These are compiled into the browser build.
12. Optional: Pages → **Custom domains → Set up a custom domain** and follow DNS instructions.

The included `public/_redirects` handles SPA navigation. `public/_headers` adds basic security headers. Production source maps are not enabled. The public Supabase key is expected to be visible; RLS and function permissions are the security boundary.

PR #1 is already merged. The new direct `/Avinash` route and regression-tested refinements are in PR #2. Choose `genspark_ai_developer` for this update, or merge PR #2 before selecting `main`.

## 4. Daily admin workflow

### Students and batches

- Student: Student Login → Create an account → full name, assigned roll number, password.
- Admin: Avinash → Students → **Verify**.
- Admin: Batches → **New batch**, set title, exam category, price, mode, subject list and optional banner URL.
- Admin: Students → **Batches** → enable the enrolled batch. Verification alone does not grant all batches.
- Student: sign out/in to refresh verification → **My Batches** → assigned batch → subject.
- Revoking verification blocks protected database reads and new test operations. Already downloaded media cannot be recalled.
- Deleting a batch also deletes its lessons, enrollments and batch-specific tests/results. Use care; backups are recommended.
- Enrollment is manual; a payment gateway is not included.

### Video class + PDF notes

- Classes & notes → Add class → choose batch, class name, subject, topic, YouTube link, PDF link, duration and display order.
- Use **YouTube unlisted**, and enable embedding on YouTube.
- Student sees subject filters, Watch buttons and an adjacent PDF icon; the lesson player also has Open class notes.
- PDF links must be actual accessible HTTPS links. This version accepts links; it does not upload/host lesson PDF files. A public PDF URL can be shared by someone who has it.
- **YouTube private videos are not a reliable embedded LMS source.** YouTube unlisted links are visible to an authorized viewer through browser tools. Encoding/encrypting a URL in JavaScript cannot hide it from that browser. This app does not make false “download-proof” promises. For stronger video control use a separate paid DRM/expiring-token service; screen recording still cannot be absolutely prevented.

### PDF MCQ tests

1. Tests & answers → Create test.
2. Set title, category, duration (1–240 minutes), marks, negative marking and optional batch restriction.
3. Upload a text-selectable **question PDF** and a separate **answer PDF**, each at most 15 MB. They are parsed locally; no paid AI/OCR service is used, and originals are not stored.
4. Expected question format (one option per line):

```text
1. What is 2 + 2?
A) 2
B) 3
C) 4
D) 5

2. Which city is the Sure60 campus in?
A) Karnal
B) Delhi
C) Jaipur
D) Mumbai
```

Answer PDF:

```text
1. C
2. A
```

5. Use **Parse & review**. Correct the editable text/options and select the right answer for **every** question. Add manually if needed.
6. Click **Publish questions**. Up to 500 questions are supported per test.
7. Scanned PDFs, diagrams, mathematical layout and multi-column PDFs are **not automatically OCR-transcribed**. Type/correct them manually. Do not publish unreviewed parser output.
8. Published test question/answer content is immutable in this UI so existing attempts remain reproducible. Hide or delete and create a corrected test if necessary. Deleting a test deletes results. Do not modify active-test marks or question content directly in the database.

### Timing, grading and rankings

- One attempt per student per test; restarting/reloading cannot reset a live deadline.
- Every option selection is saved through a serialized queue, preventing older requests from overwriting newer answers. A save status and Retry save button report connectivity problems. The browser shows a running countdown and submits at zero or on explicit confirmation.
- Before the deadline, a manual submission includes current answers. After the deadline, SQL ignores newly supplied answers and grades only answers saved before expiry.
- SQL grades against `private.answer_keys`; students cannot download production answer keys or write their own scores.
- Cron finalizes closed-browser attempts within roughly one minute. If cron is disabled, expired attempts finalize when that test/leaderboard is next requested.
- Internet is required. Answers that never reach Supabase before expiry cannot be counted. Do not promise offline exam support.
- Result: correct, wrong, unanswered and marks. Banner shows the top three and the logged-in student's result, with participant count. Rankings panel lists all completed participants with name, roll number, right/wrong and score.
- Rankings are current when the banner/panel loads, not websocket-pushed every second. Reopen to refresh.
- Ties: score descending, fewer wrong answers, shorter elapsed completion time, then attempt ID. Ranking is deterministic.
- Rankings are only visible to verified students with access to that test (and admins). Explain leaderboard visibility to students and obtain any required consent before enrolling minors.

## 5. Local development and tests

```bash
npm ci
cp .env.example .env
# Fill your two Supabase public values in .env, or leave it absent for demo mode.
npm run dev -- --port 3000
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

`.env` is ignored by git. Node 22 recommended. Browser tests use an existing local preview on port 3000. `tests/database.test.js` uses PGlite and a minimal Supabase-auth fixture to test real PostgreSQL policies/functions locally; it is not a substitute for the launch smoke test on your real Supabase project. Run `npm run test:db` after installing dependencies. Test scripts cap the JavaScript heap for small development machines. Browser tests need Chromium and its system libraries, run against the **unconfigured demo** at port 3000, and cover `/Avinash` reloads, mobile navigation, setup-gated signup, manual grading and automatic expiry. They do not pretend to test a real Supabase Auth project. Start the preview separately; browser tests do not start a server automatically.

### Launch smoke test (required on your real project)

- Create one admin and two students. Verify only one student.
- Confirm the unverified student sees no lessons and cannot start a test.
- Assign one batch to the verified student. Confirm other batches' lessons remain inaccessible.
- Publish a two-question test and attempt it. Verify correct/wrong grading and one-attempt rule.
- Start another short test; let its timer expire. Confirm automatic submission, including when the tab is closed with cron enabled.
- Confirm anon/unverified accounts cannot access `private.answer_keys`, write scores, self-verify or get rankings.
- Add social/logo links and exact Karnal address, refresh the public site.
- Test on your mobile phone and desktop with the actual Cloudflare URL.

## Assets and project boundaries

The hero photo was retrieved through the platform's CC/PD-filtered image search from Needpix, titled “Students, education, school, young, college”. Source: https://www.needpix.com/photo/download/1155176/students-education-school-young-college-learning-happy-study-group-university-people-girl-female-person-book-knowledge-class-classroom-learn-friends-studying-woman-smiling-together-lesson-adult-boy-high-teenager-caucasian-child-cheerful-youth-library-hispanic-mexico-casual-latin-cute-brunette-male-academic-mexican-technology-20s-notebook-computer-ethnic-indoors-handsome-guy-copy-man-baja-california-tijuana-haircut-long-mustache-business-lifestyle-hipster-businessman-face-fashion-millennial. Replace it with your own campus photo for authentic branding. No image-generation tool was used. CSS shapes and Lucide icons make the other visuals. Avatar initials/stars in the hero are decorative community artwork, not customer review data.

No real Supabase project, admin account, real enrollment data, exact street address, or production Cloudflare deployment is created without your account configuration. The SQL policy/grading suite runs locally against PostgreSQL; real Supabase Auth, live cron installation and YouTube permissions must still be smoke-tested after account setup. The included code and SQL implement those workflows, while the unconfigured preview demonstrates layout and a local quiz only.
