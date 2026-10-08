'use strict';

/* ---------- Dados (cache local sincronizado com o Supabase a cada login/alteração) ---------- */
let db = { escolas: [], usuarios: [], turmas: [], alunos: [], matrizes: [], descritores: [], provas: [], aplicacoes: [], resultados: [], solicitacoes: [] };
let sessao = null; // usuário logado (linha da tabela "usuarios")
const porId = (col, id) => db[col].find(x => x.id === id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Carrega (ou recarrega) tudo que as políticas de RLS liberam para o usuário logado.
async function carregarDados() {
  const tabelas = ['escolas', 'usuarios', 'turmas', 'alunos', 'matrizes', 'descritores', 'provas', 'aplicacoes', 'resultados', 'solicitacoes'];
  const resp = await Promise.all(tabelas.map(t => sb.from(t).select('*')));
  resp.forEach((r, i) => { if (r.error) throw r.error; db[tabelas[i]] = r.data || []; });
}

// Extrai a mensagem de erro de uma Edge Function do Supabase (usada por sb.functions.invoke).
async function mensagemErroFuncao(error) {
  try { const body = await error.context.json(); return body?.error || error.message; } catch { return error.message; }
}

const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const PERFIS = { admin: 'Administrador', semed: 'Coordenador SEMED', diretor: 'Diretor', coordenador: 'Coordenador escolar', professor: 'Professor' };

/* ---------- Indicador bom/atenção/crítico (usado no painel e nos relatórios) ---------- */
const statusAproveitamento = v => v === null || v === undefined ? null : v >= 70 ? 'bom' : v >= 50 ? 'atencao' : 'critico';
const ROTULO_STATUS = { bom: 'Bom', atencao: 'Atenção', critico: 'Crítico' };
const selo = (valor, status) => !status ? '<span class="selo neutro"><i></i>Sem dados</span>'
  : `<span class="selo ${status}"><i></i>${ROTULO_STATUS[status]}</span>`;
// Ordena por número do código (D2 antes de D10), não alfabeticamente.
const numDescritor = cod => parseInt(String(cod).match(/\d+/)?.[0] ?? '0', 10);

/* ---------- Definição das entidades ---------- */
const nomeTurma = t => t ? `${t.nome} (${porId('escolas', t.escola)?.nome ?? '?'})` : '';
const ENT = {
  escolas: {
    titulo: 'Escolas', singular: 'Escola',
    campos: [
      { k: 'nome', r: 'Nome da escola', obrig: 1 },
      { k: 'codigo', r: 'Código (INEP)' },
      { k: 'cidade', r: 'Cidade' },
      { k: 'uf', r: 'UF' },
    ],
    colunas: ['nome', 'cidade', 'uf'],
    rotulo: e => e.nome,
  },
  usuarios: {
    titulo: 'Usuários', singular: 'Usuário',
    campos: [
      { k: 'nome', r: 'Nome completo', obrig: 1 },
      { k: 'login', r: 'Usuário (login)', obrig: 1 },
      { k: 'email', r: 'E-mail', tipo: 'email' },
      { k: 'perfil', r: 'Perfil de acesso', obrig: 1, mapa: PERFIS, opcoesFn: () => perfisCriaveis() },
      { k: 'disciplina', r: 'Disciplina (professores)' },
      { k: 'escola', r: 'Escola (obrigatória, exceto administrador e SEMED)', ref: 'escolas' },
    ],
    colunas: ['nome', 'login', 'perfil', 'escola'],
    rotulo: u => u.nome,
    validar: (d, reg, id) => validarUsuario(d, reg, id),
    novo: d => novoUsuario(d),
    extras: [{ r: 'Redefinir senha', f: 'redefinirSenha' }],
  },
  turmas: {
    titulo: 'Turmas', singular: 'Turma',
    campos: [
      { k: 'nome', r: 'Nome da turma (ex.: 7º A)', obrig: 1 },
      { k: 'ano', r: 'Ano letivo', tipo: 'number', padrao: new Date().getFullYear() },
      { k: 'turno', r: 'Turno', opcoes: ['Manhã', 'Tarde', 'Noite', 'Integral'] },
      { k: 'escola', r: 'Escola', ref: 'escolas', obrig: 1 },
    ],
    colunas: ['nome', 'ano', 'turno', 'escola'],
    rotulo: nomeTurma,
  },
  alunos: {
    titulo: 'Alunos', singular: 'Aluno',
    campos: [
      { k: 'nome', r: 'Nome completo', obrig: 1 },
      { k: 'matricula', r: 'Matrícula', obrig: 1 },
      { k: 'turma', r: 'Turma', ref: 'turmas', obrig: 1 },
    ],
    colunas: ['matricula', 'nome', 'turma'],
    rotulo: a => a.nome,
  },
  matrizes: {
    titulo: 'Matrizes de habilidades', singular: 'Matriz',
    campos: [
      { k: 'nome', r: 'Nome da matriz', obrig: 1 },
      { k: 'disciplina', r: 'Disciplina', opcoes: ['Língua Portuguesa', 'Matemática'], obrig: 1 },
      { k: 'serie', r: 'Série/ano', opcoes: ['2º ano', '3º ano', '4º ano', '5º ano', '9º ano'], obrig: 1 },
    ],
    colunas: ['nome', 'disciplina', 'serie'],
    rotulo: m => m.nome,
  },
  descritores: {
    titulo: 'Descritores', singular: 'Descritor',
    campos: [
      { k: 'matriz', r: 'Matriz de habilidades', ref: 'matrizes', obrig: 1 },
      { k: 'codigo', r: 'Código (ex.: D1)', obrig: 1 },
      { k: 'eixo', r: 'Eixo / prática de linguagem' },
      { k: 'codigo_bncc', r: 'Código BNCC (ex.: EF15LP03)' },
      { k: 'descricao', r: 'Descrição da habilidade', obrig: 1, tipo: 'textarea' },
    ],
    colunas: ['codigo', 'matriz', 'descricao'],
    rotulo: d => `${d.codigo} — ${d.descricao}`,
  },
  provas: {
    titulo: 'Banco de provas', singular: 'Prova',
    campos: [
      { k: 'titulo', r: 'Título da prova', obrig: 1 },
      { k: 'disciplina', r: 'Disciplina' },
      { k: 'questoes', r: 'Quantidade de questões (1 a 100)', tipo: 'number', obrig: 1, min: 1, max: 100, padrao: 10 },
      { k: 'tipo', r: 'Tipo de pergunta', opcoes: ['Múltipla escolha – 5 opções (A a E)'], padrao: 'Múltipla escolha – 5 opções (A a E)' },
      { k: 'matriz', r: 'Matriz de habilidades (opcional, pra registrar o descritor de cada questão)', ref: 'matrizes' },
    ],
    colunas: ['titulo', 'disciplina', 'questoes'],
    rotulo: p => p.titulo,
    extras: [
      { r: 'Gabarito', f: 'editarGabarito' },
    ],
  },
  aplicacoes: {
    titulo: 'Provas aplicadas', singular: 'Aplicação de prova',
    campos: [
      { k: 'prova', r: 'Prova (banco de provas)', ref: 'provas', obrig: 1 },
      { k: 'turma', r: 'Turma', ref: 'turmas', obrig: 1 },
      { k: 'data', r: 'Data de aplicação', tipo: 'date' },
      { k: 'professor', r: 'Professor', ref: 'usuarios', filtro: u => u.perfil === 'professor' },
    ],
    colunas: ['prova', 'turma', 'data'],
    rotulo: ap => `${porId('provas', ap.prova)?.titulo ?? '?'} — ${nomeTurma(porId('turmas', ap.turma))}`,
    extras: [
      { r: 'Folha de Respostas', f: 'abrirFolhas', p: 1 },
      { r: 'Corrigir', f: 'corrigir', p: 1 },
      { r: 'Resultados', f: 'resultados' },
    ],
  },
};

/* ---------- Perfis e permissões ---------- */
// Para mudar quem pode fazer o quê, edite as tabelas PERM/ACOES abaixo E as políticas
// equivalentes em supabase/schema.sql (a segurança de verdade está no banco, via RLS;
// isto aqui só controla o que a interface mostra).
const TODOS = Object.keys(PERFIS);
const GLOBAIS = ['admin', 'semed'];                       // enxergam todas as escolas
const GERENTES = ['admin', 'semed', 'diretor', 'coordenador'];
const ESCOLARES = ['admin', 'semed', 'diretor', 'coordenador', 'professor'];
const PERM = {
  escolas:    { ver: GERENTES, criar: ['admin', 'semed'], editar: GERENTES, excluir: ['admin', 'semed'] },
  turmas:     { ver: TODOS, criar: TODOS, editar: TODOS, excluir: TODOS },
  alunos:     { ver: TODOS, criar: TODOS, editar: TODOS, excluir: TODOS },
  usuarios:   { ver: GERENTES, criar: GERENTES, editar: GERENTES, excluir: GERENTES },
  // Matrizes/descritores: só administrador e coordenador SEMED cadastram (mesma regra do banco de provas).
  matrizes:    { ver: ['admin', 'semed'], criar: ['admin', 'semed'], editar: ['admin', 'semed'], excluir: ['admin', 'semed'] },
  descritores: { ver: ['admin', 'semed'], criar: ['admin', 'semed'], editar: ['admin', 'semed'], excluir: ['admin', 'semed'] },
  // Banco de provas: só administrador e coordenador SEMED criam/editam/excluem provas e gabaritos.
  provas:     { ver: TODOS, criar: ['admin', 'semed'], editar: ['admin', 'semed'], excluir: ['admin', 'semed'] },
  // Provas aplicadas: diretor e coordenador escolar selecionam uma prova do banco e vinculam à turma da sua escola.
  aplicacoes: { ver: TODOS, criar: GERENTES, editar: GERENTES, excluir: GERENTES },
  relatorios: { ver: TODOS },
  dashboard:  { ver: TODOS },
};
const ACOES = {
  editarGabarito: ['admin', 'semed'],
  abrirFolhas: ESCOLARES,
  corrigir: ESCOLARES,
  resultados: TODOS,
  redefinirSenha: GERENTES,
};
const ABAS = ['dashboard', 'escolas', 'turmas', 'alunos', 'usuarios', 'matrizes', 'descritores', 'provas', 'aplicacoes', 'relatorios'];
const dependentes = {
  escolas: [['turmas', 'escola'], ['usuarios', 'escola']],
  turmas: [['alunos', 'turma'], ['aplicacoes', 'turma']],
  usuarios: [['aplicacoes', 'professor']],
  alunos: [['resultados', 'aluno']],
  matrizes: [['descritores', 'matriz'], ['provas', 'matriz']],
  provas: [['aplicacoes', 'prova']],
  aplicacoes: [['resultados', 'aplicacao']],
};

const eGlobal = () => GLOBAIS.includes(sessao?.perfil);
const pode = (acao, col) => !!sessao && PERM[col][acao].includes(sessao.perfil);
// Exclusão: admin/semed excluem qualquer registro; os demais só o que eles próprios cadastraram
// (mesma regra aplicada de verdade pelo banco via RLS — isto aqui só evita um botão que falharia).
const podeExcluirRegistro = reg => eGlobal() || reg.criado_por === sessao.id;
const podeAcao = f => !!sessao && (ACOES[f] || []).includes(sessao.perfil);
function perfisCriaveis() {
  return sessao?.perfil === 'admin' ? TODOS : sessao?.perfil === 'semed' ? ['diretor', 'coordenador', 'professor'] : ['professor'];
}

// Registros que o usuário logado pode ver: administrador e SEMED veem tudo; os demais, só a própria escola.
// (Isto é só para a interface: quem realmente decide o que cada um vê é a Row Level Security no banco.)
function visiveis(col) {
  const escola = sessao.escola, escolaDaTurma = id => porId('turmas', id)?.escola;
  if (col === 'usuarios') {
    const cri = perfisCriaveis();
    return db.usuarios.filter(u => cri.includes(u.perfil) && (eGlobal() || u.escola === escola));
  }
  if (col === 'provas') return db.provas; // banco de provas: catálogo único, sem vínculo de escola, visível a todos
  if (eGlobal()) return db[col];
  switch (col) {
    case 'escolas': return db.escolas.filter(e => e.id === escola);
    case 'turmas': return db.turmas.filter(t => t.escola === escola);
    case 'alunos': return db.alunos.filter(a => escolaDaTurma(a.turma) === escola);
    case 'aplicacoes': return db.aplicacoes.filter(ap => escolaDaTurma(ap.turma) === escola);
    case 'resultados': { const ids = new Set(visiveis('aplicacoes').map(ap => ap.id)); return db.resultados.filter(r => ids.has(r.aplicacao)); }
  }
  return db[col];
}

/* ---------- Navegação ---------- */
let aba = 'dashboard';
const abasVisiveis = () => ABAS.filter(k => PERM[k].ver.includes(sessao.perfil));
function tituloAba(k) {
  if (k === 'dashboard') return 'Painel';
  if (k === 'relatorios') return 'Relatórios';
  if (k === 'escolas' && !eGlobal()) return 'Minha escola';
  if (k === 'usuarios' && !eGlobal()) return 'Professores';
  return ENT[k].titulo;
}
function menu() {
  document.getElementById('menu').innerHTML = abasVisiveis().map(k =>
    `<button class="${k === aba ? 'ativo' : ''}" onclick="irPara('${k}')">${tituloAba(k)}</button>`).join('');
}
function irPara(k) { aba = k; menu(); listar(); }

function valorCelula(cfg, k, reg) {
  const c = cfg.campos.find(x => x.k === k);
  const v = reg[k];
  if (c.ref) { const r = porId(c.ref, v); return r ? ENT[c.ref].rotulo(r) : '—'; }
  if (c.mapa) return c.mapa[v] ?? v;
  return v ?? '';
}

/* ---------- Listagem ---------- */
function listar() {
  if (aba === 'dashboard') return dashboard();
  if (aba === 'relatorios') return relatorios();
  const cfg = ENT[aba], regs = visiveis(aba);
  const cab = cfg.colunas.map(k => `<th>${esc(cfg.campos.find(c => c.k === k).r.replace(/ \(.*\)/, ''))}</th>`).join('');
  const pendente = id => aba === 'usuarios' && db.solicitacoes.some(s => s.usuario === id && !s.atendida);
  const linhas = regs.map(r => `<tr>${cfg.colunas.map((k, i) => `<td>${esc(valorCelula(cfg, k, r))}${i === 0 && pendente(r.id) ? ' <span class="tag">senha solicitada</span>' : ''}</td>`).join('')}
    <td class="acoes">
      ${(cfg.extras || []).filter(x => podeAcao(x.f)).map(x => `<button class="s ${x.p ? 'p' : ''}" onclick="${x.f}('${r.id}')">${x.r}</button>`).join('')}
      ${pode('editar', aba) ? `<button class="s" onclick="editar('${r.id}')">Editar</button>` : ''}
      ${pode('excluir', aba) && podeExcluirRegistro(r) && !(aba === 'usuarios' && r.id === sessao.id) ? `<button class="s perigo" onclick="excluir('${r.id}')">Excluir</button>` : ''}</td></tr>`).join('');
  const nPend = aba === 'usuarios' ? regs.filter(r => pendente(r.id)).length : 0;
  document.getElementById('conteudo').innerHTML = `
    <div class="barra"><h2>${tituloAba(aba)}</h2>${pode('criar', aba) ? `<button class="p" onclick="editar()">+ Novo(a) ${(aba === 'usuarios' && !eGlobal() ? 'professor' : cfg.singular).toLowerCase()}</button>` : ''}</div>
    ${nPend ? `<p class="msg">${nPend} usuário(s) solicitaram redefinição de senha – use o botão "Redefinir senha" na linha correspondente.</p>` : ''}
    ${regs.length ? `<div class="tabela"><table><thead><tr>${cab}<th>Ações</th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : `<div class="vazio">Nenhum registro ainda.${faltaPreRequisito() ? '<br>' + faltaPreRequisito() : ''}</div>`}`;
}
function faltaPreRequisito() {
  const refs = ENT[aba].campos.filter(c => c.ref && c.obrig).map(c => c.ref);
  const falta = refs.filter(r => !visiveis(r).length);
  return falta.length ? `Cadastre antes: ${falta.map(f => tituloAba(f).toLowerCase()).join(', ')}.` : '';
}

/* ---------- Formulário ---------- */
const dlg = document.getElementById('dlg'), form = document.getElementById('form');
function editar(id) {
  const cfg = ENT[aba], reg = id ? porId(aba, id) : {};
  if (!pode(id ? 'editar' : 'criar', aba) || (id && !visiveis(aba).includes(reg))) return;
  const falta = faltaPreRequisito();
  if (!id && falta) return alert(falta);
  form.innerHTML = `<h3>${id ? 'Editar' : 'Novo(a)'} ${cfg.singular.toLowerCase()}</h3>` + cfg.campos.map(c => {
    let v = reg[c.k] ?? c.padrao ?? '';
    if (c.ref === 'escolas' && !eGlobal()) v = sessao.escola;
    let ctl;
    if (c.ref) {
      const ops = visiveis(c.ref).filter(c.filtro || (() => true));
      ctl = `<select name="${c.k}" ${c.obrig ? 'required' : ''}><option value="">— selecione —</option>${ops.map(o =>
        `<option value="${o.id}" ${o.id === v ? 'selected' : ''}>${esc(ENT[c.ref].rotulo(o))}</option>`).join('')}</select>`;
    } else if (c.opcoes || c.opcoesFn) {
      const ops = (c.opcoesFn ? c.opcoesFn() : c.opcoes);
      ctl = `<select name="${c.k}" ${c.obrig ? 'required' : ''}><option value=""></option>${ops.map(o =>
        `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(c.mapa ? c.mapa[o] : o)}</option>`).join('')}</select>`;
    } else if (c.tipo === 'textarea') {
      ctl = `<textarea name="${c.k}" rows="3" ${c.obrig ? 'required' : ''}>${esc(v)}</textarea>`;
    } else ctl = `<input name="${c.k}" type="${c.tipo || 'text'}" value="${esc(v)}" ${c.obrig ? 'required' : ''} ${c.min ? `min="${c.min}"` : ''} ${c.max ? `max="${c.max}"` : ''}>`;
    return `<label>${esc(c.r)}${c.obrig ? ' *' : ''}</label>${ctl}`;
  }).join('') + `<div class="rodape-form"><button type="button" class="s" onclick="dlg.close()">Cancelar</button><button class="p" value="ok">Salvar</button></div>`;
  form.onsubmit = async ev => {
    ev.preventDefault();
    if (ev.submitter?.value !== 'ok') return;
    const dados = Object.fromEntries(new FormData(form));
    if (!eGlobal() && cfg.campos.some(c => c.k === 'escola')) dados.escola = sessao.escola;
    if (cfg.campos.find(c => c.k === 'questoes')) {
      dados.questoes = Math.min(100, Math.max(1, parseInt(dados.questoes) || 1));
      // se reduziu o nº de questões, descarta gabarito excedente
      if (reg.gabarito) dados.gabarito = reg.gabarito.slice(0, dados.questoes);
    }
    // campo de referência/data/número vazio vira null (coluna do banco não aceita string vazia)
    cfg.campos.forEach(c => { if ((c.ref || c.tipo === 'date' || c.tipo === 'number') && dados[c.k] === '') dados[c.k] = null; });
    const erro = cfg.validar?.(dados, reg, id);
    if (erro) return alert(erro);
    try {
      if (id) {
        const { error } = await sb.from(aba).update(dados).eq('id', id);
        if (error) throw error;
        Object.assign(reg, dados);
        dlg.close(); listar();
      } else if (cfg.novo) {
        await cfg.novo(dados); // cuida de gravar, fechar o diálogo, atualizar a lista e avisar o usuário
      } else {
        const { data, error } = await sb.from(aba).insert(dados).select().single();
        if (error) throw error;
        db[aba].push(data);
        dlg.close(); listar();
      }
    } catch (e) { alert('Erro ao salvar: ' + e.message); }
  };
  dlg.showModal();
}

async function excluir(id) {
  const reg = porId(aba, id);
  if (!reg || !pode('excluir', aba) || !visiveis(aba).includes(reg) || !podeExcluirRegistro(reg)) return;
  if (aba === 'usuarios' && id === sessao.id) return alert('Você não pode excluir o seu próprio usuário.');
  const usados = (dependentes[aba] || []).reduce((n, [col, campo]) => n + db[col].filter(x => x[campo] === id).length, 0);
  if (usados) return alert(`Não é possível excluir: há ${usados} registro(s) vinculado(s) a este item.`);
  if (!confirm('Excluir este registro?')) return;
  const { error } = await sb.from(aba).delete().eq('id', id);
  if (error) return alert('Erro ao excluir: ' + error.message);
  db[aba] = db[aba].filter(x => x.id !== id);
  if (aba === 'aplicacoes') db.resultados = db.resultados.filter(r => r.aplicacao !== id);
  if (aba === 'usuarios') db.solicitacoes = db.solicitacoes.filter(s => s.usuario !== id);
  listar();
}

/* ---------- Usuários ---------- */
function validarUsuario(d, reg, id) {
  d.login = d.login.trim().toLowerCase();
  if (GLOBAIS.includes(d.perfil)) d.escola = null;
  if (db.usuarios.some(u => u.login.toLowerCase() === d.login && u.id !== id)) return 'Já existe um usuário com este login.';
  if (!perfisCriaveis().includes(d.perfil)) return 'Você não tem permissão para cadastrar este perfil.';
  if (id && id === sessao.id && d.perfil !== reg.perfil) return 'Você não pode alterar o seu próprio perfil.';
  if (!GLOBAIS.includes(d.perfil) && !d.escola) return 'Selecione a escola do usuário.';
}

// Cria o usuário via Edge Function (precisa de privilégio elevado para criar o login
// no Supabase Auth; o cliente comum, mesmo administrador, não pode fazer isso sozinho).
async function novoUsuario(d) {
  try {
    const { data, error } = await sb.functions.invoke('criar-usuario', { body: d });
    if (error) throw new Error(await mensagemErroFuncao(error));
    db.usuarios.push(data.usuario);
    dlg.close(); listar();
    alert(`Usuário cadastrado.\n\nLogin: ${data.usuario.login}\nSenha temporária: ${data.senhaTemporaria}\n\nInforme estes dados ao usuário. A troca da senha será exigida no primeiro acesso.`);
  } catch (e) { alert('Erro ao cadastrar usuário: ' + e.message); }
}

async function redefinirSenha(id) {
  const u = porId('usuarios', id);
  if (!u || !podeAcao('redefinirSenha') || !visiveis('usuarios').includes(u)) return;
  if (!confirm(`Gerar uma nova senha temporária para ${u.nome}?`)) return;
  try {
    const { data, error } = await sb.functions.invoke('redefinir-senha', { body: { usuarioId: id } });
    if (error) throw new Error(await mensagemErroFuncao(error));
    u.trocar_senha = true;
    db.solicitacoes.forEach(s => { if (s.usuario === id) s.atendida = true; });
    listar();
    alert(`Nova senha temporária de ${u.nome}: ${data.senhaTemporaria}\n\nInforme ao usuário. Ele deverá trocá-la no próximo acesso.`);
  } catch (e) { alert('Erro ao redefinir senha: ' + e.message); }
}

/* ---------- Gabarito oficial da prova ---------- */
function editarGabarito(id) {
  const p = porId('provas', id), gab = p?.gabarito || [];
  if (!podeAcao('editarGabarito') || !visiveis('provas').includes(p)) return;
  const descritores = p.matriz
    ? db.descritores.filter(d => d.matriz === p.matriz).sort((a, b) => numDescritor(a.codigo) - numDescritor(b.codigo))
    : [];
  const linha = i => {
    const g = gab[i] || {};
    const selResp = `<select name="q${i}"><option value="">–</option>${LETRAS.map(l => `<option ${g.resposta === l ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const selDesc = descritores.length
      ? `<select name="d${i}"><option value="">— sem descritor —</option>${descritores.map(d =>
          `<option value="${d.id}" ${g.descritor === d.id ? 'selected' : ''}>${esc(d.codigo)} — ${esc(d.descricao.length > 70 ? d.descricao.slice(0, 70) + '…' : d.descricao)}</option>`).join('')}</select>`
      : '';
    return `<div class="gab-linha"><span class="gab-n">${i + 1}</span>${selResp}${selDesc}</div>`;
  };
  form.innerHTML = `<h3>Gabarito – ${esc(p.titulo)}</h3>
    ${p.matriz ? '' : '<p class="msg">Esta prova não está vinculada a uma matriz de habilidades — edite a prova pra registrar o descritor de cada questão (opcional).</p>'}
    <div class="grade-gab-desc">${Array.from({ length: p.questoes }, (_, i) => linha(i)).join('')}</div>
    <div class="rodape-form"><button type="button" class="s" onclick="dlg.close()">Cancelar</button><button class="p" value="ok">Salvar</button></div>`;
  form.onsubmit = async ev => {
    ev.preventDefault();
    if (ev.submitter?.value !== 'ok') return;
    const fd = new FormData(form);
    const gabarito = Array.from({ length: p.questoes }, (_, i) => ({ resposta: fd.get('q' + i) || '', descritor: fd.get('d' + i) || null }));
    try {
      const { error } = await sb.from('provas').update({ gabarito }).eq('id', id);
      if (error) throw error;
      p.gabarito = gabarito;
      dlg.close(); listar();
    } catch (e) { alert('Erro ao salvar o gabarito: ' + e.message); }
  };
  dlg.className = 'largo';
  dlg.showModal();
}

/* ---------- Folha de respostas personalizada ---------- */
function abrirFolhas(id) {
  const ap = porId('aplicacoes', id);
  if (!podeAcao('abrirFolhas') || !visiveis('aplicacoes').includes(ap)) return;
  const p = porId('provas', ap.prova), turma = porId('turmas', ap.turma);
  const alunos = db.alunos.filter(a => a.turma === ap.turma).sort((a, b) => a.nome.localeCompare(b.nome));
  form.innerHTML = `<h3>Folha de respostas – ${esc(p.titulo)} (${esc(nomeTurma(turma))})</h3>
    <div class="opcoes">
      <label><input type="radio" name="modo" value="turma" checked> Uma folha para cada aluno da turma (${alunos.length})</label>
      <label><input type="radio" name="modo" value="branco"> Folha em branco (aluno preenche o nome)</label>
    </div>
    <div class="rodape-form"><button type="button" class="s" onclick="dlg.close()">Cancelar</button><button class="p" value="ok">Gerar</button></div>`;
  form.onsubmit = ev => {
    if (ev.submitter?.value !== 'ok') return;
    const modo = new FormData(form).get('modo');
    if (modo === 'turma' && !alunos.length) { ev.preventDefault(); return alert('Esta turma não tem alunos cadastrados.'); }
    mostrarFolhas(modo === 'turma' ? alunos.map(a => folhaHTML(p, turma, a, ap)) : [folhaHTML(p, turma, null, ap)]);
  };
  dlg.showModal();
}

function folhaHTML(p, turma, aluno, ap) {
  const n = p.questoes, porCol = n <= 25 ? n : n <= 50 ? Math.ceil(n / 2) : n <= 75 ? Math.ceil(n / 3) : 25;
  const cols = [];
  for (let i = 0; i < n; i += porCol) cols.push(Array.from({ length: Math.min(porCol, n - i) }, (_, j) => i + j + 1));
  const escola = porId('escolas', turma?.escola), prof = porId('usuarios', ap.professor);
  const data = ap.data ? new Date(ap.data + 'T00:00').toLocaleDateString('pt-BR') : '';
  const cod = `${ap.id}|${aluno ? aluno.id : 'BRANCO'}|${n}`;
  return `<div class="folha">
    <i class="marca m1"></i><i class="marca m2"></i><i class="marca m3"></i><i class="marca m4"></i>
    <h2>FOLHA DE RESPOSTAS</h2>
    <div class="sub">${esc(escola?.nome ?? '')}</div>
    <div class="cab">
      <div class="larg"><b>Aluno:</b> ${esc(aluno?.nome ?? '')}</div>
      <div><b>Matrícula:</b> ${esc(aluno?.matricula ?? '')}</div>
      <div><b>Turma:</b> ${esc(turma?.nome ?? '')}</div>
      <div><b>Prova:</b> ${esc(p.titulo)}</div>
      <div><b>Disciplina:</b> ${esc(p.disciplina ?? '')}</div>
      <div><b>Professor(a):</b> ${esc(prof?.nome ?? '')}</div>
      <div><b>Data:</b> ${esc(data)}</div>
    </div>
    <div class="instr"><b>Instruções:</b> use caneta esferográfica azul ou preta. Preencha completamente o círculo da alternativa escolhida,
      sem ultrapassar o contorno. Marque apenas uma alternativa por questão. Não rasure nem dobre esta folha.</div>
    <div class="questoes">${cols.map(c => `<div class="col">${c.map(q =>
      `<div class="q"><span class="n">${q}</span>${LETRAS.map(l => `<span class="bol">${l}</span>`).join('')}</div>`).join('')}</div>`).join('')}</div>
    <div class="id">Código da folha: ${esc(cod)}</div>
  </div>`;
}

function mostrarFolhas(lista) {
  dlg.close();
  document.getElementById('folhas').innerHTML = lista.join('');
  document.body.classList.add('previa');
  const barra = document.createElement('div');
  barra.className = 'barra-previa';
  barra.innerHTML = `<button class="p" id="bimp">Imprimir / Salvar PDF</button><button class="s" id="bfec">Fechar</button>`;
  document.body.appendChild(barra);
  barra.querySelector('#bimp').onclick = () => window.print();
  barra.querySelector('#bfec').onclick = () => { barra.remove(); document.body.classList.remove('previa'); document.getElementById('folhas').innerHTML = ''; };
}

/* ---------- Leitura óptica (OMR) ---------- */
// Posições (em mm) dos marcadores e das bolhas, medidas no próprio layout da folha.
function medirFolha(p, turma, ap) {
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;left:-9999px;top:0';
  box.innerHTML = folhaHTML(p, turma, null, ap);
  document.body.appendChild(box);
  const f = box.firstElementChild, r0 = f.getBoundingClientRect(), k = 210 / r0.width;
  const centro = el => { const r = el.getBoundingClientRect(); return [(r.left + r.width / 2 - r0.left) * k, (r.top + r.height / 2 - r0.top) * k]; };
  const marcas = [...f.querySelectorAll('.marca')].map(centro); // TL, TR, BL, BR
  const bolhas = [...f.querySelectorAll('.q')].map(q => [...q.querySelectorAll('.bol')].map(centro));
  box.remove();
  return { marcas, bolhas };
}

function carregarImagem(file) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error('Não foi possível abrir a imagem.'));
    img.src = URL.createObjectURL(file);
  });
}

// Reduz a imagem e binariza com limiar adaptativo (tolera sombras e iluminação irregular).
function binarizar(img, maxLado = 1600) {
  const s = Math.min(1, maxLado / Math.max(img.width, img.height));
  const W = Math.round(img.width * s), H = Math.round(img.height * s);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, W, H);
  const d = cx.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  const S = W + 1, I = new Float64Array(S * (H + 1));
  for (let y = 0; y < H; y++) {
    let linha = 0;
    for (let x = 0; x < W; x++) { linha += g[y * W + x]; I[(y + 1) * S + x + 1] = I[y * S + x + 1] + linha; }
  }
  const r = Math.round(Math.max(W, H) / 24), b = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      const media = (I[y1 * S + x1] - I[y0 * S + x1] - I[y1 * S + x0] + I[y0 * S + x0]) / ((x1 - x0) * (y1 - y0));
      b[y * W + x] = g[y * W + x] < media * 0.78 ? 1 : 0;
    }
  }
  return { W, H, b, cv };
}

// Blocos escuros e quadrados (candidatos a marcador de canto).
function acharQuadrados(b, W, H) {
  const vis = new Uint8Array(W * H), pilha = new Int32Array(W * H), cand = [], lim = Math.max(W, H) * 0.12;
  for (let i = 0; i < W * H; i++) {
    if (!b[i] || vis[i]) continue;
    let topo = 0, area = 0, x0 = W, x1 = 0, y0 = H, y1 = 0, sx = 0, sy = 0;
    pilha[topo++] = i; vis[i] = 1;
    while (topo) {
      const p = pilha[--topo], x = p % W, y = (p - x) / W;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && b[p - 1] && !vis[p - 1]) { vis[p - 1] = 1; pilha[topo++] = p - 1; }
      if (x < W - 1 && b[p + 1] && !vis[p + 1]) { vis[p + 1] = 1; pilha[topo++] = p + 1; }
      if (y > 0 && b[p - W] && !vis[p - W]) { vis[p - W] = 1; pilha[topo++] = p - W; }
      if (y < H - 1 && b[p + W] && !vis[p + W]) { vis[p + W] = 1; pilha[topo++] = p + W; }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w >= 10 && h >= 10 && w <= lim && h <= lim && w / h > 0.7 && w / h < 1.43 && area / (w * h) > 0.75)
      cand.push({ x: sx / area, y: sy / area, area });
  }
  return cand;
}

// Transformação projetiva (mm da folha -> pixels da imagem) a partir de 4 pontos.
function homografia(src, dst) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  const n = 8;
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]]; [B[i], B[m]] = [B[m], B[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      B[r] -= f * B[i];
    }
  }
  const h = Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = B[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * h[c];
    h[i] = s / A[i][i];
  }
  return (x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
}

function fracaoEscura(b, W, H, cx, cy, r) {
  let t = 0, d = 0;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { t++; d += b[y * W + x]; }
  return t ? d / t : 0;
}

// Devolve as respostas ('' = em branco, '*' = mais de uma marcada) e a imagem com a leitura desenhada.
async function lerFolha(file, p, turma, ap) {
  const img = await carregarImagem(file);
  const { W, H, b, cv } = binarizar(img);
  const geo = medirFolha(p, turma, ap), cand = acharQuadrados(b, W, H);
  const cantos = [[1, 1], [0, 1], [1, 0], [0, 0]].map(([esq, topo]) =>
    cand.filter(o => (o.x < W / 2) === !!esq && (o.y < H / 2) === !!topo).sort((a, c) => c.area - a.area)[0]);
  if (cantos.some(c => !c)) throw new Error('Não encontrei os 4 marcadores pretos dos cantos. Fotografe a folha inteira, de cima, com boa luz e sem cortar os cantos.');
  const areas = cantos.map(c => c.area);
  if (Math.max(...areas) > 2.5 * Math.min(...areas)) throw new Error('Os marcadores dos cantos não foram reconhecidos direito. Tente outra foto, com a folha plana e bem iluminada.');
  const dst = cantos.map(c => [c.x, c.y]), proj = homografia(geo.marcas, dst);
  const escala = Math.hypot(dst[1][0] - dst[0][0], dst[1][1] - dst[0][1]) / Math.hypot(geo.marcas[1][0] - geo.marcas[0][0], geo.marcas[1][1] - geo.marcas[0][1]);
  const raio = 2.3 * escala, cx = cv.getContext('2d');
  cx.lineWidth = Math.max(2, escala / 4);
  const respostas = geo.bolhas.map(linha => {
    const pts = linha.map(([x, y]) => proj(x, y));
    // Marca forte (preenchimento bem escuro) OU marca clara mas nitidamente mais escura
    // que as demais bolhas da mesma questão – tolera luz irregular na foto, sombra e
    // caneta mais fraca, que antes faziam uma marca real ser lida como "em branco".
    const fr = pts.map(([x, y]) => fracaoEscura(b, W, H, x, y, raio));
    const base = Math.min(...fr);
    const marc = fr.map(v => v >= 0.45 || (v >= 0.25 && v - base >= 0.18));
    pts.forEach(([x, y], j) => { cx.strokeStyle = marc[j] ? '#00a651' : 'rgba(255,0,0,.45)'; cx.beginPath(); cx.arc(x, y, raio, 0, 7); cx.stroke(); });
    const n = marc.filter(Boolean).length;
    return n === 1 ? LETRAS[marc.indexOf(true)] : n > 1 ? '*' : '';
  });
  return { respostas, canvas: cv };
}

/* ---------- Correção e resultados ---------- */
function pontuar(p, resp) {
  const gab = p.gabarito || [];
  const total = gab.filter(g => g?.resposta).length;
  const acertos = gab.reduce((n, g, i) => n + (g?.resposta && resp[i] === g.resposta ? 1 : 0), 0);
  return { total, acertos };
}
const pctDe = (a, t) => t ? Math.round(a / t * 100) + '%' : '—';
dlg.addEventListener('close', () => { dlg.className = ''; });

function corrigir(id) {
  const ap = porId('aplicacoes', id);
  if (!podeAcao('corrigir') || !visiveis('aplicacoes').includes(ap)) return;
  const p = porId('provas', ap.prova), turma = porId('turmas', ap.turma);
  const alunos = db.alunos.filter(a => a.turma === ap.turma).sort((a, b) => a.nome.localeCompare(b.nome));
  if (!alunos.length) return alert('Esta turma não tem alunos cadastrados.');
  if (!(p.gabarito || []).some(g => g?.resposta)) return alert('Preencha o gabarito da prova antes de corrigir (no Banco de provas, botão "Gabarito").');
  let resp = Array(p.questoes).fill('');
  const feito = a => db.resultados.some(r => r.aplicacao === id && r.aluno === a.id);
  form.innerHTML = `<h3>Corrigir – ${esc(p.titulo)} (${esc(nomeTurma(turma))})</h3>
    <label>Aluno *</label>
    <select name="aluno" required><option value="">— selecione —</option>${alunos.map(a => `<option value="${a.id}">${esc(a.nome)} (${esc(a.matricula)})${feito(a) ? ' ✓ já corrigido' : ''}</option>`).join('')}</select>
    <label>Foto ou scan da folha preenchida (opcional – você também pode marcar as respostas manualmente)</label>
    <input type="file" name="foto" accept="image/*">
    <div class="msg" id="cor-msg"></div>
    <div id="cor-img"></div>
    <div class="grade-cor" id="cor-grade"></div>
    <div class="nota" id="cor-nota"></div>
    <div class="rodape-form"><button type="button" class="s" onclick="dlg.close()">Cancelar</button><button class="p" value="ok">Salvar resultado</button></div>`;
  const grade = form.querySelector('#cor-grade'), msg = form.querySelector('#cor-msg');
  grade.innerHTML = resp.map((_, i) => `<div class="qc" data-i="${i}"><span>${i + 1}</span><select data-i="${i}"><option value="">–</option>${LETRAS.map(l => `<option>${l}</option>`).join('')}<option value="*">múltipla</option></select><i></i></div>`).join('');
  const pintar = () => {
    grade.querySelectorAll('.qc').forEach((el, i) => {
      const g = (p.gabarito || [])[i]?.resposta, v = resp[i];
      el.querySelector('select').value = v;
      el.className = 'qc' + (!g ? ' sem' : v === g ? ' ok' : ' erro') + (v === '' || v === '*' ? ' duv' : '');
      el.querySelector('i').textContent = !g ? '' : v === g ? '✓' : '✗';
    });
    const s = pontuar(p, resp);
    form.querySelector('#cor-nota').innerHTML = `Acertos: <b>${s.acertos}/${s.total}</b> &nbsp; Aproveitamento: <b>${pctDe(s.acertos, s.total)}</b>`;
  };
  grade.onchange = e => { resp[+e.target.dataset.i] = e.target.value; pintar(); };
  form.querySelector('[name=foto]').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    msg.className = 'msg'; msg.textContent = 'Lendo a folha…';
    try {
      const r = await lerFolha(f, p, turma, ap);
      resp = r.respostas; pintar();
      const duv = resp.filter(v => v === '' || v === '*').length;
      msg.textContent = `Leitura concluída. ${duv ? duv + ' questão(ões) em branco ou com mais de uma marca (destacadas em amarelo) – confira. ' : ''}Compare com a imagem abaixo e corrija o que for preciso.`;
      const box = form.querySelector('#cor-img'); box.innerHTML = ''; r.canvas.className = 'prev'; box.appendChild(r.canvas);
    } catch (err) { msg.className = 'msg erro'; msg.textContent = err.message; }
  };
  form.onsubmit = async ev => {
    ev.preventDefault();
    if (ev.submitter?.value !== 'ok') return;
    const aluno = new FormData(form).get('aluno'), s = pontuar(p, resp);
    if (!aluno) return;
    if (feito({ id: aluno }) && !confirm('Este aluno já tem resultado nesta prova. Substituir?')) return;
    try {
      const existente = db.resultados.find(r => r.aplicacao === id && r.aluno === aluno);
      const linha = { aplicacao: id, aluno, respostas: resp, ...s };
      if (existente) {
        const { error } = await sb.from('resultados').update(linha).eq('id', existente.id);
        if (error) throw error;
        Object.assign(existente, linha);
      } else {
        const { data, error } = await sb.from('resultados').insert(linha).select().single();
        if (error) throw error;
        db.resultados.push(data);
      }
      dlg.close(); listar();
    } catch (e) { alert('Erro ao salvar resultado: ' + e.message); }
  };
  pintar();
  dlg.className = 'largo';
  dlg.showModal();
}

function resultados(id) {
  const ap = porId('aplicacoes', id);
  if (!podeAcao('resultados') || !visiveis('aplicacoes').includes(ap)) return;
  const p = porId('provas', ap.prova), turma = porId('turmas', ap.turma);
  const alunos = db.alunos.filter(a => a.turma === ap.turma).sort((a, b) => a.nome.localeCompare(b.nome));
  const res = a => db.resultados.find(r => r.aplicacao === id && r.aluno === a.id);
  const feitos = alunos.map(res).filter(Boolean);
  form.onsubmit = null;
  form.innerHTML = `<h3>Resultados – ${esc(p.titulo)} (${esc(nomeTurma(turma))})</h3>
    <table><thead><tr><th>Matrícula</th><th>Aluno</th><th>Acertos</th><th>% de acertos</th><th></th></tr></thead><tbody>
    ${alunos.map(a => { const r = res(a); return `<tr><td>${esc(a.matricula)}</td><td>${esc(a.nome)}</td>
      <td>${r ? `${r.acertos}/${r.total}` : '—'}</td><td>${r ? pctDe(r.acertos, r.total) : '—'}</td>
      <td class="acoes">${r ? `<button type="button" class="s perigo" onclick="apagarResultado('${r.id}','${id}')">Remover</button>` : ''}</td></tr>`; }).join('')}
    </tbody></table>
    <p>Corrigidos: <b>${feitos.length}/${alunos.length}</b></p>
    <div class="rodape-form"><button type="button" class="s" onclick="exportarCSV('${id}')">Exportar CSV</button><button class="p" value="ok">Fechar</button></div>`;
  dlg.className = 'largo';
  if (!dlg.open) dlg.showModal();
}

async function apagarResultado(rid, pid) {
  if (!confirm('Remover este resultado?')) return;
  const { error } = await sb.from('resultados').delete().eq('id', rid);
  if (error) return alert('Erro ao remover: ' + error.message);
  db.resultados = db.resultados.filter(r => r.id !== rid);
  resultados(pid);
}

function exportarCSV(id) {
  const ap = porId('aplicacoes', id), p = porId('provas', ap.prova), turma = porId('turmas', ap.turma);
  const linhas = [['Matrícula', 'Aluno', 'Acertos', 'Total', '% acertos', ...Array.from({ length: p.questoes }, (_, i) => 'Q' + (i + 1))]];
  db.alunos.filter(a => a.turma === ap.turma).sort((a, b) => a.nome.localeCompare(b.nome)).forEach(a => {
    const r = db.resultados.find(x => x.aplicacao === id && x.aluno === a.id);
    linhas.push([a.matricula, a.nome, r?.acertos ?? '', r?.total ?? '', r ? pctDe(r.acertos, r.total) : '', ...(r ? r.respostas : [])]);
  });
  const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `resultados-${p.titulo.replace(/\W+/g, '_')}-${turma.nome.replace(/\W+/g, '_')}.csv`;
  a.click();
}

document.addEventListener('DOMContentLoaded', () => iniciar());
