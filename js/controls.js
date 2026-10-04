// controls.js — barra de filtros do header.
//
// Todos os controlos são two-way: escrevem no State quando o utilizador mexe
// e redesenham-se quando o State muda (venha a mudança de onde vier — por
// exemplo, do brush da vista "Evolução temporal").
//
// Cada build*() cria um controlo e devolve a sua função sync(filters).

const SOURCE = "controls";
const MAX_SUGGESTIONS = 8;
const SLIDER = { width: 240, height: 26, pad: 9, band: 16 };

let ctx;

// Envolve um controlo num bloco "rótulo + conteúdo".
function field(parent, label, cls) {
  const wrap = parent.append("div").attr("class", `field ${cls || ""}`);
  if (label) wrap.append("span").attr("class", "field-label").text(label);
  return wrap;
}

// ---------- Anos: slider de 2 handles (d3.brushX sobre um eixo) ----------

function buildYears(parent) {
  const [minY, maxY] = ctx.meta.years;
  const { width, height, pad, band } = SLIDER;
  const wrap = field(parent, "Anos", "years");
  const lo = wrap.append("span").attr("class", "year-label");
  const svg = wrap.append("svg").attr("class", "year-slider").attr("width", width).attr("height", height);
  const hi = wrap.append("span").attr("class", "year-label");

  // Cada ano ocupa a banda [ano - 0.5, ano + 0.5], o que permite escolher um só ano.
  const x = d3.scaleLinear([minY - 0.5, maxY + 0.5], [pad, width - pad]);
  const toPx = (years) => [x(years[0] - 0.5), x(years[1] + 0.5)];
  const snap = ([a, b]) => {
    const from = Math.max(minY, Math.round(x.invert(a) + 0.5));
    return [from, Math.max(from, Math.min(maxY, Math.round(x.invert(b) - 0.5)))];
  };

  const axis = d3.axisBottom(x).tickValues(d3.range(minY, maxY + 1).filter((y) => y % 5 === 0)).tickFormat(() => "").tickSize(4);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${band + 2})`).call(axis);
  svg.append("line").attr("class", "slider-track").attr("x1", pad).attr("x2", width - pad).attr("y1", band / 2 + 1).attr("y2", band / 2 + 1);

  let brushing = false;
  const brush = d3.brushX().extent([[pad, 1], [width - pad, band + 1]]).on("start brush end", onBrush);
  const g = svg.append("g").attr("class", "brush").call(brush);
  const handles = g.selectAll(".slider-handle").data([0, 1]).join("circle")
    .attr("class", "slider-handle").attr("r", 6).attr("cy", band / 2 + 1);

  function show(years, px) {
    lo.text(years[0]);
    hi.text(years[1]);
    handles.attr("cx", (i) => px[i]);
  }

  function onBrush(event) {
    if (!event.sourceEvent) return; // movimento programático (sync): ignorar
    brushing = event.type !== "end";
    const years = event.selection ? snap(event.selection) : [minY, maxY]; // clique vazio = tudo
    show(years, event.selection || toPx(years));
    ctx.state.set({ years }, SOURCE);
    if (event.type === "end") sync({ years }); // snap visual ao ano
  }

  function sync(f) {
    if (brushing) return;
    g.call(brush.move, toPx(f.years));
    show(f.years, toPx(f.years));
  }
  return sync;
}

// ---------- Divisão: <select> agrupado e ordenado por peso ----------

function buildDivision(parent) {
  const select = field(parent, "Divisão").append("select").attr("aria-label", "Divisão");
  select.append("option").attr("value", "").text("Todas");
  d3.groups(ctx.meta.weightClasses, (d) => d.group).forEach(([group, items]) => {
    select.append("optgroup").attr("label", group)
      .selectAll("option").data(items).join("option").attr("value", (d) => d.name).text((d) => d.name);
  });
  select.on("change", function () {
    ctx.state.set({ weightClass: this.value || null }, SOURCE);
  });
  return (f) => select.property("value", f.weightClass || "");
}

// ---------- Género: duas checkboxes (nunca ambas desmarcadas) ----------

function buildGender(parent) {
  const wrap = field(parent, "Género");
  const boxes = wrap.selectAll("label").data(["M", "F"]).join("label").attr("class", "check");
  const inputs = boxes.append("input").attr("type", "checkbox").attr("value", (d) => d);
  boxes.append("span").text((d) => d);
  inputs.on("change", function () {
    const next = inputs.filter(function () { return this.checked; }).data();
    if (!next.length) return void (this.checked = true); // impede desmarcar ambas
    ctx.state.set({ gender: next }, SOURCE);
  });
  return (f) => inputs.property("checked", (d) => f.gender.includes(d));
}

// ---------- Título: toggle switch ----------

function buildTitle(parent) {
  const label = field(parent, null).append("label").attr("class", "switch");
  const input = label.append("input").attr("type", "checkbox").attr("role", "switch");
  label.append("span").attr("class", "switch-track");
  label.append("span").text("Só combates de título");
  input.on("change", function () {
    ctx.state.set({ titleOnly: this.checked }, SOURCE);
  });
  return (f) => input.property("checked", f.titleOnly);
}

// ---------- País: autocomplete próprio + limpar ----------

// Normaliza para pesquisa sem acentos nem maiúsculas.
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Sugestões: primeiro as que começam pelo texto, depois por nº de lutadores.
function suggest(query) {
  const q = norm(query);
  const starts = (c) => (norm(c.name).startsWith(q) ? 0 : 1);
  return ctx.meta.countries
    .filter((c) => !q || norm(c.name).includes(q) || c.iso.toLowerCase() === q)
    .sort((a, b) => starts(a) - starts(b) || b.fighters - a.fighters)
    .slice(0, MAX_SUGGESTIONS);
}

function buildAutocomplete(wrap, choose) {
  const combo = wrap.append("div").attr("class", "combo");
  const input = combo.append("input").attr("type", "text").attr("placeholder", "Escrever país…")
    .attr("role", "combobox").attr("aria-autocomplete", "list").attr("aria-expanded", "false")
    .attr("aria-controls", "country-list").attr("aria-label", "País do vencedor").attr("autocomplete", "off");
  const clear = combo.append("button").attr("type", "button").attr("class", "combo-clear")
    .attr("aria-label", "Limpar país").text("×").on("click", () => choose(null));
  const list = combo.append("ul").attr("id", "country-list").attr("role", "listbox").property("hidden", true);

  let items = [];
  let active = -1;
  let current = ""; // nome do país atualmente no State

  function close() {
    list.property("hidden", true);
    input.attr("aria-expanded", "false");
    active = -1;
  }

  function render() {
    list.property("hidden", !items.length);
    input.attr("aria-expanded", String(!!items.length));
    const li = list.selectAll("li").data(items, (d) => d.iso).join("li").attr("role", "option")
      .classed("active", (d, i) => i === active).attr("aria-selected", (d, i) => i === active)
      .on("mousedown", (event, d) => { event.preventDefault(); pick(d); }); // antes do blur
    li.selectAll("*").remove();
    li.append("span").text((d) => d.name);
    li.append("small").text((d) => `${ctx.theme.fmt.int(d.fighters)} lut.`);
  }

  function pick(country) {
    close();
    choose(country.iso);
    input.node().blur();
  }

  function move(step) {
    if (list.property("hidden")) items = suggest(input.property("value"));
    if (!items.length) return;
    active = (active + step + items.length) % items.length;
    render();
  }

  const keys = {
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    Enter: () => { const c = items[active] || (items.length === 1 ? items[0] : null); if (c) pick(c); },
    Escape: () => { close(); input.property("value", current); },
  };

  input
    .on("input focus", () => { items = suggest(input.property("value") === current ? "" : input.property("value")); active = -1; render(); })
    .on("keydown", (event) => { if (keys[event.key]) { event.preventDefault(); keys[event.key](); } })
    .on("blur", () => { close(); input.property("value", current); });

  return (iso) => {
    current = iso ? ctx.meta.countryName.get(iso) || iso : "";
    input.property("value", current);
    clear.property("hidden", !iso);
  };
}

function buildCountry(parent) {
  const wrap = field(parent, "País do vencedor", "country");
  const choose = (iso) => ctx.state.set({ country: iso }, SOURCE);
  const syncInput = buildAutocomplete(wrap, choose);
  return (f) => syncInput(f.country);
}

// ---------- Resumo e "Limpar filtros" ----------

function buildSummary(parent) {
  const summary = parent.append("div").attr("class", "summary").attr("aria-live", "polite");
  const count = summary.append("strong");
  summary.append("span").text(" combates ");
  summary.append("small").text(`de ${ctx.theme.fmt.int(ctx.meta.decided)}`);
  parent.append("button").attr("type", "button").attr("class", "btn").text("Limpar filtros")
    .on("click", () => ctx.state.reset(SOURCE));
  return (f) => count.text(ctx.theme.fmt.int(ctx.data.filter(f).length));
}

export const Controls = {
  // filtersEl: barra de filtros; actionsEl: zona do resumo + botão de limpar.
  init(filtersEl, actionsEl, context) {
    ctx = context;
    const bar = d3.select(filtersEl);
    const syncs = [buildYears, buildDivision, buildGender, buildTitle, buildCountry].map((build) => build(bar));
    syncs.push(buildSummary(d3.select(actionsEl)));

    const syncAll = (f) => syncs.forEach((sync) => sync(f));
    ctx.state.on("change.controls", syncAll);
    syncAll(ctx.state.get());
  },
};
