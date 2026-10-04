// infoButton.js — botão ⓘ no canto de um painel, que abre um popover com a
// explicação da idiom (o que mostra, que pergunta responde, como interagir).

let openPopover = null; // só um popover aberto de cada vez
let uid = 0;

function close() {
  if (!openPopover) return;
  openPopover.popover.hidden = true;
  openPopover.button.setAttribute("aria-expanded", "false");
  openPopover = null;
}

function open(button, popover) {
  close();
  popover.hidden = false;
  button.setAttribute("aria-expanded", "true");
  openPopover = { button, popover };
}

// Fecha ao clicar fora ou com Esc.
document.addEventListener("click", (event) => {
  if (openPopover && !openPopover.popover.contains(event.target) && event.target !== openPopover.button) close();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") close();
});

export const InfoButton = {
  // Acrescenta o botão e o popover a `panel`; `title` e `text` são texto simples.
  attach(panel, title, text) {
    const id = `info-${++uid}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "info-btn";
    button.textContent = "ⓘ";
    button.setAttribute("aria-label", `Sobre: ${title}`);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", id);

    const popover = document.createElement("div");
    popover.className = "info-popover";
    popover.id = id;
    popover.hidden = true;
    const heading = document.createElement("strong");
    heading.textContent = title;
    const body = document.createElement("p");
    body.textContent = text;
    popover.append(heading, body);

    button.addEventListener("click", () => (popover.hidden ? open(button, popover) : close()));
    panel.append(button, popover);
    return button;
  },
};
