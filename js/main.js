// main.js — ponto de entrada: liga dados, State, controlos e vistas.
//
// Fluxo de dados (unidirecional):
//
//   controlos / vistas --State.set()--> State --"change"--> main --update()--> vistas
//
// As vistas nunca se chamam umas às outras. Cada uma recebe as linhas
// filtradas por todos os filtros EXCETO o(s) que ela própria controla
// (view.filterKey), para continuar a mostrar o contexto dessa dimensão.
//
// Contrato de uma vista:
//   { id, title, info(meta), filterKey, init(el, ctx), update(rows, filters), highlight?(item) }
//
// ADICIONAR UMA VISTA NOVA = 1 ficheiro em js/idioms/ + 1 entrada em `views`.
// O painel é montado em <section id="panel-<id>"> (as áreas já existem na grid;
// para "scatter" e "hist" basta retirar a entrada correspondente de SKETCHES).

import { State } from "./state.js";
import { Data } from "./data.js";
import { Theme } from "./theme.js";
import { Tooltip } from "./tooltip.js";
import { InfoButton } from "./infoButton.js";
import { Controls } from "./controls.js";
import { Sunburst } from "./idioms/sunburst.js";
import { TrendLines } from "./idioms/trendLines.js";

const views = [Sunburst, TrendLines];

// Idioms ainda em sketch (implementação no Checkpoint IV).
const SKETCH_LABEL = "Sketch · Checkpoint IV";
const SKETCHES = [
  {
    id: "scatter",
    title: "Perfil dos lutadores",
    src: "sketches/Perfil.png",
    info: "No próximo checkpoint: um scatterplot com um ponto por lutador, a cruzar a diferença média de alcance (cm) " +
      "com a taxa de vitória (%), para responder a \"ter mais alcance ajuda a vencer?\". O tooltip mostrará o lutador, " +
      "o país e o nº de combates. Vai reagir aos mesmos filtros e à seleção do sunburst. Por agora é apenas o sketch.",
  },
  {
    id: "hist",
    title: "Quando terminam os combates?",
    src: "sketches/Histograma.png",
    stretch: true, // estica a imagem até ocupar o painel todo
    info: "No próximo checkpoint: um histograma do nº de combates que terminam em cada minuto, separado por round (R1 a R5), " +
      "para mostrar em que momentos acontecem as finalizações. Será possível arrastar por minutos ou clicar num round para filtrar. " +
      "Vai reagir aos mesmos filtros e à seleção do sunburst. Por agora é apenas o sketch.",
  },
];

// Cria o cabeçalho (título + ⓘ) e o corpo de um painel; devolve o corpo.
function mountPanel(id, title, info) {
  const panel = document.getElementById(`panel-${id}`);
  const heading = document.createElement("h2");
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "panel-body";
  panel.append(heading, body);
  InfoButton.attach(panel, title, info);
  return body;
}

// Painel de sketch: imagem (object-fit: contain) ou placeholder cinzento se faltar.
function mountSketch({ id, title, src, info, stretch }) {
  const body = mountPanel(id, title, info);
  body.classList.add("sketch");
  body.classList.toggle("stretch", !!stretch);
  const img = new Image();
  img.alt = `Sketch: ${title}`;
  img.onerror = () => {
    const placeholder = document.createElement("div");
    placeholder.className = "sketch-placeholder";
    placeholder.textContent = title;
    img.replaceWith(placeholder);
  };
  img.src = src;
  const tag = document.createElement("span");
  tag.className = "sketch-tag";
  tag.textContent = SKETCH_LABEL;
  body.append(img, tag);
}

// Em cada "change": cada vista recebe as linhas sem o seu próprio filtro.
function render(filters) {
  views.forEach((view) => view.update(Data.filter(filters, view.filterKey), filters));
}

// Hover: reencaminhado para todas as vistas exceto a que o emitiu.
function relayHover(item, source) {
  views.forEach((view) => view.id !== source && view.highlight && view.highlight(item));
}

async function boot() {
  Theme.applyCss();
  await Data.load();
  Theme.registerTechniques(Data.meta.techniques);
  State.init({ years: Data.meta.years });
  document.getElementById("subtitle").textContent = `Como se vence no UFC, ${Data.meta.years.join("–")}`;

  // Contexto injetado nas vistas e controlos (não importam nada diretamente).
  const ctx = { state: State, data: Data, meta: Data.meta, theme: Theme, tooltip: Tooltip };

  Controls.init(document.getElementById("filters"), document.getElementById("actions"), ctx);
  views.forEach((view) => view.init(mountPanel(view.id, view.title, view.info(Data.meta)), ctx));
  SKETCHES.forEach(mountSketch);

  State.on("change.main", render).on("hover.main", relayHover);
  render(State.get());
}

boot().catch((error) => {
  console.error(error);
  const message = document.createElement("p");
  message.className = "load-error";
  message.textContent = "Não foi possível carregar os dados. Corra «python -m http.server» na raiz do projeto e abra http://localhost:8000.";
  document.querySelector("main").replaceChildren(message);
});
