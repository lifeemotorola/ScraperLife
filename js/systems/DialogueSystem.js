export class DialogueSystem {
  constructor(ui, dialogue, voice = null) { this.ui = ui; this.dialogue = dialogue; this.voice = voice; }
  play(id, seconds) { const line = this.dialogue[id]; if (line) this.playText(line, seconds, id); }
  // Subtitle on screen + spoken voice line (recorded clip first, browser voices as fallback).
  playText(line, seconds = 4, id = null) {
    if (!line) return;
    this.ui.subtitle(line, seconds);
    if (id && this.voice) this.voice.playLine(id, line, seconds);
    else this.voice?.speak(line);
  }
  // A real back-and-forth between characters: steps is a list of dialogue ids played
  // one voice after another. onDone fires when the exchange has fully played out.
  playConversation(ids, onDone, secondsById = {}) {
    const steps = ids
      .map((id) => ({ id, line: this.dialogue[id], seconds: secondsById[id] || 5 }))
      .filter((step) => step.line);
    if (!steps.length) { onDone?.(); return; }
    if (this.voice) {
      this.voice.playConversation(steps, {
        onLine: (line, seconds) => this.ui.subtitle(line, seconds),
        onDone,
      });
      return;
    }
    let elapsed = 0;
    steps.forEach((step) => {
      setTimeout(() => this.ui.subtitle(step.line, step.seconds), elapsed * 1000);
      elapsed += step.seconds;
    });
    setTimeout(() => onDone?.(), elapsed * 1000);
  }
}
