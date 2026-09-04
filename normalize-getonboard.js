const response = $input.first().json || {};
const body = response.body && typeof response.body === 'object' ? response.body : response;
const list = Array.isArray(body.data) ? body.data : [];
const role = /\b(dba|database|data engineer|dataops|devops|cloud|platform engineer|infrastructure engineer|site reliability|sre|postgres|postgresql|oracle|etl|analytics engineer|ingenier[oa] de datos|infraestructura)\b/i;
const blocked = /\b(lead|staff|principal|manager|director|architect|arquitect[oa]|jefe)\b/i;
const allowedGeo = /(remote_global|worldwide|latin america|latam|south america|central america|americas|argentina|buenos aires|caba)/i;
const clean = (value) => String(value == null ? '' : value)
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ')
  .trim();

const normalized = list.map((entry) => {
  const job = entry.attributes || {};
  const title = clean(job.title);
  const locationText = [
    ...(Array.isArray(job.countries) ? job.countries : []),
    job.remote_modality,
    job.remote_zone,
    clean(job.benefits),
    clean(job.description).slice(0, 800),
  ].filter(Boolean).join(' ');
  const description = clean([
    job.description_headline,
    job.description,
    job.projects,
    job.functions_headline,
    job.functions,
    job.desirable,
    job.benefits,
  ].filter(Boolean).join(' ')).slice(0, 6000);
  const years = description.match(/(?:m[ií]nimo|minimum|al menos|at least|requiere|requires?|experiencia.{0,30})([3-9])\+?\s*(?:a[nñ]os|years?)/i);
  return {
    source: 'getonboard',
    external_id: String(entry.id || ''),
    company: null,
    title,
    location: clean((job.countries || []).join(', ')) || null,
    country: /argentina/i.test(locationText) ? 'Argentina' : null,
    remote_type: job.remote ? 'remote' : (job.remote_modality || null),
    url: entry.id ? 'https://www.getonbrd.com/jobs/' + entry.id : null,
    description,
    salary: job.min_salary || null,
    currency: null,
    published_at: job.published_at ? new Date(Number(job.published_at) * 1000).toISOString() : null,
    first_seen_at: new Date().toISOString(),
    raw_source: 'getonboard',
    source_message_id: null,
    dedup_key: entry.id ? 'getonboard:' + entry.id : '',
    _seniority_penalty: /\bsenior\b|\bsr\.?\b/i.test(title),
    _years_penalty: years ? Number(years[1]) : null,
    _location_text: locationText,
  };
}).filter((job) => job.title && job.url && role.test(job.title) && !blocked.test(job.title) && allowedGeo.test(job._location_text));

return normalized.map((job) => ({
  ...job,
  _location_text: undefined,
  _source_total: list.length,
  _source_relevant: normalized.length,
}));
