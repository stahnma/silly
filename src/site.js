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

// The Neobrutalism design system from Open Design
// (github.com/feimacode/open-design-agent-kit, claude-design-systems/neobrutalism):
// warm surfaces, thick dark outlines, hard offset shadows, one vermilion
// accent for primary actions. Its display face, Arial Black, isn't free to
// ship, so headings use Archivo Black; body text is Inter. Both are served
// from /assets/fonts (OFL; see assets/README.md). Light only, as the system is.
const FONTS = `
@font-face { font-family: 'Archivo Black'; font-style: normal; font-weight: 400; font-display: swap; src: url(/assets/fonts/ArchivoBlack-latin-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: 'Archivo Black'; font-style: normal; font-weight: 400; font-display: swap; src: url(/assets/fonts/ArchivoBlack-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400 800; font-display: swap; src: url(/assets/fonts/Inter-latin-ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 400 800; font-display: swap; src: url(/assets/fonts/Inter-latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
`;

const STYLE = `
${FONTS}
:root {
  --bg: #fff4cf; --surface: #fffaf0; --surface-warm: #ffdca8;
  --fg: #2a1810; --fg-2: #593625; --muted: #8a6652;
  --border: #d9aa7a; --border-soft: #efd0ab;
  --accent: #d24b1f; --accent-on: #ffffff; --accent-hover: #bc421b; --accent-active: #ac3c17;
  --success: #3d8f4f; --warn: #f2a93b; --danger: #b83a2f;
  --radius-sm: 4px; --radius-md: 8px; --radius-lg: 12px;
  --outline: 3px solid var(--fg);
  --shadow: 6px 6px 0 var(--fg); --shadow-sm: 3px 3px 0 var(--fg);
  --focus-ring: 0 0 0 4px rgba(210, 75, 31, 0.28);
  --display: "Archivo Black", "Arial Black", Impact, sans-serif;
  --body: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
  color-scheme: light;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 400 16px/1.6 var(--body); }
a { color: var(--fg); text-decoration: underline; text-decoration-color: var(--accent);
  text-decoration-thickness: 2px; text-underline-offset: 3px; transition: color 150ms ease; }
a:hover { color: var(--accent); }
:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--radius-sm); }
code, pre { font-family: var(--mono); font-size: 0.86em; }
code { background: var(--surface-warm); border: 1.5px solid var(--fg); padding: 0.05em 0.35em;
  border-radius: var(--radius-sm); }
pre { background: var(--surface); border: var(--outline); box-shadow: var(--shadow-sm); padding: 16px 18px;
  border-radius: var(--radius-md); overflow-x: auto; line-height: 1.5; }
pre code { background: none; border: 0; padding: 0; }
.wrap { max-width: 960px; margin: 0 auto; padding: 0 16px; }

header { background: var(--surface); border-bottom: var(--outline); }
header .wrap { display: flex; align-items: center; gap: 24px; min-height: 68px; flex-wrap: wrap; }
.brand { font-family: var(--display); font-size: 1.6rem; letter-spacing: -0.01em; color: var(--fg); text-decoration: none; }
.brand span { color: var(--accent); }
nav { display: flex; gap: 18px; flex: 1; flex-wrap: wrap; }
nav a { color: var(--fg); font-weight: 600; font-size: 0.95rem; text-decoration: none; }
nav a:hover { color: var(--accent); }

.button { display: inline-block; font: 700 1rem/1 var(--body); padding: 12px 18px; cursor: pointer;
  background: var(--accent); color: var(--accent-on); text-decoration: none;
  border: var(--outline); border-radius: var(--radius-sm); box-shadow: var(--shadow-sm);
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease; }
.button:hover { background: var(--accent-hover); color: var(--accent-on); transform: translate(-2px, -2px); box-shadow: 5px 5px 0 var(--fg); }
.button:active { background: var(--accent-active); transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--fg); }
.button.quiet { background: var(--surface); color: var(--fg); }
.button.quiet:hover { background: var(--surface-warm); }
.button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; box-shadow: var(--shadow-sm); }

.hero { padding: 56px 0 36px; }
.hero h1 { font-family: var(--display); font-weight: 400; font-size: clamp(2.25rem, 6vw, 3.375rem);
  line-height: 1.05; letter-spacing: -0.02em; margin: 0 0 18px; }
.hero h1 em { font-style: normal; color: var(--accent); }
.hero p { font-size: 1.125rem; color: var(--fg-2); max-width: 640px; margin: 0; }
section { padding: 36px 0; border-top: var(--outline); }
h2 { font-family: var(--display); font-weight: 400; font-size: clamp(1.5rem, 3.5vw, 2.25rem);
  line-height: 1.1; margin: 0 0 18px; letter-spacing: -0.01em; }
h3 { font-size: 1.125rem; font-weight: 800; margin: 32px 0 10px; }
h3 code { font-size: 0.8em; }

.gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; }
.card { background: var(--surface); border: var(--outline); border-radius: var(--radius-md);
  box-shadow: var(--shadow); overflow: hidden; }
.card .shot { aspect-ratio: 4 / 3; background: var(--surface-warm); border-bottom: var(--outline);
  display: flex; align-items: center; justify-content: center; }
.card img { width: 100%; height: 100%; object-fit: contain; display: block; }
.card .body { padding: 14px 16px 16px; }
.card h3 { margin: 0 0 4px; font-size: 1.1rem; }
.card p { margin: 0; color: var(--fg-2); font-size: 0.93rem; }

.table { overflow-x: auto; border: var(--outline); border-radius: var(--radius-md); background: var(--surface);
  margin: 10px 0 16px; }
table { width: 100%; border-collapse: collapse; font-size: 0.93rem; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1.5px solid var(--border); vertical-align: top; }
tr:last-child td { border-bottom: 0; }
th { background: var(--surface-warm); border-bottom: var(--outline); font-weight: 800; font-size: 0.85rem;
  text-transform: uppercase; letter-spacing: 0.04em; }
.req { color: var(--accent); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
.muted { color: var(--muted); }
ul { padding-left: 1.2em; }
li { margin: 4px 0; }

.note { border: var(--outline); border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
  padding: 14px 18px; margin: 18px 0; background: color-mix(in srgb, var(--success) 16%, var(--surface)); }
.note.warn { background: color-mix(in srgb, var(--warn) 28%, var(--surface)); }
.note pre { box-shadow: none; }
.note code { word-break: break-all; }
.row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
form.inline { display: inline; margin: 0; }
footer { margin-top: 24px; padding: 28px 0 48px; color: var(--fg-2); font-size: 0.9rem;
  border-top: var(--outline); background: var(--surface); }
footer p { margin: 4px 0; }
@media (max-width: 600px) {
  header .wrap { gap: 0 16px; padding-top: 10px; }
  header .button { margin-left: auto; padding: 9px 12px; font-size: 0.9rem; }
  nav { order: 3; flex-basis: 100%; padding: 8px 0 12px; }
  .card, .note { box-shadow: var(--shadow-sm); }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

const page = ({ title, user, signInEnabled, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="Silly image generators for chat bots: aw yiss, O RLY covers and mustaches.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#fff4cf">
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
  <h1>Silly images, <em>by the link.</em></h1>
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
