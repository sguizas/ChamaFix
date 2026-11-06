import { db } from "./firebase.js";
import {
    collection, addDoc, serverTimestamp, doc, onSnapshot, getDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ---- Elementos da tela ----
const inputBairro = document.getElementById("bairro");
const inputTipo = document.getElementById("tipo");
const blocoAgenda = document.getElementById("bloco-agenda");
const inputData = document.getElementById("data-agendada");
const btnChamar = document.getElementById("btn-chamar");
const radiosUrgencia = document.querySelectorAll('input[name="urgencia"]');
const containerPedidos = document.getElementById("meus-pedidos");

// ---- Datas ----
function dataParaInput(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

// Converte "AAAA-MM-DD" em "dd/mm/aaaa"
function formatarDataBR(texto) {
    if (!texto) return "";
    const [ano, mes, dia] = texto.split("-");
    return `${dia}/${mes}/${ano}`;
}

const hoje = new Date();
const limite = new Date();
limite.setMonth(limite.getMonth() + 1);
inputData.min = dataParaInput(hoje);
inputData.max = dataParaInput(limite);

// ---- Validações do formulário ----
function bairroValido(nome) {
    const opcoes = document.querySelectorAll("#lista-bairros option");
    return Array.from(opcoes).some(opcao => opcao.value === nome);
}

function tipoValido(nome) {
    const opcoes = document.querySelectorAll("#lista-tipos option");
    return Array.from(opcoes).some(opcao => opcao.value === nome);
}

function urgenciaSelecionada() {
    const marcado = document.querySelector('input[name="urgencia"]:checked');
    return marcado ? marcado.value : null;
}

radiosUrgencia.forEach(radio => {
    radio.addEventListener("change", () => {
        if (urgenciaSelecionada() === "agendado") {
            blocoAgenda.classList.remove("escondido");
        } else {
            blocoAgenda.classList.add("escondido");
            inputData.value = "";
        }
    });
});

function limparFormulario() {
    inputBairro.value = "";
    inputTipo.value = "";
    inputData.value = "";
    radiosUrgencia.forEach(radio => radio.checked = false);
    blocoAgenda.classList.add("escondido");
}

// ---- Pedidos salvos no navegador (localStorage) ----
function lerMeusPedidos() {
    return JSON.parse(localStorage.getItem("meusPedidos")) || [];
}

function salvarMeuPedido(id) {
    const lista = lerMeusPedidos();
    lista.push(id);
    localStorage.setItem("meusPedidos", JSON.stringify(lista));
}

// ---- Enviar chamado ----
btnChamar.addEventListener("click", async function () {
    const bairro = inputBairro.value.trim();
    const tipo = inputTipo.value.trim();
    const urgencia = urgenciaSelecionada();
    const data = inputData.value;

    if (bairro === "" || !bairroValido(bairro)) {
        alert("Bairro não encontrado ou serviço indisponível para esta região.");
        return;
    }

    if (tipo === "" || !tipoValido(tipo)) {
        alert("Escolha um tipo de serviço da lista.");
        return;
    }

    if (urgencia === null) {
        alert("Escolha se o serviço é urgente ou agendado.");
        return;
    }

    if (urgencia === "agendado" && (data === "" || data < inputData.min || data > inputData.max)) {
        alert("Escolha uma data entre hoje e 1 mês à frente.");
        return;
    }

    if (urgencia === "urgente") {
        for (const id of lerMeusPedidos()) {
            const snap = await getDoc(doc(db, "Pedidos", id));
            if (snap.exists() && snap.data().urgencia === "urgente" && snap.data().status !== "concluido") {
                alert("Você já tem um chamado urgente em andamento. Aguarde a conclusão para pedir outro.");
                return;
            }
        }
    }

    const pedido = {
        bairro: bairro,
        tipo: tipo,
        urgencia: urgencia,
        dataAgendada: urgencia === "agendado" ? data : null,
        status: "pendente",
        criadoEm: serverTimestamp()
    };

    try {
        const referencia = await addDoc(collection(db, "Pedidos"), pedido);
        salvarMeuPedido(referencia.id);
        acompanharPedido(referencia.id);
        alert("Chamado enviado! Aguarde um prestador aceitar.");
        limparFormulario();
    } catch (erro) {
        alert("Não foi possível enviar o chamado. Tente novamente.");
        console.error(erro);
    }
});

// ---- Chat (Pedidos/{id}/mensagens) ----
function criarChat(pedidoId, autor) {
    const caixa = document.createElement("div");
    caixa.className = "chat";

    const lista = document.createElement("div");
    lista.className = "chat-mensagens";

    const formulario = document.createElement("div");
    formulario.className = "chat-form";

    const campo = document.createElement("input");
    campo.type = "text";
    campo.placeholder = "Digite uma mensagem";

    const btnEnviar = document.createElement("button");
    btnEnviar.type = "button";
    btnEnviar.className = "botao";
    btnEnviar.textContent = "Enviar";

    const colecao = collection(db, "Pedidos", pedidoId, "mensagens");

    async function enviar() {
        const texto = campo.value.trim();
        if (texto === "") return;
        campo.value = "";
        try {
            await addDoc(colecao, {
                texto: texto,
                autor: autor,
                criadoEm: serverTimestamp()
            });
        } catch (erro) {
            campo.value = texto;
            alert("Não foi possível enviar a mensagem. Tente novamente.");
            console.error(erro);
        }
    }

    btnEnviar.addEventListener("click", enviar);
    campo.addEventListener("keydown", function (evento) {
        if (evento.key === "Enter") {
            evento.preventDefault();
            enviar();
        }
    });

    const parar = onSnapshot(query(colecao, orderBy("criadoEm")), function (snapshot) {
        lista.innerHTML = "";

        if (snapshot.empty) {
            const vazio = document.createElement("p");
            vazio.className = "chat-vazio";
            vazio.textContent = "Nenhuma mensagem ainda.";
            lista.appendChild(vazio);
            return;
        }

        snapshot.forEach(function (d) {
            const m = d.data();
            const linha = document.createElement("div");
            linha.className = `msg msg-${m.autor}`;

            const nome = document.createElement("strong");
            nome.textContent = (m.autor === "cliente" ? "Cliente" : "Prestador") + ": ";

            const texto = document.createElement("span");
            texto.textContent = m.texto;

            linha.appendChild(nome);
            linha.appendChild(texto);
            lista.appendChild(linha);
        });

        lista.scrollTop = lista.scrollHeight;
    }, function (erro) {
        console.error(erro);
    });

    formulario.appendChild(campo);
    formulario.appendChild(btnEnviar);
    caixa.appendChild(lista);
    caixa.appendChild(formulario);

    return { elemento: caixa, parar: parar };
}

// ---- Acompanhamento dos pedidos em tempo real ----
const pedidosAcompanhados = new Set();

function descreverPedido(p) {
    let texto = `${p.tipo} - ${p.bairro} (${p.urgencia})`;
    if (p.urgencia === "agendado" && p.dataAgendada) {
        texto += ` - ${formatarDataBR(p.dataAgendada)}`;
    }
    return texto;
}

function acompanharPedido(id) {
    if (pedidosAcompanhados.has(id)) return;
    pedidosAcompanhados.add(id);

    const card = document.createElement("div");
    card.className = "chamado";

    const linha = document.createElement("p");
    card.appendChild(linha);
    containerPedidos.appendChild(card);

    let chat = null;

    onSnapshot(doc(db, "Pedidos", id), function (snap) {
        const p = snap.data();
        if (!p) return;

        const nome = descreverPedido(p);
        if (p.status === "pendente") {
            linha.textContent = `${nome}: aguardando um prestador...`;
        } else if (p.status === "aceito") {
            linha.textContent = `${nome}: prestador aceitou! Seu PIN é ${p.pin}`;
        } else if (p.status === "em_andamento") {
            linha.textContent = `${nome}: serviço em andamento.`;
        } else if (p.status === "concluido") {
            linha.textContent = `${nome}: serviço concluído. Obrigado!`;
        }

        const ativo = p.status === "aceito" || p.status === "em_andamento";
        if (ativo && chat === null) {
            chat = criarChat(id, "cliente");
            card.appendChild(chat.elemento);
        } else if (!ativo && chat !== null) {
            chat.parar();
            chat.elemento.remove();
            chat = null;
        }
    });
}

lerMeusPedidos().forEach(acompanharPedido);