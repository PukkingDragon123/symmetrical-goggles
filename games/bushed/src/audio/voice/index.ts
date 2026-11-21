// BUSHED voices: uncanny gibberish shaped from the text, one voice per character (./presets.ts), rendered in a worker.
//
//   import { voice } from '../audio/voice';
//   const line = voice.say('grandpa', 'This place is yours now.', { close: true });   // narration (2D, warm, wrong)
//   const l2 = voice.say('doug', text, { at: npc.model.root });                         // from a person's mouth
//   line.revealed()  // characters to type out now      line.mouth(o)  // {open, round} for lip sync
//   await line.done  // the words have ended
//
// Ported from the author's own game หลอนยันปลายทาง (effective-octo-train/src/audio/Voice.js, VoiceFX.js,
// Synth/speech.js, vox.js, gibberish.js, worker.js).
export { voice, VoiceSystem, VoiceLine, type SayOpts } from './voice';
export { VOICES, presetFor, isCryptidVoice, cryptidPresetFor, type VoicePreset, type Wrong, type CryptidVoice } from './presets';
export { renderLine, lineToWav, type LineResult } from './speech';
export { parseEnglish, readingTime } from './english';
