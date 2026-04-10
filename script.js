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
