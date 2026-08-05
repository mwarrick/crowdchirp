// /api/shorten.js
// A tiny stateless proxy — no database, no accounts, no stored data.
// Browsers can't call is.gd directly from client-side JS (it doesn't send
// CORS headers), but a server calling another server isn't subject to that
// restriction, so this just relays the request.

export default async function handler(req, res) {
  const url = req.query.url;

  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "Provide a ?url= parameter starting with http:// or https://" });
    return;
  }

  try {
    const target = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
    const upstream = await fetch(target);
    const text = (await upstream.text()).trim();

    if (!upstream.ok || /^Error/i.test(text)) {
      res.status(502).json({ error: text || "Shortening service returned an error." });
      return;
    }

    res.status(200).json({ short: text });
  } catch (err) {
    res.status(500).json({ error: "Could not reach the shortening service: " + err.message });
  }
}
