# silly

Silly image generators for chat bots and anything else that can post a link: aw yiss comics, O RLY book covers, and mustaches or Santa hats on photos.

A client asks silly for an image and gets back a URL. Silly makes the image once, stores it in S3-compatible storage and serves it from then on. Chat apps such as Slack show the URL as an image like any other image link, so clients never need to upload files.

## The website

A running silly serves a home page at `/` with live examples and the API reference. The reference is built from each generator's own description, so it matches the code. The same reference is at `/openapi.json` as an OpenAPI 3.1 spec.

## API keys

- **Signing in:** people get a key by signing in with GitHub and making one on `/account`, up to 5 each. They can revoke their keys there too. A key is shown once; only its SHA-256 is stored, under `keys/<github id>/` in the bucket.
- **Limits:** a signed-in user can make 60 images an hour, across all their keys, then gets a 429 with `Retry-After`. A key unused for 180 days expires with the bucket's lifecycle rule (see [Storage and expiry](#storage-and-expiry)).
- **Configured keys:** keys in `SILLY_API_KEYS` are for your own bots and have no rate limit.
- **Without sign-in:** if sign-in isn't configured, the site says keys are given out by request.
- **Admin:** list and revoke signed-in users' keys from anywhere the bucket's credentials are set:

  ```sh
  node scripts/keys.js list
  node scripts/keys.js revoke <key id>
  node scripts/keys.js revoke-user <github login>
  ```

## API

### `POST /v1/<generator>`: make an image

Needs an API key: `Authorization: Bearer <key>`. The body is JSON, and its fields depend on the generator.

```sh
curl -X POST https://silly.example.com/v1/awyiss \
  -H "Authorization: Bearer $SILLY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"text": "more burritos"}'
# {"url":"https://silly.example.com/i/4089656e893939785c39fbb5c4cd166a.png","id":"4089656e893939785c39fbb5c4cd166a"}
```

- The id is a hash of the generator and its parameters. The same request always gets the same URL, and only the first one actually makes the image.
- Errors come back as `{"error": "..."}`:
  - `400`: bad input, e.g. the text is too long.
  - `401`: missing or unknown key.
  - `404`: no such generator.
  - `413`: body over 16 KB.
  - `429`: over a signed-in user's rate limit.
  - `502`: the generator's upstream failed.

### `GET /i/<id>.<png|jpg>`: an image

Public and read-only. It only serves images that already exist and never makes one, so the URL is safe to post anywhere. Responses are marked immutable for caching.

### `GET /healthz`

Returns `{"ok": true}`.

## Generators

### `awyiss`

Kate Beaton's duck comic with your phrase, from [awyisser.com](https://www.awyisser.com)'s API ([quinnkeast/awyisser](https://github.com/quinnkeast/awyisser)).

- `text` (required): 1–40 characters.
- `sfw`: defaults to `true` ("motha freakin"); `false` gives the original comic's wording.

### `orly`

A parody O'Reilly book cover, drawn by silly following [charleshberlin/O-RLY-Book-Generator](https://github.com/charleshberlin/O-RLY-Book-Generator)'s layout and animal pictures, with free fonts (see `assets/README.md`).

- `title` (required): must fit on the cover; text that won't fit is a 400.
- `guide_text`: defaults to "The Definitive Guide".
- `top_text`, `author`.
- `guide_placement`: `bottom_right` (default), `bottom_left`, `top_right` or `top_left`.
- `animal` (1–40) and `theme` (the colour, 0–16): when either is left out, it's picked from the text, so the same text gives the same cover.

### `mustache`

A mustache on every face in a photo. Faces are found by [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) (MIT) with ONNX Runtime; the mustaches are drawn by silly.

- `url` (required): an http(s) link to a JPEG, PNG, GIF, WebP or BMP.
- `style`: 1 (classic curly), 2 (bushy) or 3 (smooth, emoji-like); picked from the URL when left out.

No faces is a 400. Returns a JPEG, at most 1200 px on its longest side.

### `santa`

A Santa hat on every face in a photo, drawn by silly and placed from the eyes, so it's sized to each head and tilted with it. Faces are found the same way as for `mustache`.

- `url` (required): an http(s) link to a JPEG, PNG, GIF, WebP or BMP.

No faces is a 400. Returns a JPEG, at most 1200 px on its longest side.

### Adding a generator

Write `src/generators/<name>.js` exporting an object with:

- `contentType`
- `docs`: a title, summary, field descriptions and an example. The website, OpenAPI spec and example image are built from it.
- `validate(input)`: returns the parameters that decide the image, or throws `BadRequest`.
- `render(params)`: returns a `Buffer`. Throw `UpstreamError` if something it depends on fails.

Then register it in `src/server.js`. See `src/generators/awyiss.js`.

## Fetching images

`mustache` and `santa` download the image at the URL they're given, so silly refuses anything that could reach an internal service:

- **Allowed:** http and https only. Every connection's address is checked after DNS resolution, and redirects (at most 3) are checked the same way. So neither a hostname nor a redirect can lead to a private, loopback, link-local or IPv6 unique-local address.
- **Size and format:** images are limited to 10 MB and 16 megapixels, and must be a raster format. SVGs are refused because they can reference other files.

## Storage and expiry

- **Storage:** images and API keys live in one S3 bucket, using only standard S3 calls. Any S3-compatible service works: AWS S3, Cloudflare R2, Tigris, MinIO and so on. The AWS SDK reads the endpoint and credentials from the standard `AWS_*` variables.
- **Expiry:** each time an image is served or a key is used, silly resets its last-modified time (at most once a day). A bucket lifecycle rule that deletes objects 180 days after last-modified therefore removes images and keys 180 days after their last use.
  - `node scripts/set-lifecycle.js` sets that rule through the S3 API.
  - Some providers (Cloudflare R2, for one) don't accept lifecycle rules that way. Set an equivalent rule in the provider's own console or API.
  - Without a rule, nothing is deleted.

## Logs

There's one JSON line per request on standard output. It includes:

- **Every request:** the time, method, path, status, duration, client IP (see `SILLY_CLIENT_IP_HEADER`) and user agent.
- **Image requests:** the image id.
- **Generate requests:** the generator, which key was used, whether the image was already stored, and render time.

API keys are never logged. The `key` field is the key's position in `SILLY_API_KEYS`, or `gh:<login>` for a signed-in user's key. Signing in, and making or revoking a key, are logged with the GitHub login.

## Configuration

| Variable                                                                          |                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SILLY_API_KEYS`                                                                  | Required. Comma-separated keys allowed to make images, with no rate limit. Use two while rotating a key.                                                                                                                                                                                                                                     |
| `SILLY_PUBLIC_URL`                                                                | The public base URL, e.g. `https://silly.example.com`. It's in every image URL silly returns, so use a domain you'll keep: posted links keep working if silly moves to another host or bucket.                                                                                                                                               |
| `BUCKET_NAME`                                                                     | The S3 bucket. If it isn't set, images and keys are kept in memory, which is only for development.                                                                                                                                                                                                                                           |
| `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | The bucket's endpoint and credentials, read by the AWS SDK. Leave out `AWS_ENDPOINT_URL_S3` for AWS S3 itself.                                                                                                                                                                                                                               |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`                                        | A GitHub OAuth app, for signing in to get a key.                                                                                                                                                                                                                                                                                             |
| `SILLY_SESSION_SECRET`                                                            | Signs session cookies; a long random string. Without this and the GitHub settings, sign-in is off.                                                                                                                                                                                                                                           |
| `SILLY_CLIENT_IP_HEADER`                                                          | The header the proxy in front of silly puts the client's address in, such as `CF-Connecting-IP`, `X-Real-IP` or `X-Forwarded-For` (silly uses its last entry, the one your proxy added). Used only for logs. Without it, logs show the connecting address. Only set it if your proxy sets that header, since clients can send it themselves. |
| `PORT`                                                                            | Default `8080`.                                                                                                                                                                                                                                                                                                                              |

## Development

Tools come from Flox:

```sh
flox activate
make test     # unit tests (no network)
make lint
make dev      # http://localhost:8080, in-memory storage, API key "dev"
```

CI runs lint and tests on every pull request, and Dependabot opens weekly PRs for npm packages and GitHub Actions. The workflow's `deploy` job deploys the maintainer's instance; remove or replace it in a fork.

## Deploying

Silly is a single Node.js process. Run it with Node 24 (`npm ci --omit=dev && node src/server.js`) or build the included `Dockerfile`.

What it needs from its host:

- **An S3-compatible bucket** and credentials for it.
- **HTTPS in front of it,** at the domain in `SILLY_PUBLIC_URL`. Chat apps generally preview only https links, and session cookies are marked `Secure` when the URL is https.
- **About 512 MB of memory.** Face detection for `mustache` and `santa` peaks around 250 MB.
- **At least one instance always running.** Chat apps fetch an image when they show the message, and a cold start can make them give up on the preview. Rate limits are kept in each process's memory, so several instances make them looser, not stricter.

To set up a new instance:

1. **Bucket:** create one and credentials that can read, write, list and delete in it.
2. **Run silly** with `SILLY_API_KEYS` (e.g. `openssl rand -hex 32`), `SILLY_PUBLIC_URL`, `BUCKET_NAME` and the `AWS_*` settings.
3. **Expiry rule:** set it once with `node scripts/set-lifecycle.js`, run anywhere those settings are available (see [Storage and expiry](#storage-and-expiry)).
4. **Sign-in (optional):** create a GitHub OAuth app at <https://github.com/settings/applications/new>.
   - Homepage URL: your `SILLY_PUBLIC_URL`.
   - Authorization callback URL: `<SILLY_PUBLIC_URL>/auth/github/callback`.

   Then set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and a random `SILLY_SESSION_SECRET`.

5. **Clients:** give each one the base URL and an API key.
