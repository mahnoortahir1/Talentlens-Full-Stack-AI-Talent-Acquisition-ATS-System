/**
 * Rule-based resume parser. Turns raw resume text into structured, evidence-linked data.
 * Pure module (no I/O) so it is fully unit-testable. Every extracted skill keeps the
 * resume line(s) it came from, which powers explainability and hallucination checks.
 */
import { findSkillsInText } from './skills.js';

const SECTION_ALIASES = {
  summary: ['summary', 'profile', 'professional summary', 'about me', 'objective', 'career objective'],
  skills: ['skills', 'technical skills', 'core skills', 'key skills', 'technologies', 'tech stack', 'competencies', 'core competencies', 'tools'],
  experience: ['experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history', 'career history', 'internships', 'internship'],
  education: ['education', 'academic background', 'academics', 'qualifications', 'academic qualifications'],
  projects: ['projects', 'personal projects', 'academic projects', 'key projects', 'selected projects', 'portfolio'],
  certifications: ['certifications', 'certificates', 'licenses', 'courses', 'training'],
  personal: ['personal information', 'personal details', 'personal info'],
  other: ['languages', 'interests', 'hobbies', 'achievements', 'awards', 'references', 'publications', 'volunteering'],
};

const HEADER_LOOKUP = new Map();
for (const [section, names] of Object.entries(SECTION_ALIASES)) names.forEach((n) => HEADER_LOOKUP.set(n, section));

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const MONTH_RE = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_TOKEN = `(?:${MONTH_RE}\\s*,?\\s*\\d{4}|\\d{1,2}[/.-]\\d{4}|\\d{4})`;
const RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|to|until|till)\\s*(${DATE_TOKEN}|present|current|now|ongoing|date)`, 'i');

/** Lines describing protected / irrelevant personal characteristics. Excluded from scoring. */
const PROTECTED_LINE_RE = /(^|\|\s*)\s*[•\-*]?\s*(gender|sex|marital status|religion|caste|nationality|date of birth|d\.o\.b\.?|dob|age|ethnicity|race|father'?s name|husband'?s name|cnic|passport(?: no\.?)?|blood group|disability|domicile|photo)\s*[:\-]/i;

const DEGREE_PATTERNS = [
  { level: 5, re: /\b(ph\.?\s?d|doctorate|doctor of philosophy)\b/i, label: 'PhD' },
  { level: 4, re: /\b(m\.?\s?s\.?c?|master'?s?|m\.?\s?tech|mba|m\.?\s?eng|mcs|ms\s?cs)\b/i, label: 'Master' },
  { level: 3, re: /\b(b\.?\s?s\.?c?|bachelor'?s?|b\.?\s?tech|b\.?\s?e\b|b\.?\s?eng|bcs|bscs|bs\s?cs|bs\s?se|undergraduate|b\.?\s?a\b)\b/i, label: 'Bachelor' },
  { level: 2, re: /\b(associate degree|diploma|dae|hnd)\b/i, label: 'Diploma' },
  { level: 1, re: /\b(intermediate|f\.?\s?sc|a[- ]levels?|high school|hssc|ssc|matric|o[- ]levels?)\b/i, label: 'School' },
];
const FIELD_RE = /\b(computer science|software engineering|computer engineering|information technology|data science|artificial intelligence|electrical engineering|mathematics|statistics|physics|business|information systems|cs|se|it)\b/i;

/**
 * PDF text extraction breaks long lines where the page wrapped them. Re-join a line onto the
 * previous one when the previous line is long, has no closing punctuation, and this line looks
 * like a continuation (starts lowercase, or is a short fragment that is not a header/bullet).
 */
export function joinWrappedLines(lines) {
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const continuation = prev && prev.length >= 75 && !/[.!?:;]$/.test(prev) && !headerOf(line) && !/^[•\-*▪◦]/.test(line) && !RANGE_RE.test(line)
      && (/^[a-z(]/.test(line) || (line.length < 30 && line.split(' ').length <= 4));
    if (continuation) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

/** Degree level (0-5) and field mentioned in a qualification string. */
export function degreeInfo(text = '') {
  const deg = DEGREE_PATTERNS.find((d) => d.re.test(text));
  return { level: deg?.level || 0, label: deg?.label || null, field: (text.match(FIELD_RE) || [])[0]?.toLowerCase() || null };
}

const clean = (t) => t.replace(/\u0000/g, '').replace(/[\t\f\v ]+/g, ' ').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();

function headerOf(line) {
  const norm = line.toLowerCase().replace(/[:•|_*#=\-–]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (norm.length > 40 || norm.split(' ').length > 4) return null;
  return HEADER_LOOKUP.get(norm) || null;
}

/** Split resume text into named sections. Text before the first header is "header". */
export function segmentSections(text) {
  const sections = { header: [] };
  let current = 'header';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const h = headerOf(line);
    if (h) { current = h; sections[current] = sections[current] || []; continue; }
    (sections[current] = sections[current] || []).push(line);
  }
  return sections;
}

function parseDate(token, isEnd) {
  if (!token) return null;
  const t = token.toLowerCase().trim();
  if (/present|current|now|ongoing|date/.test(t)) return new Date();
  const mY = t.match(new RegExp(`(${MONTH_RE})\\s*,?\\s*(\\d{4})`, 'i'));
  if (mY) return new Date(Number(mY[2]), MONTHS[mY[1].slice(0, 3).replace('.', '')] ?? 0, 1);
  const nY = t.match(/(\d{1,2})[/.-](\d{4})/);
  if (nY) return new Date(Number(nY[2]), Math.min(11, Number(nY[1]) - 1), 1);
  const y = t.match(/(\d{4})/);
  if (y) return new Date(Number(y[1]), isEnd ? 11 : 0, 1);
  return null;
}

const monthsBetween = (a, b) => Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1);

/** Merge overlapping intervals so parallel jobs aren't double-counted. */
export function totalExperienceMonths(entries) {
  const iv = entries.filter((e) => e.start && e.end).map((e) => [new Date(e.start).getTime(), new Date(e.end).getTime()]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of iv) {
    if (merged.length && s <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    else merged.push([s, e]);
  }
  return merged.reduce((sum, [s, e]) => sum + monthsBetween(new Date(s), new Date(e)), 0);
}

function parseExperience(lines) {
  const entries = [];
  let cur = null;
  lines.forEach((line, i) => {
    const m = line.match(RANGE_RE);
    if (m) {
      if (cur) entries.push(cur);
      const start = parseDate(m[1], false);
      const end = parseDate(m[2], true);
      const headline = line.replace(m[0], '').replace(/[|,()–—-]+\s*$/g, '').replace(/^\s*[|,()–—-]+/g, '').trim();
      // Title/company are usually on this line or the line before it.
      const prev = i > 0 && !RANGE_RE.test(lines[i - 1]) && !/^[•\-*]/.test(lines[i - 1]) ? lines[i - 1] : '';
      const titleLine = headline || prev;
      const [title, company] = titleLine.split(/\s+(?:at|@)\s+|\s*[|,–—]\s*|\s+-\s+/);
      cur = { title: (title || '').trim(), company: (company || '').trim(), start, end, months: start && end ? monthsBetween(start, end) : 0, details: [] };
      if (!headline && prev && entries.length && entries[entries.length - 1].details.at(-1) === prev) entries[entries.length - 1].details.pop();
    } else if (cur) {
      cur.details.push(line.replace(/^[•\-*▪◦]\s*/, ''));
    } else {
      // Lines before the first dated entry: keep as a pending title candidate.
    }
  });
  if (cur) entries.push(cur);
  return entries.map((e) => ({ ...e, text: [e.title, e.company, ...e.details].filter(Boolean).join('. ') }));
}

function parseEducation(lines) {
  const out = [];
  lines.forEach((line, i) => {
    const deg = DEGREE_PATTERNS.find((d) => d.re.test(line));
    if (!deg) return;
    const year = (line.match(/\b(19|20)\d{2}\b(?!.*\b(19|20)\d{2}\b)/) || [])[0] || (lines[i + 1]?.match(/\b(19|20)\d{2}\b/) || [])[0] || null;
    const field = (line.match(FIELD_RE) || [])[0] || null;
    const institution = (line.match(/\b([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*\s+(?:University|Institute|College|School)(?:\s+of\s+[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*)?|(?:University|Institute|College)\s+of\s+[A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*)\b/) || [])[0] || (lines[i + 1] && /university|institute|college/i.test(lines[i + 1]) ? lines[i + 1] : '');
    out.push({ degree: deg.label, level: deg.level, field, institution: institution.trim(), year: year ? Number(year) : null, text: line });
  });
  return out;
}

function parseProjects(lines) {
  const projects = [];
  let cur = null;
  for (const raw of lines) {
    const isBullet = /^[•\-*▪◦]/.test(raw);
    const line = raw.replace(/^[•\-*▪◦]\s*/, '');
    const namedLine = /^[^:|–—]{2,60}?\s*[:|–—]\s+\S|^.{2,60}?\s+-\s+\S/.test(line); // "Name: description"
    const looksTitle = namedLine || (!isBullet && line.length <= 90 && line.split(' ').length <= 8);
    if (looksTitle && (!cur || cur.description.length > 0)) {
      if (cur) projects.push(cur);
      const [name, ...rest] = line.split(/\s*[:|–—]\s*|\s+-\s+/);
      cur = { name: name.trim(), description: rest.join(' ').trim() };
    } else if (cur) {
      cur.description = [cur.description, line].filter(Boolean).join(' ');
    } else {
      cur = { name: line.slice(0, 60), description: line };
    }
  }
  if (cur) projects.push(cur);
  return projects
    .filter((p) => p.name)
    .map((p) => ({ ...p, skills: findSkillsInText(`${p.name}\n${p.description}`).map((s) => s.name) }));
}

function guessName(headerLines) {
  for (const line of headerLines.slice(0, 5)) {
    if (/@|\d{3}|http|www\.|linkedin|github/i.test(line)) continue;
    const candidate = line.split(/[|,]/)[0].trim();
    if (/^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,3}$/.test(candidate) && !headerOf(candidate)) return candidate.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return '';
}

/**
 * Parse resume text into a structured profile.
 * @returns {{status:'parsed'|'empty', name, email, phone, links, skills, education, experience,
 *            totalExperienceYears, projects, sections, protectedLines, sanitizedText, warnings}}
 */
export function parseResumeText(rawText) {
  const text = clean(rawText || '');
  const warnings = [];
  if (text.replace(/\s/g, '').length < 40) {
    return { status: 'empty', warnings: ['The document contains little or no extractable text. If it is a scanned image, please upload a text-based PDF.'], skills: [], education: [], experience: [], projects: [], sanitizedText: '', text };
  }

  const lines = joinWrappedLines(text.split('\n').map((l) => l.trim()).filter(Boolean));
  const protectedLines = lines.filter((l) => PROTECTED_LINE_RE.test(l) && l.length < 120);
  const email = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
  const phone = ((text.match(/(?:\+?\d[\d\s().-]{8,}\d)/) || [])[0] || '').trim();
  const links = [...new Set(text.match(/\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com)\/\S+/gi) || [])].slice(0, 5);
  const name = guessName(segmentSections(text).header || lines);

  // Sanitised text = job-related content only: no protected attributes, no identity/contact lines.
  const isIdentityLine = (l) => (name && l.toLowerCase().startsWith(name.toLowerCase()) && l.length < name.length + 40)
    || (email && l.includes(email)) || (phone && l.includes(phone)) || links.some((k) => l.includes(k));
  const sanitizedText = lines.filter((l) => !protectedLines.includes(l) && !isIdentityLine(l)).join('\n');
  const sections = segmentSections(sanitizedText);

  // Skills: scan the whole (sanitised) resume, so skills mentioned inside experience/projects are found too.
  const skillHits = findSkillsInText(sanitizedText);
  const inSkillsSection = new Set(findSkillsInText((sections.skills || []).join('\n')).map((s) => s.name));
  const skills = skillHits.map((s) => ({
    name: s.name,
    evidence: s.evidence,
    mentions: s.mentions,
    source: 'parser',
    // A skill backed only by a "skills" list line is weaker evidence than one used in experience/projects.
    usedInContext: s.mentions > (inSkillsSection.has(s.name) ? 1 : 0),
  }));

  const experience = parseExperience(sections.experience || []);
  const education = parseEducation([...(sections.education || []), ...(sections.certifications || [])]);
  const projects = parseProjects(sections.projects || []);
  const months = totalExperienceMonths(experience);

  if (!sections.experience) warnings.push('No "Experience" section detected; experience may be under-estimated.');
  if (!sections.education) warnings.push('No "Education" section detected.');
  if (!skills.length) warnings.push('No recognised skills found.');
  if (!email) warnings.push('No email address found.');

  return {
    status: 'parsed',
    name, email, phone, links,
    skills, education, experience, projects,
    totalExperienceYears: Math.round((months / 12) * 10) / 10,
    summary: (sections.summary || []).join(' ').slice(0, 600),
    sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.join('\n')])),
    protectedLines,
    sanitizedText,
    warnings,
    text,
  };
}

/** Split sanitised text into overlapping chunks for semantic indexing. */
export function chunkText(sanitizedText, sectionsMap = {}, { size = 420, overlap = 80 } = {}) {
  const chunks = [];
  const sources = Object.keys(sectionsMap).length ? Object.entries(sectionsMap).filter(([k]) => k !== 'personal') : [['body', sanitizedText]];
  for (const [section, body] of sources) {
    if (!body) continue;
    const lines = body.split('\n');
    let buf = '';
    for (const line of lines) {
      if ((buf + '\n' + line).length > size && buf) {
        chunks.push({ section, text: buf.trim() });
        buf = buf.slice(-overlap) + '\n' + line;
      } else buf = buf ? buf + '\n' + line : line;
    }
    if (buf.trim()) chunks.push({ section, text: buf.trim() });
  }
  return chunks;
}
