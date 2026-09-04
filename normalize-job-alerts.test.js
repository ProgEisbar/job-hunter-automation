const assert = require('node:assert/strict');
const { normalizeJobAlerts } = require('./normalize-job-alerts');

const now = '2026-09-02T03:00:00.000Z';
const run = (messages) => normalizeJobAlerts(messages.map((json) => ({ json })), now);

assert.equal(run([{ subject: 'Job Hunter Daily Report — 2026-09-02', text: 'report', labelIds: ['INBOX'] }])[0].json._sentinel, true);
assert.equal(run([{ subject: 'Thanks for applying to Example', text: 'personal application data', labelIds: ['INBOX'] }])[0].json._sentinel, true);
assert.equal(run([{ subject: 'Cloud DBA', text: 'job', labelIds: ['SENT'] }])[0].json._sentinel, true);

const digest = run([{
  payload: { headers: [
    { name: 'Subject', value: 'Tus empleos guardados' },
    { name: 'From', value: 'LinkedIn Jobs <jobs-noreply@linkedin.com>' },
  ] },
  text: `El empleo guardado sigue disponible.
FP&A Data Analyst
Elevva
Buenos Aires, Argentina
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/4426875646?trackingId=x
---------------------------------------------------------
AI Data Engineer Ssr.
Acciona IT
Buenos Aires y alrededores
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/4453298560?trackingId=x
---------------------------------------------------------
Ingeniero de Datos, Sistemas
GDN AR
Buenos Aires, Argentina
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/4456267174?trackingId=x
---------------------------------------------------------
DataOps Engineer
Bridgenext
Argentina
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/4457151960?trackingId=x
---------------------------------------------------------
AWS DevOps Engineer
Scale Up Recruiting Partners
Buenos Aires y alrededores
Ver anuncio de empleo: https://www.linkedin.com/comm/jobs/view/4457461460?trackingId=x`,
}]);

assert.equal(digest.length, 4);
assert.deepEqual(digest.map((item) => item.json.external_id), ['4453298560', '4456267174', '4457151960', '4457461460']);
assert.ok(digest.every((item) => item.json.source === 'linkedin'));
assert.ok(digest.every((item) => /^https:\/\/www\.linkedin\.com\/jobs\/view\/\d+$/.test(item.json.url)));
assert.equal(digest[0].json.company, 'Acciona IT');

const indeed = run([{
  payload: { headers: [
    { name: 'Subject', value: 'Cloud Database Engineer' },
    { name: 'From', value: 'Indeed Job Alerts <alerts@indeed.com>' },
  ] },
  html: '<a href="https://ar.indeed.com/viewjob?jk=abc123&utm_source=email">Cloud Database Engineer</a>',
}]);
assert.equal(indeed.length, 1);
assert.equal(indeed[0].json.source, 'indeed');
assert.equal(indeed[0].json.external_id, 'abc123');

const newsletter = run([{
  subject: 'Cybersecurity Engineer',
  from: 'LinkedIn <messages-noreply@linkedin.com>',
  text: 'email_series_follow_newsletter newsletter notification https://linkedin.com/pulse/example',
}]);
assert.equal(newsletter[0].json._sentinel, true);

console.log('normalize-job-alerts tests: OK');
