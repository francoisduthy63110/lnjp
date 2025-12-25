export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // lecture du body (Vercel le parse en JSON si Content-Type: application/json)
  const body = req.body ?? {};

  return res.status(200).json({
    ok: true,
    route: "days-save",
    received: body,
  });
}
