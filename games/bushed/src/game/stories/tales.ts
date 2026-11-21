// Campfire tales: lumber-camp legends told at the campground fire after dark, one a night. Each is a retelling of
// public-domain camp folklore (Cox's "Fearsome Creatures of the Lumberwoods", 1910, and older bunkhouse talk) or
// an original, and each hints at one of a cryptid's rules: when the tale is done, the Book writes the rule in.
export interface Tale {
  id: string;
  title: string;
  /** who tells it best (the first of these at the fire tells it; anyone there can if none are) */
  tellers: string[];
  /** the rule it teaches (Book of Cryptids ids); null for the camp's own story */
  critter: string | null;
  rule: string | null;
  lines: string[];
  /** one line for the Book's "Told at the fire" page */
  gist: string;
  /** only once the story has reached this far (a main-arc flag) */
  after?: string;
}

export const TALES: Tale[] = [
  {
    id: 'handles', title: 'The handle thief of Camp Six', tellers: ['marcel', 'hollis'], critter: 'hound', rule: 'jerky',
    gist: 'The cook kept rind in her apron. Jerky does the same: hold it out and stand still.',
    lines: [
      'Camp Six, on the Mattagami. The blacksmith hung new axe handles in the rafters to cure. Hickory, shipped up from the south. Expensive.',
      'Every morning, one fewer. No tracks. Just shavings, and a little drool.',
      'The men blamed the Swede. The Swede blamed the Pole. The Pole blamed the Company, which was fair, generally.',
      'Then the cook goes out one night to dump the grease, and there it is under the rafters. Head like an axe bit. Body like a handle. Looking at her like she is the strange one.',
      'She doesn\'t scream. She throws it the pork rind out of her apron. It stops chewing. It sits. It looks at her pocket.',
      'After that she kept rind in her apron, and the handles stayed in the rafters. Jerky does the same job now. Hold it out and stand still.',
    ],
  },
  {
    id: 'knock', title: 'The polite neighbour', tellers: ['hollis', 'esko'], critter: 'bigfoot', rule: 'knock',
    gist: 'Three knocks on the cookhouse wall. Délima knocked back, and got one knock: a man tipping his hat.',
    lines: [
      'Winter of \'49 we had a teamster from the Gatineau. Every night, something knocked on the cookhouse wall. Three knocks. Wood on wood.',
      'He\'d holler "who\'s there!" Nothing. Holler again. Nothing. Went out once with a lantern. Nothing, and a smell like a wet dog\'s wet dog.',
      'Délima, the cook, she listened one night with her head on one side like a robin. Then she took the bread paddle and knocked back. Three times. Polite.',
      'And out in the dark: one knock. Like a man tipping his hat.',
      '"There," she says. "He was only saying hello. You were being rude." That teamster knocked back every night till spring.',
    ],
  },
  {
    id: 'hat', title: 'Marcel\'s hat, the whole story', tellers: ['marcel'], critter: 'gumberoo', rule: 'fire',
    gist: 'You cannot shoot a gumberoo. You can light a fire.',
    lines: [
      'You\'ve heard about my hat. Everybody has heard about my hat. Here is the part nobody stays for.',
      'After the bullet came back, I lay in the blueberries and thought, well, Marcel, you are going to be eaten by a tire.',
      'It rolled at me. Big round thing, no hair, smelled like the dump in August. Then it stopped. Dead. Shivered all over.',
      'I had dropped my pipe, lit, in the blueberries. That thing looked at a little bit of fire the way you would look at a bear.',
      'It rolled off sulking. Bounced off two trees going away. I went home with no hat and one lesson: you cannot shoot a gumberoo, but you can light a fire.',
    ],
  },
  {
    id: 'trevor', title: 'Don\'t be Trevor', tellers: ['doug'], critter: 'dingbat', rule: 'dark',
    gist: 'Light off, stand still, and the dingbats settle. Also: don\'t be Trevor.',
    lines: [
      'Okay. True story. Summer camp on Temagami, I\'m eleven. Our cabin has a roost of something in the rafters. Little squeaky somethings.',
      'Counsellor\'s name was Trevor. Trevor had a headlamp the size of a dinner plate. Trevor turned it on.',
      'Snow globe of bats, if the bats had tiny antlers and were furious. Everybody screaming. Trevor screaming the most.',
      'Then the camp cook, Mrs. Pelletier, walks in, switches Trevor off, and just stands there. Doesn\'t move. Doesn\'t say a word.',
      'Thirty seconds. Squeak... squeak... nothing. Every one of them back up in the rafters like it never happened.',
      'Moral of the story: dark and still, they settle. Second moral: don\'t be Trevor.',
    ],
  },
  {
    id: 'tamarack', title: 'The lady in the tamaracks', tellers: ['hollis', 'megan'], critter: 'granny', rule: 'lost',
    gist: 'Lost in the fog, somebody tall walks you home. Don\'t run. Say thank you at the door.',
    lines: [
      'This one\'s my mother\'s. Back home on the Miramichi they called her something else. Up here she\'s Granny Tamarack.',
      'Fog comes in off the swamp so thick you could lean on it. You get turned round. You walk a circle, find your own tracks, and get frightened of them.',
      'And then somebody\'s beside you. Taller than a church door. Antlers like a crown of dead branches. An old woman\'s voice, kind as a kettle.',
      'She walks you home. You don\'t look up at her face, you don\'t run, and at your door you say thank you.',
      'My mother left oatmeal cookies on the stump after. The tin came back washed. Cleaner than Mother ever got it.',
    ],
  },
  {
    id: 'backwards', title: 'Eleven kilometres backwards', tellers: ['megan', 'hunter'], critter: 'hidebehind', rule: 'r1',
    gist: 'Look straight at the Hidebehind and it cannot move. A man walked home backwards, staring.',
    lines: [
      'This one\'s from the incident log. Officially it says "hiker disoriented, recovered in good health". Unofficially:',
      'Fellow walks into the ranger station at dawn, white as paper, walking backwards. Walked eleven kilometres that way.',
      'Every time he turned his back, something got one tree closer. Every time he turned round, nothing. Just a tree a bit too fat on one side.',
      'So he stopped turning round. Walked backwards all night, staring into the woods. It never moved once while he was looking at it.',
      'I wrote "disoriented". He was the least disoriented man I ever met.',
    ],
  },
  {
    id: 'mickey', title: 'Ti-Paul and the mickey', tellers: ['marcel', 'hunter'], critter: 'hidebehind', rule: 'r3',
    gist: 'Carry a lit lantern on the tote road, or stay by the fire. Ti-Paul also carried rye.',
    lines: [
      'In the old days a man walking the tote road at night carried two things: a lantern and a mickey of rye.',
      'Not for courage. For the Hidebehind. It cannot abide the smell. The rye or the lamp, nobody knows which, and nobody wants to find out.',
      'My cousin Ti-Paul forgot the lantern once. Had the mickey. Got home fine. But he drank the mickey to be safe, so he can\'t tell you how.',
      'Keep a light lit and stay near the fire. That is the whole story. Ti-Paul tells it longer.',
    ],
  },
  {
    id: 'bacon', title: 'Forty pounds of bacon', tellers: ['esko', 'hunter'], critter: 'hodag', rule: 'r3',
    gist: 'You cannot fight a hodag. You can feed one bacon, and then it thinks of nothing else.',
    lines: [
      'My father cut in Wisconsin before he came north. They have a hodag there. Same as ours. Horns. Spines. Smile like a bear trap.',
      'It came into their camp. Everybody up the trees. The cook up the stovepipe.',
      'But it ate nobody. It went into the cookhouse and ate the bacon. All the bacon. Forty pounds.',
      'Then it lay down by the stove and slept like a dog.',
      'My father said: you cannot fight a hodag. You can feed one. After bacon it thinks about nothing else all day. That is the story.',
    ],
  },
  {
    id: 'sack', title: 'The squonk in the sack', tellers: ['hollis', 'megan'], critter: 'squonk', rule: 'r3',
    gist: 'Grab at a squonk and it cries itself into a puddle. Leave the puddle be.',
    lines: [
      'There\'s a beast in the wet fir woods that cries. The squonk. Ugliest thing ever made, and it knows it. Warts on its warts. Weeps about it all day.',
      'A fellow from the Pontiac caught one. Followed the sobbing, tracked the tear spots, got it into a potato sack. Very proud of himself.',
      'Carried it home on his back. The sack got lighter. And lighter. The sobbing stopped.',
      'At his door he opened the sack and there was nothing in it but tears and bubbles.',
      'So don\'t grab at one, and don\'t chase it. Leave the puddle alone and it comes back together when nobody\'s watching.',
    ],
  },
  {
    id: 'branches', title: 'Branches out of a clear sky', tellers: ['hunter', 'marcel'], critter: 'agropelter', rule: 'r1',
    gist: 'The agropelter throws where you are, not where you are going. Keep walking.',
    lines: [
      'My grandfather\'s partner, Big Lou, got hit by a dead branch on a dead calm day. Big limb, clear sky. Lou said the wind did it.',
      'No wind. Grandpa saw a skinny arm come out of a knot-hole in a broken snag and fling that branch like a pitcher.',
      'Lou stopped to argue with the tree. Got hit again. Stood there rubbing his head. Hit again.',
      'Grandpa just kept walking. Never got touched. The thing throws at where you are, see, not where you\'re going.',
      'Agropelter. Lou called it something else.',
    ],
  },
  {
    id: 'kettle', title: 'The kettle in the brush', tellers: ['doug'], critter: 'teakettler', rule: 'r3',
    gist: 'The Kettle backs up to you, bum first, for a cup of coffee.',
    lines: [
      'First night we owned the campground, I hear a kettle boiling. In the bush. We don\'t own a kettle.',
      'I go look and there\'s this little... like a dog and a teapot had a baby. Walking backwards. Steam coming out its nose.',
      'Jojo goes, "Dad, it wants coffee." I say, "That is not how animals work." Jojo holds out a cup of coffee.',
      'It backs right up to her, bum first, looking at us over its shoulder, and drinks the whole cup.',
      'Now it comes every morning and I buy coffee by the case. Point is: coffee. Point two: it\'s always coffee.',
    ],
  },
  {
    id: 'bootlaces', title: 'The snow that looked back', tellers: ['esko'], critter: 'wasset', rule: 'r4',
    gist: 'Hold a trout out to the snow wasset and it sits up and begs.',
    lines: [
      'On the north shore in winter the snow moves. A line of it heaves up like something swims underneath.',
      'Snow wasset. Like a weasel, long as a paddle. White in winter. Brown in summer, and under the ground.',
      'I am ice fishing. It comes up, stands tall, stares at me. Then it unties my boots. Both boots.',
      'I give it a trout to go away. It does not go away. It sits up and begs for the next one.',
      'Now I bring two trout. One for me. That is the story.',
    ],
  },
  {
    id: 'lopsided', title: 'Lopsided', tellers: ['hunter', 'megan'], critter: 'gouger', rule: 'r2',
    gist: 'Lead a sidehill gouger onto the flat with chanterelles and it falls right over.',
    lines: [
      'Sidehill gouger. Legs shorter on one side so it can stand on a hill. Goes round the same knoll its whole life, always the same way round.',
      'My uncle got butted clean off a hill by one. Lay at the bottom thinking about his choices.',
      'Then he had an idea. He walked out onto the flat with a handful of chanterelles, and the gouger followed him down, nose first.',
      'Hit the level ground and fell right over. Lay there with its long legs kicking, embarrassed.',
      'He set it back on its feet on the hill, and it never butted him again. Dug him pitch wood out of the old roots instead. Best kindling in the county.',
    ],
  },
  {
    id: 'hoop', title: 'Armand jumps the hoop', tellers: ['marcel', 'doug'], critter: 'hoopsnake', rule: 'r2',
    gist: 'When the hoop snake rolls at you, jump: you go clean through the hoop.',
    lines: [
      'The hoop snake bites its own tail and rolls downhill at you like a wagon wheel with a temper. Stinger on the tail.',
      'Most men step aside. It can\'t steer. It rolls right on by.',
      'My uncle Armand was high-jump champion at the parish fair, three years running. When it came at him, he jumped. Clean through the hoop.',
      'The snake rolled on into the swamp and lay there like a dropped belt. Armand got a free beer every year after for telling it.',
      'Which is more than I get.',
    ],
  },
  {
    id: 'matchwood', title: 'Localized wind damage', tellers: ['megan'], critter: 'splintercat', rule: 'r2',
    gist: 'Never stand between a splinter cat and the tree it is staring at.',
    lines: [
      'The Ministry calls it "localized wind damage". Trees smashed to matchwood, stumps splintered from the top down, and no wind that night.',
      'Old-timers call it a splinter cat. Big cat. It picks a tree it thinks has honey in it, crouches, and goes through it head first.',
      'I have a report from a timber cruiser who stood between a splinter cat and its tree. Once.',
      'He\'s fine. They found him forty feet away in a balsam, very calm, looking at nothing.',
      'So: if you see a big cat staring at a tree, don\'t stand between them. That\'s the whole safety briefing.',
    ],
  },
  {
    id: 'goofus', title: 'The bird that flies home backwards', tellers: ['hollis', 'esko'], critter: 'goofus', rule: 'r5',
    gist: 'Lost? A tame goofus bird flies back along your trail. Follow it home.',
    lines: [
      'Goofus bird. Flies backwards. Doesn\'t care where it\'s going, only where it\'s been. Like most of the men I worked with.',
      'Délima fed one bannock crusts every morning off the cookhouse step.',
      'One winter a young teamster got lost in a whiteout. Couldn\'t see his own mitts.',
      'And that bird came flapping out of the snow backwards, right past his face, and off the way he\'d come. Slow. Waiting for him.',
      'He followed it two hours, cursing, straight back to the cookhouse step. Délima gave the bird his bannock.',
    ],
  },
  {
    id: 'stump', title: 'The bread on the stump', tellers: ['megan', 'esko'], critter: 'bigfoot', rule: 'gift',
    gist: 'Leave something on the big stump now and then. Something comes back.',
    lines: [
      'Not official, this one. My grandmother\'s, from the Porcupine country.',
      'She left the heel of the bread on the big stump by the creek every Sunday. Her mother did. Her mother\'s mother.',
      'One Sunday she forgot. Monday there were seventeen-inch prints all round the stump, and the stump just... looked disappointed.',
      'She brought a whole loaf. Next morning the loaf was gone and there was a fish on the stump. Big one. Cleaned. Neat as a pin.',
      'So. Leave something on the stump now and then. Something comes back. Manners.',
    ],
  },
  {
    id: 'cook', title: 'The cook who wouldn\'t leave', tellers: ['hollis'], critter: null, rule: null, after: 'camp',
    gist: 'Délima stayed when the Company left, and fed the others. A Tremblay has cooked for them since.',
    lines: [
      'Spring of \'51 the Company pulled out. Trucks and power saws. Everybody gone by May. Everybody but the cook.',
      'Délima said, "Who\'s going to feed them?" The foreman said, "Feed who?" And she just looked at the trees.',
      'She cooked all that summer for nobody we could see. Every night, the gut hammer, once. And every morning the plates were licked clean.',
      'They were our stories, see. Thirty years of men at the bunkhouse stove making things up. The bush heard every word. It believed us.',
      'Then we all went home, and nobody told them. Délima told them. Then her daughter. Then Ray, till April. Now you, I hear. A Tremblay\'s been cooking for them ever since.',
      'It isn\'t a curse, kid. It\'s a kitchen.',
    ],
  },
];
