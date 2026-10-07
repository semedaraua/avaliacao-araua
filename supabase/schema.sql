-- Sistema de Gestão de Avaliações – SEMED Arauá
-- Schema do banco de dados (Supabase / PostgreSQL)
--
-- Como aplicar: no painel do Supabase, vá em "SQL Editor" -> "New query",
-- cole todo este arquivo e clique em "Run". Pode ser executado do zero
-- num projeto novo, e também rodado de novo com segurança (o bloco abaixo
-- apaga qualquer versão anterior destas tabelas/funções antes de recriar).
-- Só use isto enquanto o banco ainda não tiver dados reais.

-- ========== Reset (idempotente) ==========

drop table if exists public.solicitacoes cascade;
drop table if exists public.resultados cascade;
drop table if exists public.aplicacoes cascade;
drop table if exists public.provas cascade;
drop table if exists public.descritores cascade;
drop table if exists public.matrizes cascade;
drop table if exists public.alunos cascade;
drop table if exists public.turmas cascade;
drop table if exists public.usuarios cascade;
drop table if exists public.escolas cascade;
drop function if exists public.concluir_troca_senha();
drop function if exists public.solicitar_redefinicao(text);
drop function if exists public.email_do_login(text);
drop function if exists public.perfil_criavel(text);
drop function if exists public.escola_da_turma(uuid);
drop function if exists public.eh_gerente();
drop function if exists public.eh_global();
drop function if exists public.meu_usuario_id();
drop function if exists public.minha_escola();
drop function if exists public.meu_perfil();

-- ========== Tabelas ==========

create table public.escolas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo text,
  cidade text,
  uf text,
  created_at timestamptz not null default now()
);

create table public.usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete cascade,
  nome text not null,
  login text not null unique,
  email text,
  perfil text not null check (perfil in ('admin','semed','diretor','coordenador','professor')),
  disciplina text,
  escola uuid references public.escolas(id) on delete restrict,
  trocar_senha boolean not null default true,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint escola_obrigatoria_para_perfil_local check (
    perfil in ('admin','semed') or escola is not null
  )
);

create table public.turmas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ano integer,
  turno text check (turno in ('Manhã','Tarde','Noite','Integral')),
  escola uuid not null references public.escolas(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.alunos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text not null,
  turma uuid not null references public.turmas(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Matrizes de habilidades (SAESE/BNCC): uma por disciplina+série, com os
-- descritores (D1, D2, ...) que as questões do banco de provas podem
-- referenciar no gabarito, pra permitir relatórios de desempenho por
-- descritor (além de só por questão).
create table public.matrizes (
  id uuid primary key default gen_random_uuid(),
  disciplina text not null check (disciplina in ('Língua Portuguesa','Matemática')),
  serie text not null check (serie in ('2º ano','3º ano','4º ano','5º ano','9º ano')),
  nome text not null,
  created_at timestamptz not null default now(),
  unique (disciplina, serie)
);

create table public.descritores (
  id uuid primary key default gen_random_uuid(),
  matriz uuid not null references public.matrizes(id) on delete cascade,
  codigo text not null,
  eixo text,
  codigo_bncc text,
  descricao text not null,
  created_at timestamptz not null default now(),
  unique (matriz, codigo)
);

-- Banco de provas: catálogo reutilizável, sem vínculo de turma/escola.
-- Só admin/semed criam e editam (inclui o gabarito).
-- Cada posição do gabarito é {"resposta":"A","descritor":"<id ou null>"};
-- "matriz" é opcional (provas que não seguem uma matriz do SAESE).
create table public.provas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  disciplina text,
  questoes integer not null check (questoes between 1 and 100),
  tipo text not null default 'Múltipla escolha – 5 opções (A a E)',
  gabarito jsonb not null default '[]'::jsonb,
  matriz uuid references public.matrizes(id),
  created_at timestamptz not null default now()
);

-- Provas aplicadas: vínculo prova <-> turma, feito por diretor/coordenador
-- (ou admin/semed) da escola da turma.
create table public.aplicacoes (
  id uuid primary key default gen_random_uuid(),
  prova uuid not null references public.provas(id) on delete restrict,
  turma uuid not null references public.turmas(id) on delete cascade,
  data date,
  professor uuid references public.usuarios(id),
  created_at timestamptz not null default now()
);

create table public.resultados (
  id uuid primary key default gen_random_uuid(),
  aplicacao uuid not null references public.aplicacoes(id) on delete cascade,
  aluno uuid not null references public.alunos(id) on delete cascade,
  respostas jsonb not null default '[]'::jsonb,
  total integer not null default 0,
  acertos integer not null default 0,
  created_at timestamptz not null default now(),
  unique (aplicacao, aluno)
);

create table public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  usuario uuid not null references public.usuarios(id) on delete cascade,
  data timestamptz not null default now(),
  atendida boolean not null default false
);

-- ========== Funções auxiliares (para as políticas de RLS) ==========
-- SECURITY DEFINER evita recursão de RLS ao consultar a própria tabela usuarios.

create or replace function public.meu_perfil() returns text
language sql security definer stable set search_path = public as $$
  select perfil from usuarios where auth_id = auth.uid()
$$;

create or replace function public.minha_escola() returns uuid
language sql security definer stable set search_path = public as $$
  select escola from usuarios where auth_id = auth.uid()
$$;

create or replace function public.meu_usuario_id() returns uuid
language sql security definer stable set search_path = public as $$
  select id from usuarios where auth_id = auth.uid()
$$;

create or replace function public.eh_global() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce(meu_perfil() in ('admin','semed'), false)
$$;

create or replace function public.eh_gerente() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce(meu_perfil() in ('admin','semed','diretor','coordenador'), false)
$$;

create or replace function public.escola_da_turma(t uuid) returns uuid
language sql stable set search_path = public as $$
  select escola from turmas where id = t
$$;

-- Perfis que cada perfil pode cadastrar (mesma regra de app.js: perfisCriaveis()).
create or replace function public.perfil_criavel(alvo text) returns boolean
language sql security definer stable set search_path = public as $$
  select case meu_perfil()
    when 'admin' then alvo in ('admin','semed','diretor','coordenador','professor')
    when 'semed' then alvo in ('diretor','coordenador','professor')
    else alvo = 'professor'
  end
$$;

-- Login -> e-mail sintético usado para autenticar no Supabase Auth
-- (o app usa "usuário" como identificador, não e-mail; ver auth.js).
-- security definer: roda com privilégio elevado para poder ler auth.users,
-- que o papel "anon" normalmente não acessa (chamada acontece antes do login).
create or replace function public.email_do_login(login_param text) returns text
language sql security definer stable set search_path = public as $$
  select u.email from auth.users u
  join public.usuarios us on us.auth_id = u.id
  where lower(us.login) = lower(login_param)
$$;
grant execute on function public.email_do_login(text) to anon, authenticated;

-- ========== RLS ==========

alter table public.escolas enable row level security;
alter table public.usuarios enable row level security;
alter table public.turmas enable row level security;
alter table public.alunos enable row level security;
alter table public.matrizes enable row level security;
alter table public.descritores enable row level security;
alter table public.provas enable row level security;
alter table public.aplicacoes enable row level security;
alter table public.resultados enable row level security;
alter table public.solicitacoes enable row level security;

-- escolas: GERENTES veem; admin/semed criam/editam/excluem.
-- GERENTES veem a lista toda; professor enxerga ao menos a própria escola
-- (senão o nome da escola não aparece em nenhuma tela pra ele).
create policy escolas_select on public.escolas for select to authenticated
  using (eh_gerente() or id = minha_escola());
create policy escolas_insert on public.escolas for insert to authenticated
  with check (eh_global());
create policy escolas_update on public.escolas for update to authenticated
  using (eh_global());
create policy escolas_delete on public.escolas for delete to authenticated
  using (eh_global());

-- usuarios: GERENTES veem/editam/excluem, escopados à própria escola
-- (exceto admin/semed, que veem todas). A CRIAÇÃO não tem política de insert:
-- só acontece pela Edge Function "criar-usuario", que usa a service_role
-- (ignora RLS) depois de validar tudo — não há motivo para o cliente
-- inserir aqui diretamente, e não ter a política fecha essa porta.
-- Qualquer usuário enxerga a própria linha (necessário pra completar o
-- login); GERENTES também enxergam os demais usuários da própria escola.
create policy usuarios_select on public.usuarios for select to authenticated
  using (auth_id = auth.uid() or (eh_gerente() and (eh_global() or escola = minha_escola())));
-- update: GERENTES editam usuários da própria escola, mas sem poder
-- escalar o perfil além do que podem cadastrar, nem alterar o próprio
-- perfil (mesma regra que já existia só no app.js, agora também no banco).
create policy usuarios_update on public.usuarios for update to authenticated
  using (eh_gerente() and (eh_global() or escola = minha_escola()))
  with check (
    eh_gerente()
    and perfil_criavel(perfil)
    and (eh_global() or escola = minha_escola())
    and (auth_id <> auth.uid() or perfil = meu_perfil())
  );
create policy usuarios_delete on public.usuarios for delete to authenticated
  using (eh_gerente() and (eh_global() or escola = minha_escola()) and auth_id <> auth.uid());

-- Permite que qualquer usuário logado marque a própria troca de senha como
-- concluída (1º acesso ou redefinição), sem depender de ser "gerente" —
-- sem isso, professores ficavam presos pedindo nova senha para sempre.
create or replace function public.concluir_troca_senha() returns void
language sql security definer set search_path = public as $$
  update usuarios set trocar_senha = false where auth_id = auth.uid()
$$;
grant execute on function public.concluir_troca_senha() to authenticated;

-- turmas: todos veem/criam/editam/excluem, escopados à própria escola.
create policy turmas_select on public.turmas for select to authenticated
  using (eh_global() or escola = minha_escola());
create policy turmas_insert on public.turmas for insert to authenticated
  with check (eh_global() or escola = minha_escola());
create policy turmas_update on public.turmas for update to authenticated
  using (eh_global() or escola = minha_escola());
create policy turmas_delete on public.turmas for delete to authenticated
  using (eh_global() or escola = minha_escola());

-- alunos: idem, via escola da turma.
create policy alunos_select on public.alunos for select to authenticated
  using (eh_global() or escola_da_turma(turma) = minha_escola());
create policy alunos_insert on public.alunos for insert to authenticated
  with check (eh_global() or escola_da_turma(turma) = minha_escola());
create policy alunos_update on public.alunos for update to authenticated
  using (eh_global() or escola_da_turma(turma) = minha_escola());
create policy alunos_delete on public.alunos for delete to authenticated
  using (eh_global() or escola_da_turma(turma) = minha_escola());

-- matrizes/descritores: todos autenticados veem (precisam pra montar gabarito
-- e ler os relatórios); só admin/semed criam/editam/excluem, igual ao banco de provas.
create policy matrizes_select on public.matrizes for select to authenticated using (true);
create policy matrizes_insert on public.matrizes for insert to authenticated with check (eh_global());
create policy matrizes_update on public.matrizes for update to authenticated using (eh_global());
create policy matrizes_delete on public.matrizes for delete to authenticated using (eh_global());

create policy descritores_select on public.descritores for select to authenticated using (true);
create policy descritores_insert on public.descritores for insert to authenticated with check (eh_global());
create policy descritores_update on public.descritores for update to authenticated using (eh_global());
create policy descritores_delete on public.descritores for delete to authenticated using (eh_global());

-- provas (banco): todos autenticados veem; só admin/semed criam/editam/excluem.
create policy provas_select on public.provas for select to authenticated
  using (true);
create policy provas_insert on public.provas for insert to authenticated
  with check (eh_global());
create policy provas_update on public.provas for update to authenticated
  using (eh_global());
create policy provas_delete on public.provas for delete to authenticated
  using (eh_global());

-- aplicacoes: todos veem (escopado à escola); GERENTES criam/editam/excluem
-- (diretor/coordenador só na própria escola).
create policy aplicacoes_select on public.aplicacoes for select to authenticated
  using (eh_global() or escola_da_turma(turma) = minha_escola());
create policy aplicacoes_insert on public.aplicacoes for insert to authenticated
  with check (eh_gerente() and (eh_global() or escola_da_turma(turma) = minha_escola()));
create policy aplicacoes_update on public.aplicacoes for update to authenticated
  using (eh_gerente() and (eh_global() or escola_da_turma(turma) = minha_escola()));
create policy aplicacoes_delete on public.aplicacoes for delete to authenticated
  using (eh_gerente() and (eh_global() or escola_da_turma(turma) = minha_escola()));

-- resultados: visível/edição escopada via aplicação -> turma -> escola;
-- corrigir é permitido a admin/diretor/coordenador/professor (ESCOLARES em app.js).
create policy resultados_select on public.resultados for select to authenticated
  using (eh_global() or exists (
    select 1 from public.aplicacoes ap where ap.id = aplicacao and escola_da_turma(ap.turma) = minha_escola()
  ));
-- (insert/update também confirmam que o aluno é da mesma turma da aplicação,
-- não só que a aplicação é da escola de quem está corrigindo.)
create policy resultados_insert on public.resultados for insert to authenticated
  with check (meu_perfil() in ('admin','semed','diretor','coordenador','professor') and exists (
    select 1 from public.aplicacoes ap join public.alunos al on al.turma = ap.turma
    where ap.id = aplicacao and al.id = aluno and (eh_global() or escola_da_turma(ap.turma) = minha_escola())
  ));
create policy resultados_update on public.resultados for update to authenticated
  using (meu_perfil() in ('admin','semed','diretor','coordenador','professor') and exists (
    select 1 from public.aplicacoes ap join public.alunos al on al.turma = ap.turma
    where ap.id = aplicacao and al.id = aluno and (eh_global() or escola_da_turma(ap.turma) = minha_escola())
  ));
create policy resultados_delete on public.resultados for delete to authenticated
  using (meu_perfil() in ('admin','semed','diretor','coordenador','professor') and (eh_global() or exists (
    select 1 from public.aplicacoes ap where ap.id = aplicacao and escola_da_turma(ap.turma) = minha_escola()
  )));

-- solicitacoes: GERENTES da escola veem/atendem; a criação (pedido de senha)
-- acontece antes do login, então é feita por uma função à parte (ver abaixo).
create policy solicitacoes_select on public.solicitacoes for select to authenticated
  using (eh_gerente() and exists (
    select 1 from public.usuarios u where u.id = usuario and (eh_global() or u.escola = minha_escola())
  ));
create policy solicitacoes_update on public.solicitacoes for update to authenticated
  using (eh_gerente() and exists (
    select 1 from public.usuarios u where u.id = usuario and (eh_global() or u.escola = minha_escola())
  ));

-- Pedido de redefinição de senha, chamado sem estar logado (tela "Esqueci a senha").
create or replace function public.solicitar_redefinicao(login_ou_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from usuarios where lower(login) = lower(login_ou_email) or lower(email) = lower(login_ou_email);
  if uid is not null then
    insert into solicitacoes (usuario) values (uid)
    on conflict do nothing;
  end if;
end;
$$;
grant execute on function public.solicitar_redefinicao(text) to anon, authenticated;

-- ========== Usuário administrador inicial ==========
-- O primeiro usuário admin precisa ser criado em duas etapas porque a senha
-- fica no Supabase Auth, não nesta tabela. Depois de rodar este schema:
--   1. No painel: Authentication -> Users -> "Add user" -> crie com um e-mail
--      (ex: admin@avaliacao-araua.local) e uma senha.
--   2. Copie o "User UID" gerado e rode o INSERT abaixo, substituindo
--      SEU_UID_AQUI por esse UID.
--
-- insert into public.usuarios (auth_id, nome, login, perfil, trocar_senha)
-- values ('SEU_UID_AQUI', 'Administrador', 'admin', 'admin', true);
