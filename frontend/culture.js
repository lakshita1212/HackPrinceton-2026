// What was popular at home in each era: the cards behind the living-room toys,
// lava lamp and boombox. Every item says where it comes from, and items tied to a
// date only show from that date on (`from`), so nothing is a spoiler.
export const CULTURE = {
  1962: {
    title: 'What kids are into, fall 1962',
    items: [
      { text: 'Pressed-steel Tonka trucks, like the one on the rug, are built to survive the sandbox.',
        source: 'The Strong National Toy Hall of Fame (Tonka trucks)' },
      { text: "Mattel's Barbie (1959) now has a boyfriend: Ken arrived in 1961.",
        source: 'The Strong National Toy Hall of Fame (Barbie)' },
      { text: "The Etch A Sketch (1960): turn two knobs to draw, shake it to erase.",
        source: 'The Strong National Toy Hall of Fame (Etch A Sketch)' },
      { text: "On TV: ABC's new cartoon The Jetsons, about a family in the space-age future, premiered September 23.",
        source: 'ABC, The Jetsons premiere, Sept 23, 1962' },
      { until: '1962-10-19', text: "On the radio: Bobby \"Boris\" Pickett's novelty song \"Monster Mash\" is climbing the charts for Halloween.",
        source: 'Billboard Hot 100, October 1962' },
      { from: '1962-10-20', text: "On the radio: \"Monster Mash\" by Bobby \"Boris\" Pickett is the No. 1 song in the country.",
        source: 'Billboard Hot 100, chart of Oct 20, 1962' },
    ],
  },
  1969: {
    title: 'At home, summer 1969',
    items: [
      { text: 'The lava lamp: invented in Britain in 1963 as the Astro lamp, and the glowing must-have of the decade.',
        source: 'Edward Craven Walker, Astro lamp (1963)' },
      { text: "Mattel's Hot Wheels (1968) are the fastest little cars on any kitchen floor, with bright orange track.",
        source: 'The Strong National Toy Hall of Fame (Hot Wheels)' },
      { text: "Milton Bradley's Twister (1966): left hand red, right foot green.",
        source: 'The Strong National Toy Hall of Fame (Twister)' },
      { text: "On the radio: Zager and Evans' \"In the Year 2525\" is No. 1, a song about the far future.",
        source: 'Billboard Hot 100, July 1969' },
      { text: 'On TV tonight: every network is showing the Moon, live.',
        source: 'NASA television, July 20, 1969' },
    ],
  },
  1989: {
    title: "What's on, fall 1989",
    items: [
      { text: "Nintendo's Game Boy came out in North America in July, with Tetris in the box.",
        source: 'Nintendo, Game Boy North American launch, July 1989' },
      { text: 'Teenage Mutant Ninja Turtles are everywhere: the cartoon, the action figures, the cereal.',
        source: 'Playmates Toys figures (1988); TV series (1987)' },
      { text: "The Rubik's Cube on the table: invented in Hungary in 1974, the craze of the early '80s.",
        source: "The Strong National Toy Hall of Fame (Rubik's Cube)" },
      { text: 'Boomboxes and cassettes: you make a mixtape by recording songs off the radio.',
        source: 'Consumer electronics of the 1980s' },
      { text: "On the radio: Roxette's \"Listen to Your Heart\" topped the Billboard Hot 100 at the start of November.",
        source: 'Billboard Hot 100, chart of Nov 4, 1989' },
    ],
  },
};

export function cultureFor(era, date) {
  const card = CULTURE[era];
  if (!card) return null;
  const items = card.items.filter((i) => (!i.from || date >= i.from) && (!i.until || date <= i.until));
  return { title: card.title, items };
}
