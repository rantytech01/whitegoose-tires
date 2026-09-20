// Thin fetch wrapper the rest of the app builds on. Swap in your auth
// token storage strategy (httpOnly cookie via a Next.js route handler
// is recommended over localStorage for the access token).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request to ${path} failed with ${res.status}`);
  }
  return res.json();
}
