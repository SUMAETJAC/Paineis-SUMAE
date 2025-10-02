// Alterna abas
function openTab(evt, tabName) {
  let i, tabcontent, tablink;
  tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }
  tablink = document.getElementsByClassName("tablink");
  for (i = 0; i < tablink.length; i++) {
    tablink[i].classList.remove("active");
  }
  document.getElementById(tabName).style.display = "block";
  evt.currentTarget.classList.add("active");
}

// Filtro de pesquisa
function filterCards() {
  let input = document.getElementById("searchInput").value.toLowerCase();
  let cards = document.querySelectorAll(".card");
  
  cards.forEach(card => {
    let text = card.innerText.toLowerCase();
    if (text.includes(input)) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}
