// idioms/sunburst.js — "Métodos e técnicas" (idiom principal).
//
// Dois anéis: método (interior) -> técnica (exterior); o ângulo codifica o nº
// de vitórias. Controla o filtro `node`: por isso recebe as linhas filtradas
// por tudo MENOS `node` e mostra sempre todos os nós, destacando o selecionado.
//
// Só comunica com o exterior através de ctx.state (set/hover).

const ID = "sun";
const OTHERS = "__outras__"; // chave do grupo de técnicas pequenas
const MIN_SHARE = 0.01; // técnicas abaixo de 1% do método são agrupadas
const RING = { hole: 0.28, inner: [0.28, 0.5], outer: [0.515, 1] }; // frações do raio
const MARGIN = 8;
const LABEL_PAD = 6;

let ctx, el, svg, gRoot, gArcs, gLabels, gMethodLabels, gCenter, emptyText;
const ruler = document.createElement("canvas").getContext("2d"); // mede texto sem tocar no DOM
let rows = null;
let filters = null;
let nodes = [];
let radius = 0;
let hoverPath = null; // caminho em hover (local ou vindo de outra vista)

// ---------- dados -> hierarquia -> ângulos ----------

// Junta as técnicas com menos de 1% do método num único nó "Outras".
function groupSmall(method, counts) {
  const total = d3.sum(counts.values());
  const all = Array.from(counts, ([technique, value]) => ({ method, technique, value }))
    .sort((a, b) => d3.descending(a.value, b.value));
  const small = all.filter((d) => d.value / total < MIN_SHARE);
  if (small.length < 2) return all; // um grupo de uma só técnica não ajuda
  const big = all.filter((d) => d.value / total >= MIN_SHARE);
  return big.concat({ method, technique: OTHERS, value: d3.sum(small, (d) => d.value), members: small });
}

function buildTree(data) {
  const counts = d3.rollup(data, (v) => v.length, (d) => d.method, (d) => d.technique);
  const methods = ctx.theme.methods.filter((m) => counts.has(m));
  return { children: methods.map((method) => ({ method, children: groupSmall(method, counts.get(method)) })) };
}

// Converte um nó do d3.partition no datum usado para desenhar.
function toNode(n) {
  const { method, technique, members } = n.data;
  // Métodos com uma única técnica no dataset (DEC, OTHER) não têm subdivisão real:
  // o arco exterior comporta-se como o próprio método.
  const sole = n.depth === 2 && ctx.meta.techniques.get(method).length === 1;
  const isTechnique = n.depth === 2 && !sole && !members;
  return {
    key: n.depth === 1 ? method : `${method}|${technique}`,
    depth: n.depth, method, technique, members, sole, isTechnique,
    value: n.value, parentValue: n.parent.value, x0: n.x0, x1: n.x1,
    path: isTechnique ? [method, technique] : [method],
  };
}

function layout(data) {
  const root = d3.hierarchy(buildTree(data)).sum((d) => (d.children ? 0 : d.value));
  d3.partition().size([2 * Math.PI, 1])(root);
  return root.descendants().filter((n) => n.depth > 0).map(toNode);
}

// ---------- geometria ----------

const ringOf = (d) => (d.depth === 1 ? RING.inner : RING.outer).map((f) => f * radius);

function arcPath(d, angles) {
  const [r0, r1] = ringOf(d);
  return d3.arc()({ startAngle: angles.x0, endAngle: angles.x1, innerRadius: r0, outerRadius: r1 });
}

// Técnica: texto radial, virado para nunca ficar de cabeça para baixo
// (roda 180° na metade esquerda do círculo).
function labelTransform(d, angles) {
  const deg = ((angles.x0 + angles.x1) / 2) * 180 / Math.PI;
  return `rotate(${deg - 90}) translate(${d3.mean(ringOf(d))},0) rotate(${deg > 180 ? 180 : 0})`;
}

// Método: texto ao longo do arco (textPath). Na metade de baixo o caminho é
// desenhado em sentido contrário, para o texto não ficar de cabeça para baixo.
function labelArc(d, angles) {
  const r = d3.mean(ringOf(d));
  const span = Math.min(angles.x1 - angles.x0, 2 * Math.PI - 0.001);
  const flip = Math.cos((angles.x0 + angles.x1) / 2) < 0;
  const [from, to] = flip ? [angles.x0 + span, angles.x0] : [angles.x0, angles.x0 + span];
  const point = (a) => `${r * Math.sin(a)},${-r * Math.cos(a)}`;
  return `M${point(from)}A${r},${r} 0 ${span > Math.PI ? 1 : 0} ${flip ? 0 : 1} ${point(to)}`;
}

function textWidth(text, size, weight = 400) {
  ruler.font = `${weight} ${size}px ${ctx.theme.font.family}`;
  return ruler.measureText(text).width;
}

// Encurta o texto com reticências até caber em `max` px ("" se não couber nada útil).
function truncate(text, size, max, weight) {
  if (textWidth(text, size, weight) <= max) return text;
  let cut = text;
  while (cut.length > 3 && textWidth(`${cut}…`, size, weight) > max) cut = cut.slice(0, -1).trimEnd();
  return cut.length > 3 ? `${cut}…` : "";
}

// Texto do rótulo que cabe no arco ("" se não houver espaço).
function labelText(d) {
  const [r0, r1] = ringOf(d);
  const arcLen = (d.x1 - d.x0) * d3.mean([r0, r1]);
  const size = ctx.theme.font.size;
  if (d.depth === 1) {
    const { label, short } = ctx.theme.method[d.method];
    const fits = (t) => textWidth(t, size.md, 700) + 2 * LABEL_PAD <= arcLen;
    return fits(label) ? label : fits(short) ? short : "";
  }
  if (arcLen < size.sm + 3) return "";
  return truncate(nodeLabel(d), size.sm, r1 - r0 - 2 * LABEL_PAD);
}

// ---------- rótulos, cores e seleção ----------

function nodeLabel(d) {
  if (d.depth === 1 || d.sole) return ctx.theme.method[d.method].label;
  return d.members ? "Outras" : ctx.theme.techniqueLabel(d.technique);
}

function pathLabel(path) {
  const method = ctx.theme.method[path[0]].label;
  return path.length < 2 ? method : ctx.theme.techniqueLabel(path[1]);
}

function fillOf(d) {
  if (d.depth === 1) return ctx.theme.methodColor(d.method);
  return ctx.theme.techniqueColor(d.method, d.members ? null : d.technique);
}

const samePath = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

// O nó pertence ao caminho? (o próprio, o seu método-pai ou os seus filhos)
function onPath(d, path) {
  if (!path) return true;
  if (d.method !== path[0]) return false;
  if (path.length < 2 || d.depth === 1) return true;
  return d.technique === path[1] || (d.members || []).some((m) => m.technique === path[1]);
}

function isSelected(d) {
  const node = filters.node;
  if (!node || d.method !== node[0]) return false;
  return node.length === 1 ? d.depth === 1 || d.sole : d.technique === node[1];
}

// Hover tem prioridade visual sobre a seleção; a seleção mantém o contorno.
function applyEmphasis() {
  const active = hoverPath || filters.node;
  gArcs.selectAll("path.arc").classed("dim", (d) => !onPath(d, active)).classed("selected", isSelected)
    .filter(isSelected).raise();
  gRoot.selectAll(".arc-labels text").classed("dim", (d) => !onPath(d, active));
}

// ---------- interação ----------

function tooltipContent(d) {
  const { fmt, method } = ctx.theme;
  const m = method[d.method];
  const total = rows.length;
  const lines = [`${fmt.int(d.value)} vitórias`, `${fmt.pct(d.value / total)} do total`];
  if (d.depth === 2 && !d.sole) lines.push(`${fmt.pct(d.value / d.parentValue)} do ${m.short}`);
  if (d.members) {
    lines.push(`Inclui: ${d.members.map((t) => `${ctx.theme.techniqueLabel(t.technique)} (${fmt.int(t.value)})`).join(", ")}`);
  }
  const hint = samePath(d.path, filters.node) ? "Clique para limpar a seleção"
    : d.members ? "Clique para selecionar o método" : "Clique para selecionar";
  return { color: fillOf(d), title: d.depth === 1 || d.sole ? m.label : `${m.label} / ${nodeLabel(d)}`, lines, hint };
}

function onEnter(event, d) {
  hoverPath = d.path;
  applyEmphasis();
  ctx.tooltip.show(event, tooltipContent(d));
  ctx.state.hover({ method: d.method, technique: d.isTechnique ? d.technique : null }, ID);
}

function onLeave() {
  hoverPath = null;
  applyEmphasis();
  ctx.tooltip.hide();
  ctx.state.hover(null, ID);
}

// Clicar no nó já selecionado limpa a seleção.
function onClick(event, d) {
  ctx.state.set({ node: samePath(d.path, filters.node) ? null : d.path }, ID);
}

// ---------- desenho ----------

function measure() {
  const { width, height } = el.getBoundingClientRect();
  radius = Math.max(0, Math.min(width, height) / 2 - MARGIN);
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  gRoot.attr("transform", `translate(${width / 2},${height / 2})`);
  emptyText.attr("x", width / 2).attr("y", height / 2);
}

// Interpola os ângulos a partir do estado desenhado (this._cur), para que
// transições interrompidas continuem de onde estavam.
function tweenAngles(render) {
  return function (d) {
    const i = d3.interpolate(this._cur, { x0: d.x0, x1: d.x1 });
    return (k) => render(d, (this._cur = i(k)));
  };
}

const collapse = function (d) { this._cur = { x0: d.x0, x1: d.x0 }; }; // arcos novos crescem de 0

function drawArcs(t) {
  gArcs.selectAll("path.arc").data(nodes, (d) => d.key)
    .join(
      (enter) => enter.append("path").attr("class", "arc").each(collapse)
        .on("mouseenter", onEnter).on("mousemove", (event, d) => ctx.tooltip.show(event, tooltipContent(d)))
        .on("mouseleave", onLeave).on("click", onClick),
      (update) => update,
      (exit) => exit.transition(t).style("opacity", 0).remove()
    )
    .attr("fill", fillOf)
    .transition(t).attrTween("d", tweenAngles(arcPath));
}

// Rótulos das técnicas (anel exterior): radiais.
function drawTechniqueLabels(t) {
  gLabels.selectAll("text").data(nodes.filter((d) => d.depth === 2), (d) => d.key)
    .join((enter) => enter.append("text").attr("dy", "0.35em").attr("fill-opacity", 0).each(collapse))
    .attr("font-size", ctx.theme.font.size.sm)
    .attr("fill", (d) => ctx.theme.textOn(fillOf(d)))
    .text(labelText)
    .transition(t).attr("fill-opacity", (d) => (labelText(d) ? 1 : 0)).attrTween("transform", tweenAngles(labelTransform));
}

// Rótulos dos métodos (anel interior): seguem o arco através de um textPath.
function drawMethodLabels(t) {
  const pathId = (d) => `sun-label-${ctx.theme.methods.indexOf(d.method)}`;
  const groups = gMethodLabels.selectAll("g").data(nodes.filter((d) => d.depth === 1), (d) => d.key)
    .join((enter) => {
      const group = enter.append("g");
      group.append("path").attr("id", pathId).attr("fill", "none").each(collapse);
      group.append("text").attr("class", "method-label").attr("dy", "0.35em").attr("fill-opacity", 0)
        .append("textPath").attr("href", (d) => `#${pathId(d)}`).attr("startOffset", "50%");
      return group;
    });
  groups.select("path").transition(t).attrTween("d", tweenAngles(labelArc));
  groups.select("text").attr("font-size", ctx.theme.font.size.md).attr("fill", (d) => ctx.theme.textOn(fillOf(d)))
    .transition(t).attr("fill-opacity", (d) => (labelText(d) ? 1 : 0));
  groups.select("textPath").text(labelText);
}

// Centro: total filtrado ou, com um nó selecionado, o nome e a contagem do nó.
function drawCenter() {
  const { fmt, font } = ctx.theme;
  const node = filters.node;
  const hole = RING.hole * radius;
  const count = node ? rows.filter((d) => onPath({ method: d.method, technique: d.technique, depth: 2 }, node)).length : rows.length;
  const name = node ? truncate(pathLabel(node), font.size.sm, hole * 1.7, 700) : "";
  const big = Math.max(font.size.lg, Math.min(30, hole * 0.42));

  gCenter.classed("clearable", !!node).select("circle").attr("r", Math.max(0, hole - 3));
  gCenter.select(".center-name").attr("y", -big * 0.85).attr("fill", node ? ctx.theme.methodColor(node[0]) : null).text(name);
  gCenter.select(".center-value").attr("font-size", big).attr("y", node ? big * 0.2 : 0).text(fmt.int(count));
  gCenter.select(".center-unit").attr("y", big * (node ? 0.95 : 0.8))
    .text(node && rows.length ? `combates · ${fmt.pct(count / rows.length)}` : "combates");
}

function draw(animate) {
  if (!rows) return;
  measure();
  const empty = rows.length === 0;
  const t = svg.transition().duration(animate ? ctx.theme.duration : 0);
  nodes = empty || radius <= 0 ? [] : layout(rows);
  emptyText.attr("display", empty ? null : "none");
  gCenter.attr("display", empty ? "none" : null);
  drawArcs(t);
  drawTechniqueLabels(t);
  drawMethodLabels(t);
  drawCenter();
  applyEmphasis();
}

function build() {
  svg = d3.select(el).append("svg").attr("class", "chart sunburst").attr("role", "img")
    .attr("aria-label", "Sunburst de métodos e técnicas de vitória");
  gRoot = svg.append("g");
  gArcs = gRoot.append("g");
  gLabels = gRoot.append("g").attr("class", "arc-labels");
  gMethodLabels = gRoot.append("g").attr("class", "arc-labels");
  gCenter = gRoot.append("g").attr("class", "center").on("click", () => ctx.state.set({ node: null }, ID));
  gCenter.append("circle");
  gCenter.append("text").attr("class", "center-name");
  gCenter.append("text").attr("class", "center-value");
  gCenter.append("text").attr("class", "center-unit");
  emptyText = svg.append("text").attr("class", "empty").attr("display", "none").text("Sem combates para estes filtros");
}

export const Sunburst = {
  id: ID,
  title: "Métodos e técnicas",
  filterKey: "node",
  info: (meta) =>
    `Q3 · Como são ganhos os combates? O anel interior divide as vitórias por método e o exterior por técnica; ` +
    `o ângulo é proporcional ao nº de vitórias e as técnicas com menos de 1% do seu método juntam-se em "Outras". ` +
    `Passe o rato para ver contagens e percentagens e clique num arco para o selecionar (clique outra vez, ou no centro, para limpar); ` +
    `a seleção destaca-se também na evolução temporal. Contam-se apenas combates com vencedor: ` +
    `${meta.undecided} empates e no contests ficam excluídos, e as decisões não têm subtipo no dataset.`,

  init(container, context) {
    el = container;
    ctx = context;
    build();
    new ResizeObserver(() => draw(false)).observe(el); // redesenha, sem duplicar o SVG
  },

  update(data, f) {
    rows = data;
    filters = f;
    draw(true);
  },

  // Hover vindo de outra vista: destaca o mesmo método/técnica.
  highlight(item) {
    hoverPath = item && item.method ? [item.method, item.technique].filter(Boolean) : null;
    if (rows) applyEmphasis();
  },
};
