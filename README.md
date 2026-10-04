# UFC · Inside the Octagon

Dashboard de Visualização de Informação (IST) — protótipo funcional do Checkpoint III.
Duas idioms implementadas (Sunburst e Evolução temporal) e duas ainda em sketch.

## Como correr

Na raiz do projeto:

```
python -m http.server
```

Depois abrir <http://localhost:8000>. Funciona offline: o D3 v7 está em `lib/d3.v7.min.js`
e não há CDNs, fontes externas, npm, bundlers nem transpilação — só D3 + HTML + CSS + JavaScript (ES modules).

Abrir o `index.html` diretamente (`file://`) não funciona, porque o browser bloqueia os módulos e o `d3.csv`.

Os sketches vão em `sketches/Perfil.png` e `sketches/Histograma.png`. Enquanto não existirem,
os painéis mostram um placeholder cinzento (e o browser regista um 404 por cada imagem em falta).

## Estrutura de ficheiros

```
index.html                 esqueleto: header + 4 painéis da grid
css/style.css              layout (grid 100vh) e aspeto
lib/d3.v7.min.js           D3 local
data/                      ufc_inside_the_octagon.csv, countries.csv
processing/                pré-processamento do dataset (Python)
sketches/                  Perfil.png, Histograma.png
js/main.js                 ponto de entrada: liga dados, State, controlos e vistas
js/state.js                store central dos filtros + d3.dispatch("change", "hover")
js/data.js                 load, preparação (tipos, só linhas W) e filter(filters, except)
js/theme.js                paleta, rótulos, tipografia, espaçamentos, formatação PT
js/tooltip.js              tooltip partilhado
js/infoButton.js           botão ⓘ + popover de cada painel
js/controls.js             barra de filtros (two-way com o State)
js/idioms/sunburst.js       "Métodos e técnicas"
js/idioms/trendLines.js     "Evolução temporal"
```

## Dados e unidade de análise

O CSV tem uma linha por lutador por combate. Um **combate decidido** é a linha com `result === "W"`
(uma por combate); todas as contagens e percentagens são feitas sobre essas linhas.
Empates e no contests não têm vencedor e ficam excluídos. O filtro de país aplica-se à origem do
**vencedor** ("como vencem os lutadores do país X").

No dataset, as decisões (`DEC`) e o método `OTHER` não têm subtipos: no sunburst, o seu anel
exterior é um arco único que seleciona o próprio método.

## Fluxo de dados

```
controlos / vistas ──State.set(patch)──▶ State ──"change"──▶ main.js ──view.update(rows, filters)──▶ vistas
vistas             ──State.hover(item)─▶ State ──"hover"───▶ main.js ──view.highlight(item)───────▶ outras vistas
```

- O `State` é a única fonte de verdade:
  `{ years, weightClass, gender, titleOnly, country, node }`, em que `node` é o nó selecionado
  no sunburst (`["SUB"]` ou `["SUB", "Rear Naked Choke"]`).
- As vistas e os controlos **nunca se chamam uns aos outros**: escrevem no State e reagem ao State.
  É por isso que o brush da Evolução temporal e o slider de anos do header ficam sincronizados
  sem se conhecerem.
- Em cada `change`, o `main.js` entrega a cada vista `Data.filter(filters, view.filterKey)`:
  todos os filtros **exceto** os que a própria vista controla, para ela continuar a mostrar o
  contexto dessa dimensão.
  - Sunburst: `filterKey = "node"` — mostra sempre todos os nós e destaca o selecionado.
  - Evolução temporal: `filterKey = ["years", "node"]` — mostra sempre todos os anos (sombreia os
    que estão fora do intervalo) e usa `node` só para destacar um método ou acrescentar a linha da técnica.

## Como adicionar uma vista nova

1. Criar `js/idioms/minhaVista.js` que exporta um objeto com o contrato:

   ```js
   export const MinhaVista = {
     id: "scatter",                 // monta-se em <section id="panel-scatter">
     title: "Perfil dos lutadores",
     info: (meta) => "Texto do ⓘ…",
     filterKey: null,               // chave(s) do State que esta vista controla (ou null)
     init(el, ctx) {},              // cria o SVG uma vez; ctx = { state, data, meta, theme, tooltip }
     update(rows, filters) {},      // redesenha com as linhas já filtradas
     highlight(item) {},            // opcional: hover vindo de outra vista
   };
   ```

2. Importá-la em `js/main.js` e acrescentá-la ao array `views`.

Para as áreas `scatter` e `hist` (já existentes na grid), basta ainda retirar a entrada
correspondente de `SKETCHES` no `main.js`. Um filtro novo é uma chave nova no State e um
predicado em `PREDICATES` (`js/data.js`).
