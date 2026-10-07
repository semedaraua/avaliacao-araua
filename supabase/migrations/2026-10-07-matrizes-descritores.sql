-- Matrizes de habilidades (SAESE) e descritores por questão do gabarito.
--
-- Cria duas tabelas novas:
--   matrizes    – uma por disciplina+série (ex.: "Língua Portuguesa, 2º ano")
--   descritores – os D1, D2, ... de cada matriz, com o código BNCC e a
--                 descrição da habilidade
--
-- E liga o banco de provas a elas:
--   provas.matriz      – qual matriz a prova usa (opcional, pra provas que
--                         não seguem uma matriz do SAESE)
--   provas.gabarito    – cada posição passa a ser um objeto
--                         {"resposta":"A","descritor":"<id do descritor>"}
--                         em vez de só a letra. Provas já cadastradas são
--                         convertidas automaticamente (sem descritor).
--
-- Seguro para rodar a qualquer momento: só cria o que não existe e usa
-- upsert nos dados da matriz, não apaga nem duplica nada.

create table if not exists public.matrizes (
  id uuid primary key default gen_random_uuid(),
  disciplina text not null check (disciplina in ('Língua Portuguesa','Matemática')),
  serie text not null check (serie in ('2º ano','3º ano','4º ano','5º ano','9º ano')),
  nome text not null,
  created_at timestamptz not null default now(),
  unique (disciplina, serie)
);

create table if not exists public.descritores (
  id uuid primary key default gen_random_uuid(),
  matriz uuid not null references public.matrizes(id) on delete cascade,
  codigo text not null,
  eixo text,
  codigo_bncc text,
  descricao text not null,
  created_at timestamptz not null default now(),
  unique (matriz, codigo)
);

alter table public.provas add column if not exists matriz uuid references public.matrizes(id);

alter table public.matrizes enable row level security;
alter table public.descritores enable row level security;

-- Mesma regra do banco de provas: todo autenticado vê; só admin/semed mexem.
drop policy if exists matrizes_select on public.matrizes;
create policy matrizes_select on public.matrizes for select to authenticated using (true);
drop policy if exists matrizes_insert on public.matrizes;
create policy matrizes_insert on public.matrizes for insert to authenticated with check (eh_global());
drop policy if exists matrizes_update on public.matrizes;
create policy matrizes_update on public.matrizes for update to authenticated using (eh_global());
drop policy if exists matrizes_delete on public.matrizes;
create policy matrizes_delete on public.matrizes for delete to authenticated using (eh_global());

drop policy if exists descritores_select on public.descritores;
create policy descritores_select on public.descritores for select to authenticated using (true);
drop policy if exists descritores_insert on public.descritores;
create policy descritores_insert on public.descritores for insert to authenticated with check (eh_global());
drop policy if exists descritores_update on public.descritores;
create policy descritores_update on public.descritores for update to authenticated using (eh_global());
drop policy if exists descritores_delete on public.descritores;
create policy descritores_delete on public.descritores for delete to authenticated using (eh_global());

-- Converte gabaritos já existentes (array de letras) para o novo formato
-- (array de objetos {resposta, descritor}), preservando a resposta e
-- deixando o descritor em branco. Não afeta gabaritos que já estiverem
-- no formato novo (idempotente).
update public.provas
set gabarito = (
  select coalesce(jsonb_agg(jsonb_build_object('resposta', elem, 'descritor', null)), '[]'::jsonb)
  from jsonb_array_elements_text(gabarito) as elem
)
where jsonb_typeof(gabarito) = 'array'
  and jsonb_array_length(gabarito) > 0
  and jsonb_typeof(gabarito -> 0) = 'string';

-- ========== Matriz de Língua Portuguesa – 2º ano (SAESE/BNCC) ==========

with nova_matriz as (
  insert into public.matrizes (disciplina, serie, nome)
  values ('Língua Portuguesa', '2º ano', 'Matriz de Habilidades de Língua Portuguesa da BNCC – 2º ano do Ensino Fundamental')
  on conflict (disciplina, serie) do update set nome = excluded.nome
  returning id
)
insert into public.descritores (matriz, codigo, eixo, codigo_bncc, descricao)
select nova_matriz.id, v.codigo, v.eixo, v.codigo_bncc, v.descricao
from nova_matriz, (values
  ('D1',  'I. Leitura', 'EF15LP03', 'Localizar informações explícitas em textos. (todos os campos de atuação)'),
  ('D2',  'I. Leitura', 'EF15LP14', 'Construir o sentido de histórias em quadrinhos e tirinhas, relacionando imagens e palavras e interpretando recursos gráficos (tipos de balões, de letras, onomatopeias). (campo da vida cotidiana)'),
  ('D3',  'I. Leitura', 'EF15LP18', 'Relacionar texto com ilustrações e outros recursos gráficos. (campo artístico-literário)'),
  ('D4',  'I. Leitura', 'EF12LP08', 'Ler e compreender, em colaboração com os colegas e com a ajuda do professor, fotolegendas em notícias, manchetes e lides em notícias, álbum de fotos digital noticioso e notícias curtas para público infantil, dentre outros gêneros do campo jornalístico, considerando a situação comunicativa e o tema/assunto do texto. (campo da vida pública)'),
  ('D5',  'I. Leitura', 'EF12LP04', 'Ler e compreender, em colaboração com os colegas e com a ajuda do professor ou já com certa autonomia, listas, agendas, calendários, avisos, convites, receitas, instruções de montagem (digitais ou impressos), dentre outros gêneros do campo da vida cotidiana, considerando a situação comunicativa e o tema/assunto do texto e relacionando sua forma de organização à sua finalidade. (campo da vida cotidiana)'),
  ('D6',  'I. Leitura', 'EF02LP12', 'Ler e compreender com certa autonomia cantigas, letras de canção, dentre outros gêneros do campo da vida cotidiana, considerando a situação comunicativa e o tema/assunto do texto e relacionando sua forma de organização à sua finalidade. (campo da vida cotidiana)'),
  ('D7',  'I. Leitura', 'EF02LP26', 'Ler e compreender, com certa autonomia, textos literários, de gêneros variados, desenvolvendo o gosto pela leitura. (campo artístico-literário)'),
  ('D8',  'II. Análise linguística/semiótica (alfabetização)', 'EF01LP11', 'Conhecer, diferenciar e relacionar letras em formato imprensa e cursiva, maiúsculas e minúsculas. (todos os campos de atuação)'),
  ('D9',  'II. Análise linguística/semiótica (alfabetização)', 'EF01LP09', 'Comparar palavras, identificando semelhanças e diferenças entre sons de sílabas iniciais. (todos os campos de atuação)'),
  ('D10', 'II. Análise linguística/semiótica (alfabetização)', 'EF02LP09', 'Usar adequadamente ponto final, ponto de interrogação e ponto de exclamação. (todos os campos de atuação)'),
  ('D11', 'II. Análise linguística/semiótica (alfabetização)', 'EF01LP14', 'Identificar outros sinais no texto além das letras, como pontos finais, de interrogação e exclamação e seus efeitos na entonação. (todos os campos de atuação)'),
  ('D12', 'II. Análise linguística/semiótica (alfabetização)', 'EF02LP02', 'Segmentar palavras em sílabas, reposicionar, remover e/ou substituir sílabas iniciais, mediais ou finais para criar novas palavras, a partir de imagens e jogos. (todos os campos de atuação)'),
  ('D13', 'II. Análise linguística/semiótica (alfabetização)', 'EF02LP04', 'Ler e escrever corretamente palavras com sílabas CV, V, CVC, CCV, identificando que existem vogais em todas as sílabas. (todos os campos de atuação)'),
  ('D14', 'II. Análise linguística/semiótica (alfabetização)', 'EF01LP15', 'Agrupar palavras pelo critério de aproximação de significado (sinonímia) e separar palavras pelo critério de oposição de significado (antonímia). (todos os campos de atuação)'),
  ('D15', 'II. Análise linguística/semiótica (alfabetização)', 'EF01LP26', 'Identificar elementos de uma narrativa lida ou escutada, incluindo personagens, enredo, tempo e espaço. (campo artístico-literário)'),
  ('D16', 'II. Análise linguística/semiótica (alfabetização)', 'EF02LP28', 'Reconhecer o conflito gerador de uma narrativa ficcional e sua resolução, além de palavras, expressões e frases que caracterizam personagens e ambientes. (campo artístico-literário)'),
  ('D17', 'II. Análise linguística/semiótica (alfabetização)', 'EF12LP19', 'Reconhecer, em textos versificados, rimas, sonoridades, jogos de palavras, palavras, expressões, comparações, relacionando-as com sensações e associações. (campo artístico-literário)'),
  ('D18', 'II. Análise linguística/semiótica (alfabetização)', 'EF02LP10', 'Identificar sinônimos de palavras de texto lido, determinando a diferença de sentido entre eles, e formar antônimos de palavras encontradas em texto lido pelo acréscimo do prefixo de negação in-/im-. (todos os campos de atuação)')
) as v(codigo, eixo, codigo_bncc, descricao)
on conflict (matriz, codigo) do update
  set eixo = excluded.eixo, codigo_bncc = excluded.codigo_bncc, descricao = excluded.descricao;
