# silly

Silly image generators for chat bots, starting with [aw yiss](https://www.awyisser.com). It replaces the Heroku apps that the old Hubot scripts relied on, which are gone now.

A bot asks silly for an image and gets back a URL. Silly makes the image once, stores it in S3-compatible storage (Tigris on fly.io), and serves it from then on. Slack unfurls the URL like any other image link, so the bot never uploads files.

## API

### `POST /v1/<generator>`: make an image

Needs an API key: `Authorization: Bearer <key>`. The body is JSON, and its fields depend on the generator.

```sh
curl -X POST https://stahnma-silly.fly.dev/v1/awyiss \
  -H "Authorization: Bearer $SILLY_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"text": "more burritos"}'
# {"url":"https://stahnma-silly.fly.dev/i/4089656e893939785c39fbb5c4cd166a.png","id":"4089656e893939785c39fbb5c4cd166a"}
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

| Name | Input | Source |
|---|---|---|
| `awyiss` | `{"text": "..."}`, 1–40 characters | [awyisser.com](https://www.awyisser.com)'s API ([quinnkeast/awyisser](https://github.com/quinnkeast/awyisser)), safe-for-work mode |

Planned: O RLY covers ([stahnma/burrito#79](https://github.com/stahnma/burrito/issues/79)) and mustache me ([stahnma/burrito#175](https://github.com/stahnma/burrito/issues/175)).

To add one, write `src/generators/<name>.js` exporting an object with:

- `contentType`
- `validate(input)`: returns the parameters that decide the image, or throws `BadRequest`.
- `render(params)`: returns a `Buffer`. Throw `UpstreamError` if something it depends on fails.

Then register it in `src/server.js`. See `src/generators/awyiss.js`.

## Storage and expiry

- **Storage:** images live in an S3 bucket, using only standard S3 calls. Tigris is the default, but R2, AWS S3 or MinIO work too by changing the `AWS_*` and `BUCKET_NAME` settings.
- **Expiry:** each time an image is served, silly resets its last-modified time (at most once a day per image). The bucket's lifecycle rule deletes objects 180 days after last-modified, so an image lasts 180 days past its last use. `scripts/set-lifecycle.js` sets the rule.

## Logs

There's one JSON line per request. It includes the time, method, path, status, duration, client IP (`Fly-Client-IP`) and user agent. For image requests it also has the image id; for generate requests, the generator, which key was used, whether the image was already stored, and render time. API keys are never logged; the `key` field is just the key's position in `SILLY_API_KEYS`.

```sh
fly logs -a stahnma-silly
```

## Configuration

| Variable | |
|---|---|
| `SILLY_API_KEYS` | Comma-separated keys allowed to make images. Required. Use two while rotating a key. |
| `SILLY_PUBLIC_URL` | Base URL in returned links. Set in `fly.toml`. |
| `PORT` | Default `8080`. |
| `BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | The bucket. `fly storage create` sets them all. If `BUCKET_NAME` isn't set, images are kept in memory, which is for development only. |

## Development

Tools come from Flox:

```sh
flox activate
make test     # unit tests (no network)
make lint
make dev      # http://localhost:8080, in-memory storage, API key "dev"
```

## Deploying to fly.io (first time)

```sh
flox activate
fly apps create stahnma-silly                   # fly.toml is already here
fly storage create --app stahnma-silly          # Tigris bucket; sets BUCKET_NAME and AWS_* secrets
fly secrets set --app stahnma-silly SILLY_API_KEYS="$(openssl rand -hex 32)"
fly deploy
fly ssh console --app stahnma-silly -C "node scripts/set-lifecycle.js"   # 180-day expiry
```

Then give the bot the URL and the key, e.g. for burrito, `HUBOT_SILLY_URL=https://stahnma-silly.fly.dev` and `HUBOT_SILLY_KEY=<the key>`. You can read the key back with `fly ssh console -C 'printenv SILLY_API_KEYS'`.

`fly.toml` keeps one machine running, so Slack's image fetch never waits on a cold start.
