'use strict';

/* ---------- Relatórios de resultados (acertos e % de acertos) ---------- */
let filtroRel = { escola: '', prova: '', turma: '' };

// Resultados visíveis ao usuário (escola própria ou todas), com prova/aluno/turma/escola resolvidos e filtros aplicados.
// Os acertos são recalculados com o gabarito atual da prova.
function itensRelatorio() {
  const f = filtroRel;
  return visiveis('resultados').map(r => {
    const ap = porId('aplicacoes', r.aplicacao), p = porId('provas', ap?.prova), a = porId('alunos', r.aluno), t = porId('turmas', ap?.turma), e = porId('escolas', t?.escola);
    return { r, p, a, t, e, ...(p ? pontuar(p, r.respostas) : {}) };
  }).filter(x => x.p && x.a && x.t && x.e
    && (!f.escola || x.e.id === f.escola) && (!f.prova || x.p.id === f.prova) && (!f.turma || x.t.id === f.turma));
}

function somar(itens) {
  const acertos = itens.reduce((n, x) => n + x.acertos, 0), total = itens.reduce((n, x) => n + x.total, 0);
  return { n: itens.length, acertos, total, taxa: total ? acertos / total * 100 : 0 };
}
function agrupar(itens, chave) {
  const m = new Map();
  itens.forEach(x => { const k = chave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return [...m.entries()];
}
const pct = v => Math.round(v) + '%';
const barra = taxa => `<div class="barra-nota"><i style="width:${Math.max(0, Math.min(100, taxa))}%"></i></div>`;
const acertou = (x, i) => !!x.p.gabarito?.[i]?.resposta && x.r.respostas[i] === x.p.gabarito[i].resposta;
const calor = taxa => `background:hsl(${Math.round(taxa * 1.2)} 65% 86%)`; // 0% vermelho -> 100% verde

// Matriz: uma linha por grupo, uma coluna por questão, com o % de acertos do grupo em cada questão.
function matrizQuestoes(titulo, rotuloCab, grupos, p, comAluno) {
  const gab = p.gabarito || [], nq = p.questoes;
  const cab = Array.from({ length: nq }, (_, i) => `<th class="n">${i + 1}</th>`).join('');
  const cabGab = Array.from({ length: nq }, (_, i) => `<td class="n gab">${gab[i]?.resposta || '·'}</td>`).join('');
  const linhas = grupos.map(([rot, itens]) => `<tr><td>${esc(rot)}</td>` + Array.from({ length: nq }, (_, i) => {
    if (!gab[i]?.resposta) return '<td class="n">–</td>';
    if (comAluno) { const v = itens[0].r.respostas[i]; return v === gab[i].resposta ? `<td class="n" style="${calor(100)}">✓</td>` : `<td class="n" style="${calor(0)}">${LETRAS.includes(v) ? v : '○'}</td>`; }
    const t = itens.filter(x => acertou(x, i)).length / itens.length * 100;
    return `<td class="n" style="${calor(t)}">${pct(t)}</td>`;
  }).join('') + '</tr>').join('');
  return `<h3>${titulo}</h3>
    <div class="tabela"><table class="matriz"><thead><tr><th>${rotuloCab}</th>${cab}</tr><tr><td class="gab">Gabarito</td>${cabGab}</tr></thead><tbody>${linhas}</tbody></table></div>`;
}

// Agrega acertos/erros por descritor (soma entre todas as questões de todas as provas do
// conjunto de itens que apontam pro mesmo descritor), do pior para o melhor % de acerto.
function statsPorDescritor(itens) {
  const m = new Map();
  itens.forEach(x => {
    (x.p.gabarito || []).forEach((g, i) => {
      if (!g?.resposta || !g?.descritor) return;
      if (!m.has(g.descritor)) m.set(g.descritor, { acertos: 0, total: 0 });
      const s = m.get(g.descritor);
      s.total++;
      if (x.r.respostas[i] === g.resposta) s.acertos++;
    });
  });
  return [...m.entries()].map(([id, s]) => ({ d: porId('descritores', id), s: { ...s, taxa: s.total ? s.acertos / s.total * 100 : 0 } }))
    .filter(x => x.d)
    .sort((a, b) => a.s.taxa - b.s.taxa);
}

function tabelaDescritores(titulo, linhas) {
  if (!linhas.length) return '';
  return `<h3>${esc(titulo)}</h3>
    <table><thead><tr><th>Código</th><th>Descritor</th><th class="n">Acertos</th><th class="n">% de acerto</th><th></th><th>Indicador</th></tr></thead><tbody>
    ${linhas.map(x => `<tr><td>${esc(x.d.codigo)}</td><td>${esc(x.d.descricao)}</td><td class="n">${x.s.acertos} de ${x.s.total}</td><td class="n">${pct(x.s.taxa)}</td><td>${barra(x.s.taxa)}</td><td>${selo(x.s.taxa, statusAproveitamento(Math.round(x.s.taxa)))}</td></tr>`).join('')}
    </tbody></table>`;
}

function relatorios() {
  const f = filtroRel;
  if (!eGlobal()) f.escola = sessao.escola;
  const escolas = visiveis('escolas');
  const turmas = visiveis('turmas').filter(t => !f.escola || t.escola === f.escola);
  const aplicVisiveis = visiveis('aplicacoes').filter(ap => !f.escola || porId('turmas', ap.turma)?.escola === f.escola);
  const provas = [...new Map(aplicVisiveis.map(ap => [ap.prova, porId('provas', ap.prova)])).values()].filter(Boolean);
  if (f.turma && !turmas.some(t => t.id === f.turma)) f.turma = '';
  if (f.prova && !provas.some(p => p.id === f.prova)) f.prova = '';

  const itens = itensRelatorio(), geral = somar(itens);
  const opt = (lista, sel, rot) => lista.map(o => `<option value="${o.id}" ${o.id === sel ? 'selected' : ''}>${esc(rot(o))}</option>`).join('');

  // Alunos previstos: alunos matriculados nas turmas em que a prova foi aplicada (independe de já terem sido corrigidos).
  const aplicFiltradas = aplicVisiveis.filter(ap => (!f.turma || ap.turma === f.turma) && (!f.prova || ap.prova === f.prova));
  const alunosPorTurma = new Map();
  visiveis('alunos').forEach(a => alunosPorTurma.set(a.turma, (alunosPorTurma.get(a.turma) || 0) + 1));
  const previstosPorEscola = new Map(), previstosPorTurma = new Map();
  aplicFiltradas.forEach(ap => {
    const n = alunosPorTurma.get(ap.turma) || 0, escolaId = porId('turmas', ap.turma)?.escola;
    previstosPorTurma.set(ap.turma, (previstosPorTurma.get(ap.turma) || 0) + n);
    if (escolaId) previstosPorEscola.set(escolaId, (previstosPorEscola.get(escolaId) || 0) + n);
  });
  const previstos = aplicFiltradas.reduce((n, ap) => n + (alunosPorTurma.get(ap.turma) || 0), 0);
  const participacao = n => previstos ? pct(n / previstos * 100) : '—';

  const porEscola = agrupar(itens, x => x.e.id).map(([id, l]) => ({ e: porId('escolas', id), l, s: somar(l), turmas: new Set(l.map(x => x.t.id)).size }))
    .sort((a, b) => a.e.nome.localeCompare(b.e.nome));
  const porTurma = agrupar(itens, x => x.t.id).map(([id, l]) => ({ t: porId('turmas', id), l, s: somar(l) }))
    .sort((a, b) => nomeTurma(a.t).localeCompare(nomeTurma(b.t)));
  const alunos = itens.slice().sort((a, b) => nomeTurma(a.t).localeCompare(nomeTurma(b.t)) || a.a.nome.localeCompare(b.a.nome));
  const porDescritor = statsPorDescritor(itens);

  const tabela = (cab, linhas) => `<table><thead><tr>${cab}<th class="n">Alunos previstos</th><th class="n">Avaliados</th><th class="n">% participação</th><th class="n">Acertos</th><th class="n">% de acertos</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`;
  const cel = (s, previstosGrupo) => `<td class="n">${previstosGrupo}</td><td class="n">${s.n}</td><td class="n">${previstosGrupo ? pct(s.n / previstosGrupo * 100) : '—'}</td><td class="n">${s.acertos} de ${s.total}</td><td class="n">${pct(s.taxa)}</td><td>${barra(s.taxa)}</td>`;
  const filtrosDesc = [f.escola && porId('escolas', f.escola)?.nome, f.turma && nomeTurma(porId('turmas', f.turma)), f.prova && porId('provas', f.prova)?.titulo].filter(Boolean);
  const prova = f.prova ? porId('provas', f.prova) : null;

  let questoes = '<p class="msg">Selecione uma prova no filtro para ver o percentual de acertos por questão (por escola, turma e aluno).</p>';
  if (prova) {
    const g = [[`Todos os alunos (${itens.length})`, itens]];
    questoes = matrizQuestoes('% de acertos por questão – geral', 'Grupo', g, prova)
      + matrizQuestoes('% de acertos por questão – por escola', 'Escola', porEscola.map(x => [x.e.nome, x.l]), prova)
      + matrizQuestoes('% de acertos por questão – por turma', 'Turma', porTurma.map(x => [nomeTurma(x.t), x.l]), prova)
      + matrizQuestoes('Acertos por questão – por aluno (✓ = acertou; letra = alternativa marcada; ○ = em branco ou múltipla)', 'Aluno',
        alunos.map(x => [`${x.a.nome} (${x.t.nome})`, [x]]), prova, true);
  }

  document.getElementById('conteudo').innerHTML = `
    <div class="barra"><h2>Relatórios de resultados</h2>
      <span><button class="s" onclick="imprimirRelatorio()">Imprimir</button> <button class="s" onclick="exportarRelatorioCSV()">Exportar CSV</button></span></div>
    <div class="filtros">
      <div><label>Escola</label>${eGlobal()
        ? `<select onchange="setFiltroRel('escola', this.value)"><option value="">Todas as escolas</option>${opt(escolas, f.escola, e => e.nome)}</select>`
        : `<select disabled><option>${esc(escolas[0]?.nome ?? '')}</option></select>`}</div>
      <div><label>Turma</label><select onchange="setFiltroRel('turma', this.value)"><option value="">Todas as turmas</option>${opt(turmas, f.turma, nomeTurma)}</select></div>
      <div><label>Prova</label><select onchange="setFiltroRel('prova', this.value)"><option value="">Todas as provas</option>${opt(provas, f.prova, p => p.titulo)}</select></div>
    </div>
    <div id="rel-corpo" class="rel">
      ${filtrosDesc.length ? `<p class="msg">Filtro: ${esc(filtrosDesc.join(' · '))}</p>` : ''}
      <div class="cartoes">
        <div class="cartao"><span>Alunos previstos</span><b>${previstos}</b></div>
        <div class="cartao"><span>Alunos avaliados</span><b>${geral.n}</b></div>
        <div class="cartao"><span>% de participação</span><b>${participacao(geral.n)}</b></div>
        ${itens.length ? `<div class="cartao"><span>Acertos</span><b>${geral.acertos} <small>de ${geral.total}</small></b></div>
        <div class="cartao"><span>% de acertos</span><b>${pct(geral.taxa)}</b></div>` : ''}
      </div>
      ${!itens.length ? '<div class="vazio">Nenhum resultado corrigido para os filtros selecionados.</div>' : `
      <h3>Acertos por escola</h3>
      ${tabela('<th>Escola</th><th class="n">Turmas</th>', porEscola.map(x => `<tr><td>${esc(x.e.nome)}</td><td class="n">${x.turmas}</td>${cel(x.s, previstosPorEscola.get(x.e.id) || 0)}</tr>`).join(''))}
      <h3>Acertos por turma</h3>
      ${tabela('<th>Turma</th>', porTurma.map(x => `<tr class="clic" title="Clique para filtrar esta turma" onclick="setFiltroRel('turma','${x.t.id}')"><td>${esc(nomeTurma(x.t))}</td>${cel(x.s, previstosPorTurma.get(x.t.id) || 0)}</tr>`).join(''))}
      <h3>Acertos por aluno</h3>
      <table><thead><tr><th>Turma</th><th>Matrícula</th><th>Aluno</th><th>Prova</th><th class="n">Acertos</th><th class="n">% de acertos</th><th></th></tr></thead><tbody>
      ${alunos.map(x => `<tr><td>${esc(nomeTurma(x.t))}</td><td>${esc(x.a.matricula)}</td><td>${esc(x.a.nome)}</td><td>${esc(x.p.titulo)}</td><td class="n">${x.acertos} de ${x.total}</td><td class="n">${pctDe(x.acertos, x.total)}</td><td>${barra(x.total ? x.acertos / x.total * 100 : 0)}</td></tr>`).join('')}
      </tbody></table>
      ${tabelaDescritores('Desempenho por descritor de habilidade', porDescritor)}
      ${questoes}`}
    </div>`;
}

function setFiltroRel(campo, valor) {
  filtroRel[campo] = valor;
  if (campo === 'escola') { filtroRel.turma = ''; filtroRel.prova = ''; }
  relatorios();
}

function imprimirRelatorio() {
  const s = document.getElementById('folhas');
  s.innerHTML = `<div class="rel-print rel">
    <h2>Secretaria Municipal de Educação de Arauá</h2><h3>Sistema de Gestão de Avaliações – Relatório de resultados</h3>
    <p>Emitido por ${esc(sessao.nome)} (${PERFIS[sessao.perfil]}) em ${new Date().toLocaleString('pt-BR')}</p>
    ${document.getElementById('rel-corpo').innerHTML}</div>`;
  window.addEventListener('afterprint', () => { s.innerHTML = ''; }, { once: true });
  window.print();
}

function exportarRelatorioCSV() {
  const prova = filtroRel.prova ? porId('provas', filtroRel.prova) : null;
  const qs = prova ? Array.from({ length: prova.questoes }, (_, i) => 'Q' + (i + 1)) : [];
  const linhas = [['Escola', 'Turma', 'Prova', 'Matrícula', 'Aluno', 'Acertos', 'Total', '% acertos', ...qs]];
  itensRelatorio().forEach(x => linhas.push([x.e.nome, x.t.nome, x.p.titulo, x.a.matricula, x.a.nome, x.acertos, x.total, pctDe(x.acertos, x.total),
    ...(prova ? qs.map((_, i) => (x.p.gabarito?.[i]?.resposta ? (acertou(x, i) ? 1 : 0) : '')) : [])]));
  const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'relatorio-resultados.csv';
  a.click();
}
