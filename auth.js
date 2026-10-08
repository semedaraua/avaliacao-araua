'use strict';

/* ---------- Senhas temporárias (a senha em si é gerenciada pelo Supabase Auth) ---------- */
function senhaTemporaria() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint32Array(8))].map(n => alfabeto[n % alfabeto.length]).join('');
}

/* ---------- Sessão / inicialização ---------- */
async function buscarUsuarioPorAuthId(authId) {
  const { data, error } = await sb.from('usuarios').select('*').eq('auth_id', authId).maybeSingle();
  if (error) throw error;
  return data;
}

async function iniciar() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      const u = await buscarUsuarioPorAuthId(session.user.id);
      if (u && u.trocar_senha) return telaLogin('trocar', u.id);
      if (u) return entrar(u);
      await sb.auth.signOut(); // sessão órfã (sem linha correspondente em "usuarios")
    }
  } catch (e) { /* segue para a tela de login */ }
  telaLogin('entrar');
}

/* ---------- Tela de login ---------- */
const LOGO = `<img class="logo" src="brasao.png" alt="Brasão da Secretaria Municipal de Educação de Arauá">`;

let falhas = 0, bloqueadoAte = 0;

function telaLogin(modo = 'entrar', uid = null) {
  document.body.classList.add('deslogado');
  sessao = null;
  const el = document.getElementById('login');
  const lado = `<div class="login-lado">${LOGO}
    <h1>Secretaria Municipal de Educação de Arauá</h1><div class="linha"></div>
    <p>Sistema de Gestão de Avaliações</p></div>`;
  const campoSenha = (nome, rotulo, auto) => `<label>${rotulo}</label><div class="campo-senha"><input name="${nome}" type="password" autocomplete="${auto}" required>
    <button type="button" data-ver>mostrar</button></div>`;
  let caixa;
  if (modo === 'entrar') caixa = `<form class="login-form" id="lf">
      <h2>Bem-vindo(a)</h2><p class="dica">Acesse com seu usuário e senha.</p>
      <label>Usuário</label><input name="login" autocomplete="username" autofocus required>
      ${campoSenha('senha', 'Senha', 'current-password')}
      <button class="entrar" type="submit">Entrar</button>
      <button class="link" type="button" id="esqueci">Esqueceu a senha?</button>
      <div id="msg"></div>
    </form>`;
  else if (modo === 'esqueci') caixa = `<form class="login-form" id="lf">
      <h2>Recuperar acesso</h2><p class="dica">Informe seu usuário ou e-mail. A solicitação será enviada ao administrador ou ao responsável pelo seu cadastro, que informará uma senha temporária.</p>
      <label>Usuário ou e-mail</label><input name="id" autofocus required>
      <button class="entrar" type="submit">Solicitar redefinição</button>
      <button class="link" type="button" id="voltar">Voltar ao login</button>
      <div id="msg"></div></form>`;
  else caixa = `<form class="login-form" id="lf">
      <h2>Crie uma nova senha</h2><p class="dica">Por segurança, defina uma senha pessoal para continuar (mínimo de 6 caracteres).</p>
      ${campoSenha('nova', 'Nova senha', 'new-password')}
      ${campoSenha('conf', 'Confirmar nova senha', 'new-password')}
      <button class="entrar" type="submit">Salvar e entrar</button>
      <button class="link" type="button" id="voltar">Cancelar</button>
      <div id="msg"></div></form>`;
  el.innerHTML = lado + `<div class="login-caixa">${caixa}</div>`;

  const f = el.querySelector('#lf'), msg = el.querySelector('#msg'), btn = f.querySelector('.entrar');
  const aviso = (t, ok) => { msg.className = ok ? 'ok' : 'erro'; msg.textContent = t; };
  f.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => {
    const i = b.previousElementSibling, ver = i.type === 'password';
    i.type = ver ? 'text' : 'password'; b.textContent = ver ? 'ocultar' : 'mostrar';
  });
  el.querySelector('#esqueci')?.addEventListener('click', () => telaLogin('esqueci'));
  el.querySelector('#voltar')?.addEventListener('click', () => telaLogin('entrar'));

  f.onsubmit = async ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    btn.disabled = true;
    try {
      if (modo === 'entrar') {
        if (Date.now() < bloqueadoAte) return aviso(`Muitas tentativas. Aguarde ${Math.ceil((bloqueadoAte - Date.now()) / 1000)} s.`);
        const login = d.login.trim().toLowerCase();
        const { data: email } = await sb.rpc('email_do_login', { login_param: login });
        const { data: signIn, error } = email
          ? await sb.auth.signInWithPassword({ email, password: d.senha })
          : { data: null, error: true };
        if (!signIn || error) {
          if (++falhas >= 5) { bloqueadoAte = Date.now() + 30000; falhas = 0; }
          return aviso('Usuário ou senha inválidos.');
        }
        falhas = 0;
        const u = await buscarUsuarioPorAuthId(signIn.user.id);
        if (!u) { await sb.auth.signOut(); return aviso('Usuário sem cadastro no sistema. Contate o administrador.'); }
        if (u.trocar_senha) return telaLogin('trocar', u.id);
        entrar(u);
      } else if (modo === 'esqueci') {
        await sb.rpc('solicitar_redefinicao', { login_ou_email: d.id.trim() });
        aviso('Solicitação registrada. Procure o administrador ou o responsável pelo seu cadastro para receber a senha temporária.', true);
      } else {
        if (d.nova.length < 6) return aviso('A senha deve ter pelo menos 6 caracteres.');
        if (d.nova !== d.conf) return aviso('As senhas não conferem.');
        const { error: erroSenha } = await sb.auth.updateUser({ password: d.nova });
        if (erroSenha) return aviso('Não foi possível alterar a senha: ' + erroSenha.message);
        const { error: erroUsuario } = await sb.rpc('concluir_troca_senha');
        if (erroUsuario) return aviso('Senha alterada, mas houve um erro ao atualizar o cadastro: ' + erroUsuario.message);
        const { data: { user } } = await sb.auth.getUser();
        entrar(await buscarUsuarioPorAuthId(user.id));
      }
    } catch (e) {
      aviso('Erro: ' + e.message);
    } finally { btn.disabled = false; }
  };
}

/* ---------- Sessão ---------- */
async function entrar(u) {
  sessao = u;
  try {
    await carregarDados();
  } catch (e) {
    alert('Não foi possível carregar os dados do sistema: ' + e.message);
    return sair();
  }
  document.body.classList.remove('deslogado');
  document.getElementById('usuario').innerHTML = `<div><b>${esc(u.nome)}</b><span>${PERFIS[u.perfil]}${u.escola ? ' · ' + esc(porId('escolas', u.escola)?.nome ?? '') : ''}</span></div>
    <button onclick="alterarSenha()">Alterar senha</button><button onclick="sair()">Sair</button>`;
  aba = abasVisiveis().includes('dashboard') ? 'dashboard' : abasVisiveis()[0];
  menu(); listar();
}
async function sair() {
  await sb.auth.signOut();
  db = { escolas: [], usuarios: [], turmas: [], alunos: [], matrizes: [], descritores: [], provas: [], aplicacoes: [], resultados: [], solicitacoes: [] };
  document.getElementById('conteudo').innerHTML = '';
  telaLogin('entrar');
}

function alterarSenha() {
  form.innerHTML = `<h3>Alterar minha senha</h3>
    <label>Senha atual</label><input type="password" name="atual" autocomplete="current-password">
    <label>Nova senha (mínimo 6 caracteres)</label><input type="password" name="nova" autocomplete="new-password">
    <label>Confirmar nova senha</label><input type="password" name="conf" autocomplete="new-password">
    <div class="msg erro" id="msgsenha"></div>
    <div class="rodape-form"><button type="button" class="s" onclick="dlg.close()">Cancelar</button><button class="p" type="submit">Salvar</button></div>`;
  form.onsubmit = async ev => {
    ev.preventDefault(); // mantém a janela aberta até validar
    const d = Object.fromEntries(new FormData(form)), erro = t => { form.querySelector('#msgsenha').textContent = t; };
    if (d.nova.length < 6) return erro('A nova senha deve ter pelo menos 6 caracteres.');
    if (d.nova !== d.conf) return erro('As senhas não conferem.');
    try {
      const { data: email } = await sb.rpc('email_do_login', { login_param: sessao.login });
      const { error: erroAtual } = await sb.auth.signInWithPassword({ email, password: d.atual });
      if (erroAtual) return erro('Senha atual incorreta.');
      const { error } = await sb.auth.updateUser({ password: d.nova });
      if (error) return erro('Não foi possível alterar a senha: ' + error.message);
      dlg.close(); alert('Senha alterada com sucesso.');
    } catch (e) { erro('Erro: ' + e.message); }
  };
  dlg.showModal();
}
