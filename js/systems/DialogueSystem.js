export class DialogueSystem {
  constructor(ui, dialogue, voice = null) { this.ui = ui; this.dialogue = dialogue; this.voice = voice; }
  play(id, seconds) { const line = this.dialogue[id]; if (line) this.playText(line, seconds); }
  // Subtitle on screen + spoken voice line (when voices are available and enabled).
  playText(line, seconds = 4) {
    if (!line) return;
    this.ui.subtitle(line, seconds);
    this.voice?.speak(line);
  }
}
