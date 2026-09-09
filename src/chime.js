// A struck-bar voice, synthesized rather than loaded: no asset to ship, and it
// can be shaped to be noticeable without being an alarm.
//
// What makes a marimba sound like wood rather than a beep is the partial
// structure. A tuned bar is undercut so its overtones land near four and ten
// times the fundamental, and the higher ones die away much faster than the body
// of the note. That is the whole trick here: same attack, very different decays.
const PARTIALS = [
  { mult: 1, gain: 1, decay: 1.5 },
  { mult: 4, gain: 0.34, decay: 0.42 },
  { mult: 10, gain: 0.07, decay: 0.19 }
];

let audio = null;

// Browsers only allow audio to begin from a gesture, so this is called from the
// click that starts a timer and the context is kept for later chimes.
export function primeAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    return true;
  } catch {
    return false;
  }
}

function strike(at, freq, level) {
  const warm = audio.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 5200;
  warm.connect(audio.destination);

  PARTIALS.forEach(({ mult, gain, decay }) => {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    // A near instant attack is what reads as struck. Ramping in over even 30ms
    // would turn a mallet into a pad.
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(level * gain, at + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(amp);
    amp.connect(warm);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  });
}

function play(notes, level) {
  if (!primeAudio()) return;
  const start = audio.currentTime + 0.04;
  notes.forEach(([freq, offset], i) => strike(start + offset, freq, level * (i === notes.length - 1 ? 0.7 : 1)));
}

// End of a work block: a rising figure, because it is an invitation to stop
// rather than a demand for attention.
export function chimeWorkDone() {
  play([[523.25, 0], [659.25, 0.13], [783.99, 0.26], [1046.5, 0.42]], 0.17);
}

// End of a break: the same voice falling, so the two are told apart without
// having to look at the screen.
export function chimeBreakDone() {
  play([[783.99, 0], [659.25, 0.13], [523.25, 0.26]], 0.12);
}
