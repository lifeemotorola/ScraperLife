export class DialogueSystem {
  constructor(ui, dialogue, voice = null, music = null) {
    this.ui = ui;
    this.dialogue = dialogue;
    this.voice = voice;
    this.music = music;
    this.duckTimer = null;
    this.sequenceTimer = null;
    this.sequenceActive = false;
    this.sequenceGeneration = 0;
  }

  play(id, seconds) {
    const line = this.dialogue[id];
    if (line) this.playText(line, seconds, id);
  }

  stopSequence() {
    this.sequenceGeneration += 1;
    this.sequenceActive = false;
    clearTimeout(this.sequenceTimer);
    clearTimeout(this.duckTimer);
    this.voice?.stopPlayback?.();
    this.music?.unduck?.();
  }

  // Sequence of dialogue lines with different speakers (e.g. real radio show banter between man & woman)
  playSequence(steps, onDone) {
    if (!steps || !steps.length) { onDone?.(); return; }
    this.stopSequence();
    const generation = this.sequenceGeneration;
    this.sequenceActive = true;
    this.music?.duck?.();

    let index = 0;
    const playNext = () => {
      if (generation !== this.sequenceGeneration) return;
      if (index >= steps.length) {
        this.sequenceActive = false;
        this.duckTimer = setTimeout(() => {
          if (generation === this.sequenceGeneration) this.music?.unduck?.();
        }, 700);
        onDone?.();
        return;
      }
      const step = steps[index++];
      const formatted = step.line.includes(':') ? step.line : `${step.speaker}: “${step.line}”`;

      // Subtitle duration dynamically matches word count
      const wordCount = step.line.split(/\s+/).length;
      const subtitleSeconds = Math.max(step.seconds || 4.2, (wordCount / 2.7) + 1.2);
      this.ui.subtitle(formatted, subtitleSeconds);

      if (this.voice && step.audio) {
        // Play real .wav voice clip from assets/radioVoices/
        this.voice.playClip(step.audio, formatted, subtitleSeconds, () => {
          if (generation !== this.sequenceGeneration) return;
          this.sequenceTimer = setTimeout(playNext, 350);
        });
      } else if (this.voice) {
        // Wait for the current speaker to finish speaking completely before advancing!
        this.voice.speak(formatted, () => {
          if (generation !== this.sequenceGeneration) return;
          // Natural human conversational pause (350ms) between speakers
          this.sequenceTimer = setTimeout(playNext, 350);
        });
      } else {
        this.sequenceTimer = setTimeout(playNext, subtitleSeconds * 1000);
      }
    };

    playNext();
  }

  // Subtitle on screen + spoken voice line (recorded clip first, browser voices as fallback).
  playText(line, seconds = 4, id = null) {
    if (!line) return;
    if (this.sequenceActive) this.stopSequence();
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
    if (this.sequenceActive) this.stopSequence();

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
