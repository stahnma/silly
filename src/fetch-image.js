// Fetch an image from a URL a client gave us, without letting that URL reach
// anything internal. Silly runs inside fly.io's private network, so a URL
// pointing at a private, loopback or link-local address (or a hostname that
// resolves to one) could otherwise be used to probe it.
//
// - Only http and https, on any port.
// - Every connection's address is checked after DNS resolution, so a hostname
//   can't point at an internal address, and a redirect can't either.
//   Redirects are followed by hand (at most 3) so IP-literal targets, which
//   skip DNS, are checked too.
// - The body is capped in size, must be an image, and its dimensions are read
//   from the header before anything decodes it.

import { lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';
// undici's own fetch: Node's built-in fetch bundles an older undici that
// can't use this version's Agent.
import { Agent, fetch as undiciFetch } from 'undici';
import { imageSize } from 'image-size';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_REDIRECTS = 3;
// Raster formats only: an SVG can reference other files when it's drawn.
const FORMATS = ['jpg', 'png', 'gif', 'webp', 'bmp'];
const TIMEOUT_MS = 15_000;

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7], // unique local, including fly.io's private network (fdaa::/16)
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
]) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

// True if an address must not be fetched from. IPv4-mapped IPv6 addresses
// (::ffff:10.0.0.1) are checked as the IPv4 address they map.
export const isBlockedAddress = address => {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) return blocked.check(address, 'ipv6');
  return true;
};

export class FetchError extends Error {}

// A DNS lookup that refuses internal addresses; undici uses it for every
// connection, including after a redirect.
const safeLookup = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const bad = addresses.find(a => isBlockedAddress(a.address));
    if (bad) {
      return callback(new FetchError(`${hostname} resolves to an address silly won't fetch from`));
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
};

const agent = new Agent({ connect: { lookup: safeLookup } });

const checkUrl = url => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError('not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new FetchError('only http and https URLs can be fetched');
  }
  // IP-literal hosts never go through DNS, so check them here.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isBlockedAddress(host)) {
    throw new FetchError("that address isn't one silly will fetch from");
  }
  return parsed;
};

const readCapped = async body => {
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new FetchError(`the image is over ${MAX_BYTES / 1024 / 1024} MB`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

// Resolves with the image's bytes. Rejects with a FetchError (the client's
// URL is the problem) for anything that isn't a reachable, reasonably sized
// image.
export const fetchImage = async (url, { fetch = undiciFetch } = {}) => {
  let current = checkUrl(url);
  for (let hops = 0; ; hops++) {
    let res;
    try {
      res = await fetch(current, {
        dispatcher: agent,
        redirect: 'manual',
        headers: { 'User-Agent': 'silly (+https://github.com/stahnma/silly)', Accept: 'image/*' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const cause = err.cause instanceof FetchError ? err.cause : err;
      throw cause instanceof FetchError
        ? cause
        : new FetchError(`couldn't fetch it: ${cause.message}`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel();
      if (hops >= MAX_REDIRECTS) throw new FetchError('too many redirects');
      current = checkUrl(new URL(res.headers.get('location'), current).href);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchError(`fetching it returned HTTP ${res.status}`);
    }
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) {
      await res.body?.cancel();
      throw new FetchError(`that's not an image (${type.split(';')[0] || 'no content type'})`);
    }
    const length = Number(res.headers.get('content-length'));
    if (length > MAX_BYTES) {
      await res.body?.cancel();
      throw new FetchError(`the image is over ${MAX_BYTES / 1024 / 1024} MB`);
    }
    const bytes = await readCapped(res.body);

    let size;
    try {
      size = imageSize(bytes);
    } catch {
      throw new FetchError("couldn't read that image");
    }
    if (!FORMATS.includes(size.type)) {
      throw new FetchError(`${size.type} images aren't supported (only ${FORMATS.join(', ')})`);
    }
    if (size.width * size.height > MAX_PIXELS) {
      throw new FetchError(`the image is too big (${size.width}x${size.height})`);
    }
    return bytes;
  }
};
