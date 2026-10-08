-- Restringe quem pode EXCLUIR cada cadastro: só administrador/SEMED podem
-- excluir qualquer registro; diretor, coordenador escolar e professor só
-- podem excluir o que eles mesmos cadastraram (não mais o que qualquer
-- gerente da mesma escola cadastrou, como era antes).
--
-- Isso não muda quem pode VER ou EDITAR nada — só quem pode EXCLUIR.
--
-- Como fazemos isso: cada tabela ganha uma coluna "criado_por", preenchida
-- sozinha (via DEFAULT) com quem fez o cadastro. As políticas de exclusão
-- passam a exigir "é admin/semed" OU "criado_por = eu mesmo".
--
-- Cadastros feitos ANTES desta migration não têm como saber quem os criou
-- (a coluna não existia), então ficam com criado_por nulo — na prática,
-- só admin/semed conseguem excluir esses registros antigos. Novos
-- cadastros (a partir de agora) já guardam o autor automaticamente.
--
-- Seguro para rodar a qualquer momento: só adiciona coluna/recria política,
-- não apaga nem altera nenhum dado existente.

alter table public.escolas    add column if not exists criado_por uuid references public.usuarios(id) on delete set null default public.meu_usuario_id();
alter table public.turmas     add column if not exists criado_por uuid references public.usuarios(id) on delete set null default public.meu_usuario_id();
alter table public.alunos     add column if not exists criado_por uuid references public.usuarios(id) on delete set null default public.meu_usuario_id();
alter table public.matrizes   add column if not exists criado_por uuid references public.usuarios(id) on delete set null default public.meu_usuario_id();
alter table public.descritores add column if not exists criado_por uuid references public.usuarios(id) on delete set null default public.meu_usuario_id();
alter table public.provas     add column if not exists criado_por uuid references public.usuarios(id) on delete set null default public.meu_usuario_id();
alter table public.aplicacoes add column if not exists criado_por uuid references public.usuarios(id) on delete set null default public.meu_usuario_id();
alter table public.resultados add column if not exists criado_por uuid references public.usuarios(id) on delete set null default public.meu_usuario_id();

-- ---------- escolas ----------
drop policy if exists escolas_insert on public.escolas;
create policy escolas_insert on public.escolas for insert to authenticated
  with check (eh_global() and criado_por = meu_usuario_id());
drop policy if exists escolas_delete on public.escolas;
create policy escolas_delete on public.escolas for delete to authenticated
  using (eh_global() or criado_por = meu_usuario_id());

-- ---------- usuarios ----------
drop policy if exists usuarios_delete on public.usuarios;
create policy usuarios_delete on public.usuarios for delete to authenticated
  using ((eh_global() or criado_por = meu_usuario_id()) and auth_id <> auth.uid());

-- ---------- turmas ----------
drop policy if exists turmas_insert on public.turmas;
create policy turmas_insert on public.turmas for insert to authenticated
  with check ((eh_global() or escola = minha_escola()) and criado_por = meu_usuario_id());
drop policy if exists turmas_delete on public.turmas;
create policy turmas_delete on public.turmas for delete to authenticated
  using (eh_global() or criado_por = meu_usuario_id());

-- ---------- alunos ----------
drop policy if exists alunos_insert on public.alunos;
create policy alunos_insert on public.alunos for insert to authenticated
  with check ((eh_global() or escola_da_turma(turma) = minha_escola()) and criado_por = meu_usuario_id());
drop policy if exists alunos_delete on public.alunos;
create policy alunos_delete on public.alunos for delete to authenticated
  using (eh_global() or criado_por = meu_usuario_id());

-- ---------- matrizes ----------
drop policy if exists matrizes_insert on public.matrizes;
create policy matrizes_insert on public.matrizes for insert to authenticated with check (eh_global() and criado_por = meu_usuario_id());
drop policy if exists matrizes_delete on public.matrizes;
create policy matrizes_delete on public.matrizes for delete to authenticated using (eh_global() or criado_por = meu_usuario_id());

-- ---------- descritores ----------
drop policy if exists descritores_insert on public.descritores;
create policy descritores_insert on public.descritores for insert to authenticated with check (eh_global() and criado_por = meu_usuario_id());
drop policy if exists descritores_delete on public.descritores;
create policy descritores_delete on public.descritores for delete to authenticated using (eh_global() or criado_por = meu_usuario_id());

-- ---------- provas ----------
drop policy if exists provas_insert on public.provas;
create policy provas_insert on public.provas for insert to authenticated
  with check (eh_global() and criado_por = meu_usuario_id());
drop policy if exists provas_delete on public.provas;
create policy provas_delete on public.provas for delete to authenticated
  using (eh_global() or criado_por = meu_usuario_id());

-- ---------- aplicacoes ----------
drop policy if exists aplicacoes_insert on public.aplicacoes;
create policy aplicacoes_insert on public.aplicacoes for insert to authenticated
  with check (eh_gerente() and (eh_global() or escola_da_turma(turma) = minha_escola()) and criado_por = meu_usuario_id());
drop policy if exists aplicacoes_delete on public.aplicacoes;
create policy aplicacoes_delete on public.aplicacoes for delete to authenticated
  using (eh_global() or criado_por = meu_usuario_id());

-- ---------- resultados ----------
drop policy if exists resultados_insert on public.resultados;
create policy resultados_insert on public.resultados for insert to authenticated
  with check (meu_perfil() in ('admin','semed','diretor','coordenador','professor') and criado_por = meu_usuario_id() and exists (
    select 1 from public.aplicacoes ap join public.alunos al on al.turma = ap.turma
    where ap.id = aplicacao and al.id = aluno and (eh_global() or escola_da_turma(ap.turma) = minha_escola())
  ));
drop policy if exists resultados_delete on public.resultados;
create policy resultados_delete on public.resultados for delete to authenticated
  using (eh_global() or criado_por = meu_usuario_id());
