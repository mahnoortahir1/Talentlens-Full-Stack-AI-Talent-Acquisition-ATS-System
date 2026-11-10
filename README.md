[readme_md.md](https://github.com/user-attachments/files/34582192/readme_md.md)
<div align="center">

# 🎯 TalentLens | Full-Stack AI Talent Acquisition & ATS Platform

An enterprise-ready, explainable AI applicant tracking system (ATS) engineered to parse multi-format resumes, calculate evidence-backed candidate matching scores, conduct bias-mitigation audits, and orchestrate the interview lifecycle.

[![GitHub license](https://img.shields.io/github/license/mahnoortahir1/Talentlens-Full-Stack-AI-Talent-Acquisition-ATS-System?style=for-the-badge&color=blue)](LICENSE)
[![Node Version](https://img.shields.io/badge/Node.js-20.12+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Express Version](https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0+-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

[Key Features](#-key-features) • [System Architecture](#-system-architecture) • [Quick Start](#-quick-start) • [Evaluation & Scoring](#-explainable-matching-engine) • [API & Workflows](#-core-api-endpoints)

---
</div>

## 📌 Overview

Traditional Applicant Tracking Systems rely on naive keyword matching that rewards resume stuffing and overlooks qualified candidates with non-standard phrasing. **TalentLens** solves this by implementing **evidence-linked semantic retrieval**:

- **Explainable Match Scoring:** Every percentage point is tied to direct resume passages, verified credentials, or recognized ontological equivalents.
- **Fairness & Counterfactual Bias Audits:** Demographic markers (gender, age, location, ethnicity) are strictly sanitized prior to inference. The engine executes counterfactual delta audits to prove non-bias ($\Delta = 0$).
- **Human-In-The-Loop Design:** AI suggests, ranks, and highlights evidence; hiring managers retain final decision authority with auditable override logs.

---

## ✨ Key Features

| Capability | Technical Realization |
| :--- | :--- |
| **Document Parsing** | Native extraction from PDF (`pdf-parse`) and DOCX (`mammoth`) with line-wrap reconstitution and corruption protection. |
| **Ontology Normalization** | Bidirectional alias mapping (`k8s` $\rightarrow$ Kubernetes, `psql` $\rightarrow$ PostgreSQL) and hierarchical implications (`Django` $\implies$ Python). |
| **Vector Embeddings** | Integrated `all-MiniLM-L6-v2` transformer model (runs locally offline) with optional OpenAI / Gemini LLM augmentations. |
| **Claim Verification** | Bidirectional character-offset mapping linking extracted assertions back to exact resume excerpts. |
| **Conflict-Aware Scheduling** | Real-time recruiter calendar collision detection with timezone and interview panel support. |
| **Enterprise Security** | `httpOnly` secure JWT cookies, RBAC enforcement, strict Zod schema validation, and NoSQL injection sanitizer guards. |

---

## 🏗 System Architecture

```text
                     ┌──────────────────────────────┐
                     │    React 18 + Vite Client   │
                     │  (Tailwind UI + SVG Charts)  │
                     └──────────────┬───────────────┘
                                    │ HTTP / REST (/api)
                                    ▼
                     ┌──────────────────────────────┐
                     │     Express 5 API Engine     │
                     ├──────────────────────────────┤
                     │  • JWT Auth & RBAC Guards    │
                     │  • Zod Contract Validators   │
                     │  • Rate-Limiting & Helmet    │
                     └──────────────┬───────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ Extraction Core  │      │  Semantic Engine │      │ Persistence Tier │
├──────────────────┤      ├──────────────────┤      ├──────────────────┤
│ • pdf-parse      │      │ • MiniLM Embeds  │      │ • MongoDB 6+     │
│ • mammoth DOCX   │      │ • Cosine Vectors │      │ • Users/Profiles │
│ • Entity Redact  │      │ • Skill Ontology │      │ • Audit Trails   │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

---

## ⚡ Quick Start

### Option 1: Docker (Fastest)

Clone the repository and launch the containerized application stack:

```bash
# 1. Clone repository
git clone https://github.com/mahnoortahir1/Talentlens-Full-Stack-AI-Talent-Acquisition-ATS-System.git
cd Talentlens-Full-Stack-AI-Talent-Acquisition-ATS-System

# 2. Build and launch services in background
docker compose up --build -d

# 3. Seed demo accounts, sample jobs, and candidate resumes
docker compose exec app npm run seed -- --reset
```

The application will be live at: **`http://localhost:5000`**

---

### Option 2: Local Development Setup

#### Prerequisites
* Node.js $\ge$ 20.12.0
* MongoDB $\ge$ 6.0 (Local daemon or MongoDB Atlas URL)
* npm $\ge$ 10.0.0

```bash
# 1. Install all dependencies across workspace
npm run install:all

# 2. Create environment files
cp server/.env.example server/.env

# 3. Populate server/.env with your configurations
# MONGO_URI=mongodb://localhost:27017/talentlens
# JWT_SECRET=your_super_secret_key_here

# 4. Seed the database with the evaluation dataset
npm run seed

# 5. Start development servers concurrently
npm run dev:server    # Backend API: http://localhost:5000
npm run dev:client    # Vite Frontend: http://localhost:5173
```

---

## 🔑 Seed Test Accounts

The database comes pre-seeded with candidate scenarios and recruiter pipelines. All accounts share the credential password: `Demo@1234`

| Account Role | Email Identifier | Scenario Context |
| :--- | :--- | :--- |
| **Recruiter** | `recruiter@demo.com` | Preloaded pipelines, interview boards, and active job postings. |
| **Candidate 1** | `ayesha@demo.com` | Primary candidate: Backend specialist ($\approx 90\%$ match). |
| **Candidate 2** | `bilal@demo.com` | Ontological match: MySQL credited toward PostgreSQL ($\approx 55\%$). |
| **Candidate 3** | `sara@demo.com` | Edge candidate: Identifies qualification gaps ($\approx 29\%$). |

---

## 🧠 Explainable Matching Engine

The scoring pipeline (`server/src/services/matcher.js`) computes candidate ranking based on 4 configurable pillars:

```text
Score = 0.50(Skills) + 0.25(Experience) + 0.15(Projects) + 0.10(Qualifications)
```

| Factor | Weight | Scoring Mechanism |
| :--- | :---: | :--- |
| **Skills** | **50%** | Exact text evidence (1.0) · Implied skills (0.85) · Contextual semantic vector match (0.60) · Ontological relation cross-credit (0.80) · Self-reported (0.60). |
| **Experience** | **25%** | $60\%$ based on verified tenure length vs. threshold + $40\%$ based on semantic relevance of highest title held. |
| **Projects** | **15%** | Direct technology stack overlap + contextual embeddings of project problem statements. |
| **Qualifications**| **10%** | Degree level attainment (BS/MS/PhD) indexed against minimum job requirements and domain relevance. |

---

## 🧪 Testing & Verification

The suite includes 36 unit tests for isolated deterministic evaluation, plus full-lifecycle integration runs over an in-memory MongoDB server.

```bash
# Run unit tests (Parser, Matcher, Ontology, Fairness, Sanitization)
npm test

# Run full integration test scenario
npm run test:all
```

---

## 🔒 Security Best Practices

- **Zero-Trust Token Management:** JWTs delivered exclusively via `httpOnly`, `SameSite=Strict`, `Secure` cookies to eradicate XSS credential theft.
- **Data De-identification:** Sensitive PII and demographic metadata are parsed out before embedding vectors are generated.
- **Injection Mitigation:** Deep recursive sanitization of incoming JSON keys to neutralize MongoDB operator injection (`$gt`, `$ne`, etc.).
- **Upload Hardening:** Ingestion pipeline verifies magic bytes, mime-types, and caps files at 5MB to prevent zip bombs and malicious payloads.

---

## 📂 Project Structure

```bash
Talentlens-Full-Stack-AI-Talent-Acquisition-ATS-System/
├── client/                     # Vite + React 18 Single-Page Application
│   ├── src/
│   │   ├── components/         # Reusable UI (Evidence badges, SVG charts)
│   │   ├── pages/              # Recruiter & Candidate authenticated views
│   │   └── api.js              # Centralized Axios/Fetch HTTP client
│   └── package.json
│
├── server/                     # Node.js + Express 5 Core API
│   ├── src/
│   │   ├── models/             # Mongoose Schemas (User, Job, CandidateProfile)
│   │   ├── routes/             # REST endpoints (auth, search, interviews)
│   │   ├── services/           # AI Core (matcher, parser, embeddings, fairness)
│   │   └── middleware/         # Security guards, JWT verification, file upload
│   └── tests/                  # Unit and integration test suites
│
├── docker-compose.yml          # Container configuration
└── README.md
```

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more details.

---

<div align="center">
  <sub>Developed by <a href="https://github.com/mahnoortahir1">Mahnoor Tahir & Ariba Arif</a></sub>
</div>
