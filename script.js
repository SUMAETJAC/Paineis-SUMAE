const SUPABASE_URL  = "https://dykbwbogktwhhjltndyr.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5a2J3Ym9na3R3aGhqbHRuZHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjM5MTEsImV4cCI6MjA5NDA5OTkxMX0.ms1UP9L480iP7dZ8fRAwro_lsffDUcRSo6mqwGV5bgY";

const dbVault = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

function hexToBytes(hex) {
  if (!hex) return new Uint8Array(0);
  if (typeof hex !== "string") {
    throw new Error("Bytea invalido: formato inesperado.");
  }
  const h = hex.startsWith("\\x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) {
    throw new Error("Bytea invalido: hexadecimal malformado.");
  }
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.substr(i * 2, 2), 16);
  }
  return out;
}

async function derivarChaveMestra(senha, salt, iteracoes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(senha),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iteracoes, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function descriptografarCampo(chave, ciphertext, iv) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    chave,
    ciphertext
  );
  return new TextDecoder().decode(pt);
}

async function buscarCredenciais(email, senha) {
  if (!dbVault) {
    throw new Error("Cliente Supabase indisponivel. Verifique a conexao com o CDN.");
  }

  const { data: sessao, error: erroLogin } = await dbVault.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (erroLogin) {
    throw new Error("Falha no login: " + erroLogin.message);
  }

  const userId = sessao.user.id;

  const { data: perfil, error: erroPerfil } = await dbVault
 .from("credentials")
.select("id, category, service_name, service_url, username_ciphertext, username_iv, password_ciphertext, password_iv, notes_ciphertext, notes_iv")
.eq("user_id", userId)
.order("service_name", { ascending: true });

  if (erroPerfil || !perfil?.kdf_salt) {
    throw new Error("Perfil sem salt — verifique se o usuário existe no Cofre.");
  }

  const chave = await derivarChaveMestra(
    senha,
    hexToBytes(perfil.kdf_salt),
    perfil.kdf_iterations
  );

  const { data: linhas, error: erroBanco } = await dbVault
    .from("credentials")
    .select("*")
    .order("service_name", { ascending: true });

  if (erroBanco) {
    throw new Error("Erro ao buscar credenciais: " + erroBanco.message);
  }

  const resultado = [];
  for (const linha of linhas) {
    try {
      const usuario = await descriptografarCampo(
        chave,
        hexToBytes(linha.username_ciphertext),
        hexToBytes(linha.username_iv)
      );
      const senha_decifrada = await descriptografarCampo(
        chave,
        hexToBytes(linha.password_ciphertext),
        hexToBytes(linha.password_iv)
      );
      let notas = "";
      if (linha.notes_ciphertext && linha.notes_iv) {
        notas = await descriptografarCampo(
          chave,
          hexToBytes(linha.notes_ciphertext),
          hexToBytes(linha.notes_iv)
        );
      }
      resultado.push({
        id:        linha.id,
        categoria: linha.category,
        servico:   linha.service_name,
        url:       linha.service_url,
        usuario,
        senha:     senha_decifrada,
        notas,
      });
    } catch {
      console.warn("[Cofre] Não foi possível descriptografar a linha:", linha.id);
    }
  }

  return resultado;
}

let credenciaisCache = new Map();
const TEMPO_INATIVIDADE_MS = 5 * 60 * 1000;
let timerInatividade = null;
const revelarTimers  = new Map();

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function categoriaBadge(cat) {
  const mapa = {
    'pessoal':       'cofre-badge--pessoal',
    'sistemas tjac': 'cofre-badge--sistemas-tjac',
    'sumae':         'cofre-badge--sumae',
  };
  return mapa[(cat || '').toLowerCase()] ?? 'cofre-badge--outros';
}

function domIdSeguro(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function escAttr(str) {
  return esc(str).replace(/'/g, '&#39;');
}

function normalizarUrlSegura(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function resetarTimerInatividade() {
  if (credenciaisCache.size === 0) return;
  clearTimeout(timerInatividade);
  timerInatividade = setTimeout(() => bloquearCofrePorInatividade(), TEMPO_INATIVIDADE_MS);
}

['mousemove', 'keydown', 'click', 'touchstart'].forEach(evento => {
  document.addEventListener(evento, resetarTimerInatividade, { passive: true });
});

function cardHTML(c) {
  const idReal = String(c.id);
  const idDom = domIdSeguro(idReal);
  const idArg = escAttr(JSON.stringify(idReal));
  let urlLink;
  const urlSegura = normalizarUrlSegura(c.url);
  if (urlSegura) {
    const url = urlSegura.href;
    urlLink = `<a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer" class="cofre-valor cofre-url" title="${escAttr(url)}">${esc(urlSegura.hostname)}</a>`;
  } else if (c.url) {
    urlLink = `<span class="cofre-valor cofre-vazio" title="URL bloqueada por seguranca">URL invalida</span>`;
  } else {
    urlLink = `<span class="cofre-valor cofre-vazio">—</span>`;
  }

  const notasHTML = c.notas
    ? `<div class="cofre-linha">
         <span class="cofre-label"><i class="fa-solid fa-note-sticky"></i> Notas</span>
         <span class="cofre-valor cofre-notas-valor">${esc(c.notas)}</span>
       </div>`
    : '';

  return `
    <div class="cofre-card">
      <div class="cofre-card-topo">
        <span class="cofre-badge ${categoriaBadge(c.categoria)}">${esc(c.categoria)}</span>
        <h3 class="cofre-card-titulo">${esc(c.servico)}</h3>
      </div>
      <div class="cofre-card-corpo">
        <div class="cofre-linha">
          <span class="cofre-label"><i class="fa-solid fa-link"></i> URL</span>
          ${urlLink}
        </div>
        <div class="cofre-linha">
          <span class="cofre-label"><i class="fa-solid fa-user"></i> Usuário</span>
          <span class="cofre-valor">${esc(c.usuario)}</span>
        </div>
        <div class="cofre-linha cofre-linha-senha">
          <span class="cofre-label"><i class="fa-solid fa-key"></i> Senha</span>
          <div class="cofre-senha-row">
            <span class="cofre-senha-mask" id="pwd-${idDom}">••••••••</span>
            <button class="cofre-action-btn" id="btn-rev-${idDom}"
                    onclick="revelarSenha(${idArg})" title="Revelar por 15 s">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="cofre-action-btn" id="btn-cpy-${idDom}"
                    onclick="copiarSenha(${idArg})" title="Copiar (apaga em 30 s)">
              <i class="fa-solid fa-copy"></i>
            </button>
          </div>
        </div>
        ${notasHTML}
      </div>
    </div>`;
}

function renderizarCofre(credenciais) {
  const container = document.getElementById('cofre-credenciais');
  container.innerHTML = '';

  if (credenciais.length === 0) {
    container.innerHTML = '<p style="text-align:center;padding:2rem;color:#94a3b8;">Nenhuma credencial encontrada.</p>';
    return;
  }

  const grupos = new Map();
  for (const c of credenciais) {
    const lista = grupos.get(c.categoria) ?? [];
    lista.push(c);
    grupos.set(c.categoria, lista);
  }

  for (const [cat, lista] of grupos) {
    const div = document.createElement('div');
    div.className = 'cofre-grupo';
    const n = lista.length;
    div.innerHTML = `
      <div class="cofre-grupo-header">
        <span class="cofre-grupo-titulo">${esc(cat)}</span>
        <span class="cofre-grupo-count">${n} ${n === 1 ? 'item' : 'itens'}</span>
      </div>
      <div class="cofre-cards-grid">${lista.map(cardHTML).join('')}</div>`;
    container.appendChild(div);
  }
}

async function abrirCofre(e) {
  e.preventDefault();
  const email     = document.getElementById('cofre-email').value.trim();
  const senha     = document.getElementById('cofre-senha-mestra').value;
  const btnSubmit = document.getElementById('cofre-btn-submit');
  const erroEl    = document.getElementById('cofre-erro-msg');

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Desbloqueando…';
  erroEl.textContent = '';

  try {
    const credenciais = await buscarCredenciais(email, senha);

    credenciaisCache.clear();
    credenciais.forEach(c => credenciaisCache.set(String(c.id), c));

    const n = credenciais.length;
    document.getElementById('cofre-info').textContent =
      `${n} credencial${n !== 1 ? 'is' : ''} • ${email}`;

    renderizarCofre(credenciais);

    document.getElementById('cofre-bloqueado').style.display = 'none';
    document.getElementById('cofre-aberto').style.display    = '';
    document.getElementById('cofre-senha-mestra').value = '';
    resetarTimerInatividade();
  } catch (err) {
    erroEl.textContent = err.message || 'Erro ao desbloquear.';
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<i class="fa-solid fa-unlock-keyhole"></i> Desbloquear';
  }
}

async function bloquearCofre() {
  revelarTimers.forEach(t => clearTimeout(t));
  revelarTimers.clear();
  clearTimeout(timerInatividade);
  timerInatividade = null;
  credenciaisCache.clear();
  await dbVault.auth.signOut().catch(() => {});

  document.getElementById('cofre-credenciais').innerHTML = '';
  document.getElementById('cofre-aberto').style.display    = 'none';
  document.getElementById('cofre-bloqueado').style.display = '';
  document.getElementById('formCofre').reset();
  document.getElementById('cofre-erro-msg').textContent = '';
}

async function bloquearCofrePorInatividade() {
  revelarTimers.forEach(t => clearTimeout(t));
  revelarTimers.clear();
  clearTimeout(timerInatividade);
  timerInatividade = null;

  document.querySelectorAll('.cofre-senha-mask').forEach(display => {
    display.textContent = '••••••••';
    display.dataset.revealed = 'false';
  });
  document.querySelectorAll('[id^="btn-rev-"]').forEach(btn => {
    btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
  });

  credenciaisCache.clear();
  await dbVault.auth.signOut().catch(() => {});
}

function revelarSenha(id) {
  const idReal  = String(id);
  const idDom   = domIdSeguro(idReal);
  const display = document.getElementById(`pwd-${idDom}`);
  const btnRev  = document.getElementById(`btn-rev-${idDom}`);
  const cred    = credenciaisCache.get(idReal);
  if (!cred || !display || !btnRev) return;
  resetarTimerInatividade();

  const estaRevelado = display.dataset.revealed === 'true';

  if (estaRevelado) {
    display.textContent = '••••••••';
    display.dataset.revealed = 'false';
    btnRev.innerHTML = '<i class="fa-solid fa-eye"></i>';
    clearTimeout(revelarTimers.get(idReal));
    revelarTimers.delete(idReal);
  } else {
    display.textContent = cred.senha;
    display.dataset.revealed = 'true';
    btnRev.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    clearTimeout(revelarTimers.get(idReal));
    const t = setTimeout(() => {
      display.textContent = '••••••••';
      display.dataset.revealed = 'false';
      btnRev.innerHTML = '<i class="fa-solid fa-eye"></i>';
      revelarTimers.delete(idReal);
    }, 15_000);
    revelarTimers.set(idReal, t);
  }
}

async function copiarSenha(id) {
  const idReal = String(id);
  const idDom  = domIdSeguro(idReal);
  const btnCpy = document.getElementById(`btn-cpy-${idDom}`);
  const cred   = credenciaisCache.get(idReal);
  if (!cred || !btnCpy) return;
  resetarTimerInatividade();

  try {
    await navigator.clipboard.writeText(cred.senha);
    btnCpy.innerHTML = '<i class="fa-solid fa-check"></i>';
    btnCpy.classList.add('cofre-action-btn--copied');
    setTimeout(() => {
      btnCpy.innerHTML = '<i class="fa-solid fa-copy"></i>';
      btnCpy.classList.remove('cofre-action-btn--copied');
    }, 2_000);
    setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30_000);
  } catch {
    btnCpy.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    setTimeout(() => { btnCpy.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 2_000);
  }
}

// Alterna as abas principais (Painéis, Ferramentas, Agenda, Anotações)
function openTab(evt, tabName) {
  let i, tabcontent, tablink;
  
  // Esconde todo o conteúdo das abas
  tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }
  
  // Remove a classe "active" de todos os botões principais
  tablink = document.getElementsByClassName("tablink");
  for (i = 0; i < tablink.length; i++) {
    tablink[i].classList.remove("active");
  }
  
  // Mostra a aba atual e adiciona a classe "active" ao botão clicado
  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.classList.add("active");
}

// Filtro de pesquisa para os Painéis e Ferramentas
function filterCards() {
  let input = document.getElementById("searchInput").value.toLowerCase();
  let cards = document.querySelectorAll(".card");
  
  cards.forEach(card => {
    let text = card.innerText.toLowerCase();
    if (text.includes(input)) {
      card.style.display = "block"; // ou "" (vazio) como estava no original
    } else {
      card.style.display = "none";
    }
  });
}

// Alterna as sub-abas da secção Agenda
function switchAgenda(agendaId, btn) {
  // Esconde todos os calendários da agenda
  document.querySelectorAll('#agenda .calendar-container').forEach(el => el.classList.remove('active'));
  
  // Remove o estado ativo dos botões da agenda
  document.querySelectorAll('#agenda .btn-agenda').forEach(el => el.classList.remove('active'));
  
  // Ativa o calendário escolhido e o botão correspondente
  document.getElementById(agendaId).classList.add('active');
  btn.classList.add('active');
}

// Alterna as sub-abas da secção Anotações
function switchAnotacao(anotacaoId, btn) {
  // Esconde todas as áreas de anotação
  document.querySelectorAll('#anotacoes .calendar-container').forEach(el => el.classList.remove('active'));
  
  // Remove o estado ativo dos botões de anotações
  document.querySelectorAll('#anotacoes .btn-agenda').forEach(el => el.classList.remove('active'));
  
  // Ativa a área de anotação escolhida e o botão correspondente
  document.getElementById(anotacaoId).classList.add('active');
  btn.classList.add('active');
}

// Lógica para as Anotações Locais (Salva no navegador do utilizador)
document.addEventListener("DOMContentLoaded", function() {
  const campoAnotacao = document.getElementById("textoAnotacoes");
  // Quando a página carrega, verifica se há algo salvo no LocalStorage e preenche a caixa
  if (campoAnotacao) {
    campoAnotacao.value = localStorage.getItem("minhas_anotacoes") || "";
  }
});

function salvarAnotacaoLocal() {
  const campoAnotacao = document.getElementById("textoAnotacoes");
  if (campoAnotacao) {
    // Guarda o texto digitado no LocalStorage do navegador
    localStorage.setItem("minhas_anotacoes", campoAnotacao.value);
    alert("Anotação guardada com sucesso no seu navegador!");
  }
}
