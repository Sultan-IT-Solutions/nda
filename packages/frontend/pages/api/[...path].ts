import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const base = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!base) {
    res.status(500).json({ detail: "NEXT_PUBLIC_API_URL is not set" });
    return;
  }

  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : "";
  const url = `${base}/${path}`;

  const headers: Record<string, string> = {};
  if (req.headers.authorization) headers["authorization"] = String(req.headers.authorization);
  if (req.headers["content-type"]) headers["content-type"] = String(req.headers["content-type"]);

  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body: req.method && ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
  });

  const text = await upstream.text();
  res.status(upstream.status);

  const ct = upstream.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      res.json(JSON.parse(text));
    } catch {
      res.send(text);
    }
  } else {
    res.send(text);
  }
}
