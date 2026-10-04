// idioms/trendLines.js — "Evolução temporal".
//
// Line chart com pontos: x = ano, y = % das vitórias desse ano obtidas por cada
// método (KO/TKO, SUB, DEC; OTHER é omitido). Controla o filtro `years` através
// de um brush no eixo x, por isso mostra sempre todos os anos e sombreia os
// que estão fora do intervalo. Também ignora `node`: o nó selecionado no
// sunburst não filtra as linhas, apenas destaca um método / acrescenta a
// linha da técnica.
//
// Só comunica com o exterior através de ctx.state (set/hover).

const ID = "lines";
const MIN_N = 10; // abaixo disto, o ano é sinalizado como incerto
const MARGIN = { top: 10, right: 18, bottom: 30, left: 40 };
const BRUSH_H = 22; // faixa do brush, sobre o eixo x
const SNAP_PX = 14; // distância máx. para "apanhar" uma linha com o rato
const POINT_R = 3;

let ctx, chartEl, legend, svg, g, gGrid, gX, gShade, gSeries, gTech, gGuide, gHit, gBrush;
let brush, x, y;
let width = 0;
let height = 0;
let rows = null;
let filters = null;
let series = []; // [{ method, color, points: [{ year, n, total, pct, weak }] }]
let tech = null; // linha da técnica selecionada (ou null)
let hoverMethod = null;
let lastHover = "";
let brushing = false;

// ---------- dados ----------

// Percentagem por ano de um subconjunto (método ou técnica) face ao total do ano.
function yearlyShare(subset, totals) {
  const counts = d3.rollup(subset, (v) => v.length, (d) => d.year);
  const [minY, maxY] = ctx.meta.years;
  return d3.range(minY, maxY + 1)
    .map((year) => ({ year, n: counts.get(year) || 0, total: totals.get(year) || 0 }))
    .filter((p) => p.total > 0) // anos sem combates não têm ponto
    .map((p) => ({ ...p, pct: p.n / p.total, weak: p.total < MIN_N }));
}

function compute() {
  const totals = d3.rollup(rows, (v) => v.length, (d) => d.year);
  const byMethod = d3.group(rows, (d) => d.method);
  series = ctx.theme.trendMethods.map((method) => ({
    method,
    color: ctx.theme.methodColor(method),
    points: yearlyShare(byMethod.get(method) || [], totals),
  }));
  const node = filters.node;
  tech = node && node.length === 2 && {
    method: node[0],
    label: ctx.theme.techniqueLabel(node[1]),
    color: ctx.theme.techniqueColor(node[0], node[1]),
    points: yearlyShare((byMethod.get(node[0]) || []).filter((d) => d.technique === node[1]), totals),
  };
}

// Segmentos entre anos consecutivos; tracejados se algum extremo for incerto.
function segments(points) {
  return d3.pairs(points)
    .filter(([a, b]) => b.year - a.year === 1)
    .map(([a, b]) => ({ a, b, key: a.year, weak: a.weak || b.weak }));
}

// ---------- escalas e anos ----------

// Cada ano ocupa a banda [ano - 0.5, ano + 0.5] (permite selecionar um só ano).
const yearsToPx = (years) => [x(years[0] - 0.5), x(years[1] + 0.5)];

// Com todos os anos selecionados o brush fica vazio, para se poder arrastar
// um novo intervalo em qualquer ponto do eixo.
const isFullRange = (years) => years[0] === ctx.meta.years[0] && years[1] === ctx.meta.years[1];
const brushSelection = (years) => (isFullRange(years) ? null : yearsToPx(years));

function pxToYears([a, b]) {
  const [minY, maxY] = ctx.meta.years;
  const from = Math.max(minY, Math.round(x.invert(a) + 0.5));
  return [from, Math.max(from, Math.min(maxY, Math.round(x.invert(b) - 0.5)))];
}

function measure() {
  const box = chartEl.getBoundingClientRect();
  width = Math.max(0, box.width - MARGIN.left - MARGIN.right);
  height = Math.max(0, box.height - MARGIN.top - MARGIN.bottom);
  svg.attr("viewBox", `0 0 ${box.width} ${box.height}`);
  x.range([0, width]);
  y.range([height, 0]);
}

// ---------- seleção e destaque ----------

const selectedMethod = () => (filters.node ? filters.node[0] : null);

function toggleMethod(method) {
  ctx.state.set({ node: selectedMethod() === method && filters.node.length === 1 ? null : [method] }, ID);
}

function applyEmphasis() {
  const selected = selectedMethod();
  const active = hoverMethod || selected;
  const dim = (method) => !!active && method !== active;
  gSeries.selectAll("g.series").classed("dim", (s) => dim(s.method)).classed("selected", (s) => s.method === selected);
  legend.selectAll("button").classed("dim", (m) => dim(m)).attr("aria-pressed", (m) => m === selected);
}

// ---------- desenho ----------

function drawAxes() {
  const [minY, maxY] = ctx.meta.years;
  const step = width < 380 ? 5 : width < 620 ? 2 : 1;
  const ticks = d3.range(minY, maxY + 1).filter((yr) => (maxY - yr) % step === 0);
  gX.attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format("d")).tickSizeOuter(0));
  gGrid.call(d3.axisLeft(y).tickValues([0, 0.25, 0.5, 0.75, 1]).tickFormat(ctx.theme.fmt.pct0).tickSize(-width).tickPadding(6));
}

// Sombreia os anos fora do intervalo selecionado (incluindo a faixa do eixo).
function drawShade() {
  const [a, b] = yearsToPx(filters.years);
  const zones = [{ x: 0, w: Math.max(0, a) }, { x: b, w: Math.max(0, width - b) }];
  gShade.selectAll("rect").data(zones).join("rect")
    .attr("x", (d) => d.x).attr("width", (d) => d.w).attr("y", 0).attr("height", height + BRUSH_H);
}

function drawSegments(group, s, t) {
  group.selectAll("line.seg").data(segments(s.points), (d) => d.key)
    .join((enter) => enter.append("line").attr("class", "seg")
      .attr("x1", (d) => x(d.a.year)).attr("x2", (d) => x(d.b.year))
      .attr("y1", (d) => y(d.a.pct)).attr("y2", (d) => y(d.b.pct)).attr("opacity", 0))
    .attr("stroke", s.color).classed("weak", (d) => d.weak)
    .transition(t).attr("opacity", 1)
    .attr("x1", (d) => x(d.a.year)).attr("x2", (d) => x(d.b.year))
    .attr("y1", (d) => y(d.a.pct)).attr("y2", (d) => y(d.b.pct));
}

// Pontos ocos = anos com menos de MIN_N vitórias.
function drawPoints(group, s, t) {
  group.selectAll("circle.pt").data(s.points, (d) => d.year)
    .join((enter) => enter.append("circle").attr("class", "pt").attr("r", POINT_R)
      .attr("cx", (d) => x(d.year)).attr("cy", (d) => y(d.pct)).attr("opacity", 0))
    .attr("stroke", s.color).attr("fill", (d) => (d.weak ? ctx.theme.ui.panel : s.color))
    .transition(t).attr("opacity", 1).attr("cx", (d) => x(d.year)).attr("cy", (d) => y(d.pct));
}

function drawSeries(t) {
  gSeries.selectAll("g.series").data(series, (s) => s.method)
    .join((enter) => enter.append("g").attr("class", "series"))
    .each(function (s) {
      drawSegments(d3.select(this), s, t);
      drawPoints(d3.select(this), s, t);
    });
}

// Linha tracejada da técnica selecionada, na cor da técnica, com rótulo no fim.
function drawTechnique(t) {
  const data = tech ? [tech] : [];
  const line = d3.line().x((d) => x(d.year)).y((d) => y(d.pct));
  const last = (d) => d.points[d.points.length - 1];
  gTech.selectAll("path").data(data).join("path").attr("class", "tech-line")
    .attr("stroke", (d) => d.color).transition(t).attr("d", (d) => line(d.points));
  gTech.selectAll("text").data(data.filter((d) => d.points.length)).join("text").attr("class", "tech-label")
    .attr("text-anchor", "end").text((d) => d.label)
    .transition(t).attr("x", (d) => x(last(d).year)).attr("y", (d) => y(last(d).pct) - 8);
}

function drawBrush(resized) {
  if (resized) {
    brush.extent([[0, 0], [Math.max(1, width), BRUSH_H]]);
    gBrush.attr("transform", `translate(0,${height})`).call(brush);
  }
  if (!brushing) gBrush.call(brush.move, brushSelection(filters.years));
}

function draw(animate, resized) {
  if (!rows) return;
  if (resized) measure();
  const empty = rows.length === 0;
  const t = svg.transition().duration(animate ? ctx.theme.duration : 0);
  svg.select(".empty").attr("display", empty ? null : "none")
    .attr("x", MARGIN.left + width / 2).attr("y", MARGIN.top + height / 2);
  gHit.select("rect").attr("width", width).attr("height", height);
  drawAxes();
  drawShade();
  drawSeries(t);
  drawTechnique(t);
  drawBrush(resized);
  applyEmphasis();
}

// ---------- interação: hover, clique, brush ----------

// Ano mais próximo do cursor e, se estiver perto de uma linha, o seu método.
function nearest(event) {
  const [mx, my] = d3.pointer(event, gHit.node());
  const [minY, maxY] = ctx.meta.years;
  const year = Math.max(minY, Math.min(maxY, Math.round(x.invert(mx))));
  const at = series.map((s) => ({ method: s.method, p: s.points.find((p) => p.year === year) })).filter((c) => c.p);
  const best = d3.least(at, (c) => Math.abs(y(c.p.pct) - my));
  const near = best && Math.abs(y(best.p.pct) - my) <= SNAP_PX ? best.method : null;
  return { year, method: near };
}

// "Submission · 2020 · 16,2% · 83/511"
function tooltipContent(year, method) {
  const { fmt } = ctx.theme;
  const row = (label, color, p, strong) => ({ color, strong, text: `${label} · ${year} · ${fmt.pct(p.pct)} · ${fmt.int(p.n)}/${fmt.int(p.total)}` });
  const at = (points) => points.find((p) => p.year === year);
  const lines = series.filter((s) => at(s.points))
    .map((s) => row(ctx.theme.method[s.method].label, s.color, at(s.points), s.method === method));
  if (tech && at(tech.points)) lines.push(row(tech.label, tech.color, at(tech.points), false));
  if (!lines.length) return { title: String(year), lines: ["Sem combates neste ano"] };
  const weak = at(series[0].points).weak;
  return { title: weak ? `${year} · menos de ${MIN_N} vitórias` : String(year), lines, hint: method ? "Clique para selecionar o método" : null };
}

function onMove(event) {
  const { year, method } = nearest(event);
  gGuide.attr("display", null).attr("x1", x(year)).attr("x2", x(year)).attr("y2", height);
  gSeries.selectAll("circle.pt").attr("r", (d) => (d.year === year ? POINT_R + 2 : POINT_R));
  gHit.style("cursor", method ? "pointer" : null);
  ctx.tooltip.show(event, tooltipContent(year, method));
  hoverMethod = method;
  applyEmphasis();
  if (lastHover !== `${year}|${method}`) ctx.state.hover({ year, method }, ID); // só quando muda
  lastHover = `${year}|${method}`;
}

function onLeave() {
  gGuide.attr("display", "none");
  gSeries.selectAll("circle.pt").attr("r", POINT_R);
  ctx.tooltip.hide();
  hoverMethod = null;
  lastHover = "";
  applyEmphasis();
  ctx.state.hover(null, ID);
}

function onClick(event) {
  const { method } = nearest(event);
  if (method) toggleMethod(method);
}

// O brush escreve `years` no State (com snap ao ano); o slider do header
// reage ao State, e vice-versa.
function onBrush(event) {
  if (!event.sourceEvent) return; // movimento programático: ignorar
  brushing = event.type !== "end";
  const years = event.selection ? pxToYears(event.selection) : ctx.meta.years; // clique vazio = tudo
  ctx.state.set({ years }, ID);
  if (event.type === "end") gBrush.call(brush.move, brushSelection(years));
}

// ---------- construção ----------

function buildLegend(container) {
  legend = d3.select(container).append("div").attr("class", "legend");
  const items = legend.selectAll("button").data(ctx.theme.trendMethods).join("button")
    .attr("type", "button").attr("class", "legend-item").on("click", (event, m) => toggleMethod(m));
  items.append("span").attr("class", "swatch").style("background", (m) => ctx.theme.methodColor(m));
  items.append("span").text((m) => ctx.theme.method[m].label);
  const note = legend.append("span").attr("class", "legend-note");
  note.append("span").attr("class", "weak-key");
  note.append("span").text(`ano com < ${MIN_N} vitórias`);
}

function buildChart(container) {
  chartEl = d3.select(container).append("div").attr("class", "chart-wrap").node();
  svg = d3.select(chartEl).append("svg").attr("class", "chart trend").attr("role", "img")
    .attr("aria-label", "Percentagem de vitórias por método, por ano");
  g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  gGrid = g.append("g").attr("class", "axis grid");
  gShade = g.append("g").attr("class", "shade");
  gBrush = g.append("g").attr("class", "brush"); // por baixo dos rótulos do eixo
  gX = g.append("g").attr("class", "axis x-axis");
  gGuide = g.append("line").attr("class", "guide").attr("display", "none");
  gSeries = g.append("g");
  gTech = g.append("g");
  gHit = g.append("g").attr("class", "hit").on("pointermove", onMove).on("pointerleave", onLeave).on("click", onClick);
  gHit.append("rect");
  svg.append("text").attr("class", "empty").attr("display", "none").text("Sem combates para estes filtros");
}

export const TrendLines = {
  id: ID,
  title: "Evolução temporal",
  filterKey: ["years", "node"],
  info: () =>
    `Q1 · O UFC ficou mais ou menos decisivo? Cada linha mostra, por ano, a percentagem das vitórias obtidas por knockout, ` +
    `submission ou decisão (o método "Outro" é omitido por ser residual, por isso as três linhas podem não somar 100%). ` +
    `Arraste no eixo dos anos para escolher o intervalo (sincronizado com o slider do topo) e clique numa linha ou na legenda ` +
    `para selecionar um método; ao selecionar uma técnica no sunburst surge a sua linha tracejada. ` +
    `Anos com menos de ${MIN_N} vitórias aparecem com pontos ocos e segmentos tracejados: a percentagem é pouco fiável.`,

  init(container, context) {
    ctx = context;
    x = d3.scaleLinear().domain([ctx.meta.years[0] - 0.5, ctx.meta.years[1] + 0.5]);
    y = d3.scaleLinear().domain([0, 1]);
    brush = d3.brushX().on("start brush end", onBrush);
    buildLegend(container);
    buildChart(container);
    new ResizeObserver(() => draw(false, true)).observe(chartEl); // redesenha, sem duplicar o SVG
  },

  update(data, f) {
    rows = data;
    filters = f;
    compute();
    draw(true, width === 0);
  },

  // Hover vindo de outra vista: destaca a linha do mesmo método.
  highlight(item) {
    hoverMethod = item && ctx.theme.trendMethods.includes(item.method) ? item.method : null;
    if (rows) applyEmphasis();
  },
};
