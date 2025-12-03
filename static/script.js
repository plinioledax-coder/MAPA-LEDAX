// =========================
// CONFIGURAÇÕES DO BACKEND
// =========================
const API = "https://mapa-ledax.onrender.com";
// =========================
// VARIÁVEIS GLOBAIS
// =========================
let clientes = [];
let markersLayer = L.layerGroup();            // marcadores sem cluster
let clusterGroup = L.markerClusterGroup();    // marcadores com cluster
let clustersAtivos = true;                    // controle do checkbox
let heatLayer = null;
let choroplethLayer = null;
let geoJSONestados = null;
let regionalLayer = null;
let representanteLayer = null;
let map;

// 🚨 NOVO: Cor de sobreposição para quando houver 2 ou mais representantes no mesmo estado (UF)
const COR_SOBREPOSICAO = "rgba(255, 102, 0, 0.8)"; // Laranja forte / Vermelho


// ================================
// MAPA DE COBERTURA DOS REGIONAIS
// ================================

const coberturaRegional = {
  "Escritório Ceará": ["PA", "PI", "MA", "CE", "RN"],
  "Regional Allexandre Lago": ["AL", "GO", "BA", "SE", "PE", "PB", "RN"],
  "Regional Evelyn Castor": ["ES", "MT", "MS", "RJ"],
  "Regional Sérgio Saez": ["SP", "PR", "SC", "RS"],
  "Regional sem GR": "RESTO"
};

// ================================
// CORES POR REGIONAL
// ================================
const coresRegional = {
  "Escritório Ceará": "rgba(255, 166, 0, 0.77)",         // laranja
  "Regional Allexandre Lago": "rgba(255, 215, 0, 0.85)", // amarelo
  "Regional Evelyn Castor": "rgba(135, 206, 235, 0.55)", // azul claro
  "Regional Sérgio Saez": "rgba(144, 238, 144, 0.55)",   // verde claro
  "Regional sem GR": "rgba(180, 180, 180, 0.55)"         // cinza
};

// ================================
// MAPA DE COBERTURA DOS REPRESENTANTES
// ================================
const coberturaRepresentante = {
  "RENATO PEREIRA": ["MT"],
  "RODRIGO LISBOA": ["MG"],
  "DANIEL DE EQUIP.": ["PE", "RN"],
  "VICTOR MOURA": ["MA", "CE", "PI", "RN"],
  "CLECIO SALVIANO": ["SP"],
  "HAMILTON MORAES": ["GO", "MS"],
  "MARCOS BARIANI": ["SP", "AL"],
  "ALEXANDRE CÂND.": ["AL", "DF"],
  "EDSEU MARQUES": ["TO", "PA"],
  "MAURO FOLLMANN": ["PA"],
  "MANOEL AFONSO": ["AC", "RO"],
  "JOSÉ LOBO": ["BA"],
  "PEDRO AMORIM": ["RJ"],
  "CRYSTIANO SILVA": ["AM"],
  "ROGÉRIO CASAGRANDE": ["MG", "SP"],
  "ERNESTO (LLAMPE)": ["SC", "PR"],
  "SEM COBERTURA": "RESTO" // Para estados não cobertos
};

// ================================
// CORES POR REPRESENTANTE
// ================================
const coresRepresentante = {
  "RENATO PEREIRA": "rgba(255, 105, 180, 0.7)",
  "RODRIGO LISBOA": "rgba(0, 191, 255, 0.7)",
  "DANIEL DE EQUIP.": "rgba(255, 69, 0, 0.7)",
  "VICTOR MOURA": "rgba(50, 205, 50, 0.7)",
  "CLECIO SALVIANO": "rgba(147, 112, 219, 0.7)",
  "HAMILTON MORAES": "rgba(255, 215, 0, 0.7)",
  "MARCOS BARIANI": "rgba(0, 255, 255, 0.7)",
  "ALEXANDRE CÂND.": "rgba(255, 165, 0, 0.7)",
  "EDSEU MARQUES": "rgba(128, 0, 128, 0.7)",
  "MAURO FOLLMANN": "rgba(255, 0, 0, 0.7)",
  "MANOEL AFONSO": "rgba(0, 128, 0, 0.7)",
  "JOSÉ LOBO": "rgba(255, 140, 0, 0.7)",
  "PEDRO AMORIM": "rgba(70, 130, 180, 0.7)",
  "CRYSTIANO SILVA": "rgba(0, 0, 255, 0.7)",
  "ROGÉRIO CASAGRANDE": "rgba(128, 0, 0, 0.7)",
  "ERNESTO (LLAMPE)": "rgba(0, 128, 15, 0.58)",
  "SEM COBERTURA": "rgba(180, 180, 180, 0.55)"
};

// ================================
// INICIAR MAPA
// ================================

function initMap() {
  map = L.map("map").setView([-15.78, -47.93], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(map);


  // Começar com clusters ligados
  clusterGroup.addTo(map);
}

initMap();


// ================================
// BUSCAR DADOS DO BACKEND E FUNÇÕES DE FILTRO EM CASCATA
// ================================

async function carregarClientes() {
  const res = await fetch(`${API}/clientes`);
  clientes = await res.json();
  atualizarMapa(clientes);
  atualizarKPIs(clientes);
}

// 🚨 CORRIGIDO: Função genérica para preencher o select, limpando e preservando o valor
function preencherSelect(id, lista, defaultText = "Todos") {
  const sel = document.getElementById(id);
  // Verifica se o elemento existe antes de tentar manipulá-lo
  if (!sel) return;

  const currentValue = sel.value; // Salva o valor atual

  // Limpa o select antes de preencher
  sel.innerHTML = "";

  // Adiciona a opção padrão
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = defaultText;
  sel.appendChild(defaultOpt);

  lista.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });

  // Tenta restaurar o valor, se ele ainda existir na nova lista
  if (lista.includes(currentValue) || currentValue === "") {
    sel.value = currentValue;
  } else {
    // Se o valor anterior não estiver mais na lista, volta para o default.
    sel.value = "";
  }
}

// 🚨 NOVO: Carrega filtros de dados (Rede, Funil, etc) no startup, usando o backend
async function preencherFiltrosIniciais() {
  const res = await fetch(`${API}/filtros`);
  const dados = await res.json();

  // Mapeamento de texto padrão
  const defaultTextMap = {
    "filtroRede": "Todas", "filtroRegiao": "Todas", "filtroTipoCliente": "Todos",
    "filtroFunil": "Todos", "filtroRepresentante": "Todos", "filtroResponsavel": "Todos"
  };

  preencherSelect("filtroRede", dados.rede, defaultTextMap["filtroRede"]);
  preencherSelect("filtroTipoCliente", dados.tipo_cliente, defaultTextMap["filtroTipoCliente"]);
  preencherSelect("filtroFunil", dados.funil, defaultTextMap["filtroFunil"]);
  preencherSelect("filtroRepresentante", dados.representante, defaultTextMap["filtroRepresentante"]);
  preencherSelect("filtroRegiao", dados.regiao, defaultTextMap["filtroRegiao"]);
  preencherSelect("filtroResponsavel", dados.responsavel, defaultTextMap["filtroResponsavel"]);
}

// 🚨 NOVO: Atualiza os filtros de dados em cascata (chamada após aplicarFiltros)
async function atualizarFiltrosEmCascata(currentParams) {
  // Faz a requisição ao backend com os filtros aplicados
  const res = await fetch(`${API}/filtros?` + currentParams.toString());
  const dados = await res.json();

  const defaultTextMap = {
    "filtroRede": "Todas", "filtroRegiao": "Todas", "filtroTipoCliente": "Todos",
    "filtroFunil": "Todos", "filtroRepresentante": "Todos", "filtroResponsavel": "Todos"
  };

  // Recarrega todos os filtros baseados no resultado da filtragem (em cascata)
  preencherSelect("filtroRede", dados.rede, defaultTextMap["filtroRede"]);
  preencherSelect("filtroTipoCliente", dados.tipo_cliente, defaultTextMap["filtroTipoCliente"]);
  preencherSelect("filtroFunil", dados.funil, defaultTextMap["filtroFunil"]);
  preencherSelect("filtroRepresentante", dados.representante, defaultTextMap["filtroRepresentante"]);
  preencherSelect("filtroRegiao", dados.regiao, defaultTextMap["filtroRegiao"]);
  preencherSelect("filtroResponsavel", dados.responsavel, defaultTextMap["filtroResponsavel"]);
}


// ================================
// APLICAR FILTROS (ATUALIZADO COM CASCATA E DATA)
// ================================

async function aplicarFiltros() {
  const params = new URLSearchParams();

  // 1. Coleta os parâmetros de filtragem
  addFiltro(params, "rede", "filtroRede");
  addFiltro(params, "tipo_cliente", "filtroTipoCliente");
  addFiltro(params, "funil", "filtroFunil");
  addFiltro(params, "representante", "filtroRepresentante");
  addFiltro(params, "regiao", "filtroRegiao");
  addFiltro(params, "responsavel", "filtroResponsavel");
  // 🚨 NOVO: Adiciona o campo de busca
  addFiltro(params, "busca_texto", "filtroBuscaTexto");

  // 🚨 NOVOS FILTROS DE DATA
  addFiltro(params, "data_inicio", "filtroDataInicio");
  addFiltro(params, "data_fim", "filtroDataFim");

  // 2. Filtra os clientes
  const res = await fetch(`${API}/clientes/filtrar?` + params.toString());
  const filtrados = await res.json();

  // 3. Atualiza o mapa e KPIs
  atualizarMapa(filtrados);
  atualizarKPIs(filtrados);

  // 4. ATUALIZA OS DROPDOWNS DE FILTROS EM CASCATA
  await atualizarFiltrosEmCascata(params);

  // 5. Desenha a cobertura (mantendo a lógica da correção anterior)
  const regionalSelecionado = document.getElementById("filtroRegional").value;
  const representanteSelecionado = document.getElementById("filtroRepresentante").value;

  if (regionalSelecionado) {
    desenharCoberturaRegional(regionalSelecionado);
  } else if (representanteSelecionado) {
    desenharCoberturaRepresentante(representanteSelecionado);
  } else {
    // Limpa as camadas se nenhum filtro de cobertura estiver ativo
    if (regionalLayer) {
      map.removeLayer(regionalLayer);
      regionalLayer = null;
    }
    if (representanteLayer) {
      map.removeLayer(representanteLayer);
      representanteLayer = null;
    }
  }
}

function addFiltro(params, backendField, htmlField) {
  const element = document.getElementById(htmlField);
  if (!element) return; // Garante que o elemento existe

  const value = element.value;
  if (value) params.append(backendField, value);
}

// ================================
// LIMPAR FILTROS (MANTIDO)
// ================================

function limparFiltros() {
  document.querySelectorAll("select").forEach(s => s.value = "");

  // 🚨 LIMPAR CAMPOS DE DATA (assumindo type="date")
  const dataInicio = document.getElementById("filtroDataInicio");
  const dataFim = document.getElementById("filtroDataFim");
  if (dataInicio) dataInicio.value = "";
  if (dataFim) dataFim.value = "";

  // Limpa as camadas de cobertura de Regional e Representante
  if (regionalLayer) {
    map.removeLayer(regionalLayer);
    regionalLayer = null;
  }
  if (representanteLayer) {
    map.removeLayer(representanteLayer);
    representanteLayer = null;
  }
  // 🚨 NOVO: Limpa o campo de busca
  const buscaTexto = document.getElementById("filtroBuscaTexto");
  if (buscaTexto) buscaTexto.value = "";

  // Recarrega todos os clientes e filtros em cascata
  aplicarFiltros();
}

// ================================
// ATUALIZAR MAPA, KPIs, CHOROPLETH (MANTIDOS)
// ================================
// ================================
// CONFIGURAÇÕES DO HEATMAP (NOVO)
// ================================
const HEATMAP_MAX_INTENSITY = 20.0; // Aumenta a intensidade visual geral
const HEATMAP_RADIUS = 25;
const HEATMAP_GRADIENT = {
  // Cores: 0.0 (baixo) a 1.0 (alto)
  0.0: '#eaff00ff', // Verde vibrante
  0.3: '#ff1500ff', // Amarelo
  0.6: '#ff9900', // Laranja
  1.0: '#ff0000'  // Vermelho
};


// ================================
// ATUALIZAR MAPA (CORRIGIDO)
// ================================
function atualizarMapa(lista) {

  // remover camadas anteriores
  map.removeLayer(markersLayer);
  map.removeLayer(clusterGroup);

  // recriar camadas vazias
  markersLayer = L.layerGroup();
  clusterGroup = L.markerClusterGroup();

  const heatData = [];

  lista.forEach(c => {
    if (!c.latitude || !c.longitude) return;
    const valorDisplay = c.valor_venda 
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.valor_venda) 
        : "Valor indisponível";

    const marker = L.marker([c.latitude, c.longitude]).bindPopup(`
      <b>${c.titulo}</b><br>
      Cidade: ${c.cidade} - ${c.uf}<br>
      Rede: ${c.rede ?? "-"}<br>
      Representante: ${c.representante ?? "-"}<br>
      <hr style="margin: 5px 0;">
      💰 <b>Valor da Venda:</b> ${valorDisplay} 
    `);

    if (clustersAtivos) {
      clusterGroup.addLayer(marker);
    } else {
      markersLayer.addLayer(marker);
    }

    // Cada ponto tem um "peso" de 1
    heatData.push([c.latitude, c.longitude, 1]);
  });

  // adicionar camada correta ao mapa
  if (clustersAtivos) {
    clusterGroup.addTo(map);
  } else {
    markersLayer.addTo(map);
  }

  // Heatmap
  if (heatLayer) map.removeLayer(heatLayer);

  if (document.getElementById("toggleHeat").checked) {
    heatLayer = L.heatLayer(heatData, {
      radius: HEATMAP_RADIUS,
      max: HEATMAP_MAX_INTENSITY, // <--- AUMENTA A INTENSIDADE
      gradient: HEATMAP_GRADIENT  // <--- PALETA DE CORES PERSONALIZADA
    });
    heatLayer.addTo(map);
  }

  atualizarChoropleth(lista);
}

function atualizarKPIs(lista) {
  document.getElementById("kp_totalClientes").textContent = lista.length;

  const regioes = new Set(lista.map(c => c.regiao).filter(Boolean));
  const redes = new Set(lista.map(c => c.rede).filter(Boolean));
  const reps = new Set(lista.map(c => c.representante).filter(Boolean));

  document.getElementById("kp_regioesPresenca").textContent = regioes.size;
  document.getElementById("kp_redesPresenca").textContent = redes.size;
  document.getElementById("kp_repsAtivos").textContent = reps.size;

  atualizarListasQualitativas(lista);
}

function atualizarListasQualitativas(lista) {
  atualizarLista("list_presenca_regiao", "regiao", lista);
  atualizarLista("list_presenca_rede", "rede", lista);
}

// script.js (Substitua esta função)

function atualizarLista(id, campo, lista) {
  const ul = document.getElementById(id);
  ul.innerHTML = "";

  const contagem = {};
  lista.forEach(c => {
    if (!c[campo]) return;
    contagem[c[campo]] = (contagem[c[campo]] || 0) + 1;
  });

  // 🚨 NOVA LÓGICA DE ORDENAÇÃO:
  // 1. Converte o objeto contagem para um array de pares [chave, valor]
  const contagemArray = Object.entries(contagem);

  // 2. Ordena o array baseado no valor (o segundo elemento do par [0, 1]) em ordem decrescente
  // Isso garante que o maior número de clientes apareça primeiro
  contagemArray.sort((a, b) => b[1] - a[1]);

  // 3. Itera sobre o array ordenado para criar os elementos <li>
  contagemArray.forEach(([key, value]) => {
    const li = document.createElement("li");
    li.innerHTML = `${key} <span class="badge">${value}</span>`;
    ul.appendChild(li);
  });
}

function atualizarChoropleth(lista) {
  if (!document.getElementById("toggleChoropleth").checked) {
    if (choroplethLayer) map.removeLayer(choroplethLayer);
    return;
  }

  if (!geoJSONestados) return;

  const contagemUF = {};
  lista.forEach(c => {
    if (!c.uf) return;
    contagemUF[c.uf] = (contagemUF[c.uf] || 0) + 1;
  });

  const valores = Object.values(contagemUF);
  const max = valores.length ? Math.max(...valores) : 1;

  function getColor(qtd) {
    const pct = qtd / max;
    const intensidade = Math.floor(200 * pct);
    return `rgb(${55 - intensidade}, ${120 + intensidade}, 255)`;
  }

  if (choroplethLayer) map.removeLayer(choroplethLayer);

  choroplethLayer = L.geoJSON(geoJSONestados, {
    style: f => {
      const uf = f.properties.sigla;
      const qtd = contagemUF[uf] || 0;

      return {
        fillColor: getColor(qtd),
        fillOpacity: 0.55,
        weight: 1,
        color: "#444"
      };
    },
    onEachFeature: (feature, layer) => {
      const uf = feature.properties.sigla;
      const qtd = contagemUF[uf] || 0;
      layer.bindPopup(`<b>${feature.properties.nome}</b><br>Clientes: ${qtd}`);
    }
  });

  choroplethLayer.addTo(map);
}

function desenharCoberturaRegional(nomeRegional) {

  // Remove a camada de Representantes para evitar sobreposição visual
  if (representanteLayer) {
    map.removeLayer(representanteLayer);
    representanteLayer = null;
  }

  // Remover camada anterior
  if (regionalLayer) {
    map.removeLayer(regionalLayer);
    regionalLayer = null;
  }

  if (!geoJSONestados) return;

  // Determina quais regionais serão desenhados
  let regionaisParaDesenhar = [];
  if (!nomeRegional || nomeRegional === "") {
    regionaisParaDesenhar = Object.keys(coberturaRegional);
  } else if (coberturaRegional[nomeRegional]) {
    regionaisParaDesenhar = [nomeRegional];
  } else {
    return;
  }

  const ufsComCor = {};
  const todosEstados = new Set(
    geoJSONestados.features.map(f => f.properties.sigla)
  );
  const todosRegionais = Object.keys(coberturaRegional);

  regionaisParaDesenhar.forEach(regional => {
    const estadosAlvo = coberturaRegional[regional];
    const corBase = coresRegional[regional] || "rgba(180, 180, 180, 0.55)";
    let estadosFinal = estadosAlvo;

    if (estadosAlvo === "RESTO") {
      let usados = new Set();
      todosRegionais.forEach(k => {
        const v = coberturaRegional[k];
        if (k !== "Regional sem GR" && Array.isArray(v)) v.forEach(uf => usados.add(uf));
      });
      estadosFinal = [...[...todosEstados].filter(uf => !usados.has(uf))];
    }

    if (Array.isArray(estadosFinal)) {
      estadosFinal.forEach(uf => {
        if (!ufsComCor[uf]) {
          ufsComCor[uf] = { cor: corBase, nome: regional };
        } else {
          ufsComCor[uf].nome += `, ${regional}`;
        }
      });
    }
  });

  regionalLayer = L.geoJSON(geoJSONestados, {
    style: feature => {
      const uf = feature.properties.sigla;
      const data = ufsComCor[uf];

      if (data) {
        return {
          fillColor: data.cor,
          fillOpacity: 0.55,
          weight: 2,
          color: "#444"
        };
      } else {
        return {
          fillColor: "transparent",
          fillOpacity: 0,
          weight: 0.5,
          color: "#aaa"
        };
      }
    },

    onEachFeature: (feature, layer) => {
      const uf = feature.properties.sigla;
      const data = ufsComCor[uf];

      if (data) {
        layer.bindTooltip(
          `${data.nome}<br>Estado: ${feature.properties.nome}`,
          { sticky: true }
        );

        layer.on("mouseover", function () {
          this.setStyle({ fillOpacity: 0.75, weight: 3 });
        });

        layer.on("mouseout", function () {
          this.setStyle({ fillOpacity: 0.55, weight: 2 });
        });
      }
    }
  });

  regionalLayer.addTo(map);
}


function desenharCoberturaRepresentante(nomeRepresentante) {

  // Remove a camada Regional para evitar sobreposição visual
  if (regionalLayer) {
    map.removeLayer(regionalLayer);
    regionalLayer = null;
  }

  // Remover camada anterior
  if (representanteLayer) {
    map.removeLayer(representanteLayer);
    representanteLayer = null;
  }

  if (!geoJSONestados) return;

  // 1. Definição dos Representantes a serem processados
  let representantesParaDesenhar = [];
  const isFilterAll = !nomeRepresentante || nomeRepresentante === "";

  if (isFilterAll) {
    representantesParaDesenhar = Object.keys(coberturaRepresentante);
  } else if (coberturaRepresentante[nomeRepresentante]) {
    representantesParaDesenhar = [nomeRepresentante];
  } else {
    return;
  }

  // 2. Coleta de Cobertura por UF
  const ufsComCobertura = {};
  const todosEstados = new Set(
    geoJSONestados.features.map(f => f.properties.sigla)
  );
  const todosRepresentantes = Object.keys(coberturaRepresentante);
  const corSemCobertura = coresRepresentante["SEM COBERTURA"];


  representantesParaDesenhar.forEach(representante => {
    const estadosAlvo = coberturaRepresentante[representante];
    const corBase = coresRepresentante[representante] || corSemCobertura;
    let estadosFinal = estadosAlvo;

    // Lógica de cálculo do "RESTO" (SEM COBERTURA)
    if (estadosAlvo === "RESTO") {
      let usados = new Set();
      todosRepresentantes.forEach(k => {
        const v = coberturaRepresentante[k];
        if (k !== "SEM COBERTURA" && Array.isArray(v)) v.forEach(uf => usados.add(uf));
      });
      estadosFinal = [...[...todosEstados].filter(uf => !usados.has(uf))];
    }

    if (Array.isArray(estadosFinal)) {
      estadosFinal.forEach(uf => {
        if (!ufsComCobertura[uf]) {
          ufsComCobertura[uf] = { nomes: [], cor: corBase };
        }

        if (!ufsComCobertura[uf].nomes.includes(representante)) {
          ufsComCobertura[uf].nomes.push(representante);
        }
      });
    }
  });


  // 3. Aplicação do Estilo (Cores)
  representanteLayer = L.geoJSON(geoJSONestados, {
    style: feature => {
      const uf = feature.properties.sigla;
      const data = ufsComCobertura[uf];

      const repNames = data ? data.nomes.filter(n => n !== "SEM COBERTURA") : [];
      const isCovered = repNames.length > 0;
      const isSemCoberturaOnly = data && data.nomes.includes("SEM COBERTURA") && repNames.length === 0;

      let finalColor = "transparent";
      let finalOpacity = 0;
      let finalWeight = 0.5;

      if (isCovered) {
        finalOpacity = 0.55;
        finalWeight = 2;

        if (!isFilterAll) {
          finalColor = coresRepresentante[nomeRepresentante];
        }
        else {
          if (repNames.length >= 2) {
            finalColor = COR_SOBREPOSICAO;
          }
          else {
            const repName = repNames[0];
            finalColor = coresRepresentante[repName] || corSemCobertura;
          }
        }
      } else if (isSemCoberturaOnly && isFilterAll) {
        finalColor = corSemCobertura;
        finalOpacity = 0.55;
        finalWeight = 2;
      }

      return {
        fillColor: finalColor,
        fillOpacity: finalOpacity,
        weight: finalWeight,
        color: (finalColor === "transparent") ? "#aaa" : "#444"
      };
    },

    // 4. Aplicação do Tooltip (Nomes de Sobreposição)
    onEachFeature: (feature, layer) => {
      const uf = feature.properties.sigla;
      const data = ufsComCobertura[uf];

      if (data && data.nomes.length > 0) {

        const repNames = data.nomes.filter(n => n !== "SEM COBERTURA");

        let tooltipText;

        if (repNames.length > 0) {
          const namesList = repNames.join(', ');
          tooltipText = `Representantes: ${namesList}<br>Estado: ${feature.properties.nome}`;
        } else if (data.nomes.includes("SEM COBERTURA")) {
          tooltipText = `Representantes: SEM COBERTURA<br>Estado: ${feature.properties.nome}`;
        } else {
          return;
        }

        layer.bindTooltip(
          tooltipText,
          { sticky: true }
        );

        layer.on("mouseover", function () {
          this.setStyle({ fillOpacity: 0.75, weight: 3 });
        });

        layer.on("mouseout", function () {
          this.setStyle({ fillOpacity: 0.55, weight: 2 });
        });
      }
    }
  });

  representanteLayer.addTo(map);
}


// ================================
// CONTROLES DA SIDEBAR
// ================================

document.getElementById("btnToggleSidebar").onclick = () => {
  document.getElementById("sidebar").classList.toggle("collapsed");
};

document.getElementById("btnAplicar").onclick = aplicarFiltros;
document.getElementById("btnLimpar").onclick = limparFiltros;

document.getElementById("toggleHeat").onchange = () => atualizarMapa(clientes);
document.getElementById("toggleChoropleth").onchange = () => atualizarMapa(clientes);

document.getElementById("toggleClusters").onchange = () => {
  clustersAtivos = document.getElementById("toggleClusters").checked;
  atualizarMapa(clientes);
};

// Listeners de Cobertura (Garante que só uma esteja ativa por vez)
document.getElementById("filtroRegional").onchange = (e) => {
  document.getElementById("filtroRepresentante").value = ""; // Limpa o outro filtro
  desenharCoberturaRegional(e.target.value);
};

document.getElementById("filtroRepresentante").onchange = (e) => {
  document.getElementById("filtroRegional").value = ""; // Limpa o outro filtro
  desenharCoberturaRepresentante(e.target.value);
};


// ================================
// INICIALIZAÇÃO (CORRIGIDA)
// ================================

(async function () {
  await carregarClientes();

  // Carrega o filtro Regional (lista estática)
  const regionais = Object.keys(coberturaRegional);
  preencherSelect("filtroRegional", regionais, "Todas");

  // Carrega os filtros de dados (Rede, Funil, etc)
  await preencherFiltrosIniciais();

  geoJSONestados = await fetch("http://localhost:8000/static/brasil_estados.geojson")
    .then(r => r.json())
    .catch(err => console.error("Erro ao carregar GeoJSON:", err));
})();
