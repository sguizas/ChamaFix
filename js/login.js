const btnPrestador = document.getElementById("btn-prestador");
const btnCliente = document.getElementById("btn-cliente");
btnPrestador.addEventListener("click", function() {
    window.location.href = "dashboard.html";
});
btnCliente.addEventListener("click", function() {
    window.location.href = "cliente.html";
});