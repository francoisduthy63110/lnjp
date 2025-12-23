import { supabase } from "./supabase";

export async function fetchLatestMessages({ leagueId, limit = 50 }) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, content, created_at, user_id, profiles(display_name, role)")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  // on veut afficher dans l'ordre chronologique
  return (data ?? []).slice().reverse();
}

export function subscribeToMessages({ leagueId, onInsert }) {
  const channel = supabase
    .channel(`messages:${leagueId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `league_id=eq.${leagueId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function sendMessage({ leagueId, content }) {
  const trimmed = content.trim();
  if (!trimmed) return;

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("messages").insert({
    league_id: leagueId,
    user_id: user.id,
    content: trimmed,
  });

  if (error) throw error;
}

export async function getUnreadCount({ leagueId }) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return 0;

  const { data: readRow, error: readErr } = await supabase
    .from("league_reads")
    .select("last_read_at")
    .eq("league_id", leagueId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) throw readErr;

  const lastReadAt = readRow?.last_read_at ?? "1970-01-01T00:00:00.000Z";

  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId)
    .gt("created_at", lastReadAt);

  if (error) throw error;
  return count ?? 0;
}

export async function markChatRead({ leagueId }) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return;

  const { error } = await supabase.from("league_reads").upsert(
    {
      league_id: leagueId,
      user_id: user.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "league_id,user_id" }
  );

  if (error) throw error;
}
