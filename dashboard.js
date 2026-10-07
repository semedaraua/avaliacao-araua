'use strict';

/* ---------- Painel (tela inicial) ---------- */
// Administrador e coordenador SEMED escolhem uma escola no seletor (ou "Todas
// as escolas"); diretor, coordenador escolar e professor só veem os números
// da própria escola, sem seletor.
let dashboardEscola = '';

// Números de uma escola específica (id) ou da rede toda (id vazio/nulo).
function statsEscola(escolaId) {
  const turmas = escolaId ? db.turmas.filter(t => t.escola === escolaId) : visiveis('turmas');
  const turmaIds = new Set(turmas.map(t => t.id));
  const alunos = db.alunos.filter(a => turmaIds.has(a.turma));
  const aplicacoes = db.aplicacoes.filter(ap => turmaIds.has(ap.turma));
  const alunosPorTurma = new Map();
  alunos.forEach(a => alunosPorTurma.set(a.turma, (alunosPorTurma.get(a.turma) || 0) + 1));
  const esperado = aplicacoes.reduce((n, ap) => n + (alunosPorTurma.get(ap.turma) || 0), 0);
  const aplicacaoIds = new Set(aplicacoes.map(ap => ap.id));
  const resultados = db.resultados.filter(r => aplicacaoIds.has(r.aplicacao));
  const acertos = resultados.reduce((n, r) => n + r.acertos, 0);
  const totalQ = resultados.reduce((n, r) => n + r.total, 0);
  return {
    turmas: turmas.length,
    alunos: alunos.length,
    aplicacoes: aplicacoes.length,
    corrigidos: resultados.length,
    esperado,
    aproveitamento: totalQ ? Math.round(acertos / totalQ * 100) : null,
  };
}

function dashboard() {
  const admin = eGlobal();
  const escolas = visiveis('escolas').slice().sort((a, b) => a.nome.localeCompare(b.nome));
  const escolaAtual = admin ? dashboardEscola : sessao.escola;
  const s = statsEscola(escolaAtual || null);

  const seletor = admin ? `
    <div class="filtros">
      <div><label>Escola</label>
        <select onchange="setDashboardEscola(this.value)">
          <option value="">Todas as escolas</option>
          ${escolas.map(e => `<option value="${e.id}" ${e.id === dashboardEscola ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}
        </select>
      </div>
    </div>` : '';

  document.getElementById('conteudo').innerHTML = `
    <div class="barra"><h2>Painel${!admin ? ' — ' + esc(porId('escolas', sessao.escola)?.nome ?? '') : ''}</h2></div>
    ${seletor}
    <div class="cartoes">
      ${admin ? `<div class="cartao"><span>Escolas</span><b>${escolas.length}</b></div>` : ''}
      <div class="cartao"><span>Turmas</span><b>${s.turmas}</b></div>
      <div class="cartao"><span>Alunos</span><b>${s.alunos}</b></div>
      <div class="cartao"><span>Banco de provas</span><b>${db.provas.length}</b></div>
      <div class="cartao"><span>Provas aplicadas</span><b>${s.aplicacoes}</b></div>
      <div class="cartao"><span>Resultados corrigidos</span><b>${s.corrigidos} <small>de ${s.esperado}</small></b></div>
      <div class="cartao"><span>Aproveitamento médio</span><b>${s.aproveitamento === null ? '—' : s.aproveitamento + '%'}</b></div>
    </div>`;
}

function setDashboardEscola(id) { dashboardEscola = id; dashboard(); }
