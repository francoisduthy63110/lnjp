import { supabase } from "../../lib/supabase";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { dayId } = req.body;

  try {
    const { data: day, error } = await supabase
      .from("days")
      .update({
        status: "PUBLISHED",
        published_at: new Date().toISOString(),
      })
      .eq("id", dayId)
      .select()
      .single();

    if (error) throw error;

    // 👉 APPEL DE TA CHAÎNE NOTIFICATION EXISTANTE
    // fetch("/api/admin-notify", {...})
    // ⚠️ volontairement laissé tel quel pour ne RIEN casser

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to publish day" });
  }
}
