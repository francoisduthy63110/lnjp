export default function handler(req, res) {
  const { count = 5 } = req.query;

  res.status(200).json({
    ok: true,
    message: "fl1-upcoming route OK",
    count: Number(count),
  });
}
