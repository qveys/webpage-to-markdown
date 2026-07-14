(function (global) {
  "use strict";

  const MAX_ASSET_BYTES = 100 * 1024 * 1024;
  const MAX_SESSION_ASSET_BYTES = 1000 * 1024 * 1024;

  function hasPrefix(bytes, signature) {
    if (bytes.length < signature.length) return false;
    return signature.every((value, index) => bytes[index] === value);
  }

  function isWebp(bytes) {
    return hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes.length >= 12 &&
      String.fromCharCode.apply(null, bytes.slice(8, 12)) === "WEBP";
  }

  function isAvif(bytes) {
    if (bytes.length < 12) return false;
    const box = String.fromCharCode.apply(null, bytes.slice(4, 12));
    return box.startsWith("ftyp") && /avif|avis/.test(
      String.fromCharCode.apply(null, bytes.slice(8, Math.min(bytes.length, 32))),
    );
  }

  // XML character references (&#64;, &#x40;, &amp;…) are resolved by the XML
  // parser before CSS is interpreted, so the safety regexes must also run on
  // the decoded text. A few rounds cover nested encodings (e.g. &amp;#64;).
  function decodeXmlCharacterReferences(text) {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    let decoded = text;
    for (let round = 0; round < 3; round++) {
      const next = decoded.replace(
        /&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi,
        (match, hex, dec, name) => {
          if (name) return named[name.toLowerCase()];
          const code = parseInt(hex || dec, hex ? 16 : 10);
          if (!Number.isFinite(code) || code > 0x10ffff) return match;
          try {
            return String.fromCodePoint(code);
          } catch (_err) {
            return match;
          }
        },
      );
      if (next === decoded) break;
      decoded = next;
    }
    return decoded;
  }

  function validatePassiveSvg(bytes) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (_err) {
      throw new Error("SVG is not valid UTF-8");
    }
    if (!/<svg(?:\s|>)/i.test(text)) throw new Error("Invalid SVG root");

    const forbiddenMarkup = /<!doctype|<!entity|<\?xml-stylesheet|<(?:script|foreignObject|iframe|object|embed|audio|video|link|animate|animateMotion|animateTransform|set)\b/i;
    const eventHandler = /\son[a-z][a-z0-9_-]*\s*=/i;
    const activeScheme = /(?:javascript\s*:|data\s*:\s*text\/html)/i;
    const externalReference = /(?:href|xlink:href|src)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|gif|webp|avif)[;,])[^"']+["']/i;
    const cssNetworkReference = /(?:@import|url\s*\(\s*["']?(?!#|data:image\/(?:png|jpeg|gif|webp|avif)[;,]))/i;
    const unsafeCss = /(?:@|expression\s*\(|(?:-moz-binding|behavior)\s*:|image-set\s*\()/i;

    for (const candidate of [text, decodeXmlCharacterReferences(text)]) {
      const styleContents = [];
      for (const match of candidate.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
        styleContents.push(match[1]);
      }
      for (const match of candidate.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) {
        styleContents.push(match[2]);
      }
      if (styleContents.some((css) =>
        unsafeCss.test(css) || activeScheme.test(css) || cssNetworkReference.test(css)
      )) {
        throw new Error("SVG contains active or external content");
      }

      if (forbiddenMarkup.test(candidate) || eventHandler.test(candidate) ||
          activeScheme.test(candidate) || externalReference.test(candidate) ||
          cssNetworkReference.test(candidate)) {
        throw new Error("SVG contains active or external content");
      }
    }
  }

  function normalizeMime(contentType) {
    return String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  }

  function validateAssetBytes(bytes, contentType) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const mime = normalizeMime(contentType);
    const rules = {
      "image/png": { extension: ".png", valid: (b) => hasPrefix(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
      "image/jpeg": { extension: ".jpg", valid: (b) => hasPrefix(b, [0xff, 0xd8, 0xff]) },
      "image/gif": { extension: ".gif", valid: (b) => hasPrefix(b, [0x47, 0x49, 0x46, 0x38]) },
      "image/webp": { extension: ".webp", valid: isWebp },
      "image/avif": { extension: ".avif", valid: isAvif },
      "image/bmp": { extension: ".bmp", valid: (b) => hasPrefix(b, [0x42, 0x4d]) },
      "image/x-icon": { extension: ".ico", valid: (b) => hasPrefix(b, [0x00, 0x00, 0x01, 0x00]) },
      "image/vnd.microsoft.icon": { extension: ".ico", valid: (b) => hasPrefix(b, [0x00, 0x00, 0x01, 0x00]) },
      "image/svg+xml": { extension: ".svg", valid: (b) => { validatePassiveSvg(b); return true; } },
    };
    const rule = rules[mime];
    if (!rule) throw new Error(`Unsupported image type: ${mime || "missing"}`);
    if (!rule.valid(data)) throw new Error(`Image signature does not match ${mime}`);
    return { mime, extension: rule.extension };
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    if (typeof btoa === "function") return btoa(binary);
    return Buffer.from(bytes).toString("base64");
  }

  function reserveAssetBytes(budget, bytes, maxBytes) {
    if (!budget || typeof budget !== "object") throw new Error("Missing session image budget");
    const current = Number(budget.used) || 0;
    if (bytes < 0 || current + bytes > maxBytes) {
      throw new Error("Session image budget exceeded");
    }
    budget.used = current + bytes;
  }

  async function defaultPermissionCheck(url) {
    const pattern = `${new URL(url).origin}/*`;
    return chrome.permissions.contains({ origins: [pattern] });
  }

  async function readResponseBytes(response, maxBytes) {
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        total += chunk.length;
        if (total > maxBytes) {
          await reader.cancel("Image exceeds the size limit");
          throw new Error("Image exceeds the size limit");
        }
        chunks.push(chunk);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error("Image exceeds the size limit");
    return bytes;
  }

  async function fetchValidatedAsset(url, options = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only HTTP(S) image URLs are allowed");
    }
    const permissionCheck = options.permissionCheck || defaultPermissionCheck;
    if (!(await permissionCheck(parsed.href))) {
      throw new Error(`Origin is not authorized: ${parsed.origin}`);
    }

    const maxBytes = Math.min(options.maxBytes ?? MAX_ASSET_BYTES, MAX_ASSET_BYTES);
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(parsed.href, {
      credentials: "omit",
      redirect: "error",
      headers: { Accept: "image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon,image/svg+xml" },
    });
    if (!response.ok) throw new Error(`Image request failed with HTTP ${response.status}`);

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxBytes) throw new Error("Image exceeds the size limit");
    const bytes = await readResponseBytes(response, maxBytes);

    const validated = validateAssetBytes(bytes, response.headers.get("content-type"));
    return {
      ...validated,
      bytes: bytes.length,
      dataUrl: `data:${validated.mime};base64,${bytesToBase64(bytes)}`,
    };
  }

  global.W2M = global.W2M || {};
  global.W2M.safeAssets = {
    MAX_ASSET_BYTES,
    MAX_SESSION_ASSET_BYTES,
    fetchValidatedAsset,
    reserveAssetBytes,
    validateAssetBytes,
    validatePassiveSvg,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.W2M.safeAssets;
  }
})(typeof self !== "undefined" ? self : globalThis);
