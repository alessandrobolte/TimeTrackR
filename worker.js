export default {
    async fetch(request, env) {
      const url = new URL(request.url);
      const { pathname } = url;
  
      // ---- CORS erlauben nur für dein Frontend ----
      const headers = {
        "Access-Control-Allow-Origin": "https://timetrackr.pages.dev",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
  
      if (request.method === "OPTIONS") {
        return new Response("ok", { headers });
      }
  
      // ---- Session speichern ----
      if (pathname === "/api/saveSession" && request.method === "POST") {
        const data = await request.json();
        if (!data.username) {
          return new Response("Missing username", { status: 400, headers });
        }
  
        const key = `sessions:${data.username}`;
        const existing = (await env.ZM_SESSIONS.get(key, { type: "json" })) || [];
  
        existing.push({
          id: data.id,
          category: data.category,
          durationMin: data.durationMin,
          note: data.note || "",
          timestamp: Date.now(),
        });
  
        await env.ZM_SESSIONS.put(key, JSON.stringify(existing));
        return new Response(JSON.stringify({ ok: true }), { headers });
      }
  
      // ---- Sessions eines Nutzers abrufen ----
      if (pathname === "/api/getSessions" && request.method === "GET") {
        const user = url.searchParams.get("username");
        if (!user) {
          return new Response("Missing username", { status: 400, headers });
        }
        const sessions = (await env.ZM_SESSIONS.get(`sessions:${user}`, { type: "json" })) || [];
        return new Response(JSON.stringify(sessions), { headers });
      }
  
      return new Response("Not Found", { status: 404, headers });
    },
  };
  