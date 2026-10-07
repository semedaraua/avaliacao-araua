// Edge Function: gera uma nova senha temporária para outro usuário.
//
// Como em criar-usuario, alterar a senha de OUTRA pessoa exige privilégio
// elevado (service_role) que um cliente comum não tem.
//
// Quem pode chamar: admin, semed, diretor ou coordenador — e só sobre
// usuários da própria escola (admin/semed podem sobre qualquer um).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function senhaTemporaria() {
  const alfabeto = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  return Array.from(bytes, (n) => alfabeto[n % alfabeto.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const comoChamador = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await comoChamador.auth.getUser();
    if (!user) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: chamador } = await admin.from("usuarios").select("*").eq("auth_id", user.id).single();
    if (!chamador || !["admin", "semed", "diretor", "coordenador"].includes(chamador.perfil))
      return json({ error: "Sem permissão." }, 403);

    const { usuarioId } = await req.json();
    const { data: alvo } = await admin.from("usuarios").select("*").eq("id", usuarioId).single();
    if (!alvo) return json({ error: "Usuário não encontrado." }, 404);

    const chamadorGlobal = ["admin", "semed"].includes(chamador.perfil);
    if (!chamadorGlobal && alvo.escola !== chamador.escola)
      return json({ error: "Sem permissão sobre este usuário." }, 403);
    // diretor/coordenador só podem redefinir senha de professores da própria
    // escola (mesma regra de perfisCriaveis() em app.js e perfil_criavel() no
    // banco) — sem isso, um coordenador conseguia redefinir a senha do
    // diretor da própria escola (ou de outro coordenador) e sequestrar a
    // conta, já que a função devolve a senha temporária em texto puro.
    if (!chamadorGlobal && alvo.perfil !== "professor")
      return json({ error: "Sem permissão sobre este usuário." }, 403);

    const senha = senhaTemporaria();
    const { error: erroAuth } = await admin.auth.admin.updateUserById(alvo.auth_id, { password: senha });
    if (erroAuth) return json({ error: erroAuth.message }, 400);

    await admin.from("usuarios").update({ trocar_senha: true }).eq("id", usuarioId);
    await admin.from("solicitacoes").update({ atendida: true }).eq("usuario", usuarioId).eq("atendida", false);

    return json({ senhaTemporaria: senha });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
