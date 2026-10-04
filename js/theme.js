// theme.js — identidade visual partilhada por TODAS as vistas e pelo CSS:
// paleta, rótulos, tipografia, espaçamentos e formatação numérica PT.

// Paleta colorblind-safe (Okabe–Ito). É a única definição de cor de método.
const METHOD = {
  "KO/TKO": { label: "Knockout", short: "KO/TKO", color: "#D55E00" },
  "SUB": { label: "Submission", short: "SUB", color: "#0072B2" },
  "DEC": { label: "Decisão", short: "DEC", color: "#009E73" },
  "OTHER": { label: "Outro", short: "Outro", color: "#7A7F87" },
};

// Rótulos de técnicas cujo valor no CSV não é legível por si só.
const TECHNIQUE_LABEL = { DEC: "Decisão", Other: "Não especificada" };

const UI = {
  bg: "#F2F3F5", panel: "#FFFFFF", ink: "#1B1F24", muted: "#667085",
  line: "#D9DDE3", grid: "#E9ECF0", accent: "#3B4A63",
};

const FONT = {
  family: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  size: { xs: 10, sm: 11, md: 12, lg: 14, xl: 18 },
};

const SPACE = { xs: 4, sm: 8, md: 12, lg: 16 };

// Formatação portuguesa: vírgula decimal, espaço (não separável) nos milhares.
const locale = d3.formatLocale({ decimal: ",", thousands: " ", grouping: [3], currency: ["", " €"] });
const fmt = {
  int: locale.format(","),
  pct: locale.format(".1%"),
  pct0: locale.format(".0%"),
};

// Ordem das técnicas de cada método (preenchida a partir dos dados).
let techniqueOrder = new Map();

export const Theme = {
  methods: Object.keys(METHOD), // ordem fixa de desenho
  trendMethods: ["KO/TKO", "SUB", "DEC"], // OTHER é omitido da evolução temporal
  method: METHOD,
  ui: UI,
  font: FONT,
  space: SPACE,
  fmt,
  dimOpacity: 0.22,
  duration: 500,

  // Regista a ordem das técnicas (Map método -> [técnicas]) para cores estáveis.
  registerTechniques(order) {
    techniqueOrder = order;
  },

  methodColor(method) {
    return METHOD[method].color;
  },

  // Técnica = tom mais claro da cor do método; quanto mais rara, mais claro.
  // rank nulo => grupo "Outras" (o tom mais claro).
  techniqueColor(method, technique) {
    const order = techniqueOrder.get(method) || [];
    const i = order.indexOf(technique);
    const t = i < 0 ? 1.15 : order.length > 1 ? Math.sqrt(i / (order.length - 1)) : 0.3;
    return d3.interpolateRgb(METHOD[method].color, "#FFFFFF")(0.22 + 0.4 * t);
  },

  techniqueLabel(technique) {
    return TECHNIQUE_LABEL[technique] || technique;
  },

  // Cor de texto com contraste suficiente sobre `fill`.
  textOn(fill) {
    return d3.hcl(fill).l > 64 ? UI.ink : "#FFFFFF";
  },

  // Publica os tokens como variáveis CSS, para o style.css usar os mesmos valores.
  applyCss(root = document.documentElement) {
    const set = (name, value) => root.style.setProperty(name, value);
    Object.entries(UI).forEach(([k, v]) => set(`--${k}`, v));
    Object.entries(FONT.size).forEach(([k, v]) => set(`--fs-${k}`, `${v}px`));
    Object.entries(SPACE).forEach(([k, v]) => set(`--sp-${k}`, `${v}px`));
    set("--font", FONT.family);
    set("--dim", Theme.dimOpacity);
  },
};
