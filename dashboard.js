'use strict';

/* ---------- Painel (tela inicial) ---------- */
// Administrador e coordenador SEMED escolhem a escola no seletor (ou "Todas
// as escolas"); diretor, coordenador escolar e professor só veem os números
// da própria escola. Todos podem refinar por turma e por disciplina — útil
// porque cada disciplina/série tem sua própria matriz de habilidades.
let dashboardEscola = '';
let dashboardTurma = '';
let dashboardDisciplina = '';
let dashboardProva = '';

// Números de um conjunto de turmas, opcionalmente restritos a uma disciplina
// (via provas.disciplina) e/ou a um simulado específico (provas.id): matrícula,
// aplicações, previstos (alunos matriculados nas turmas com prova aplicada),
// avaliados e desempenho.
function statsGrupo(turmas, disciplina, prova) {
  const turmaIds = new Set(turmas.map(t => t.id));
  const alunos = db.alunos.filter(a => turmaIds.has(a.turma));
  let aplicacoes = db.aplicacoes.filter(ap => turmaIds.has(ap.turma));
  if (prova) aplicacoes = aplicacoes.filter(ap => ap.prova === prova);
  else if (disciplina) aplicacoes = aplicacoes.filter(ap => porId('provas', ap.prova)?.disciplina === disciplina);
  const alunosPorTurma = new Map();
  alunos.forEach(a => alunosPorTurma.set(a.turma, (alunosPorTurma.get(a.turma) || 0) + 1));
  const previsto = aplicacoes.reduce((n, ap) => n + (alunosPorTurma.get(ap.turma) || 0), 0);
  const aplicacaoIds = new Set(aplicacoes.map(ap => ap.id));
  const resultados = db.resultados.filter(r => aplicacaoIds.has(r.aplicacao));
  const acertos = resultados.reduce((n, r) => n + r.acertos, 0);
  const totalQ = resultados.reduce((n, r) => n + r.total, 0);
  return {
    turmas: turmas.length,
    alunos: alunos.length,
    aplicacoes: aplicacoes.length,
    previsto,
    avaliados: resultados.length,
    participacao: previsto ? Math.round(resultados.length / previsto * 100) : null,
    aproveitamento: totalQ ? Math.round(acertos / totalQ * 100) : null,
  };
}
// Números de uma escola específica (id) ou da rede toda (id vazio/nulo).
function statsEscola(escolaId, disciplina, prova) {
  return statsGrupo(escolaId ? db.turmas.filter(t => t.escola === escolaId) : visiveis('turmas'), disciplina, prova);
}

// statusAproveitamento/ROTULO_STATUS/selo ficam em app.js (compartilhados com relatorios.js).
const statusParticipacao = v => v === null ? null : v >= 90 ? 'bom' : v >= 70 ? 'atencao' : 'critico';

// Desempenho por descritor entre as turmas do escopo atual (soma todas as provas/aplicações
// que tocaram essas turmas, filtrando por disciplina e/ou simulado quando informado), do pior
// pro melhor % de acerto.
function statsPorDescritorTurmas(turmas, disciplina, prova) {
  const turmaIds = new Set(turmas.map(t => t.id));
  let aplicacoes = db.aplicacoes.filter(ap => turmaIds.has(ap.turma));
  if (prova) aplicacoes = aplicacoes.filter(ap => ap.prova === prova);
  else if (disciplina) aplicacoes = aplicacoes.filter(ap => porId('provas', ap.prova)?.disciplina === disciplina);
  const aplicacaoIds = new Set(aplicacoes.map(ap => ap.id));
  const resultados = db.resultados.filter(r => aplicacaoIds.has(r.aplicacao));
  const m = new Map();
  resultados.forEach(r => {
    const ap = porId('aplicacoes', r.aplicacao), p = porId('provas', ap?.prova);
    (p?.gabarito || []).forEach((g, i) => {
      if (!g?.resposta || !g?.descritor) return;
      if (!m.has(g.descritor)) m.set(g.descritor, { acertos: 0, total: 0 });
      const s = m.get(g.descritor);
      s.total++;
      if (r.respostas[i] === g.resposta) s.acertos++;
    });
  });
  return [...m.entries()].map(([id, s]) => ({ d: porId('descritores', id), s: { ...s, taxa: s.total ? Math.round(s.acertos / s.total * 100) : 0 } }))
    .filter(x => x.d)
    .sort((a, b) => a.s.taxa - b.s.taxa);
}

function painelDescritores(turmas, disciplina, prova) {
  const piores = statsPorDescritorTurmas(turmas, disciplina, prova).slice(0, 5);
  if (!piores.length) return '';
  return `<div class="bloco-ranking">
    <h3>Descritores que precisam de atenção</h3>
    <div class="ranking">
      ${piores.map(x => `<div class="rank-linha">
        <div class="rank-topo"><span class="rank-nome">${esc(x.d.codigo)} — ${esc(x.d.descricao.length > 90 ? x.d.descricao.slice(0, 90) + '…' : x.d.descricao)}</span>
          <span class="rank-metricas">${selo(x.s.taxa, statusAproveitamento(x.s.taxa))}<span class="rank-valor">${x.s.taxa}%</span></span></div>
        <div class="rank-barra"><i class="${statusAproveitamento(x.s.taxa) || 'neutro'}" style="width:${x.s.taxa}%"></i></div>
        <div class="rank-part">${x.s.acertos} de ${x.s.total} respostas corretas</div>
      </div>`).join('')}
    </div>
  </div>`;
}

// Lista ordenada (do melhor pro pior aproveitamento) com barra de progresso e participação.
function listaRanking(titulo, grupos) {
  const ordenado = grupos.slice().sort((a, b) => (b.s.aproveitamento ?? -1) - (a.s.aproveitamento ?? -1));
  return `<div class="bloco-ranking">
    <h3>${esc(titulo)}</h3>
    <div class="ranking">
      ${ordenado.map(g => {
        const st = statusAproveitamento(g.s.aproveitamento), pct = g.s.aproveitamento ?? 0;
        return `<div class="rank-linha">
          <div class="rank-topo"><span class="rank-nome">${esc(g.nome)}</span>
            <span class="rank-metricas">${selo(g.s.aproveitamento, st)}<span class="rank-valor">${g.s.aproveitamento === null ? '—' : pct + '%'}</span></span></div>
          <div class="rank-barra"><i class="${st || 'neutro'}" style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>
          <div class="rank-part">${g.s.avaliados} de ${g.s.previsto} alunos previstos avaliados${g.s.participacao === null ? '' : ' · ' + g.s.participacao + '% de participação'}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function dashboard() {
  const admin = eGlobal();
  const escolas = visiveis('escolas').slice().sort((a, b) => a.nome.localeCompare(b.nome));
  const escolaAtual = admin ? dashboardEscola : sessao.escola;
  const turmasDaEscola = (escolaAtual ? db.turmas.filter(t => t.escola === escolaAtual) : visiveis('turmas'))
    .slice().sort((a, b) => nomeTurma(a).localeCompare(nomeTurma(b)));
  if (dashboardTurma && !turmasDaEscola.some(t => t.id === dashboardTurma)) dashboardTurma = '';
  const disciplinas = [...new Set(db.provas.map(p => p.disciplina).filter(Boolean))].sort();
  if (dashboardDisciplina && !disciplinas.includes(dashboardDisciplina)) dashboardDisciplina = '';

  const turmasEscopo = dashboardTurma ? db.turmas.filter(t => t.id === dashboardTurma) : turmasDaEscola;
  const turmaIdsEscopo = new Set(turmasEscopo.map(t => t.id));
  // Simulados (provas) de fato aplicados no escopo atual – ao longo do ano haverá vários por
  // disciplina/série, então o painel deixa escolher um específico em vez de somar todos juntos.
  let simulados = [...new Map(db.aplicacoes.filter(ap => turmaIdsEscopo.has(ap.turma)).map(ap => [ap.prova, porId('provas', ap.prova)])).values()].filter(Boolean);
  if (dashboardDisciplina) simulados = simulados.filter(p => p.disciplina === dashboardDisciplina);
  simulados.sort((a, b) => a.titulo.localeCompare(b.titulo));
  if (dashboardProva && !simulados.some(p => p.id === dashboardProva)) dashboardProva = '';

  const s = statsGrupo(turmasEscopo, dashboardDisciplina, dashboardProva);
  const statusPart = statusParticipacao(s.participacao), statusApr = statusAproveitamento(s.aproveitamento);

  const filtros = `
    <div class="filtros">
      ${admin ? `<div><label>Escola</label>
        <select onchange="setDashboardFiltro('escola', this.value)">
          <option value="">Todas as escolas</option>
          ${escolas.map(e => `<option value="${e.id}" ${e.id === dashboardEscola ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}
        </select></div>` : ''}
      <div><label>Turma</label>
        <select onchange="setDashboardFiltro('turma', this.value)">
          <option value="">Todas as turmas</option>
          ${turmasDaEscola.map(t => `<option value="${t.id}" ${t.id === dashboardTurma ? 'selected' : ''}>${esc(admin && !escolaAtual ? nomeTurma(t) : t.nome)}</option>`).join('')}
        </select></div>
      <div><label>Disciplina</label>
        <select onchange="setDashboardFiltro('disciplina', this.value)">
          <option value="">Todas as disciplinas</option>
          ${disciplinas.map(d => `<option value="${esc(d)}" ${d === dashboardDisciplina ? 'selected' : ''}>${esc(d)}</option>`).join('')}
        </select></div>
      <div><label>Simulado</label>
        <select onchange="setDashboardFiltro('prova', this.value)">
          <option value="">Todos os simulados</option>
          ${simulados.map(p => `<option value="${p.id}" ${p.id === dashboardProva ? 'selected' : ''}>${esc(p.titulo)}</option>`).join('')}
        </select></div>
    </div>`;

  let ranking = '';
  if (!dashboardTurma) {
    if (admin && !escolaAtual) {
      const grupos = escolas.map(e => ({ nome: e.nome, s: statsEscola(e.id, dashboardDisciplina, dashboardProva) })).filter(g => g.s.aplicacoes);
      ranking = grupos.length ? listaRanking('Desempenho por escola', grupos) : '';
    } else {
      const grupos = turmasDaEscola.map(t => ({ nome: nomeTurma(t), s: statsGrupo([t], dashboardDisciplina, dashboardProva) })).filter(g => g.s.aplicacoes);
      ranking = grupos.length ? listaRanking('Desempenho por turma', grupos) : '';
    }
  }
  const descritores = painelDescritores(turmasEscopo, dashboardDisciplina, dashboardProva);
  const provasNoFiltro = db.provas.filter(p => (!dashboardDisciplina || p.disciplina === dashboardDisciplina) && (!dashboardProva || p.id === dashboardProva)).length;

  document.getElementById('conteudo').innerHTML = `
    <div class="barra"><h2>Painel${!admin ? ' — ' + esc(porId('escolas', sessao.escola)?.nome ?? '') : ''}</h2></div>
    ${filtros}
    <div class="cartoes dash">
      ${admin ? `<div class="cartao cor-violeta"><span>Escolas</span><b>${escolas.length}</b></div>` : ''}
      <div class="cartao cor-azul"><span>Turmas</span><b>${s.turmas}</b></div>
      <div class="cartao cor-agua"><span>Alunos</span><b>${s.alunos}</b></div>
      <div class="cartao cor-magenta"><span>Banco de provas</span><b>${provasNoFiltro}</b></div>
      <div class="cartao cor-marca"><span>Provas aplicadas</span><b>${s.aplicacoes}</b></div>
    </div>
    <h3 class="sub-dash">Resultados das provas aplicadas</h3>
    <div class="cartoes dash">
      <div class="cartao cor-dourado"><span>Alunos previstos</span><b>${s.previsto}</b></div>
      <div class="cartao cor-verde"><span>Avaliados</span><b>${s.avaliados}</b></div>
      <div class="cartao status-${statusPart || 'neutro'}"><span>% de participação</span><b>${s.participacao === null ? '—' : s.participacao + '%'}</b>
        <div class="meter"><i class="${statusPart || 'neutro'}" style="width:${s.participacao ?? 0}%"></i></div></div>
      <div class="cartao status-${statusApr || 'neutro'}"><span>% de acertos</span><b>${s.aproveitamento === null ? '—' : s.aproveitamento + '%'}</b>
        <div class="meter"><i class="${statusApr || 'neutro'}" style="width:${s.aproveitamento ?? 0}%"></i></div></div>
    </div>
    ${ranking || '<div class="vazio">Nenhuma prova aplicada ainda para os filtros selecionados.</div>'}
    ${descritores}`;
}

function setDashboardFiltro(campo, valor) {
  if (campo === 'escola') { dashboardEscola = valor; dashboardTurma = ''; }
  else if (campo === 'turma') dashboardTurma = valor;
  else if (campo === 'disciplina') { dashboardDisciplina = valor; dashboardProva = ''; }
  else if (campo === 'prova') dashboardProva = valor;
  dashboard();
}
