/**
 * Skill ontology: canonical names, aliases (normalisation such as JS -> JavaScript),
 * categories and weighted relations. Relations let the matcher give partial,
 * explainable credit ("Flask is closely related to Django") instead of all-or-nothing keywords.
 *
 * Alias rules: matched case-insensitively on word boundaries, unless prefixed with "cs:"
 * (case-sensitive, used for short or ambiguous tokens like "Go" or "JS").
 */
const ONTOLOGY = {
  // Languages
  Python: { aliases: ['python', 'python3', 'py3'], category: 'language' },
  JavaScript: { aliases: ['javascript', 'cs:JS', 'ecmascript', 'es6', 'vanilla js'], category: 'language', related: { TypeScript: 0.7 } },
  TypeScript: { aliases: ['typescript', 'cs:TS'], category: 'language', related: { JavaScript: 0.8 } },
  Java: { aliases: ['java', 'java 8', 'java 11', 'java 17'], category: 'language', related: { Kotlin: 0.6 } },
  Kotlin: { aliases: ['kotlin'], category: 'language', related: { Java: 0.6 } },
  'C#': { aliases: ['c#', 'csharp', 'c sharp'], category: 'language', related: { Java: 0.4 } },
  'C++': { aliases: ['c++', 'cpp'], category: 'language' },
  Go: { aliases: ['golang', 'go lang', 'cs:Go (Golang)'], category: 'language', canonicalMatch: false },
  Rust: { aliases: ['rust', 'rustlang'], category: 'language' },
  PHP: { aliases: ['php'], category: 'language' },
  Ruby: { aliases: ['ruby'], category: 'language' },
  SQL: { aliases: ['sql', 't-sql', 'pl/sql', 'plsql'], category: 'database' },
  HTML: { aliases: ['html', 'html5'], category: 'frontend' },
  CSS: { aliases: ['css', 'css3', 'scss', 'sass'], category: 'frontend' },

  // Backend frameworks
  Django: { aliases: ['django', 'django rest framework', 'drf', 'django orm'], category: 'backend', implies: ['Python', 'REST API'], related: { Flask: 0.6, FastAPI: 0.6 } },
  Flask: { aliases: ['flask'], category: 'backend', implies: ['Python'], related: { Django: 0.55, FastAPI: 0.7 } },
  FastAPI: { aliases: ['fastapi', 'fast api'], category: 'backend', implies: ['Python', 'REST API'], related: { Flask: 0.7, Django: 0.55 } },
  'Node.js': { aliases: ['node.js', 'nodejs', 'node js', 'cs:Node'], category: 'backend', implies: ['JavaScript'], related: { 'Express.js': 0.6 } },
  'Express.js': { aliases: ['express.js', 'expressjs', 'express js', 'cs:Express'], category: 'backend', implies: ['Node.js', 'JavaScript'], related: { 'Node.js': 0.8 } },
  NestJS: { aliases: ['nestjs', 'nest.js'], category: 'backend', implies: ['Node.js', 'TypeScript'], related: { 'Express.js': 0.6 } },
  Spring: { aliases: ['spring boot', 'springboot', 'spring framework', 'spring mvc'], category: 'backend', implies: ['Java'], canonicalMatch: false },
  '.NET': { aliases: ['.net', 'dotnet', 'asp.net', '.net core'], category: 'backend', implies: ['C#'] },
  Laravel: { aliases: ['laravel'], category: 'backend', implies: ['PHP'] },
  'Ruby on Rails': { aliases: ['ruby on rails', 'rails', 'ror'], category: 'backend', implies: ['Ruby'] },
  Celery: { aliases: ['celery'], category: 'backend', implies: ['Python'] },

  // Frontend frameworks
  React: { canonicalMatch: 'cs', aliases: ['react.js', 'reactjs', 'react js'], category: 'frontend', implies: ['JavaScript'], related: { 'Next.js': 0.7, Vue: 0.5, Angular: 0.45 } },
  'Next.js': { aliases: ['next.js', 'nextjs', 'next js'], category: 'frontend', implies: ['React', 'JavaScript'], related: { React: 0.8 } },
  Vue: { aliases: ['vue', 'vue.js', 'vuejs', 'nuxt'], category: 'frontend', implies: ['JavaScript'], related: { React: 0.5 } },
  Angular: { aliases: ['angular', 'angularjs'], category: 'frontend', implies: ['TypeScript'], related: { React: 0.45 } },
  Redux: { aliases: ['redux', 'redux toolkit'], category: 'frontend', related: { React: 0.5 } },
  'Tailwind CSS': { aliases: ['tailwind', 'tailwindcss', 'tailwind css'], category: 'frontend', implies: ['CSS'] },

  // Data stores
  PostgreSQL: { aliases: ['postgresql', 'postgres', 'psql', 'postgis', 'pgvector'], category: 'database', implies: ['SQL'], related: { MySQL: 0.7, SQLite: 0.5 } },
  MySQL: { aliases: ['mysql', 'mariadb'], category: 'database', implies: ['SQL'], related: { PostgreSQL: 0.7 } },
  SQLite: { aliases: ['sqlite', 'sqlite3'], category: 'database', implies: ['SQL'], related: { PostgreSQL: 0.4 } },
  MongoDB: { aliases: ['mongodb', 'mongo', 'mongoose', 'mongo db'], category: 'database', related: { Redis: 0.2 } },
  Redis: { aliases: ['redis'], category: 'database' },
  Elasticsearch: { aliases: ['elasticsearch', 'elastic search', 'opensearch'], category: 'database' },

  // DevOps / cloud
  Docker: { aliases: ['docker', 'dockerfile', 'docker-compose', 'docker compose', 'containerization', 'containerisation', 'containers'], category: 'devops', related: { Kubernetes: 0.5, Podman: 0.8 } },
  Podman: { aliases: ['podman'], category: 'devops', related: { Docker: 0.8 } },
  Kubernetes: { aliases: ['kubernetes', 'k8s', 'helm', 'eks', 'gke', 'aks'], category: 'devops', related: { Docker: 0.6 } },
  AWS: { aliases: ['aws', 'amazon web services', 'ec2', 's3', 'lambda', 'rds', 'ecs'], category: 'cloud', related: { GCP: 0.5, Azure: 0.5 } },
  GCP: { aliases: ['gcp', 'google cloud', 'google cloud platform', 'cloud run'], category: 'cloud', related: { AWS: 0.5, Azure: 0.5 } },
  Azure: { aliases: ['azure', 'microsoft azure'], category: 'cloud', related: { AWS: 0.5, GCP: 0.5 } },
  'CI/CD': { aliases: ['ci/cd', 'cicd', 'continuous integration', 'continuous deployment', 'github actions', 'gitlab ci', 'jenkins', 'circleci'], category: 'devops' },
  Terraform: { aliases: ['terraform', 'infrastructure as code', 'iac'], category: 'devops' },
  Linux: { aliases: ['linux', 'ubuntu', 'debian', 'centos', 'bash', 'shell scripting'], category: 'devops' },
  Nginx: { aliases: ['nginx', 'gunicorn', 'uwsgi'], category: 'devops' },
  Git: { aliases: ['git', 'github', 'gitlab', 'bitbucket', 'version control'], category: 'tools' },

  // APIs and architecture
  'REST API': { aliases: ['rest api', 'rest apis', 'restful', 'restful api', 'restful apis', 'rest services', 'api development'], category: 'architecture', related: { GraphQL: 0.5 } },
  GraphQL: { aliases: ['graphql', 'apollo'], category: 'architecture', related: { 'REST API': 0.5 } },
  Microservices: { aliases: ['microservices', 'microservice', 'micro-services', 'service oriented architecture'], category: 'architecture' },
  Kafka: { aliases: ['kafka', 'apache kafka'], category: 'architecture', related: { RabbitMQ: 0.6 } },
  RabbitMQ: { aliases: ['rabbitmq', 'message queue', 'message queues'], category: 'architecture', related: { Kafka: 0.6, Celery: 0.4 } },

  // Testing
  'Unit Testing': { aliases: ['unit testing', 'unit tests', 'tdd', 'test driven development', 'pytest', 'unittest', 'jest', 'mocha', 'junit'], category: 'testing' },

  // Data / AI
  'Machine Learning': { aliases: ['machine learning', 'cs:ML', 'scikit-learn', 'sklearn'], category: 'ai', related: { 'Deep Learning': 0.6, 'Data Analysis': 0.4 } },
  'Deep Learning': { aliases: ['deep learning', 'neural networks', 'tensorflow', 'pytorch', 'keras'], category: 'ai', related: { 'Machine Learning': 0.7 } },
  NLP: { aliases: ['nlp', 'natural language processing', 'transformers', 'llm', 'llms'], category: 'ai', related: { 'Machine Learning': 0.5 } },
  'Data Analysis': { aliases: ['data analysis', 'pandas', 'numpy', 'data analytics', 'matplotlib'], category: 'data', related: { 'Machine Learning': 0.3 } },

  // Practices / soft skills
  Agile: { aliases: ['agile', 'scrum', 'kanban', 'jira'], category: 'practice' },
  Communication: { aliases: ['communication', 'communication skills', 'presentation skills'], category: 'soft' },
  Leadership: { aliases: ['leadership', 'team lead', 'mentoring', 'mentored'], category: 'soft' },
  Figma: { aliases: ['figma', 'ui/ux', 'ux design'], category: 'design' },
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Precompile one regex per alias. Word boundaries are emulated with look-arounds so that
// aliases containing symbols ("c++", ".net", "node.js") still match correctly.
const MATCHERS = [];
for (const [canonical, def] of Object.entries(ONTOLOGY)) {
  const canonicalEntry = def.canonicalMatch === false ? [] : [def.canonicalMatch === 'cs' ? `cs:${canonical}` : canonical];
  for (const raw of [...canonicalEntry, ...def.aliases]) {
    const caseSensitive = raw.startsWith('cs:');
    const alias = caseSensitive ? raw.slice(3) : raw;
    const pattern = `(?<![A-Za-z0-9+#.])${escapeRe(alias).replace(/\\ /g, '[\\s-]?').replace(/ /g, '[\\s-]?')}(?![A-Za-z0-9+#])`;
    MATCHERS.push({ canonical, alias, re: new RegExp(pattern, caseSensitive ? 'g' : 'gi') });
  }
}

const LOOKUP = new Map();
for (const [canonical, def] of Object.entries(ONTOLOGY)) {
  LOOKUP.set(canonical.toLowerCase(), canonical);
  for (const raw of def.aliases) {
    const alias = raw.startsWith('cs:') ? raw.slice(3) : raw;
    if (!LOOKUP.has(alias.toLowerCase())) LOOKUP.set(alias.toLowerCase(), canonical);
  }
}

/** Normalise a free-text skill name to its canonical form; unknown skills are title-cased and kept. */
export function normalizeSkill(term) {
  if (!term || typeof term !== 'string') return null;
  const t = term.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const hit = LOOKUP.get(t.toLowerCase());
  if (hit) return hit;
  // Try trimming common suffixes ("Docker containers", "Python programming")
  const stripped = t.toLowerCase().replace(/\b(programming|language|framework|development|developer|experience|skills?)\b/g, '').trim();
  if (stripped && LOOKUP.get(stripped)) return LOOKUP.get(stripped);
  return t.length <= 40 ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

export const isKnownSkill = (name) => Object.prototype.hasOwnProperty.call(ONTOLOGY, name);
export const skillCategory = (name) => ONTOLOGY[name]?.category || 'other';
export const allCanonicalSkills = () => Object.keys(ONTOLOGY);

/** Skills implied by a skill (Django -> Python, REST API). */
export const impliedBy = (name) => ONTOLOGY[name]?.implies || [];

/** Relation strength 0..1 between two canonical skills (symmetric best-effort). */
export function relationStrength(a, b) {
  if (a === b) return 1;
  return Math.max(ONTOLOGY[a]?.related?.[b] || 0, ONTOLOGY[b]?.related?.[a] || 0);
}

/**
 * Find all skills mentioned in text with the line(s) that mention them as evidence.
 * Returns [{ name, evidence: [excerpt], mentions }] sorted by mentions desc.
 */
export function findSkillsInText(text, { maxEvidence = 3 } = {}) {
  const collect = maxEvidence + 3;
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const found = new Map();
  lines.forEach((line) => {
    for (const m of MATCHERS) {
      m.re.lastIndex = 0;
      if (!m.re.test(line)) continue;
      const entry = found.get(m.canonical) || { name: m.canonical, evidence: [], mentions: 0, aliases: new Set() };
      entry.mentions += 1;
      entry.aliases.add(m.alias.toLowerCase());
      const excerpt = line.length > 220 ? line.slice(0, 217) + '...' : line;
      if (entry.evidence.length < collect && !entry.evidence.includes(excerpt)) entry.evidence.push(excerpt);
      found.set(m.canonical, entry);
    }
  });
  // Prefer evidence that shows the skill in use over a bare comma-separated skills list.
  const listiness = (l) => (l.match(/,/g) || []).length;
  return [...found.values()]
    .map((e) => ({ name: e.name, evidence: [...e.evidence].sort((a, b) => listiness(a) - listiness(b)).slice(0, maxEvidence), mentions: e.mentions, aliases: [...e.aliases] }))
    .sort((a, b) => b.mentions - a.mentions);
}

// Role / domain words in a search query mapped to skill categories ("frontend developer" -> React, Vue, CSS...).
const ROLE_TERMS = [
  [/\bfront[\s-]?end\b|\bui (developer|engineer)\b|\bweb ui\b/i, ['frontend']],
  [/\bback[\s-]?end\b|\bserver[\s-]?side\b|\bapi (developer|engineer)\b/i, ['backend', 'architecture']],
  [/\bfull[\s-]?stack\b/i, ['frontend', 'backend']],
  [/\bdev[\s-]?ops\b|\bsre\b|\bsite reliability\b|\binfrastructure\b|\bplatform engineer/i, ['devops', 'cloud']],
  [/\bcloud\b/i, ['cloud']],
  [/\bdata (scientist|science)\b|\bml engineer\b|\bai engineer\b|\bmachine learning engineer\b/i, ['ai', 'data']],
  [/\bdata (analyst|engineer)\b|\banalytics\b/i, ['data', 'database']],
  [/\bdatabase\b|\bdba\b/i, ['database']],
  [/\bqa\b|\btest(ing)? engineer\b|\bsdet\b/i, ['testing']],
  [/\bdesigner\b|\bux\b/i, ['design']],
];

/**
 * Parse a recruiter's search query. Unlike resume parsing it is case-insensitive for every
 * alias ("react developer" -> React) and also returns skill categories implied by role words.
 */
export function findSkillsInQuery(query) {
  const q = String(query || '');
  const found = new Set(findSkillsInText(q).map((s) => s.name));
  for (const [canonical, def] of Object.entries(ONTOLOGY)) {
    const names = [...(def.canonicalMatch === false ? [] : [canonical]), ...def.aliases.filter((a) => a.startsWith('cs:')).map((a) => a.slice(3))];
    for (const n of names) {
      if (n.length < 2 || /^go$/i.test(n)) continue; // "go" is too ambiguous in plain English
      if (new RegExp(`(?<![A-Za-z0-9+#.])${escapeRe(n)}(?![A-Za-z0-9+#])`, 'i').test(q)) found.add(canonical);
    }
  }
  const categories = new Set();
  for (const [re, cats] of ROLE_TERMS) if (re.test(q)) cats.forEach((c) => categories.add(c));
  const categorySkills = Object.entries(ONTOLOGY).filter(([, d]) => categories.has(d.category)).map(([n]) => n);
  return { skills: [...found], categories: [...categories], categorySkills };
}

/** Does the given text mention the skill? Returns matching excerpt or null. */
export function findEvidenceFor(skill, text) {
  const hits = findSkillsInText(text, { maxEvidence: 1 });
  return hits.find((h) => h.name === skill)?.evidence[0] || null;
}
