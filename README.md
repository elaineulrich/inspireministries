# inspireministries

The Inspire Ministries Texas website ([inspireministries.net](https://inspireministries.net)), rebuilt as a Node.js app with the student application handled in-house instead of through JotForm.

## What's included

**Public site.** These pages recreate the current WordPress site: Home, 2026 Bible School Event, Contact Us, Student Application (with the PDF downloads), and the Survey link.

**Online student application** (`/student-application-online`)
- A multi-step form. Answers save automatically, and the student gets an emailed link to resume, so they can stop and come back at any time.
- The student agrees to the terms and **signs** with a finger or mouse, plus their typed name.
- After submitting, the student's status page lets them complete each reference (parent and pastor) in one of two ways:
  - **In person:** hand their phone to the parent or pastor, who fills out and signs their part right there.
  - **By email:** send a secure link to the parent or pastor. If enabled in Settings, this happens automatically on submit. Links can be re-sent.
- The parent reference has Father's and Mother's signatures; at least one is required. The pastor reference has the Leader's signature.
- Parents and pastors can also save their progress and come back later.
- When everything is signed, the application becomes **Ready for review** and the board is emailed.

**Admin portal** (`/admin`)
- **Applications:** search and filter by status, see reference progress, and open the full packet (student, parent and pastor answers with signatures, timestamps and IP addresses). From there you can change the status (Under review, Accepted, Waitlisted, Declined…), add private board notes, re-send or copy reference links, re-open a form for edits, print or save it as a PDF, or export everything to CSV.
- **Forms:** a form editor for the student, parent and pastor forms. Add, remove or reorder sections and questions; change wording, options, required/optional and width; and add "Other" boxes, agreements, signatures or instruction text. Submitted applications keep the exact version of the form they were signed against.
- **Settings:** where application notifications are emailed, whether references are auto-sent, open/close applications, contact info, and the email sender name.
- **Admin users:** add or remove admins and change your password.
- **Email log:** every email the system sent, or recorded when email isn't connected yet.

## Running it

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env   # then edit it
npm start              # http://localhost:3000
```

The `.env` file is not loaded automatically. Set these as real environment variables on your host, or run `node --env-file=.env server.js`.

On the first start, an admin account is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. If no password is set, a random one is printed to the console. Sign in at `/admin` and change it under **Admin Users**.

### Email

Until `SMTP_HOST` is set, emails are **recorded in the Email Log but not delivered**, which is useful for testing. To send for real with the ministry Gmail account:
1. Turn on 2-Step Verification on the Google account, then create an **App Password**.
2. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER` to the Gmail address, and `SMTP_PASS` to the app password.
3. Set `BASE_URL` to the live site address so links in emails work.
4. Use **Settings → Send test email** to confirm.

### Hosting

Everything (applications, signatures, forms, settings) is stored in one SQLite file in `DATA_DIR`. Host it anywhere that runs Node.js **with a persistent disk**, for example a small VPS, Render (with a disk), Railway (with a volume), or Fly.io (with a volume). Back up the `data/` folder regularly.

## Project layout

```
server.js               app entry
src/db.js               SQLite schema
src/forms-default.js    default student / parent / pastor forms (from the original JotForm + PDFs)
src/forms.js            form schema cleaning, validation, display
src/applications.js     application + reference workflow and notification emails
src/mail.js             email sending + email template
src/routes/             public pages, application flow, admin portal
views/                  EJS templates (site, application, admin)
public/                 CSS, JS (form runner, form builder), images, fonts, PDFs
```
