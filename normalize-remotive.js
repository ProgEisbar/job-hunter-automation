const body = $input.first().json || {};
const list = Array.isArray(body.jobs) ? body.jobs : [];
const role = /\b(dba|database|data engineer|dataops|devops|cloud|platform engineer|infrastructure engineer|site reliability|sre|postgres|postgresql|oracle|etl|analytics engineer)\b/i;
const blocked = /\b(lead|staff|principal|manager|director|architect)\b/i;
const geo = /(anywhere|worldwide|latin america|latam|south america|americas|argentina|remote)/i;
const clean = (value) => String(value == null ? '' : value)
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ')
  .trim();

const normalized = list.map((job) => {
  const title = clean(job.title);
  const location = clean(job.candidate_required_location);
  const description = clean(job.description).slice(0, 6000);
  const years = description.match(/(?:minimum|at least|requires?|experience.{0,30})([3-9])\+?\s*years?/i);
  return {
    source: 'remotive',
    external_id: String(job.id || ''),
    company: clean(job.company_name) || null,
    title,
    location: location || null,
    country: null,
    remote_type: 'remote',
    url: job.url || null,
    description,
    salary: null,
    currency: null,
    published_at: job.publication_date || null,
    first_seen_at: new Date().toISOString(),
    raw_source: 'remotive',
    source_message_id: null,
    dedup_key: job.id ? 'remotive:' + job.id : String(job.url || '').toLowerCase(),
    _seniority_penalty: /\bsenior\b|\bsr\.?\b/i.test(title),
    _years_penalty: years ? Number(years[1]) : null,
  };
}).filter((job) => job.title && job.url && role.test(job.title) && !blocked.test(job.title) && geo.test(job.location || ''));

return normalized.map((job) => ({
  ...job,
  _source_total: list.length,
  _source_relevant: normalized.length,
}));
