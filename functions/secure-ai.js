const TAVILY_URL = "https://api.tavily.com/search";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PRODUCTION_ORIGIN = "https://study-as-otaku.vercel.app";

function applyCors(req, res) {
  const configuredOrigins = (process.env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([PRODUCTION_ORIGIN, ...configuredOrigins]);
  const origin = req.get("origin");

  if (origin && !allowedOrigins.has(origin)) {
    return false;
  }

  res.set("Access-Control-Allow-Origin", origin || PRODUCTION_ORIGIN);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Vary", "Origin");
  return true;
}

async function proxy(url, options) {
  const upstream = await fetch(url, options);
  const contentType = upstream.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await upstream.json()
    : await upstream.text();

  if (!upstream.ok) {
    const message = body?.error?.message || `Provider request failed (${upstream.status}).`;
    throw new Error(message);
  }
  return body;
}

export default async function secureAi(req, res) {
  try {
    if (!applyCors(req, res)) {
      return res.status(403).json({ error: "Origin not allowed." });
    }
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: "Function CORS configuration is missing." });
  }

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const { action, payload } = req.body || {};
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "A JSON payload is required." });
  }

  try {
    if (action === "tavily-search") {
      if (!process.env.FIRST_API_KEY) throw new Error("FIRST_API_KEY is missing.");
      const data = await proxy(TAVILY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, api_key: process.env.FIRST_API_KEY })
      });
      return res.status(200).json(data);
    }

    if (action === "openrouter-chat") {
      if (!process.env.SECOND_API_KEY) throw new Error("SECOND_API_KEY is missing.");
      const data = await proxy(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SECOND_API_KEY}`
        },
        body: JSON.stringify(payload)
      });
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (error) {
    console.error("secure-ai error:", error.message);
    return res.status(502).json({ error: "The AI service request could not be completed." });
  }
}
