// state.js — store central dos filtros (única fonte de verdade).
//
// Controlos e vistas NUNCA falam entre si: escrevem aqui com set()/hover()
// e o main.js redistribui o novo estado por todas as vistas.
//
//   filtros = {
//     years:       [min, max]      intervalo de anos (inclusivo)
//     weightClass: null | string   divisão
//     gender:      ["M", "F"]      géneros incluídos
//     titleOnly:   boolean         só combates de título
//     country:     null | ISO-2    país de origem do VENCEDOR
//     node:        null | [método] | [método, técnica]   nó do sunburst
//   }

const dispatch = d3.dispatch("change", "hover");

let defaults = {
  years: [0, 0],
  weightClass: null,
  gender: ["M", "F"],
  titleOnly: false,
  country: null,
  node: null,
};
let filters = clone(defaults);

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const State = {
  // Define os valores por omissão que dependem dos dados (ex.: extensão de anos).
  init(patch) {
    defaults = { ...defaults, ...clone(patch) };
    filters = clone(defaults);
  },

  // Cópia do estado atual (as vistas não o podem mutar por engano).
  get() {
    return clone(filters);
  },

  // Aplica um patch parcial; só emite "change" se algo mudou de facto.
  // `source` identifica quem escreveu (id da vista ou "controls").
  set(patch, source) {
    const changed = Object.keys(patch).filter((k) => !same(patch[k], filters[k]));
    if (!changed.length) return;
    changed.forEach((k) => (filters[k] = clone(patch[k])));
    dispatch.call("change", null, State.get(), source, changed);
  },

  // Repõe todos os filtros.
  reset(source) {
    State.set(defaults, source);
  },

  // Hover transitório (não é filtro): item = { method, technique?, year? } | null.
  hover(item, source) {
    dispatch.call("hover", null, item, source);
  },

  // on("change.<ns>", (filters, source, changedKeys) => …)
  // on("hover.<ns>",  (item, source) => …)
  on(type, cb) {
    dispatch.on(type, cb);
    return State;
  },
};
