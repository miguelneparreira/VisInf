// data.js — carregamento, preparação e filtragem dos dados.
//
// Unidade de análise: um combate decidido = a linha com result === "W"
// (uma por bout). Empates e no contests não têm linha W e ficam excluídos.

const PATHS = {
  fights: "data/ufc_inside_the_octagon.csv",
  countries: "data/countries.csv",
};

// Limite de peso (lb) de cada divisão — serve só para ordenar o <select>.
const WEIGHT_LIMIT = {
  "Flyweight": 125, "Bantamweight": 135, "Featherweight": 145, "Lightweight": 155,
  "Welterweight": 170, "Middleweight": 185, "Light Heavyweight": 205, "Heavyweight": 265,
  "Women's Strawweight": 115, "Women's Flyweight": 125,
  "Women's Bantamweight": 135, "Women's Featherweight": 145,
};

const num = (v) => (v === "" || v == null ? null : +v);

// Converte uma linha do CSV para tipos JS (nomes em camelCase).
function parseRow(d) {
  return {
    boutId: d.bout_id, event: d.event, date: new Date(d.date), year: +d.year,
    eventIso: d.event_iso, weightClass: d.weight_class, gender: d.gender,
    isTitle: d.is_title === "1", endRound: num(d.end_round), fightTime: num(d.fight_time_s),
    method: d.method, technique: d.technique, position: d.position || null,
    fighterId: d.fighter_id, fighter: d.fighter, opponent: d.opponent, result: d.result,
    originIso: d.origin_iso || null, originCountry: d.origin_country || null,
    isHome: num(d.is_home), age: num(d.age), reach: num(d.reach_cm), reachDiff: num(d.reach_diff_cm),
    sigLanded: num(d.sig_landed), sigPerMin: num(d.sig_per_min),
    tdLanded: num(d.td_landed), ctrl: num(d.ctrl_s),
  };
}

// Um predicado por chave do State. Um filtro novo = uma entrada aqui.
const PREDICATES = {
  years: (d, v) => d.year >= v[0] && d.year <= v[1],
  weightClass: (d, v) => v === null || d.weightClass === v,
  gender: (d, v) => v.includes(d.gender),
  titleOnly: (d, v) => !v || d.isTitle,
  country: (d, v) => v === null || d.originIso === v,
  node: (d, v) => !v || (d.method === v[0] && (v.length < 2 || d.technique === v[1])),
};

// Divisões ordenadas por grupo (masculinas, femininas, outras) e limite de peso.
function weightClasses(wins) {
  const groupOf = (name, gender) =>
    !(name in WEIGHT_LIMIT) ? "Outras" : gender === "F" ? "Femininas" : "Masculinas";
  const order = ["Masculinas", "Femininas", "Outras"];
  return d3.rollups(wins, (v) => v[0].gender, (d) => d.weightClass)
    .map(([name, gender]) => ({ name, group: groupOf(name, gender), limit: WEIGHT_LIMIT[name] ?? Infinity }))
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.limit - b.limit);
}

// Países de countries.csv com o nº de lutadores distintos (todas as linhas, não só W).
function countryList(all, countries) {
  const fighters = d3.rollup(
    all.filter((d) => d.originIso),
    (v) => new Set(v.map((d) => d.fighterId)).size,
    (d) => d.originIso
  );
  return countries
    .map((c) => ({ iso: c.iso2, name: c.name, fighters: fighters.get(c.iso2) || 0 }))
    .sort((a, b) => d3.ascending(a.name, b.name));
}

// Técnicas de cada método por ordem decrescente de frequência (dataset completo).
// Ordem estável => cores de técnica estáveis em todas as vistas e filtros.
function techniquesByMethod(wins) {
  return new Map(
    d3.rollups(wins, (v) => v.length, (d) => d.method, (d) => d.technique).map(([method, techs]) => [
      method,
      techs.sort((a, b) => d3.descending(a[1], b[1])).map(([t]) => t),
    ])
  );
}

function buildMeta(all, wins, countries) {
  const list = countryList(all, countries);
  const bouts = new Set(all.map((d) => d.boutId)).size;
  return {
    years: d3.extent(wins, (d) => d.year),
    weightClasses: weightClasses(wins),
    countries: list,
    countryName: new Map(list.map((c) => [c.iso, c.name])),
    techniques: techniquesByMethod(wins),
    bouts,
    decided: wins.length,
    undecided: bouts - wins.length,
  };
}

export const Data = {
  rows: [], // linhas W (um combate decidido por linha)
  meta: null,

  // Carrega os dois CSV, converte tipos e fica só com as linhas do vencedor.
  async load() {
    const [all, countries] = await Promise.all([d3.csv(PATHS.fights, parseRow), d3.csv(PATHS.countries)]);
    Data.rows = all.filter((d) => d.result === "W");
    Data.meta = buildMeta(all, Data.rows, countries);
    return Data;
  },

  // Aplica todos os filtros exceto `except` (chave ou lista de chaves).
  // Cada vista exclui o filtro que ela própria controla, para continuar a
  // mostrar o contexto completo dessa dimensão.
  filter(filters, except) {
    const skip = new Set([].concat(except ?? []));
    const keys = Object.keys(PREDICATES).filter((k) => !skip.has(k) && k in filters);
    return Data.rows.filter((d) => keys.every((k) => PREDICATES[k](d, filters[k])));
  },
};
