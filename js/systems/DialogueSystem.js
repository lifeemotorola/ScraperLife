export class DialogueSystem {
  constructor(ui, dialogue, voice = null, music = null) {
    this.ui = ui;
    this.dialogue = dialogue;
    this.voice = voice;
    this.music = music;
    this.duckTimer = null;
    this.sequenceTimer = null;
  }

  play(id, seconds) {
    const line = this.dialogue[id];
    if (line) this.playText(line, seconds, id);
  }

  stopSequence() {
    clearTimeout(this.sequenceTimer);
    clearTimeout(this.duckTimer);
    this.music?.unduck?.();
  }

  // Sequence of dialogue lines with different speakers (e.g. real radio show banter between man & woman)
  playSequence(steps, onDone) {
    if (!steps || !steps.length) { onDone?.(); return; }
    this.stopSequence();
    this.music?.duck?.();

    let index = 0;
    const playNext = () => {
      if (index >= steps.length) {
        this.duckTimer = setTimeout(() => this.music?.unduck?.(), 800);
        onDone?.();
        return;
      }
      const step = steps[index++];
      const seconds = step.seconds || 4.8;
      const formatted = step.line.includes(':') ? step.line : `${step.speaker}: “${step.line}”`;
      this.ui.subtitle(formatted, seconds);
      if (this.voice) {
        this.voice.speak(formatted);
      }
      this.sequenceTimer = setTimeout(playNext, seconds * 1000);
    };

    playNext();
  }

  // Subtitle on screen + spoken voice line (recorded clip first, browser voices as fallback).
  playText(line, seconds = 4, id = null) {
    if (!line) return;
    this.music?.duck?.();
    clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => this.music?.unduck?.(), seconds * 1000);
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

    this.music?.duck?.();
    const finish = () => {
      this.music?.unduck?.();
      onDone?.();
    };

    if (this.voice) {
      this.voice.playConversation(steps, {
        onLine: (line, seconds) => this.ui.subtitle(line, seconds),
        onDone: finish,
      });
      return;
    }
    let elapsed = 0;
    steps.forEach((step) => {
      setTimeout(() => this.ui.subtitle(step.line, step.seconds), elapsed * 1000);
      elapsed += step.seconds;
    });
    setTimeout(() => finish(), elapsed * 1000);
  }
}
