// BUSHED music: "Kettle Lake Waltz" (theme / campfire / ending), an original folk-horror waltz synthesised in code.
//   import { music, installMusic } from '../audio/music';
//   installMusic(game)            boot step: menu + loading theme, campfire tune, ducking under dialogue
//   music.play('ending', { hold: true }); ... music.release()
export { music, installMusic, MusicSystem, type MusicOpts } from './music';
export { renderSong, type SongName, type SongAudio } from './songs';
