import { db } from "./firebase.js";
import {
    collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ---- Sair, menu e status ----
const btnSair = document.getElementById("btn-sair");
btnSair.addEventListener("click", function () {
    window.location.href = "index.html";
});

const btnMenu = document.getElementById("btn-menu");
const menu = document.querySelector(".menu");
btnMenu.addEventListener("click", function () {
    menu.classList.toggle("fechado");
});

const btnStatus = document.getElementById("btn-status");
btnStatus.addEventListener("click", function () {
    if (btnStatus.classList.contains("offline")) {
        btnStatus.classList.remove("offline");
        btnStatus.classList.add("online");
        btnStatus.textContent = "Online";
    } else {
        btnStatus.classList.remove("online");
        btnStatus.classList.add("offline");
        btnStatus.textContent = "Offline";
    }
});

// ---- Elementos da tela ----
const elTotal = document.getElementById("total-servicos");
const elPendentes = document.getElementById("servicos-pendentes");
const elConcluidos = document.getElementById("servicos-concluidos");
const elUrgentesConcluidas = document.getElementById("urgentes-concluidas");
const elUrgentesPendentes = document.getElementById("urgentes-pendentes");
const elTotalSemana = document.getElementById("total-semana");
const elConcluidosSemana = document.getElementById("concluidos-semana");
const elGrafico = document.getElementById("grafico-semana");
const listaUrgentes = document.getElementById("lista-urgentes");
const listaAgendados = document.getElementById("lista-agendados");
const listaServicos = document.getElementById("lista-servicos");

const msgVazioServicos = document.createElement("p");
msgVazioServicos.className = "aviso-vazio";
msgVazioServicos.textContent = "Nenhum serviço em andamento.";
listaServicos.after(msgVazioServicos);

let pedidos = [];

// ---- Funções de apoio ----
// Converte "AAAA-MM-DD" em "dd/mm/aaaa"
function formatarDataBR(texto) {
    if (!texto) return "";
    const [ano, mes, dia] = texto.split("-");
    return `${dia}/${mes}/${ano}`;
}

function paraMillis(timestamp) {
    return timestamp && timestamp.toMillis ? timestamp.toMillis() : 0;
}

function descreverPedido(p) {
    let texto = `${p.tipo} - ${p.bairro} (${p.urgencia})`;
    if (p.urgencia === "agendado" && p.dataAgendada) {
        texto += ` - ${formatarDataBR(p.dataAgendada)}`;
    }
    return texto;
}

// ---- Chamados pendentes (urgentes e agendados) ----
function desenharChamados(pendentes, container) {
    container.innerHTML = "";

    if (pendentes.length === 0) {
        const vazio = document.createElement("p");
        vazio.className = "aviso-vazio";
        vazio.textContent = "Nenhum chamado no momento.";
        container.appendChild(vazio);
        return;
    }

    pendentes.forEach(function (pedido) {
        const card = document.createElement("div");
        card.className = "chamado";

        const texto = document.createElement("p");
        texto.textContent = descreverPedido(pedido);

        const btnAceitar = document.createElement("button");
        btnAceitar.className = "botao";
        btnAceitar.textContent = "Aceitar";
        btnAceitar.addEventListener("click", function () {
            aceitarChamado(pedido.id);
        });

        card.appendChild(texto);
        card.appendChild(btnAceitar);
        container.appendChild(card);
    });
}

async function aceitarChamado(id) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    try {
        await updateDoc(doc(db, "Pedidos", id), {
            status: "aceito",
            pin: pin,
            aceitoEm: serverTimestamp()
        });
    } catch (erro) {
        alert("Não foi possível aceitar o chamado. Tente novamente.");
        console.error(erro);
    }
}

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

// ---- Serviços aceitos e em andamento ----
// Os cards são mantidos entre as atualizações, para não apagar
// o PIN digitado nem a conversa do chat quando outro pedido mudar.
const cartoesServicos = new Map();

function montarAcao(item) {
    item.acao.innerHTML = "";

    if (item.dados.status === "aceito") {
        const input = document.createElement("input");
        input.placeholder = "PIN de 4 dígitos";
        input.maxLength = 4;

        const btnValidar = document.createElement("button");
        btnValidar.className = "botao";
        btnValidar.textContent = "Validar PIN";
        btnValidar.addEventListener("click", function () {
            validarPin(item.dados.id, input.value.trim(), item.dados.pin);
        });

        item.acao.appendChild(input);
        item.acao.appendChild(btnValidar);
    } else {
        const btnConcluir = document.createElement("button");
        btnConcluir.className = "botao";
        btnConcluir.textContent = "Concluir serviço";
        btnConcluir.addEventListener("click", function () {
            concluirServico(item.dados.id);
        });
        item.acao.appendChild(btnConcluir);
    }

    item.statusMontado = item.dados.status;
}

function criarCartaoServico(servico) {
    const card = document.createElement("div");
    card.className = "chamado";

    const texto = document.createElement("p");
    const acao = document.createElement("div");
    acao.className = "acao";
    const chat = criarChat(servico.id, "prestador");

    card.appendChild(texto);
    card.appendChild(acao);
    card.appendChild(chat.elemento);

    return {
        card: card,
        texto: texto,
        acao: acao,
        parar: chat.parar,
        dados: servico,
        statusMontado: null
    };
}

function desenharServicos() {
    const servicos = pedidos
        .filter(p => p.status === "aceito" || p.status === "em_andamento")
        .sort((a, b) => paraMillis(a.criadoEm) - paraMillis(b.criadoEm));

    const idsAtuais = new Set(servicos.map(s => s.id));

    cartoesServicos.forEach(function (item, id) {
        if (!idsAtuais.has(id)) {
            item.parar();
            item.card.remove();
            cartoesServicos.delete(id);
        }
    });

    msgVazioServicos.style.display = servicos.length === 0 ? "block" : "none";

    servicos.forEach(function (servico, posicao) {
        let item = cartoesServicos.get(servico.id);
        if (!item) {
            item = criarCartaoServico(servico);
            cartoesServicos.set(servico.id, item);
        }

        item.dados = servico;
        item.texto.textContent = descreverPedido(servico);

        if (item.statusMontado !== servico.status) {
            montarAcao(item);
        }

        if (listaServicos.children[posicao] !== item.card) {
            listaServicos.insertBefore(item.card, listaServicos.children[posicao] || null);
        }
    });
}

async function validarPin(id, digitado, pinCorreto) {
    if (digitado !== pinCorreto) {
        alert("PIN incorreto.");
        return;
    }
    try {
        await updateDoc(doc(db, "Pedidos", id), {
            status: "em_andamento"
        });
    } catch (erro) {
        alert("Não foi possível validar o PIN. Tente novamente.");
        console.error(erro);
    }
}

async function concluirServico(id) {
    try {
        await updateDoc(doc(db, "Pedidos", id), {
            status: "concluido",
            concluidoEm: serverTimestamp()
        });
    } catch (erro) {
        alert("Não foi possível concluir o serviço. Tente novamente.");
        console.error(erro);
    }
}

// ---- Gráfico semanal (segunda a domingo) ----
const NOMES_DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const ALTURA_MAXIMA_BARRA = 100;

function desenharGrafico() {
    const agora = new Date();
    const diasDesdeSegunda = (agora.getDay() + 6) % 7;
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - diasDesdeSegunda);
    const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 7);

    const contagem = [0, 0, 0, 0, 0, 0, 0];

    pedidos.forEach(function (p) {
        if (p.status === "pendente") return;

        const marca = p.aceitoEm || p.criadoEm;
        if (!marca || !marca.toDate) return;

        const data = marca.toDate();
        if (data < inicio || data >= fim) return;

        contagem[(data.getDay() + 6) % 7]++;
    });

    let concluidosNaSemana = 0;
    pedidos.forEach(function (p) {
        if (p.status !== "concluido" || !p.concluidoEm || !p.concluidoEm.toDate) return;
        const data = p.concluidoEm.toDate();
        if (data >= inicio && data < fim) concluidosNaSemana++;
    });
    elConcluidosSemana.textContent = concluidosNaSemana;

    const total = contagem.reduce((soma, valor) => soma + valor, 0);
    const maior = Math.max(...contagem);

    elTotalSemana.textContent = total;
    elGrafico.innerHTML = "";

    contagem.forEach(function (valor, indice) {
        const coluna = document.createElement("div");
        coluna.className = "coluna-grafico";

        const numero = document.createElement("span");
        numero.className = "grafico-numero";
        numero.textContent = valor;

        const barra = document.createElement("div");
        barra.className = "barra-grafico";
        barra.style.height = (maior > 0 ? Math.round((valor / maior) * ALTURA_MAXIMA_BARRA) : 0) + "px";

        const rotulo = document.createElement("span");
        rotulo.className = "grafico-dia";
        rotulo.textContent = NOMES_DIAS[indice];

        coluna.appendChild(numero);
        coluna.appendChild(barra);
        coluna.appendChild(rotulo);
        elGrafico.appendChild(coluna);
    });
}

// ---- Escuta ao vivo: todos os pedidos ----
onSnapshot(collection(db, "Pedidos"), function (snapshot) {
    pedidos = snapshot.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));

    elTotal.textContent = pedidos.length;
    elPendentes.textContent = pedidos.filter(p => p.status !== "concluido").length;
    elConcluidos.textContent = pedidos.filter(p => p.status === "concluido").length;

    const urgentes = pedidos.filter(p => p.urgencia === "urgente");
    elUrgentesConcluidas.textContent = urgentes.filter(p => p.status === "concluido").length;
    elUrgentesPendentes.textContent = urgentes.filter(p => p.status !== "concluido").length;

    const pendentes = pedidos.filter(p => p.status === "pendente");

    desenharChamados(
        pendentes
            .filter(p => p.urgencia === "urgente")
            .sort((a, b) => paraMillis(a.criadoEm) - paraMillis(b.criadoEm)),
        listaUrgentes
    );

    desenharChamados(
        pendentes
            .filter(p => p.urgencia === "agendado")
            .sort((a, b) => (a.dataAgendada || "").localeCompare(b.dataAgendada || "")),
        listaAgendados
    );

    desenharServicos();
    desenharGrafico();
}, function (erro) {
    console.error(erro);
});