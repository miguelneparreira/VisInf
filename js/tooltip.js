// tooltip.js — um único tooltip, partilhado por todas as vistas, para que o
// aspeto e o comportamento sejam iguais em todo o dashboard.
//
// Conteúdo: { color?, title, lines: [string | { text, color?, strong? }], hint? }

const OFFSET = 14;
let node = null;

function ensure() {
  if (!node) node = d3.select("body").append("div").attr("class", "tooltip").attr("role", "tooltip");
  return node;
}

function swatch(parent, color) {
  if (color) parent.append("span").attr("class", "swatch").style("background", color);
}

// Reconstrói o conteúdo com textContent (nunca HTML vindo dos dados).
function render(tip, content) {
  tip.selectAll("*").remove();
  const title = tip.append("div").attr("class", "tooltip-title");
  swatch(title, content.color);
  title.append("span").text(content.title);
  (content.lines || []).forEach((line) => {
    const item = typeof line === "string" ? { text: line } : line;
    const row = tip.append("div").attr("class", "tooltip-line").classed("strong", !!item.strong);
    swatch(row, item.color);
    row.append("span").text(item.text);
  });
  if (content.hint) tip.append("div").attr("class", "tooltip-hint").text(content.hint);
}

// Coloca o tooltip junto ao cursor sem sair da janela.
function place(tip, event) {
  const { width, height } = tip.node().getBoundingClientRect();
  const x = event.clientX + OFFSET + width > window.innerWidth ? event.clientX - OFFSET - width : event.clientX + OFFSET;
  const y = Math.min(event.clientY + OFFSET, window.innerHeight - height - OFFSET / 2);
  tip.style("left", `${Math.max(4, x)}px`).style("top", `${Math.max(4, y)}px`);
}

export const Tooltip = {
  show(event, content) {
    const tip = ensure();
    render(tip, content);
    tip.classed("visible", true);
    place(tip, event);
  },
  hide() {
    if (node) node.classed("visible", false);
  },
};
