# TalentLens — Recruitment & Talent Intelligence Platform

A MERN application (MongoDB, Express, React, Node.js) that helps recruiters publish jobs, parse resumes, score applicants with **explainable, evidence-linked semantic matching**, shortlist, generate interview questions, schedule interviews and track recruitment analytics. Every hiring decision stays with a human.

## Quick start

### Option A — Docker (recommended)

```bash
docker compose up --build -d
docker compose exec app npm run seed -- --reset   # loads the demo scenario
```

Open http://localhost:5000.

### Option B — Local development

Requirements: Node.js 20.12+ and MongoDB 6+ running locally (or a MongoDB Atlas URI).

```bash
npm run install:all
cp server/.env.example server/.env      # edit MONGO_URI / JWT_SECRET if needed
npm run seed                             # demo data (wipes the configured database)
npm run dev:server                       # API on http://localhost:5000
npm run dev:client                       # UI on http://localhost:5173 (proxies /api)
```

On first start the API downloads the `all-MiniLM-L6-v2` Sentence-Transformers model (~25 MB) for semantic embeddings. Without internet access set `EMBEDDING_PROVIDER=hash` to use the offline fallback.

### Demo accounts (password `Demo@1234`)

| Role | Email |
|---|---|
| Recruiter | recruiter@demo.com |
| Candidates | ayesha@demo.com, bilal@demo.com, sara@demo.com, usman@demo.com |

## Demonstration scenario walkthrough

1. Sign in as **recruiter@demo.com**. The *Backend Developer* job (Python, Django, PostgreSQL, Docker) already has three applicants who applied with the PDF resumes in `/samples`.
2. Open **Jobs → Backend Developer**. Applicants are ranked (Ayesha ≈ 90, Bilal ≈ 55, Sara ≈ 29). Chips show *how* each skill was evidenced: solid = found in resume, dashed = partial credit via a related skill (Bilal's MySQL → PostgreSQL), pink = no evidence.
3. Open an applicant: score breakdown, matched skills with resume excerpts, gaps (missing evidence vs. confirmed absence), experience/projects/qualification evidence, learning suggestions, fairness check, claim verification and the audit trail.
4. Click **Shortlist**, go to **Interview questions → Generate questions**, edit/remove/regenerate as needed.
5. **Interviews** tab → schedule. Booking the same interviewer twice is flagged as a conflict.
6. Return to the **Dashboard**: stage counts, shortlist rate, processing time and skill gaps update.

To run the scenario from scratch instead: create a job, sign in as a new candidate, upload a PDF from `/samples`, and apply.

## Architecture

```
client/ (React 18 + Vite, react-router)          server/ (Express 5 + Mongoose)
  pages/recruiter/*  pages/candidate/*             routes/      auth, profile, jobs, applications,
  components/Evidence.jsx (score bar, chips)                    interviews, analytics, search, notifications
  components/Charts.jsx (dependency-free SVG)      middleware/  JWT cookie auth, RBAC, zod validation,
        │  fetch /api (httpOnly cookie)                         NoSQL-injection sanitising, uploads, errors
        ▼                                          services/    ← all AI logic lives here, pure & unit-tested
                                                     resumeParser   text → sections, contacts, skills+evidence,
MongoDB: users, candidateprofiles (parsed data +                    experience (overlap-merged), education, projects
  chunk embeddings), resumefiles, jobs,              skills         ontology: aliases (JS→JavaScript), relations
  applications (assessment, history, notes,          embeddings     MiniLM (local) | Gemini | OpenAI | hash fallback
  questions), interviews, notifications              matcher        weighted, explainable scoring
                                                     jobExtraction  JD → required/preferred skills (LLM + rules)
                                                     questions      LLM or evidence-driven generator
                                                     fairness       counterfactual attribute tests
                                                     verification   claim ↔ resume-excerpt linking
                                                     duplicates     normalised contacts + document similarity
```

Semantic retrieval stores per-section chunk embeddings in MongoDB and ranks them with cosine similarity in Node, which is fine at this scale. For large volumes, swap in MongoDB Atlas Vector Search with the same vectors.

## AI implementation

**Resume parsing** (`services/resumeParser.js`): `pdf-parse` (PDF) / `mammoth` (DOCX) → section detection → name, email, phone, links, skills (each with the resume lines that mention it), dated experience entries with total years (overlaps merged), education with degree level and field, projects with their technologies. Lines wrapped by PDF extraction are re-joined. Empty or scanned documents, wrong file types and corrupted/password-protected PDFs return clear messages. Candidates can correct skills and experience; recruiters can correct skills too.

**Normalisation**: a skill ontology maps aliases to canonical names (`JS`, `ES6` → JavaScript; `Postgres`, `psql` → PostgreSQL; `k8s` → Kubernetes), defines implications (Django ⇒ Python) and weighted relations (Flask ~ Django, MySQL ~ PostgreSQL). Ambiguous words (`Go`, `Spring`, `react`) are matched case-sensitively or only in unambiguous forms.

**Job-relevance score** (`services/matcher.js`), default weights from the brief, editable per job:

| Component | Weight | How it's computed |
|---|---|---|
| Skills | 50 | Importance-weighted credit per required skill (preferred skills count ½). Best of: exact evidence 1.0 · implied 0.85 · semantically similar resume passage 0.6 / 0.3 · related skill strength × 0.8 · self-reported without excerpt 0.6 |
| Experience | 25 | 60% years vs. minimum + 40% relevance of the best role (semantic similarity or skill overlap) |
| Projects | 15 | Overlap of project technologies with job skills, or semantic similarity to the job |
| Qualifications | 10 | Degree level vs. requirement, with field compatibility |

The output includes matched skills with match type, credit and excerpts, gaps classified as **no evidence**, **weak evidence** or **confirmed absent** (declared by the candidate or confirmed by a recruiter), natural-language explanations, learning suggestions and flags for anything without resume support. Recruiters can override the score with a mandatory reason.

**LLM features**: set `GEMINI_API_KEY` (free tier works) or `OPENAI_API_KEY`. The LLM extracts requirements from job descriptions and writes interview questions. Its output is always verified: extracted skills must appear in the description, and questions referring to projects not in the resume are flagged. Without a key the system uses a rule-based extractor and a question generator driven by the candidate's actual evidence (skills, gaps, projects) — nothing is hard-coded per candidate.

**Advanced talent intelligence**: natural-language talent search with evidence, semantic resume search, duplicate detection (Gmail dot/plus normalisation, phone suffix, name, shingle and embedding similarity) with confirmed merging, job recommendations for candidates (skills, projects and stated interests), talent-pool discovery respecting consent and a retention window, side-by-side comparison, and claim verification.

**Fairness**: names, contact details and protected/irrelevant attributes (gender, age/DOB, nationality, religion, marital status, etc.) are stripped before indexing and scoring. The **fairness check** re-runs the full parse → embed → score pipeline on counterfactual copies of a resume with only those attributes changed and reports the score deltas (expected: 0).

## Security

bcrypt (12 rounds) password hashing and a password policy · JWT in an httpOnly, SameSite=Lax cookie (Secure in production) · role-based authorisation plus ownership checks on every job/application/interview · candidates see only their own application status, never scores, notes or AI internals · zod validation on every input · `$`/dotted-key stripping against NoSQL injection · origin check on state-changing requests · Helmet headers · rate limiting (stricter on auth) · upload type, magic-byte and 5 MB size checks · generic login errors to avoid account enumeration.

## Testing

```bash
npm test                # 36 unit tests: parser, ontology, matcher, fairness, extraction, duplicates, questions, verification
npm run test:all        # + end-to-end API test of the demo scenario against an in-memory MongoDB
```

The integration test (`server/tests/integration/workflow.test.js`) walks the full demonstration scenario through the HTTP API and checks access control, validation and upload errors. It uses `mongodb-memory-server`, which downloads a MongoDB binary on first run.

## Rubric mapping

| Criterion | Where |
|---|---|
| Architecture & functional completeness (30) | Sections 3.1–3.10 implemented across `server/src/routes` and `client/src/pages` |
| AI implementation & matching quality (25) | `services/matcher.js`, `embeddings.js`, `skills.js`, `questions.js`, `jobExtraction.js` |
| Resume parsing & extraction (15) | `services/resumeParser.js`, `textExtract.js`, candidate/recruiter corrections |
| UI & experience (15) | Responsive React UI (sidebar on desktop, tab bar on mobile), palette `#F6E2E9 #FEFAF3 #B8CFB3 #84A282` |
| Innovation, testing, security & deployment (15) | Fairness tests, claim verification, unit + integration tests, Docker Compose |

## Known limitations

- Scanned (image-only) PDFs are detected and rejected with guidance; OCR is not included.
- Notifications are simulated as an in-app inbox (allowed by the brief).
- The offline `hash` embedding provider is less semantic than MiniLM; use `local` or a hosted provider for the demo.
