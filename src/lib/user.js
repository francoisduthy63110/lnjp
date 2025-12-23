export const getCurrentUserId = () => {
  // 1) En priorité : UUID Supabase Auth stocké par App.jsx
  const id = localStorage.getItem("lnjp_user_id");
  if (id) return id;

  // 2) Fallback: ancien comportement (utile si tu testes sans auth)
  return "user_test_iphone";
};
