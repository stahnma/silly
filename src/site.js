// The web pages (home and API docs, account, messages) and the OpenAPI spec.
// The API reference is built from each generator's `docs`, so it can't drift
// from what the generators accept.

const escape = value =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// `code` spans in docs strings; everything else escaped.
const inline = text => escape(text).replace(/`([^`]+)`/g, '<code>$1</code>');

const SOURCE = 'https://github.com/stahnma/silly';

const STYLE = `
:root {
  --bg: #fffdf8; --fg: #1f1b16; --muted: #6b6257; --line: #e7dfd2; --card: #ffffff;
  --accent: #b4441f; --accent-fg: #ffffff; --code-bg: #f4eee4; --ok-bg: #eef7ea; --ok-line: #9cc98a;
  --warn-bg: #fdf1ec; --warn-line: #e3a58d;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #17140f; --fg: #f1ebe2; --muted: #a89d8f; --line: #3a332a; --card: #201c16;
    --accent: #f08a5d; --accent-fg: #1b120c; --code-bg: #2a241c; --ok-bg: #1e2a1a; --ok-line: #4f7a42;
    --warn-bg: #2d1d16; --warn-line: #8a4b33;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: var(--accent); }
code, pre { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.88em; }
code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 4px; }
pre { background: var(--code-bg); padding: 14px 16px; border-radius: 8px; overflow-x: auto; line-height: 1.45; }
pre code { background: none; padding: 0; }
.wrap { max-width: 920px; margin: 0 auto; padding: 0 16px; }
header { border-bottom: 1px solid var(--line); }
header .wrap { display: flex; align-items: center; gap: 20px; min-height: 60px; flex-wrap: wrap; }
.brand { font-weight: 800; font-size: 1.35rem; letter-spacing: -0.02em; color: var(--fg); text-decoration: none; }
.brand span { color: var(--accent); }
nav { display: flex; gap: 16px; flex: 1; flex-wrap: wrap; }
nav a { color: var(--muted); text-decoration: none; font-size: 0.95rem; }
nav a:hover { color: var(--fg); }
.button { display: inline-block; border: 0; border-radius: 8px; padding: 9px 16px; font: inherit; font-weight: 600;
  background: var(--accent); color: var(--accent-fg); text-decoration: none; cursor: pointer; }
.button.quiet { background: transparent; color: var(--fg); border: 1px solid var(--line); font-weight: 500; }
.button:disabled { opacity: 0.5; cursor: not-allowed; }
.hero { padding: 48px 0 24px; }
.hero h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; margin: 0 0 12px; letter-spacing: -0.03em; }
.hero p { font-size: 1.15rem; color: var(--muted); max-width: 640px; margin: 0; }
section { padding: 28px 0; border-bottom: 1px solid var(--line); }
section:last-of-type { border-bottom: 0; }
h2 { font-size: 1.5rem; margin: 0 0 14px; letter-spacing: -0.01em; }
h3 { font-size: 1.15rem; margin: 28px 0 8px; }
.gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.card .shot { aspect-ratio: 4 / 3; background: var(--code-bg); display: flex; align-items: center; justify-content: center; }
.card img { width: 100%; height: 100%; object-fit: contain; display: block; }
.card .body { padding: 12px 14px; }
.card h3 { margin: 0 0 4px; font-size: 1.05rem; }
.card p { margin: 0; color: var(--muted); font-size: 0.93rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.93rem; margin: 8px 0 12px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; font-size: 0.85rem; }
.table { overflow-x: auto; }
.req { color: var(--accent); font-size: 0.8rem; font-weight: 600; }
.muted { color: var(--muted); }
.note { border-radius: 8px; padding: 14px 16px; margin: 16px 0; border: 1px solid var(--ok-line); background: var(--ok-bg); }
.note.warn { border-color: var(--warn-line); background: var(--warn-bg); }
.note code { word-break: break-all; }
.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
form.inline { display: inline; margin: 0; }
@media (max-width: 600px) {
  header .wrap { gap: 0 16px; padding-top: 8px; }
  header .button { margin-left: auto; padding: 7px 12px; font-size: 0.9rem; }
  nav { order: 3; flex-basis: 100%; padding: 6px 0 10px; }
}
footer { padding: 28px 0 48px; color: var(--muted); font-size: 0.9rem; border-top: 1px solid var(--line); }
footer p { margin: 4px 0; }
`;

const page = ({ title, user, signInEnabled, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="Silly image generators for chat bots: aw yiss, O RLY covers and mustaches.">
<style>${STYLE}</style>
</head>
<body>
<header><div class="wrap">
  <a class="brand" href="/">silly<span>.</span></a>
  <nav><a href="/#examples">Examples</a><a href="/#keys">Get a key</a><a href="/#api">API</a><a href="/openapi.json">OpenAPI</a></nav>
  ${
    user
      ? `<a class="button quiet" href="/account">@${escape(user.login)} · Your keys</a>`
      : signInEnabled
        ? '<a class="button" href="/login">Sign in with GitHub</a>'
        : ''
  }
</div></header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap">
  <p>silly is <a href="${SOURCE}">open source</a>.
  Aw yiss comics come from <a href="https://www.awyisser.com">awyisser.com</a> (the comic is Kate Beaton's).
  O RLY covers follow Charles Berlin's <a href="https://github.com/charleshberlin/O-RLY-Book-Generator">O-RLY-Book-Generator</a>.
  Faces are found by <a href="https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet">YuNet</a>.</p>
</div></footer>
</body>
</html>
`;

const fieldType = f => {
  if (f.enum) return f.enum.map(v => `<code>${escape(v)}</code>`).join(' · ');
  if (f.type === 'integer' && f.minimum !== undefined) return `integer ${f.minimum}–${f.maximum}`;
  return escape(f.type);
};

const fieldDefault = f => {
  if (f.required) return '<span class="req">required</span>';
  if (f.default === undefined) return '<span class="muted">—</span>';
  return f.default === ''
    ? '<span class="muted">empty</span>'
    : `<code>${escape(JSON.stringify(f.default))}</code>`;
};

const curl = (base, name, example) =>
  `curl -X POST ${base}/v1/${name} \\
  -H "Authorization: Bearer $SILLY_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(example).replace(/'/g, "'\\''")}'`;

const generatorReference = (base, name, g) => `
<h3 id="${escape(name)}">${escape(g.docs.title)} <code>POST /v1/${escape(name)}</code></h3>
<p>${inline(g.docs.summary)} Returns a ${g.contentType === 'image/jpeg' ? 'JPEG' : 'PNG'}.</p>
<div class="table"><table>
<tr><th>Field</th><th>Type</th><th>Default</th><th>Description</th></tr>
${g.docs.fields
  .map(
    f =>
      `<tr><td><code>${escape(f.name)}</code></td><td>${fieldType(f)}</td><td>${fieldDefault(f)}</td><td>${inline(f.description)}</td></tr>`
  )
  .join('\n')}
</table></div>
<pre><code>${escape(curl(base, name, g.docs.example))}</code></pre>`;

export const renderHome = ({ base, generators, user, signInEnabled, limits }) =>
  page({
    title: 'silly: image generators for chat bots',
    user,
    signInEnabled,
    body: `
<div class="hero">
  <h1>Silly images, by the link.</h1>
  <p>Ask silly for an aw yiss comic, an O RLY book cover or a mustache on a photo, and get back a URL.
  Post the URL in Slack (or anywhere) and it shows up as the image.</p>
</div>

<section id="examples">
  <h2>Examples</h2>
  <div class="gallery">
  ${Object.entries(generators)
    .map(
      ([name, g]) => `<div class="card">
    <div class="shot"><img src="/examples/${escape(name)}" alt="Example ${escape(g.docs.title)} image" loading="lazy"></div>
    <div class="body"><h3>${escape(g.docs.title)}</h3><p>${inline(g.docs.summary)} <a href="#${escape(name)}">API</a></p></div>
  </div>`
    )
    .join('\n  ')}
  </div>
</section>

<section id="keys">
  <h2>Get a key</h2>
  ${
    signInEnabled
      ? `<p>Making images needs an API key. Sign in with GitHub and make one on your
  <a href="/account">account page</a>; it's shown once, so keep it somewhere safe.</p>
  <div class="row">${
    user
      ? '<a class="button" href="/account">Your keys</a>'
      : '<a class="button" href="/login">Sign in with GitHub</a>'
  }</div>`
      : '<p>Making images needs an API key. Keys are given out by request for now.</p>'
  }
  <ul>
    <li>Each key can make ${limits.perHour} images an hour.</li>
    <li>You can have up to ${limits.maxKeys} keys, and revoke any of them yourself.</li>
    <li>A key nobody uses for 180 days expires.</li>
    <li>Looking at images needs no key: image URLs are public.</li>
  </ul>
</section>

<section id="api">
  <h2>API</h2>
  <p>Also available as an <a href="/openapi.json">OpenAPI spec</a>.</p>

  <h3>Making an image</h3>
  <p><code>POST /v1/&lt;generator&gt;</code> with a JSON body and your key in the
  <code>Authorization: Bearer &lt;key&gt;</code> header. The answer is the image's URL:</p>
  <pre><code>{"url": "${escape(base)}/i/4089656e893939785c39fbb5c4cd166a.png", "id": "4089656e893939785c39fbb5c4cd166a"}</code></pre>
  <p>The same request always gets the same URL, and only the first one actually makes the image, so
  asking again is cheap. Images are kept for 180 days after they were last viewed.</p>

  <h3>Errors</h3>
  <p>Errors are JSON, <code>{"error": "…"}</code>, with a message fit to show a person.</p>
  <div class="table"><table>
  <tr><th>Status</th><th>Meaning</th></tr>
  <tr><td><code>400</code></td><td>Bad input, e.g. text too long to fit, or no faces in the photo.</td></tr>
  <tr><td><code>401</code></td><td>Missing or unknown API key.</td></tr>
  <tr><td><code>404</code></td><td>No such generator, or no such image.</td></tr>
  <tr><td><code>413</code></td><td>Request body over 16 KB.</td></tr>
  <tr><td><code>429</code></td><td>Over the rate limit; <code>Retry-After</code> says how many seconds to wait.</td></tr>
  <tr><td><code>502</code></td><td>Something silly depends on (like awyisser.com) failed.</td></tr>
  </table></div>

  <h3>Images</h3>
  <p><code>GET /i/&lt;id&gt;.&lt;png|jpg&gt;</code> serves an image that's already been made. No key needed.</p>

  ${Object.entries(generators)
    .map(([name, g]) => generatorReference(base, name, g))
    .join('\n')}
</section>
`,
  });

const date = d => (d ? new Date(d).toISOString().slice(0, 10) : '—');

export const renderAccount = ({ user, keys, newKey, notice, base, limits }) =>
  page({
    title: 'Your keys · silly',
    user,
    signInEnabled: true,
    body: `
<div class="hero"><h1>Your API keys</h1>
<p>Signed in as <strong>@${escape(user.login)}</strong> on GitHub.</p></div>
<section>
${
  newKey
    ? `<div class="note"><p><strong>Here's your new key.</strong> Copy it now: it won't be shown again.</p>
<pre><code>${escape(newKey)}</code></pre></div>`
    : ''
}
${notice ? `<div class="note warn">${escape(notice)}</div>` : ''}
${
  keys.length
    ? `<div class="table"><table>
<tr><th>Key</th><th>Created</th><th>Last used</th><th></th></tr>
${keys
  .map(
    k => `<tr><td><code>silly_…${escape(k.hint)}</code></td><td>${date(k.created)}</td><td>${date(k.lastUsed)}</td>
<td><form class="inline" method="post" action="/account/keys/${escape(k.id)}/revoke"><button class="button quiet" type="submit">Revoke</button></form></td></tr>`
  )
  .join('\n')}
</table></div>
<p class="muted">"Last used" is updated at most once a day. A key unused for 180 days expires.</p>`
    : "<p>You don't have any keys yet.</p>"
}
<form method="post" action="/account/keys" class="row">
  <button class="button" type="submit"${keys.length >= limits.maxKeys ? ' disabled' : ''}>Make a new key</button>
  <span class="muted">${keys.length} of ${limits.maxKeys} · ${limits.perHour} images an hour each</span>
</form>
</section>
<section>
<h2>Using it</h2>
<pre><code>${escape(curl(base, 'awyiss', { text: 'more silly images' }))}</code></pre>
<p>See the <a href="/#api">API reference</a> for everything else.</p>
<form method="post" action="/logout"><button class="button quiet" type="submit">Sign out</button></form>
</section>
`,
  });

export const renderMessage = ({ title, message, user, signInEnabled }) =>
  page({
    title: `${title} · silly`,
    user,
    signInEnabled,
    body: `<div class="hero"><h1>${escape(title)}</h1><p>${escape(message)}</p></div>
<p><a href="/">Back to silly</a></p>`,
  });

const schemaFor = f => {
  const schema = { type: f.type, description: f.description.replace(/`/g, '') };
  for (const k of ['enum', 'minimum', 'maximum', 'maxLength', 'default']) {
    if (f[k] !== undefined) schema[k] = f[k];
  }
  return schema;
};

export const openApi = ({ base, generators }) => ({
  openapi: '3.1.0',
  info: {
    title: 'silly',
    version: '1',
    description:
      'Image generators for chat bots. Make an image with POST /v1/{generator} and get back a public URL.',
  },
  servers: [{ url: base }],
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
    schemas: {
      Image: {
        type: 'object',
        required: ['url', 'id'],
        properties: { url: { type: 'string', format: 'uri' }, id: { type: 'string' } },
      },
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
    },
  },
  paths: {
    ...Object.fromEntries(
      Object.entries(generators).map(([name, g]) => [
        `/v1/${name}`,
        {
          post: {
            operationId: name,
            summary: g.docs.title,
            description: g.docs.summary,
            security: [{ bearer: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: g.docs.fields.filter(f => f.required).map(f => f.name),
                    properties: Object.fromEntries(g.docs.fields.map(f => [f.name, schemaFor(f)])),
                  },
                  example: g.docs.example,
                },
              },
            },
            responses: {
              200: {
                description: 'The image, made now or earlier.',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Image' } } },
              },
              ...Object.fromEntries(
                [
                  [400, 'Bad input.'],
                  [401, 'Missing or unknown API key.'],
                  [413, 'Request body over 16 KB.'],
                  [429, 'Over the rate limit; see Retry-After.'],
                  [502, 'An upstream service failed.'],
                ].map(([code, description]) => [
                  code,
                  {
                    description,
                    content: {
                      'application/json': { schema: { $ref: '#/components/schemas/Error' } },
                    },
                  },
                ])
              ),
            },
          },
        },
      ])
    ),
    '/i/{file}': {
      get: {
        operationId: 'image',
        summary: 'An image that has been made. Public.',
        parameters: [
          {
            name: 'file',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^[0-9a-f]{32}\\.(png|jpg)$' },
          },
        ],
        responses: {
          200: { description: 'The image.', content: { 'image/png': {}, 'image/jpeg': {} } },
          404: { description: 'No such image.' },
        },
      },
    },
  },
});
