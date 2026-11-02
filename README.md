# silly

Silly image generators for chat bots and anything else that can post a link, starting with [aw yiss](https://www.awyisser.com).

A client asks silly for an image and gets back a URL. Silly makes the image once, stores it in S3-compatible storage (Tigris on fly.io), and serves it from then on. Chat apps such as Slack show the URL as an image like any other image link, so clients never need to upload files.

## API

### `POST /v1/<generator>`: make an image

Needs an API key: `Authorization: Bearer <key>`. The body is JSON, and its fields depend on the generator.

```sh
curl -X POST https://silly.stahnma.us/v1/awyiss \
  -H "Authorization: Bearer $SILLY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"text": "more burritos"}'
# {"url":"https://silly.stahnma.us/i/4089656e893939785c39fbb5c4cd166a.png","id":"4089656e893939785c39fbb5c4cd166a"}
```

- The id is a hash of the generator and its parameters. The same request always gets the same URL, and only the first one actually makes the image.
- Errors come back as `{"error": "..."}`:
  - `400`: bad input, e.g. the text is too long.
  - `401`: missing or unknown key.
  - `404`: no such generator.
  - `413`: body over 16 KB.
  - `502`: the generator's upstream failed.

### `GET /i/<id>.png`: an image

Public and read-only. It only serves images that already exist and never makes one, so the URL is safe to post anywhere. Responses are marked immutable for caching.

### `GET /healthz`

Returns `{"ok": true}`.

## Generators

| Name       | Input                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Source                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `awyiss`   | `{"text": "...", "sfw": false}`: text is 1–40 characters. `sfw` is optional and defaults to `true` ("motha freakin"); `false` gives the original comic's wording.                                                                                                                                                                                                                                                                                                                                   | [awyisser.com](https://www.awyisser.com)'s API ([quinnkeast/awyisser](https://github.com/quinnkeast/awyisser))                                                                                  |
| `orly`     | `{"title": "...", "guide_text": "...", "top_text": "...", "author": "...", "guide_placement": "bottom_right", "animal": 12, "theme": 3}`: only `title` is required. `guide_text` defaults to "The Definitive Guide". `guide_placement` is `bottom_right` (default), `bottom_left`, `top_right` or `top_left`. `animal` is 1–40 and `theme` (the colour) 0–16; when either is left out, it's picked from the text, so the same text gives the same cover. Text that won't fit on the cover is a 400. | Drawn by silly, following [charleshberlin/O-RLY-Book-Generator](https://github.com/charleshberlin/O-RLY-Book-Generator)'s layout and animal pictures, with free fonts (see `assets/README.md`). |
| `mustache` | `{"url": "https://...", "style": 2}`: `url` is an http(s) link to a JPEG, PNG, GIF, WebP or BMP. `style` is 1 (handlebar), 2 (walrus) or 3 (pencil); when it's left out, it's picked from the URL. Every face found gets a mustache; no faces is a 400. Returns a JPEG, at most 1200px on its longest side.                                                                                                                                                                                         | Faces found by [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) (MIT) with ONNX Runtime. Mustaches are drawn by silly.                                       |

To add one, write `src/generators/<name>.js` exporting an object with:

- `contentType`
- `validate(input)`: returns the parameters that decide the image, or throws `BadRequest`.
- `render(params)`: returns a `Buffer`. Throw `UpstreamError` if something it depends on fails.

Then register it in `src/server.js`. See `src/generators/awyiss.js`.

## Fetching images

`mustache` downloads the image at the URL it's given, so it refuses anything that could reach an internal service:

- **Allowed:** http and https only. Every connection's address is checked after DNS resolution, and redirects (at most 3) are checked the same way, so neither a hostname nor a redirect can lead to a private, loopback, link-local or fly.io-internal address.
- **Size and format:** images are limited to 10 MB and 40 megapixels, and must be a raster format; SVGs are refused because they can reference other files.

## Storage and expiry

- **Storage:** images live in an S3 bucket, using only standard S3 calls. Tigris is the default, but R2, AWS S3 or MinIO work too by changing the `AWS_*` and `BUCKET_NAME` settings.
- **Expiry:** each time an image is served, silly resets its last-modified time (at most once a day per image). The bucket's lifecycle rule deletes objects 180 days after last-modified, so an image lasts 180 days past its last use. `scripts/set-lifecycle.js` sets the rule.

## Logs

There's one JSON line per request. It includes the time, method, path, status, duration, client IP (`Fly-Client-IP`) and user agent. For image requests it also has the image id; for generate requests, the generator, which key was used, whether the image was already stored, and render time. API keys are never logged; the `key` field is just the key's position in `SILLY_API_KEYS`.

```sh
fly logs -a stahnma-silly
```

## Configuration

| Variable                                                                                         |                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `SILLY_API_KEYS`                                                                                 | Comma-separated keys allowed to make images. Required. Use two while rotating a key.                                                  |
| `SILLY_PUBLIC_URL`                                                                               | Base URL in returned links. Set in `fly.toml`.                                                                                        |
| `PORT`                                                                                           | Default `8080`.                                                                                                                       |
| `BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | The bucket. `fly storage create` sets them all. If `BUCKET_NAME` isn't set, images are kept in memory, which is for development only. |

## Development

Tools come from Flox:

```sh
flox activate
make test     # unit tests (no network)
make lint
make dev      # http://localhost:8080, in-memory storage, API key "dev"
```

## Deploying

Merging to `main` deploys automatically. The CI workflow runs lint and tests, then `fly deploy` using the `FLY_API_TOKEN` repository secret, a deploy token scoped to the app. To create or replace that token:

```sh
fly tokens create deploy -a stahnma-silly | gh secret set FLY_API_TOKEN -R stahnma/silly
```

Dependabot opens weekly PRs for npm packages and GitHub Actions.

## Setting up on fly.io (first time)

```sh
flox activate
fly apps create stahnma-silly                   # fly.toml is already here
fly storage create --app stahnma-silly          # Tigris bucket; sets BUCKET_NAME and AWS_* secrets
fly secrets set --app stahnma-silly SILLY_API_KEYS="$(openssl rand -hex 32)"
fly deploy
fly ssh console --app stahnma-silly -C "node scripts/set-lifecycle.js"   # 180-day expiry
fly certs add silly.stahnma.us --app stahnma-silly
```

For the domain, add DNS records for `silly.stahnma.us` as `fly certs add` describes. Usually that's a CNAME to `stahnma-silly.fly.dev`, or the A/AAAA records from `fly ips list`. Then wait for `fly certs show silly.stahnma.us --app stahnma-silly` to report the certificate as issued. Every image URL uses `SILLY_PUBLIC_URL` (`https://silly.stahnma.us`, set in `fly.toml`), so links already posted keep working if silly moves to another host or bucket.

Then give each client the base URL (`https://silly.stahnma.us`) and an API key. You can read the keys back with `fly ssh console -C 'printenv SILLY_API_KEYS'`.

`fly.toml` keeps one machine running, so Slack's image fetch never waits on a cold start.
