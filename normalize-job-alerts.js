function normalizeJobAlerts(items, nowIso = new Date().toISOString()) {
  const norm = (value) => (value == null ? '' : String(value)).trim();
  const decodeHtml = (value) => norm(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
  const textFromHtml = (html) => decodeHtml(html)
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const getHeader = (json, wanted) => {
    const target = wanted.toLowerCase();
    const sources = [json?.payload?.headers, json?.headers];
    for (const source of sources) {
      if (Array.isArray(source)) {
        const found = source.find((h) => norm(h?.name).toLowerCase() === target);
        if (found) return norm(found.value);
      } else if (source && typeof source === 'object') {
        const key = Object.keys(source).find((k) => k.toLowerCase() === target);
        if (key) return norm(source[key]);
      }
    }
    return '';
  };
  const cleanLine = (line) => decodeHtml(line)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[|•]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizeUrl = (url) => decodeHtml(url).replace(/[)\].,;]+$/, '');
  const sourceFrom = (from, url, body) => {
    const haystack = `${from} ${url} ${body.slice(0, 500)}`.toLowerCase();
    if (haystack.includes('linkedin')) return 'linkedin';
    if (haystack.includes('indeed')) return 'indeed';
    if (/getonbrd|getonboard/.test(haystack)) return 'getonboard';
    if (haystack.includes('greenhouse')) return 'greenhouse';
    if (haystack.includes('lever.co')) return 'lever';
    if (haystack.includes('ashbyhq')) return 'ashby';
    if (haystack.includes('workable')) return 'workable';
    return 'gmail';
  };
  const isNoiseLine = (line) => /^(ver anuncio|solicitar|ver empleo|aplicar|apply|tus otros empleos|ahora sigue|descubre otros|el empleo guardado|empleos similares|ver todos|ofertas? de empleo)/i.test(line)
    || /personas? estudi|antiguo empleado|misma instituci[oó]n/i.test(line)
    || /^[-_]{4,}$/.test(line);
  const locationLike = (line) => /argentina|buenos aires|remot|h[ií]brid|presencial|latam|latin america|caba|provincia|alrededores|worldwide/i.test(line);
  const extractLinkedInContext = (plain, urlIndex) => {
    const windowStart = Math.max(0, urlIndex - 900);
    let block = plain.slice(windowStart, urlIndex);
    const separators = [...block.matchAll(/(?:^|\n)[-_]{8,}(?:\n|$)/g)];
    if (separators.length) block = block.slice(separators[separators.length - 1].index);
    const lines = block.split(/\r?\n/)
      .map(cleanLine)
      .filter((line) => line && !isNoiseLine(line) && !/^ver anuncio de empleo:?$/i.test(line));
    const tail = lines.slice(-6);
    let location = null;
    let locationIndex = -1;
    for (let i = tail.length - 1; i >= 0; i -= 1) {
      if (locationLike(tail[i])) {
        location = tail[i];
        locationIndex = i;
        break;
      }
    }
    const companyIndex = locationIndex > 0 ? locationIndex - 1 : tail.length - 1;
    const titleIndex = companyIndex - 1;
    return {
      title: titleIndex >= 0 ? tail[titleIndex] : null,
      company: companyIndex >= 0 ? tail[companyIndex] : null,
      location,
      description: tail.join(' ').slice(0, 2000),
    };
  };
  const canonicalize = (rawUrl, hintedSource) => {
    const url = normalizeUrl(rawUrl);
    const linkedIn = url.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i);
    if (linkedIn) return { source: 'linkedin', external_id: linkedIn[1], url: `https://www.linkedin.com/jobs/view/${linkedIn[1]}` };
    try {
      const parsed = new URL(url);
      const indeedId = parsed.searchParams.get('jk');
      if (indeedId && /indeed\./i.test(parsed.hostname)) {
        return { source: 'indeed', external_id: indeedId, url: `${parsed.origin}${parsed.pathname}?jk=${encodeURIComponent(indeedId)}` };
      }
      parsed.hash = '';
      for (const key of [...parsed.searchParams.keys()]) {
        if (/^(utm_|trk|tracking|ref|source|lipi|mid|eid|otp)/i.test(key)) parsed.searchParams.delete(key);
      }
      return { source: hintedSource, external_id: null, url: parsed.toString().replace(/\?$/, '') };
    } catch (_) {
      return { source: hintedSource, external_id: null, url: url || null };
    }
  };
  const makeJob = ({ source, external_id, company, title, location, url, description, messageId }) => {
    const cleanTitle = norm(title).replace(/^[-:–—\s]+|[-:–—\s]+$/g, '');
    if (!cleanTitle || !url) return null;
    const canonical = canonicalize(url, source);
    const dedupKey = canonical.external_id
      ? `${canonical.source}:${canonical.external_id}`
      : canonical.url.toLowerCase();
    return {
      source: canonical.source,
      external_id: canonical.external_id,
      company: norm(company) || null,
      title: cleanTitle,
      location: norm(location) || null,
      country: /argentina/i.test(norm(location)) ? 'Argentina' : null,
      remote_type: /100%\s*remot|remot[eo]/i.test(`${title} ${location} ${description}`) ? 'remote' : null,
      url: canonical.url,
      description: norm(description).replace(/\s+/g, ' ').slice(0, 6000),
      salary: null,
      currency: null,
      published_at: null,
      first_seen_at: nowIso,
      raw_source: canonical.source,
      source_message_id: messageId || null,
      dedup_key: dedupKey,
    };
  };

  const jobs = [];
  let totalFound = 0;
  for (const item of items || []) {
    const json = item?.json || {};
    if (!json || Object.keys(json).length === 0) continue;
    totalFound += 1;
    const subject = norm(json.Subject || json.subject || getHeader(json, 'subject'));
    const from = norm(json.From || json.from || getHeader(json, 'from')).toLowerCase();
    const messageId = norm(json.id || json.messageId || getHeader(json, 'message-id'));
    const labels = Array.isArray(json.labelIds) ? json.labelIds.map((x) => norm(x).toUpperCase()) : [];
    const html = norm(json.html);
    const plain = norm(json.text || json.textPlain || json.snippet) || textFromHtml(html);
    const body = plain || textFromHtml(html);
    const exclusionText = `${subject}\n${body.slice(0, 1200)}`;
    if (labels.includes('SENT')) continue;
    if (/^job hunter daily report\b/i.test(subject)) continue;
    if (/thanks for applying|application confirmation|se ha enviado tu solicitud|solicitud (?:fue )?enviada|we (?:have )?received your application|hemos recibido tu solicitud/i.test(subject)) continue;
    if (/email_application_confirmation|application~confirmation/i.test(exclusionText)) continue;
    if (/email_series_follow_newsletter|newsletter notification|darse de baja.*newsletter/i.test(exclusionText)) continue;

    const hintedSource = sourceFrom(from, '', body);
    const linkedInMatches = [...body.matchAll(/https?:\/\/(?:(?:[a-z]{2}|www)\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)[^\s"'<>]*/gi)];
    const seenLinkedIn = new Set();
    for (const match of linkedInMatches) {
      if (seenLinkedIn.has(match[1])) continue;
      seenLinkedIn.add(match[1]);
      const context = extractLinkedInContext(body, match.index || 0);
      const fallbackTitle = linkedInMatches.length === 1 && !/job alert|empleos guardados|solicita ya/i.test(subject) ? subject : null;
      const job = makeJob({
        source: 'linkedin', external_id: match[1],
        title: context.title || fallbackTitle,
        company: context.company,
        location: context.location,
        url: match[0],
        description: context.description,
        messageId,
      });
      if (job) jobs.push(job);
    }
    if (seenLinkedIn.size) continue;

    const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const candidateAnchors = anchors.map((match) => ({
      url: normalizeUrl(match[1]),
      title: textFromHtml(match[2]).replace(/\s+/g, ' ').trim(),
    })).filter((anchor) => anchor.title
      && /indeed\.|greenhouse|lever\.co|ashbyhq|workable|\/jobs?\/|\/careers?\//i.test(anchor.url)
      && !/unsubscribe|help|privacy|preferences|login|sign.?in/i.test(anchor.url));
    const seenUrls = new Set();
    for (const anchor of candidateAnchors) {
      const canonical = canonicalize(anchor.url, sourceFrom(from, anchor.url, body));
      if (!canonical.url || seenUrls.has(canonical.url)) continue;
      seenUrls.add(canonical.url);
      const genericAnchor = /ver (?:anuncio|empleo)|view job|apply|solicitar/i.test(anchor.title);
      const title = genericAnchor ? (candidateAnchors.length === 1 ? subject : null) : anchor.title;
      const job = makeJob({ source: canonical.source, external_id: canonical.external_id, title, company: null, location: null, url: canonical.url, description: body, messageId });
      if (job) jobs.push(job);
    }
    if (seenUrls.size) continue;

    const rawLinks = body.match(/https?:\/\/[^\s"'<>]+/g) || [];
    const bestUrl = rawLinks.map(normalizeUrl).find((url) => /\/jobs?\/|\/careers?\/|\/positions?\//i.test(url)
      && !/w3\.org|unsubscribe|linkedin\.com\/(?:comm\/)?feed|linkedin\.com\/help/i.test(url));
    if (bestUrl && !/job alert|empleos guardados|ofertas de empleo/i.test(subject)) {
      const job = makeJob({ source: sourceFrom(from, bestUrl, body), external_id: null, title: subject, company: null, location: null, url: bestUrl, description: body, messageId });
      if (job) jobs.push(job);
    }
  }

  const irrelevant = [/frontend/i, /front-end/i, /mobile/i, /android/i, /ux\b/i, /\bui\b/i, /qa manual/i, /product manager/i, /marketing/i, /\bsales\b/i, /ventas/i, /designer/i, /recruiter/i, /copywriter/i, /community manager/i];
  const relevantTitle = /\b(dba|database|databases|data engineer|dataops|devops|cloud|site reliability|sre|platform engineer|infrastructure engineer|postgres|postgresql|oracle|sql|etl|analytics engineer|ingenier[oa] de datos|ingenier[ií]a de datos|administrador(?:a)? de bases?)\b/i;
  const deduped = [...new Map(jobs.map((job) => [job.dedup_key, job])).values()];
  const relevant = deduped.filter((job) => relevantTitle.test(job.title) && !irrelevant.some((rx) => rx.test(job.title)));
  if (relevant.length === 0) {
    return [{ json: { _sentinel: true, _total_found: totalFound, _total_parsed: deduped.length, _total_relevant: 0 } }];
  }
  return relevant.map((job) => ({ json: { ...job, _total_found: totalFound, _total_parsed: deduped.length, _total_relevant: relevant.length } }));
}

if (typeof module !== 'undefined') module.exports = { normalizeJobAlerts };
