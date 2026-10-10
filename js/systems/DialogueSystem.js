export class DialogueSystem {
  constructor(ui, dialogue) { this.ui = ui; this.dialogue = dialogue; }
  play(id, seconds) { const line = this.dialogue[id]; if (line) this.ui.subtitle(line, seconds); }
}
