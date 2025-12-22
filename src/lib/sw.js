export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return false;

  // En dev, iOS/web push est souvent capricieux. On vise surtout prod (Vercel HTTPS).
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return !!reg;
}
