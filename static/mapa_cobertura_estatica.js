// ===================================
// CONFIGURAÇÃO DE COBERTURA (ESTÁTICO)
// ===================================

let map;
let geoJSONestados = null;
let coberturaLayer = null; // Camada para Regional OU Representante

// Mapeamento dos Regionais (CÓPIA do script.js atual)
const coberturaRegional = {
    "Escritório Ceará": ["PA", "PI", "MA", "CE", "RN"],
    "Regional Allexandre Lago": ["GO", "BA", "SE", "PE", "PB", "RN"],
    "Regional Evelyn Castor": ["ES", "MT", "MS", "RJ"],
    "Regional Sérgio Saez": ["SP", "PR", "SC", "RS"],
    "Regional sem GR": "RESTO"
};

// Cores por Regional (CÓPIA do script.js atual)
const coresRegional = {
    "Escritório Ceará": "rgba(255, 166, 0, 0.77)", // laranja
    "Regional Allexandre Lago": "rgba(255, 215, 0, 0.85)", // amarelo
    "Regional Evelyn Castor": "rgba(135, 206, 235, 0.55)", // azul claro
    "Regional Sérgio Saez": "rgba(144, 238, 144, 0.55)", // verde claro
    "Regional sem GR": "rgba(180, 180, 180, 0.55)" // cinza
};

// Mapeamento dos Representantes (NOVO, baseado na estrutura da imagem)
// 🚨 ATUALIZE ISTO COM SEUS DADOS REAIS DE COBERTURA DE REPRESENTANTE 🚨
const coberturaRepresentante = {
    // 🚨 Dados traduzidos da sua lista por UF/Região
    "RENATO PEREIRA": ["MT", "MS", "GO", "DF"], // Agrupando o Centro-Oeste
    "RODRIGO LISBOA": ["MG"],
    "DANIEL DE EQUIP.": ["PE", "RN", "PB", "AL", "SE"], // PE/RN + PB/AL/SE (Nordeste)
    "VICTOR MOURA": ["MA", "CE", "PI"], // MA/CE/PI/Oeste RN (Norte/Nordeste)
    "CLECIO SALVIANO": ["SP"],
    "HAMILTON MORAES": ["GO", "TO", "DF", "MT", "MS"], // Incluído DF, GO, MT, MS para cobrir
    "MARCOS BARIANI": ["SP"],
    "ALEXANDRE CÂND.": ["AL", "SE"],
    "EDSEU MARQUES": ["TO", "PA"],
    "MAURO FOLLMANN": ["PA"],
    "MANOEL AFONSO": ["AC", "RO"],
    "JOSÉ LOBO": ["BA"],
    "PEDRO AMORIM": ["RJ", "ES"], // RJ + ES (Sudeste)
    "CRYSTIANO SILVA": ["AM", "RR", "AP"], // AM + RR/AP (Norte)
    "ROGÉRIO CASAGRANDE": ["MG", "SP"], // MG/SP
    "FERNANDO TONON": ["DF"],
    // O restante dos estados que não foram explicitamente mencionados
    "Outros / Sem Representante": ["PR", "SC", "RS", "RO", "AC"] 
};
// Cor fixa para Reps (para diferenciar do Regional)
const COR_REP_BASE = "rgba(100, 50, 200, 0.7)";


// ===================================
// FUNÇÕES DE UTILIDADE E INIT
// ===================================

function preencherSelectEstatico(id, lista) {
    const sel = document.getElementById(id);
    lista.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
    });
}

function limparCamadaCobertura() {
    if (coberturaLayer) {
        map.removeLayer(coberturaLayer);
        coberturaLayer = null;
    }
}

function initMap() {
    map = L.map("map").setView([-15.78, -47.93], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap"
    }).addTo(map);
}

// ===================================
// LÓGICA DE DESENHO
// ===================================

function desenhar(nome, tipo = "REGIONAL") {
    limparCamadaCobertura();
    if (!nome) return;

    let dadosCobertura;
    let cor;
    let titulo;

    if (tipo === "REGIONAL") {
        dadosCobertura = coberturaRegional;
        cor = coresRegional[nome] || "rgba(150, 150, 150, 0.7)";
        titulo = "Regional";
    } else if (tipo === "REPRESENTANTE") {
        dadosCobertura = coberturaRepresentante;
        cor = COR_REP_BASE;
        titulo = "Representante";
    }

    let ufsAlvo = dadosCobertura[nome];

    // Lógica para "RESTO" (apenas para Regional, se aplicável)
    if (ufsAlvo === "RESTO") {
        const todosEstados = new Set(geoJSONestados.features.map(f => f.properties.sigla));
        let usados = new Set();
        Object.values(coberturaRegional).forEach(v => {
            if (Array.isArray(v)) v.forEach(uf => usados.add(uf));
        });
        ufsAlvo = [...[...todosEstados].filter(uf => !usados.has(uf))];
    }
    
    if (!ufsAlvo || ufsAlvo.length === 0) return;

    coberturaLayer = L.geoJSON(geoJSONestados, {
        style: feature => {
            const uf = feature.properties.sigla;
            return {
                fillColor: ufsAlvo.includes(uf) ? cor : "transparent",
                fillOpacity: ufsAlvo.includes(uf) ? 0.75 : 0,
                weight: ufsAlvo.includes(uf) ? 3 : 0,
                color: ufsAlvo.includes(uf) ? "#000" : "transparent"
            };
        },

        onEachFeature: (feature, layer) => {
            const uf = feature.properties.sigla;

            if (ufsAlvo.includes(uf)) {
                layer.bindPopup(
                    `<h4>${titulo}: ${nome}</h4><p>Estado: ${feature.properties.nome}</p>`,
                    { sticky: true }
                );

                // Efeito hover
                layer.on("mouseover", function () {
                    this.setStyle({ fillOpacity: 0.9, weight: 4 });
                });

                layer.on("mouseout", function () {
                    this.setStyle({ fillOpacity: 0.75, weight: 3 });
                });
            }
        }
    });

    coberturaLayer.addTo(map);
}

// ===================================
// LÓGICA DE APLICAÇÃO DE FILTROS
// ===================================

function aplicarFiltrosEstaticos() {
    const regional = document.getElementById("filtroRegionalCobertura").value;
    const representante = document.getElementById("filtroRepresentanteCobertura").value;
    
    // Prioriza o filtro de Regional, se ambos estiverem selecionados
    if (regional) {
        desenhar(regional, "REGIONAL");
    } else if (representante) {
        desenhar(representante, "REPRESENTANTE");
    } else {
        // Se nada for selecionado, limpa o mapa
        limparCamadaCobertura();
    }
}

function limparTudoEstatico() {
    document.getElementById("filtroRegionalCobertura").value = "";
    document.getElementById("filtroRepresentanteCobertura").value = "";
    limparCamadaCobertura();
}

// ===================================
// INICIALIZAÇÃO
// ===================================

function popularLegenda() {
    const container = document.getElementById("cobertura-legend");
    Object.entries(coresRegional).forEach(([nome, cor]) => {
        const item = document.createElement("div");
        item.classList.add("legend-item");
        item.innerHTML = `<span style="background:${cor}; display:inline-block; width:15px; height:15px; margin-right:5px; border: 1px solid #777;"></span> ${nome}`;
        container.appendChild(item);
    });
}

(async function () {
    const API_BASE = "http://localhost:8000"; 
    
    initMap();
    
    // Carregar GeoJSON de forma estática
    geoJSONestados = await fetch(`${API_BASE}/static/brasil_estados.geojson`)
        .then(r => r.json())
        .catch(err => console.error("Erro ao carregar GeoJSON:", err));

    // Popula os filtros estáticos
    preencherSelectEstatico("filtroRegionalCobertura", Object.keys(coberturaRegional));
    preencherSelectEstatico("filtroRepresentanteCobertura", Object.keys(coberturaRepresentante));
    
    popularLegenda();

    // Event Listeners
    document.getElementById("btnAplicar").onclick = aplicarFiltrosEstaticos;
    document.getElementById("btnLimpar").onclick = limparTudoEstatico;
    document.getElementById("btnToggleSidebar").onclick = () => {
        document.getElementById("sidebar").classList.toggle("collapsed");
    };
    
    // Desenha a cobertura completa por padrão (opcional, remova se quiser começar com mapa limpo)
    // desenhar(null, "TODOS"); 
})();