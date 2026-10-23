// /api/sms-inbound.js
// Receives incoming texts from voip.ms (the DID's "SMS URL Callback").
//
// Set the callback on the DID in the voip.ms portal to:
//   https://<your-site>/api/sms-inbound?key=<SMS_INBOUND_KEY>&to={TO}&from={FROM}&message={MESSAGE}&id={ID}&date={TIMESTAMP}
// and enable "URL callback retry" so voip.ms resends until it gets "ok".
//
// Sources disagree on whether voip.ms sends GET with placeholders (sometimes
// separated by ";" instead of "&") or POST with a JSON body, so this accepts both.
//
// Env vars:
//   SMS_INBOUND_KEY  shared secret in the callback URL; voip.ms doesn't sign requests

export default async function handler(req, res) {
  const query = parseQuery(req.url);

  if (!process.env.SMS_INBOUND_KEY || query.key !== process.env.SMS_INBOUND_KEY) {
    res.status(401).send("unauthorized");
    return;
  }

  const sms = normalize({ ...query, ...flattenBody(req.body) });

  if (!sms.from || !sms.to) {
    res.status(400).send("missing from/to");
    return;
  }

  // TODO: do something with the message (store it, forward it, auto-reply).
  // Keep it fast: voip.ms treats anything other than "ok" as a failure and retries,
  // so use sms.id to ignore duplicates once messages are stored.
  console.log("Inbound SMS", JSON.stringify(sms));

  res.status(200).send("ok");
}

// Vercel's req.query only splits on "&"; voip.ms callbacks may use ";".
function parseQuery(url = "") {
  const qs = url.split("?")[1] || "";
  const out = {};
  for (const pair of qs.split(/[&;]/)) {
    if (!pair) continue;
    const [k, ...rest] = pair.split("=");
    out[decodeURIComponent(k)] = decodeURIComponent(rest.join("=").replace(/\+/g, " "));
  }
  return out;
}

// Handles a flat form/JSON body or a nested JSON webhook payload ({ data: { payload: {...} } }).
function flattenBody(body) {
  if (!body || typeof body !== "object") return {};
  const p = body.data?.payload || body.payload || body;
  const fields = {
    id: p.id,
    from: typeof p.from === "object" ? p.from?.phone_number : p.from,
    to: Array.isArray(p.to) ? p.to[0]?.phone_number : p.to,
    message: p.text ?? p.message,
    date: p.received_at ?? p.date,
    media: p.media,
  };
  // Drop missing fields so they don't overwrite values from the query string.
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null));
}

function normalize(raw) {
  const digits = (v) => String(v || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return {
    id: raw.id || null,
    from: digits(raw.from),
    to: digits(raw.to),
    message: raw.message || "",
    date: raw.date || null,
    media: Array.isArray(raw.media) ? raw.media.map((m) => m.url || m) : [],
  };
}
