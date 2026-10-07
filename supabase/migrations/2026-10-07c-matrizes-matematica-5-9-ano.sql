-- Carrega as matrizes de Matemática (BNCC) do 5º e do 9º ano do Ensino
-- Fundamental, mesmo padrão das migrations anteriores de matrizes.
--
-- Seguro para rodar a qualquer momento: usa upsert, não apaga nem duplica.

-- ========== Matriz de Matemática – 5º ano (BNCC) ==========

with nova_matriz as (
  insert into public.matrizes (disciplina, serie, nome)
  values ('Matemática', '5º ano', 'Matriz de Habilidades de Matemática da BNCC – 5º ano do Ensino Fundamental')
  on conflict (disciplina, serie) do update set nome = excluded.nome
  returning id
)
insert into public.descritores (matriz, codigo, eixo, codigo_bncc, descricao)
select nova_matriz.id, v.codigo, v.eixo, v.codigo_bncc, v.descricao
from nova_matriz, (values
  ('D1',  'I. Números', 'EF05MA01', 'Ler, escrever e ordenar números naturais até a ordem das centenas de milhar com compreensão das principais características do sistema de numeração decimal.'),
  ('D2',  'I. Números', 'EF05MA02', 'Ler, escrever e ordenar números racionais na forma decimal com compreensão das principais características do sistema de numeração decimal, utilizando, como recursos, a composição e decomposição e a reta numérica.'),
  ('D3',  'I. Números', 'EF05MA03', 'Identificar frações (menores e maiores que a unidade), associando-as ao resultado de uma divisão ou à ideia de parte de um todo, utilizando a reta numérica como recurso.'),
  ('D4',  'I. Números', 'EF05MA04', 'Identificar frações equivalentes.'),
  ('D5',  'I. Números', 'EF05MA05', 'Comparar e ordenar números racionais positivos (representações fracionária e decimal), relacionando-os a pontos na reta numérica.'),
  ('D6',  'I. Números', 'EF05MA06', 'Associar as representações 10%, 25%, 50%, 75% e 100% respectivamente à décima parte, quarta parte, metade, três quartos e um inteiro, para calcular porcentagens, utilizando estratégias pessoais em contextos de educação financeira, entre outros.'),
  ('D7',  'I. Números', 'EF05MA07', 'Resolver e elaborar problemas de adição e subtração com números naturais e com números racionais, cuja representação decimal seja finita, utilizando estratégias diversas, como cálculo por estimativa, cálculo mental e algoritmos.'),
  ('D8',  'I. Números', 'EF05MA08', 'Resolver e elaborar problemas de multiplicação e divisão com números naturais e com números racionais cuja representação decimal é finita (com multiplicador natural e divisor natural e diferente de zero), utilizando estratégias diversas, como cálculo por estimativa, cálculo mental e algoritmos.'),
  ('D9',  'I. Números', 'EF05MA09', 'Resolver problemas simples de contagem envolvendo o princípio multiplicativo, como a determinação do número de agrupamentos possíveis ao se combinar cada elemento de uma coleção com todos os elementos de outra coleção, por meio de diagramas de árvore ou por tabelas.'),
  ('D10', 'II. Álgebra', 'EF05MA10', 'Reconhecer que a relação de igualdade existente entre dois membros permanece ao adicionar, subtrair, multiplicar ou dividir cada um desses membros por um mesmo número, para construir a noção de equivalência.'),
  ('D11', 'II. Álgebra', 'EF05MA11', 'Resolver problemas cuja conversão em sentença matemática seja uma igualdade com uma operação em que um dos termos é desconhecido.'),
  ('D12', 'II. Álgebra', 'EF05MA12', 'Resolver problemas que envolvam variação de proporcionalidade direta entre duas grandezas, para associar a quantidade de um produto ao valor a pagar, alterar as quantidades de ingredientes de receitas, ampliar ou reduzir escala em mapas, entre outros.'),
  ('D13', 'II. Álgebra', 'EF05MA13', 'Resolver problemas envolvendo a partilha de uma quantidade em duas partes desiguais, tais como dividir uma quantidade em duas partes, de modo que uma seja o dobro da outra, com compreensão da ideia de razão entre as partes e delas com o todo.'),
  ('D14', 'III. Geometria', 'EF05MA14', 'Utilizar e compreender diferentes representações para a localização de objetos no plano, como mapas, células em planilhas eletrônicas e coordenadas geográficas, a fim de desenvolver as primeiras noções de coordenadas cartesianas.'),
  ('D15', 'III. Geometria', 'EF05MA15', 'Interpretar, descrever e representar a localização ou movimentação de objetos no plano cartesiano (1º quadrante), utilizando coordenadas cartesianas, indicando mudanças de direção e de sentido e giros.'),
  ('D16', 'III. Geometria', 'EF05MA16', 'Associar figuras espaciais a suas planificações (prismas, pirâmides, cilindros e cones) e analisar, nomear e comparar seus atributos.'),
  ('D17', 'III. Geometria', 'EF05MA17', 'Reconhecer, nomear e comparar polígonos, considerando lados, vértices e ângulos, utilizando material de desenho ou tecnologias digitais.'),
  ('D18', 'III. Geometria', 'EF05MA18', 'Reconhecer a congruência dos ângulos e a proporcionalidade entre os lados correspondentes de figuras poligonais em situações de ampliação e de redução em malhas quadriculadas.'),
  ('D19', 'IV. Grandezas e Medidas', 'EF05MA19', 'Resolver e elaborar problemas envolvendo medidas das grandezas comprimento, área, massa, tempo, temperatura e capacidade, recorrendo a transformações entre as unidades mais usuais em contextos socioculturais.'),
  ('D20', 'IV. Grandezas e Medidas', 'EF05MA20', 'Concluir, por meio de investigações que figuras de perímetros iguais podem ter áreas diferentes e que, também, figuras que têm a mesma área podem ter perímetros diferentes.'),
  ('D21', 'IV. Grandezas e Medidas', 'EF05MA21', 'Reconhecer volume como grandeza associada a sólidos geométricos e medir volumes por meio de empilhamento de cubos, utilizando, preferencialmente, objetos concretos.'),
  ('D22', 'V. Probabilidade e Estatística', 'EF05MA22', 'Apresentar todos os possíveis resultados de um experimento aleatório, estimando se esses resultados são igualmente prováveis ou não.'),
  ('D23', 'V. Probabilidade e Estatística', 'EF05MA23', 'Determinar a probabilidade de ocorrência de um resultado em eventos aleatórios, quando todos os resultados possíveis têm a mesma chance de ocorrer (equiprováveis).'),
  ('D24', 'V. Probabilidade e Estatística', 'EF05MA24', 'Interpretar dados estatísticos apresentados em textos, tabelas e gráficos (colunas ou linhas), referentes a outras áreas do conhecimento ou a outros contextos, como saúde e trânsito, e produzir textos com o objetivo de sintetizar conclusões.'),
  ('D25', 'V. Probabilidade e Estatística', 'EF05MA25', 'Realizar pesquisa envolvendo variáveis categóricas e numéricas, organizar dados coletados por meio de tabelas, gráficos de colunas, pictóricos e de linhas, com e sem uso de tecnologias digitais, e apresentar texto escrito sobre a finalidade da pesquisa e a síntese dos resultados.')
) as v(codigo, eixo, codigo_bncc, descricao)
on conflict (matriz, codigo) do update
  set eixo = excluded.eixo, codigo_bncc = excluded.codigo_bncc, descricao = excluded.descricao;

-- ========== Matriz de Matemática – 9º ano (BNCC) ==========

with nova_matriz as (
  insert into public.matrizes (disciplina, serie, nome)
  values ('Matemática', '9º ano', 'Matriz de Habilidades de Matemática da BNCC – 9º ano do Ensino Fundamental')
  on conflict (disciplina, serie) do update set nome = excluded.nome
  returning id
)
insert into public.descritores (matriz, codigo, eixo, codigo_bncc, descricao)
select nova_matriz.id, v.codigo, v.eixo, v.codigo_bncc, v.descricao
from nova_matriz, (values
  ('D1',  'I. Números', 'EF09MA01', 'Reconhecer que, uma vez fixada uma unidade de comprimento, existem segmentos de reta cujo comprimento não é expresso por número racional (como as medidas de diagonais de um polígono e alturas de um triângulo, quando se toma a medida de cada lado como unidade).'),
  ('D2',  'I. Números', 'EF09MA02', 'Reconhecer um número irracional como um número real cuja representação decimal é infinita e não periódica, e estimar a localização de alguns deles na reta numérica.'),
  ('D3',  'I. Números', 'EF09MA03', 'Efetuar cálculos com números reais, inclusive potências com expoentes fracionários.'),
  ('D4',  'I. Números', 'EF09MA04', 'Resolver e elaborar problemas com números reais, inclusive em notação científica, envolvendo diferentes operações.'),
  ('D5',  'I. Números', 'EF09MA05', 'Resolver e elaborar problemas que envolvam porcentagens, com a ideia de aplicação de percentuais sucessivos e a determinação das taxas percentuais, preferencialmente com o uso de tecnologias digitais, no contexto da educação financeira.'),
  ('D6',  'II. Álgebra', 'EF09MA06', 'Compreender as funções como relações de dependência unívoca entre duas variáveis e suas representações numérica, algébrica e gráfica e utilizar esse conceito para analisar situações que envolvam relações funcionais entre duas variáveis.'),
  ('D7',  'II. Álgebra', 'EF09MA07', 'Resolver problemas que envolvam a razão entre duas grandezas de espécies diferentes, como velocidade e densidade demográfica.'),
  ('D8',  'II. Álgebra', 'EF09MA08', 'Resolver e elaborar problemas que envolvam relações de proporcionalidade direta e inversa entre duas ou mais grandezas, inclusive escalas, divisão em partes proporcionais e taxa de variação, em contextos socioculturais, ambientais e de outras áreas.'),
  ('D9',  'II. Álgebra', 'EF09MA09', 'Compreender os processos de fatoração de expressões algébricas, com base em suas relações com os produtos notáveis, para resolver e elaborar problemas que possam ser representados por equações polinomiais do 2º grau.'),
  ('D10', 'III. Geometria', 'EF09MA10', 'Demonstrar as relações simples entre os ângulos formados por retas paralelas cortadas por uma transversal.'),
  ('D11', 'III. Geometria', 'EF09MA11', 'Resolver problemas por meio do estabelecimento de relações entre arcos, ângulos centrais e ângulos inscritos na circunferência. Fazendo uso, inclusive, de softwares de geometria dinâmica.'),
  ('D12', 'III. Geometria', 'EF09MA12', 'Reconhecer as condições necessárias e suficientes para que dois triângulos sejam semelhantes.'),
  ('D13', 'III. Geometria', 'EF09MA13', 'Demonstrar as relações métricas do triângulo retângulo, entre elas o teorema de Pitágoras, utilizando, inclusive, a semelhança de triângulos.'),
  ('D14', 'III. Geometria', 'EF09MA14', 'Resolver e elaborar problemas de aplicação do teorema de Pitágoras ou das relações de proporcionalidade envolvendo retas paralelas cortadas por secantes.'),
  ('D15', 'III. Geometria', 'EF09MA15', 'Descrever, por escrito e por meio de um fluxograma, um algoritmo para a construção de um polígono regular cuja medida do lado é conhecida, utilizando régua e compasso, como também softwares.'),
  ('D16', 'III. Geometria', 'EF09MA16', 'Determinar o ponto médio de um segmento de reta e a distância entre dois pontos quaisquer, dadas as coordenadas desses pontos no plano cartesiano, sem o uso de fórmulas, e utilizar esse conhecimento para calcular, por exemplo, medidas de perímetros e áreas de figuras planas construídas no plano.'),
  ('D17', 'III. Geometria', 'EF09MA17', 'Reconhecer vistas ortogonais e planificações de figuras espaciais, e aplicar esse conhecimento para desenhar objetos em perspectiva.'),
  ('D18', 'IV. Grandezas e Medidas', 'EF09MA18', 'Reconhecer e empregar unidades usadas para expressar medidas muito grandes ou muito pequenas, tais como distância entre planetas e sistemas solares, tamanho de vírus ou de células, capacidade de armazenamento de computadores, entre outros.'),
  ('D19', 'IV. Grandezas e Medidas', 'EF09MA19', 'Resolver e elaborar problemas que envolvam medidas de volumes de prismas e de cilindros retos, inclusive com uso de expressões de cálculo, em situações cotidianas.'),
  ('D20', 'V. Probabilidade e Estatística', 'EF09MA20', 'Reconhecer, em experimentos aleatórios, eventos independentes e dependentes e calcular a probabilidade de sua ocorrência, nos dois casos.'),
  ('D21', 'V. Probabilidade e Estatística', 'EF09MA21', 'Analisar e identificar, em gráficos divulgados pela mídia, os elementos que podem induzir, às vezes propositadamente, erros de leitura, como escalas inapropriadas, legendas não explicitadas corretamente, omissão de informações importantes (fontes e datas), entre outros.'),
  ('D22', 'V. Probabilidade e Estatística', 'EF09MA22', 'Escolher e construir o gráfico mais adequado (colunas, setores, linhas), com ou sem uso de planilhas eletrônicas, para apresentar um determinado conjunto de dados, destacando aspectos como as medidas de tendência central.'),
  ('D23', 'V. Probabilidade e Estatística', 'EF09MA23', 'Planejar e executar pesquisa amostral envolvendo tema da realidade social e comunicar os resultados por meio de relatório contendo avaliação de medidas de tendência central e da amplitude, tabelas e gráficos adequados, construídos com o apoio de planilhas eletrônicas.')
) as v(codigo, eixo, codigo_bncc, descricao)
on conflict (matriz, codigo) do update
  set eixo = excluded.eixo, codigo_bncc = excluded.codigo_bncc, descricao = excluded.descricao;
