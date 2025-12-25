export default function handler(req, res) {
  const { count = 5 } = req.query;
  return res.status(200).json({
    ok: true,
    route: "fl1-upcoming",
    count: Number(count),
  });
}
