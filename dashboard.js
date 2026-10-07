'use strict';

/* ---------- Painel (tela inicial) ---------- */
// Administrador e coordenador SEMED escolhem uma escola no seletor (ou "Todas
// as escolas"); diretor, coordenador escolar e professor só veem os números
// da própria escola, sem seletor.
let dashboardEscola = '';

// Números de um conjunto de turmas: matrícula, aplicações, previstos (alunos
// matriculados nas turmas com prova aplicada), avaliados e desempenho.
function statsGrupo(turmas) {
  const turmaIds = new Set(turmas.map(t => t.id));
  const alunos = db.alunos.filter(a => turmaIds.has(a.turma));
  const aplicacoes = db.aplicacoes.filter(ap => turmaIds.has(ap.turma));
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
function statsEscola(escolaId) {
  return statsGrupo(escolaId ? db.turmas.filter(t => t.escola === escolaId) : visiveis('turmas'));
}

const statusAproveitamento = v => v === null ? null : v >= 70 ? 'bom' : v >= 50 ? 'atencao' : 'critico';
const statusParticipacao = v => v === null ? null : v >= 90 ? 'bom' : v >= 70 ? 'atencao' : 'critico';
const ROTULO_STATUS = { bom: 'Bom', atencao: 'Atenção', critico: 'Crítico' };
const selo = (valor, status) => !status ? '<span class="selo neutro"><i></i>Sem dados</span>'
  : `<span class="selo ${status}"><i></i>${ROTULO_STATUS[status]}</span>`;

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
  const s = statsEscola(escolaAtual || null);
  const statusPart = statusParticipacao(s.participacao), statusApr = statusAproveitamento(s.aproveitamento);

  const seletor = admin ? `
    <div class="filtros">
      <div><label>Escola</label>
        <select onchange="setDashboardEscola(this.value)">
          <option value="">Todas as escolas</option>
          ${escolas.map(e => `<option value="${e.id}" ${e.id === dashboardEscola ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}
        </select>
      </div>
    </div>` : '';

  let ranking;
  if (admin && !escolaAtual) {
    const grupos = escolas.map(e => ({ nome: e.nome, s: statsEscola(e.id) })).filter(g => g.s.aplicacoes);
    ranking = grupos.length ? listaRanking('Desempenho por escola', grupos) : '';
  } else {
    const turmasEsc = db.turmas.filter(t => t.escola === escolaAtual);
    const grupos = turmasEsc.map(t => ({ nome: nomeTurma(t), s: statsGrupo([t]) })).filter(g => g.s.aplicacoes);
    ranking = grupos.length ? listaRanking('Desempenho por turma', grupos) : '';
  }

  document.getElementById('conteudo').innerHTML = `
    <div class="barra"><h2>Painel${!admin ? ' — ' + esc(porId('escolas', sessao.escola)?.nome ?? '') : ''}</h2></div>
    ${seletor}
    <div class="cartoes dash">
      ${admin ? `<div class="cartao cor-violeta"><span>Escolas</span><b>${escolas.length}</b></div>` : ''}
      <div class="cartao cor-azul"><span>Turmas</span><b>${s.turmas}</b></div>
      <div class="cartao cor-agua"><span>Alunos</span><b>${s.alunos}</b></div>
      <div class="cartao cor-magenta"><span>Banco de provas</span><b>${db.provas.length}</b></div>
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
    ${ranking || '<div class="vazio">Nenhuma prova aplicada ainda — os números de participação e aproveitamento aparecem aqui assim que houver aplicações.</div>'}`;
}

function setDashboardEscola(id) { dashboardEscola = id; dashboard(); }
