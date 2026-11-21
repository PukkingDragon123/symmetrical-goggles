// Seams to systems the cinematics use but don't own. Each is optional: unset, the cinematic still plays (subtitles
// without a voice, no score, no depth of field). The same moments also go out as game events ('cine_voice',
// 'music_cue', 'cine_dof') so a system can listen without being wired here.
//
//   cineHooks.voice = (l) => voices.say(l.who, l.text, { mood: l.mood });   // returns the line's length (s), or a promise
//   cineHooks.music = (cue, fade) => music.cue(cue, fade);                  // 'opening' | 'title' | 'arrive' | 'finale' | 'stop'
//   cineHooks.dof = (d) => renderer.setDof(d);                              // null = off
export interface VoiceLine {
  /** who speaks: 'ray' (Pépère Ray, old, warm, gravel) */
  who: string;
  text: string;
  /** a hint for the voice: 'letter' (read aloud, close, quiet), 'ghost' (far, airy, wrong) */
  mood?: string;
}

export const cineHooks: {
  voice: ((l: VoiceLine) => number | Promise<unknown> | void) | null;
  music: ((cue: string, fade?: number) => void) | null;
  dof: ((d: { focus: number; fstop: number; mm: number } | null) => void) | null;
} = { voice: null, music: null, dof: null };
