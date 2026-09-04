const items = $input.all().map((item) => item.json || {});
const candidates = items.filter((job) => job.dedup_key && job.title && job.url);

if (!candidates.length) {
  const sentinel = items.find((job) => job._sentinel) || {};
  return [{ json: {
    _sentinel: true,
    _total_found: sentinel._total_found || 0,
    _total_parsed: 0,
    _total_relevant: 0,
  } }];
}

const sourcePriority = {
  target_company: 5,
  greenhouse: 4,
  lever: 4,
  getonboard: 3,
  linkedin: 3,
  jobicy: 2,
  remotive: 2,
  gmail: 1,
};

const lowSemiPattern = /\b(semi[-\s]?senior|semi[-\s]?sr\.?|ssr\.?)\b/i;
const seniorPattern = /\b(senior|sr\.?)\b/i;
const preferredPattern = /\b(junior|jr\.?|associate|entry[-\s]?level|mid(?:[-\s]?level)?|intermediate|semi[-\s]?senior|semi[-\s]?sr\.?|ssr\.?)\b/i;
const internPattern = /\b(intern(?:ship)?|trainee|pasant(?:e|ia))\b/i;
const databasePattern = /\b(database|dba|postgres(?:ql)?|oracle|sql server|database migration)\b/i;
const blockedLeadershipPattern = /\b(lead|staff|principal|manager|director|architect|head|chief)\b/i;

const titleOf = (job) => String(job.title || '');
const yearsOf = (job) => Number(job._years_penalty || 0);
const isLowSemi = (job) => lowSemiPattern.test(titleOf(job));
const isSenior = (job) => !isLowSemi(job) && seniorPattern.test(titleOf(job));
const isIntern = (job) => internPattern.test(titleOf(job));
const isPreferred = (job) => preferredPattern.test(titleOf(job)) && !isIntern(job);
const isDatabaseException = (job) => isSenior(job)
  && databasePattern.test(titleOf(job))
  && yearsOf(job) <= 4;

// La búsqueda apunta a Junior/Mid/Semi Senior bajo. Evitamos gastar IA en
// posiciones de liderazgo, requisitos de 5+ años y Seniors genéricos.
const eligible = candidates.filter((job) => {
  if (blockedLeadershipPattern.test(titleOf(job))) return false;
  if (yearsOf(job) >= 5) return false;
  if (isSenior(job)) return isDatabaseException(job);
  return true;
});

const score = (job) => {
  let value = sourcePriority[job.source] || 1;
  if (isPreferred(job)) value += 4;
  else if (isIntern(job)) value -= 1;
  else value += 2;
  if (isSenior(job)) value -= 5;
  if (yearsOf(job) === 4) value -= 2;
  return value;
};

const unique = [...new Map(eligible
  .sort((a, b) => score(b) - score(a))
  .map((job) => [job.dedup_key, job])).values()]
  .sort((a, b) => score(b) - score(a));

const regular = unique.filter((job) => !isSenior(job) && !isIntern(job)).slice(0, 43);
const interns = unique.filter((job) => isIntern(job)).slice(0, 5);
const seniorDatabaseExceptions = unique.filter((job) => isSenior(job)).slice(0, 2);
const selected = [...regular, ...interns, ...seniorDatabaseExceptions]
  .sort((a, b) => score(b) - score(a))
  .slice(0, 50);

if (!selected.length) {
  const sentinel = items.find((job) => job._sentinel) || {};
  return [{ json: {
    _sentinel: true,
    _total_found: sentinel._total_found || candidates.length,
    _total_parsed: candidates.length,
    _total_relevant: 0,
  } }];
}

return selected.map((job) => ({ json: job }));
