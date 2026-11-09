import { setEmbeddingProvider } from '../../src/services/embeddings.js';

// Unit tests use the deterministic offline embedding provider: fast and reproducible.
setEmbeddingProvider('hash');

export const STRONG_RESUME = `Ayesha Malik
Backend Engineer | ayesha.malik@gmail.com | +92 321 5550192 | github.com/ayeshamalik
Summary
Backend engineer building Python web services.
Skills
Python, Django, DRF, Postgres, Docker, Redis, Git
Experience
Software Engineer at Arbisoft
Mar 2021 - Feb 2025
- Built REST APIs in Django REST Framework serving 80k monthly users
- Containerised services with Docker and docker-compose
Associate Engineer, Systems Ltd
Jan 2020 - Feb 2021
- Developed Django features backed by PostgreSQL
Education
BS Computer Science, University of the Punjab, 2019
Projects
ClinicQ: Django + PostgreSQL booking system deployed in Docker`;

export const WEAK_RESUME = `Sara Iqbal
Web Developer | sara@yahoo.com | +92 333 4445566
Skills
JavaScript, React, MongoDB
Experience
Junior Web Developer at Codeworks
Sep 2024 - Feb 2025
- Built React screens for an admin panel
Education
Intermediate, Govt College, 2019`;

export const JOB = {
  title: 'Backend Developer',
  description: 'Backend Developer. Requirements: 3+ years with Python and Django, strong PostgreSQL, Docker.',
  requiredSkills: [{ name: 'Python', importance: 4 }, { name: 'Django', importance: 4 }, { name: 'PostgreSQL', importance: 5 }, { name: 'Docker', importance: 4 }],
  preferredSkills: [{ name: 'Kubernetes', importance: 2 }],
  minExperienceYears: 3,
  qualifications: ["Bachelor's in Computer Science"],
};
