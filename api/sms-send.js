// /api/sms-send.js
// Sends a text message through the voip.ms REST API.
// Stateless like /api/shorten.js: nothing is stored, the request is relayed.
//
// POST /api/sms-send
//   Header:  Authorization: Bearer <SMS_SEND_KEY>
//   Body:    { "to": "5551234567", "message": "Hello", "media": ["https://..."] }
//
// Env vars:
//   VOIPMS_API_USERNAME  voip.ms account email
//   VOIPMS_API_PASSWORD  the API password (not the portal password)
//   VOIPMS_DID           the voip.ms number to send from, digits only
//   SMS_SEND_KEY         shared secret so this isn't an open SMS relay
//   VOIPMS_API_URL       optional; point at a fixed-IP relay, since voip.ms only
//                        accepts API calls from whitelisted IPs and Vercel's
//                        outbound IPs are not fixed

const API_URL = process.env.VOIPMS_API_URL || "https://voip.ms/api/v1/rest.php";
const SMS_MAX = 160;
const MMS_MAX = 2048;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Use POST." });
    return;
  }

  const auth = req.headers.authorization || "";
  if (!process.env.SMS_SEND_KEY || auth !== `Bearer ${process.env.SMS_SEND_KEY}`) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { to, message = "", media = [] } = req.body || {};
  const dst = String(to || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

  if (dst.length !== 10) {
    res.status(400).json({ error: "Provide a 10-digit US/Canada number in `to`." });
    return;
  }
  if (!message && media.length === 0) {
    res.status(400).json({ error: "Provide a `message` or `media`." });
    return;
  }
  if (message.length > MMS_MAX) {
    res.status(400).json({ error: `Message is longer than ${MMS_MAX} characters.` });
    return;
  }
  if (!Array.isArray(media) || media.length > 3) {
    res.status(400).json({ error: "`media` must be an array of up to 3 URLs." });
    return;
  }

  // Plain SMS when it fits; otherwise MMS, which allows longer text and attachments.
  const useMMS = media.length > 0 || message.length > SMS_MAX;
  const params = new URLSearchParams({
    api_username: process.env.VOIPMS_API_USERNAME || "",
    api_password: process.env.VOIPMS_API_PASSWORD || "",
    method: useMMS ? "sendMMS" : "sendSMS",
    did: process.env.VOIPMS_DID || "",
    dst,
    message,
  });
  media.forEach((url, i) => params.set(`media${i + 1}`, url));

  try {
    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const data = await upstream.json();

    if (data.status !== "success") {
      // e.g. "ip_not_enabled" when this server's IP isn't whitelisted at voip.ms
      res.status(502).json({ error: data.status || "voip.ms returned an error." });
      return;
    }

    res.status(200).json({ id: data.sms ?? data.mms ?? null, method: params.get("method") });
  } catch (err) {
    res.status(500).json({ error: "Could not reach voip.ms: " + err.message });
  }
}
