// English text -> phrases of rough syllables for the gibberish voice. The words are not spoken: their shape is. Every
// syllable keeps its onset class (stop, fricative, nasal, liquid), vowel colour, length and coda, stress falls where
// English puts it, punctuation sets the pauses and the tune (a question lifts, a full stop falls), and each
// syllable remembers where it sits in the text so the subtitles can type along with the voice.
//
// The phone set and the segment rules come from the Thai murmur in the author's own game หลอนยันปลายทาง
// (effective-octo-train/src/audio/Synth/speech.js); this front end is new.

export type Tone = 'M' | 'acc' | 'fall' | 'rise' | 'low';

export interface Syl {
  /** an 's' before the onset (st-, sp-, sk-) */
  pre: string;
  onset: string; cluster: string; vowel: string; long: boolean; glide: string;
  /** stop / sonorant coda (k t p m n ng w y) and a fricative tail after it (s f ch) */
  coda: string; fric: string;
  tone: Tone;
  /** UTF-16 index of the syllable's first letter and one past its last (the typewriter reveals up to ce) */
  ci: number; ce: number;
  word: number; wordStart: boolean; wordEnd: boolean;
  stress: boolean; fn: boolean;
}
export interface Phrase { sylls: Syl[]; pause: number; question: boolean; exclaim: boolean; breakCi: number }

const FUNCTION = new Set(('a an the of to in on at by for from with as and or but nor so if then than that this these those ' +
  'is am are was were be been being do does did have has had will would can could shall should may might must ' +
  'i me my mine you your yours he him his she her hers it its we us our they them their there here not no ' +
  'just up out off into onto over about what who whom which when where why how all some any one oh uh um').split(' '));
const SOFT_TH = new Set('the this that these those they them their there then than though thus thee thy'.split(' '));
const UNSTRESSED_PREFIX = /^(a|be|re|de|for|un|com|con|ex|in|im|pre|pro|per)(?=[a-z]{3,})/;
const VOW = 'aeiou';
const DIGRAPH = ['tch', 'sch', 'thr', 'shr', 'squ', 'str', 'spr', 'scr', 'spl', 'th', 'sh', 'ch', 'ph', 'wh', 'ck', 'ng', 'gh', 'qu', 'kn', 'wr', 'dg'];
const ONSET_CLUSTERS = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr', 'st', 'sp', 'sk', 'sl', 'sm', 'sn', 'sw', 'tw', 'qu',
  'str', 'spr', 'scr', 'spl', 'squ', 'thr', 'shr', 'sh', 'ch', 'th', 'ph', 'wh', 'kn', 'wr', 'dw', 'gw', 'pf', 'sc', 'tch']);

function isVowelAt(w: string, i: number): boolean {
  const c = w[i];
  if (VOW.includes(c)) return !(c === 'u' && w[i - 1] === 'q');
  // y is a vowel after a consonant (my, happy, rhythm), a consonant at the start or after a vowel (yes, boy)
  if (c === 'y') return i > 0 && !VOW.includes(w[i - 1]);
  return false;
}

/** consonant letters -> the synth's phone classes */
function onsetOf(s: string, nextV: string, soft: boolean): { pre: string; onset: string; cluster: string } {
  if (!s) return { pre: '', onset: '', cluster: '' };
  let pre = '';
  if (s.length > 1 && s[0] === 's' && 'ptkcq'.includes(s[1])) { pre = 's'; s = s.slice(1); }
  const soft2 = 'eiy'.includes(nextV);
  const map = (c: string): string => {
    switch (c) {
      case 'th': return soft ? 'd' : 'f';
      case 'sh': case 'ch': case 'tch': case 'sch': return 'ch';
      case 'ph': return 'f';
      case 'wh': return 'w';
      case 'kn': return 'n';
      case 'wr': return 'r';
      case 'gh': return 'k';
      case 'ck': case 'k': case 'q': return 'kh';
      case 'qu': return 'kh';
      case 'j': case 'dg': return 'c';
      case 'g': return soft2 ? 'c' : 'k';
      case 'c': return soft2 ? 's' : 'kh';
      case 'p': return 'ph';
      case 't': return 'th';
      case 'v': return 'f';
      case 'z': case 'x': return 's';
      default: return 'bdfhlmnrswy'.includes(c) ? c : 'kh';
    }
  };
  // first unit (digraph or letter), then maybe a liquid / glide cluster
  let first = s[0];
  for (const d of DIGRAPH) if (s.startsWith(d) && d.length > first.length && !['thr', 'shr', 'str', 'spr', 'scr', 'spl', 'squ'].includes(d)) first = d;
  const rest = s.slice(first.length);
  const onset = map(first);
  let cluster = '';
  if (first === 'qu') cluster = 'w';
  else if (rest && 'lrw'.includes(rest[rest.length - 1])) cluster = rest[rest.length - 1];
  return { pre, onset, cluster };
}

/** coda letters -> a stop / sonorant coda and a fricative tail */
function codaOf(s: string): { coda: string; fric: string } {
  if (!s) return { coda: '', fric: '' };
  let fric = '';
  if (/(s|z|ss|ce|se|ze)$/.test(s)) fric = 's';
  else if (/x$/.test(s)) fric = 's';
  else if (/(sh|ch|tch|dge|ge)$/.test(s)) fric = 'ch';
  else if (/(f|ff|ph|v|ve|gh|th)$/.test(s)) fric = s.endsWith('gh') && !/ough$/.test(s) ? '' : 'f';
  let coda = '';
  if (/ng|nk/.test(s)) coda = 'ng';
  else if (/^m/.test(s) || /[^s]m/.test(s)) coda = 'm';
  else if (/n/.test(s)) coda = 'n';
  else if (/l/.test(s)) coda = 'w';
  else if (/[pb]/.test(s)) coda = 'p';
  else if (/[td]/.test(s.replace(/tch$/, ''))) coda = 't';
  else if (/[kcgqx]/.test(s.replace(/(ch|gh)$/, ''))) coda = 'k';
  return { coda, fric };
}

/** a vowel group (+ the letters after it) -> vowel colour, length and off-glide */
function vowelOf(nuc: string, after: string, magicE: boolean, last: boolean, single: boolean): { vowel: string; long: boolean; glide: string; eatsR: boolean } {
  const r = after[0] === 'r' && !isVowelAtStr(after, 1);
  if (r) {
    if (nuc === 'a') return { vowel: 'a', long: true, glide: '', eatsR: true };
    if (nuc === 'o' || nuc === 'oa' || nuc === 'ou' || nuc === 'oo') return { vowel: 'or', long: true, glide: '', eatsR: true };
    if (nuc === 'ai') return { vowel: 'e', long: true, glide: 'schwa', eatsR: true };
    if (nuc === 'ee' || nuc === 'ea' || nuc === 'ie') return { vowel: 'i', long: true, glide: 'schwa', eatsR: true };
    return { vowel: 'oe', long: true, glide: '', eatsR: true }; // er ir ur
  }
  switch (nuc) {
    case 'a': return magicE ? { vowel: 'e', long: true, glide: 'i', eatsR: false } : { vowel: 'ae', long: false, glide: '', eatsR: false };
    case 'ai': case 'ay': case 'ei': case 'ey': return { vowel: 'e', long: true, glide: 'i', eatsR: false };
    case 'au': case 'aw': return { vowel: 'or', long: true, glide: '', eatsR: false };
    case 'e': return magicE || (last && single) ? { vowel: 'i', long: true, glide: '', eatsR: false } : { vowel: 'e', long: false, glide: '', eatsR: false };
    case 'ee': case 'ea': case 'ie': return { vowel: 'i', long: true, glide: '', eatsR: false };
    case 'eu': case 'ew': case 'ue': case 'ui': return { vowel: 'u', long: true, glide: '', eatsR: false };
    case 'i': return magicE || after.startsWith('gh') || (last && single && !after) ? { vowel: 'a', long: true, glide: 'i', eatsR: false } : { vowel: 'i', long: false, glide: '', eatsR: false };
    case 'o': return magicE || (last && !after) ? { vowel: 'o', long: true, glide: 'u', eatsR: false } : { vowel: 'or', long: false, glide: '', eatsR: false };
    case 'oa': case 'oe': return { vowel: 'o', long: true, glide: 'u', eatsR: false };
    case 'oo': return { vowel: 'u', long: true, glide: '', eatsR: false };
    case 'ou': case 'ow': return after.startsWith('gh') ? { vowel: 'or', long: true, glide: '', eatsR: false } : { vowel: 'a', long: true, glide: 'u', eatsR: false };
    case 'oi': case 'oy': return { vowel: 'or', long: true, glide: 'i', eatsR: false };
    case 'u': return magicE ? { vowel: 'u', long: true, glide: '', eatsR: false } : { vowel: 'uh', long: false, glide: '', eatsR: false };
    case 'y': return single ? { vowel: 'a', long: true, glide: 'i', eatsR: false } : { vowel: 'i', long: last, glide: '', eatsR: false };
    default: {
      const c = nuc[0];
      return { vowel: c === 'a' ? 'ae' : c === 'e' ? 'e' : c === 'i' ? 'i' : c === 'o' ? 'o' : c === 'u' ? 'u' : 'schwa', long: nuc.length > 1, glide: '', eatsR: false };
    }
  }
}
const isVowelAtStr = (s: string, i: number): boolean => i < s.length && 'aeiouy'.includes(s[i]);

/** split a consonant run between two vowels: [coda of the left syllable, onset of the right] */
function splitRun(run: string): [string, string] {
  if (run.length <= 1) return ['', run];
  for (let k = Math.min(3, run.length); k >= 2; k--) {
    const tail = run.slice(run.length - k);
    if (ONSET_CLUSTERS.has(tail)) return [run.slice(0, run.length - k), tail];
  }
  for (const d of ['ck', 'ng', 'gh']) if (run.startsWith(d)) return [d, run.slice(2)];
  return [run.slice(0, run.length - 1), run.slice(run.length - 1)];
}

/** one word -> syllables (ci relative to the text) */
function wordSylls(raw: string, at: number, wordIdx: number): Syl[] {
  const w = raw.toLowerCase();
  const lettersOnly = w.replace(/[^a-z]/g, '');
  const fn = FUNCTION.has(lettersOnly);
  // digits: one syllable each
  if (/^\d/.test(w)) {
    const out: Syl[] = [];
    for (let i = 0; i < w.length; i++) {
      if (!/\d/.test(w[i])) continue;
      out.push(mk({ onset: 'nthkfs'[Number(w[i]) % 6] === 't' ? 'th' : 'nthkfs'[Number(w[i]) % 6], vowel: ['i', 'u', 'e', 'a', 'or'][Number(w[i]) % 5], long: Number(w[i]) % 2 === 0, ci: at + i, ce: at + i + 1, word: wordIdx, fn: false }));
    }
    return out;
  }
  // map letters (apostrophes dropped) back to text indices
  const idx: number[] = [];
  let s = '';
  for (let i = 0; i < w.length; i++) if (/[a-z]/.test(w[i])) { s += w[i]; idx.push(at + i); }
  if (!s) return [];
  // vowel groups
  const groups: { a: number; b: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    if (!isVowelAt(s, i)) continue;
    let j = i;
    while (j + 1 < s.length && isVowelAt(s, j + 1) && !(s[j] === 'e' && s[j + 1] === 'o')) j++;
    groups.push({ a: i, b: j + 1 });
    i = j;
  }
  // silent final e (time, stone, make); -le stays a syllable (table, little)
  let magicE = false;
  if (groups.length > 1) {
    const g = groups[groups.length - 1];
    const endsE = g.a === s.length - 1 && s[g.a] === 'e';
    const endsEs = (s.endsWith('es') || s.endsWith('ed')) && g.a === s.length - 2 && g.b === s.length - 1 && !/[sxzhtd]e[sd]$/.test(s.slice(-3));
    if ((endsE && !/[^aeiou]le$/.test(s)) || endsEs) {
      const prev = groups[groups.length - 2];
      if (g.a - prev.b === 1 && prev.b - prev.a === 1) magicE = true;
      groups.pop();
    }
  }
  if (!groups.length) groups.push({ a: Math.max(0, s.length - 1), b: s.length });
  const n = groups.length;
  const single = n === 1;
  const out: Syl[] = [];
  let onsetStr = s.slice(0, groups[0].a);
  for (let k = 0; k < n; k++) {
    const g = groups[k];
    const nuc = s.slice(g.a, g.b);
    const nextA = k + 1 < n ? groups[k + 1].a : s.length;
    const run = s.slice(g.b, nextA);
    const [codaStr, nextOnset] = k + 1 < n ? splitRun(run) : [run, ''];
    const last = k === n - 1;
    // r-colouring and -igh / -ough only look at this syllable's own coda (a-round is not ar-ound)
    const v = vowelOf(nuc, codaStr, last && magicE, last, single);
    const o = onsetOf(onsetStr, nuc[0], SOFT_TH.has(lettersOnly));
    const cd = codaOf(v.eatsR ? codaStr.replace(/^r/, '') : codaStr);
    const ciL = g.a - onsetStr.length;
    const ceL = last ? s.length : g.b + codaStr.length;
    out.push({
      pre: o.pre, onset: o.onset, cluster: o.cluster, vowel: v.vowel, long: v.long, glide: v.glide, coda: cd.coda, fric: cd.fric, tone: 'M',
      ci: idx[Math.max(0, ciL)] ?? at, ce: (idx[Math.min(idx.length - 1, ceL - 1)] ?? at) + 1,
      word: wordIdx, wordStart: k === 0, wordEnd: last, stress: false, fn,
    });
    onsetStr = nextOnset;
  }
  // stress: content words only; the first syllable, or the second after an unstressed prefix (about, remember)
  if (!fn) {
    const si = n >= 2 && UNSTRESSED_PREFIX.test(s) ? 1 : 0;
    out[Math.min(si, n - 1)].stress = true;
  }
  // unstressed short vowels reduce toward schwa (the lazy middle of real speech)
  for (const y of out) if (!y.stress && !y.long && (n > 1 || fn) && y.vowel !== 'i') y.vowel = 'schwa';
  return out;
}

function mk(p: Partial<Syl> & { ci: number; ce: number; word: number }): Syl {
  return { pre: '', onset: '', cluster: '', vowel: 'schwa', long: false, glide: '', coda: '', fric: '', tone: 'M', wordStart: true, wordEnd: true, stress: true, fn: false, ...p };
}

/** Split English text into phrases of syllables. */
export function parseEnglish(text: string): Phrase[] {
  const phrases: Phrase[] = [];
  let cur: Syl[] = [];
  let wordIdx = 0;
  const end = (pause: number, at: number, q = false, ex = false) => {
    if (cur.length) phrases.push({ sylls: cur, pause, question: q, exclaim: ex, breakCi: at });
    else if (phrases.length) { const p = phrases[phrases.length - 1]; p.pause = Math.max(p.pause, pause); p.question ||= q; p.exclaim ||= ex; }
    cur = [];
  };
  const re = /([A-Za-z0-9][A-Za-z0-9'’]*)|(\.\.\.|…|[.!?]+|[,;:]|—|--| - )/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) {
      const sy = wordSylls(m[1].replace(/’/g, "'"), m.index, wordIdx++);
      cur.push(...sy);
      // a long run without punctuation takes a breath at a function word
      if (cur.length > 13 && sy.length && sy[0].fn) { const last = cur.splice(cur.length - sy.length, sy.length); end(0.14, m.index); cur.push(...last); }
    } else {
      const p = m[2];
      if (p === '...' || p === '…') end(0.7, m.index);
      else if (p.includes('?')) end(0.45, m.index, true, p.includes('!'));
      else if (p.includes('!')) end(0.42, m.index, false, true);
      else if (p.includes('.')) end(0.5, m.index);
      else if (p === ',' ) end(0.26, m.index);
      else end(0.34, m.index);
    }
  }
  end(0.3, text.length);
  // intonation: accents on stressed syllables, the phrase's last accent falls (or rises for a question)
  for (const ph of phrases) {
    let lastAcc = -1;
    ph.sylls.forEach((s, i) => { if (s.stress) { s.tone = 'acc'; lastAcc = i; } });
    if (lastAcc >= 0) ph.sylls[lastAcc].tone = ph.question ? 'rise' : 'fall';
    if (ph.question) ph.sylls[ph.sylls.length - 1].tone = 'rise';
    for (let i = lastAcc + 1; i < ph.sylls.length; i++) if (ph.sylls[i].tone === 'M') ph.sylls[i].tone = ph.question ? 'rise' : 'low';
  }
  return phrases;
}

/** a reading-time estimate (s) for a line nobody voices */
export function readingTime(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(9, 1.2 + words * 0.28);
}
