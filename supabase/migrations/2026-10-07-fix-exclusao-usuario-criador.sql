-- Correção: não era possível excluir (nem recriar) o usuário admin, ou
-- qualquer outra conta que já tenha cadastrado outras pessoas no sistema.
--
-- A coluna "criado_por" (quem cadastrou cada usuário) referenciava
-- usuarios(id) sem "on delete", então o Postgres bloqueava a exclusão do
-- usuário criador para não deixar essa referência "pendurada" — o
-- Supabase Auth então reportava um genérico "Database error deleting
-- user". Agora, ao excluir o criador, essas linhas apenas perdem o
-- vínculo de auditoria (criado_por fica nulo) em vez de impedir a
-- exclusão.
--
-- Seguro para rodar a qualquer momento: só troca a regra da constraint,
-- não apaga nem altera nenhum dado existente.

alter table public.usuarios drop constraint usuarios_criado_por_fkey;
alter table public.usuarios add constraint usuarios_criado_por_fkey
  foreign key (criado_por) references public.usuarios(id) on delete set null;
