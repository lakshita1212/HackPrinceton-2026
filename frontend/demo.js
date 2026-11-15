// Demo mode (?demo=1): the two-minute demo runs by itself, with the narration
// as captions, for the video or for a judge to watch. The one thing it can't
// do is the first click: browsers only allow sound after a real click, so it
// waits for you to press "Tune in" on the intro, then drives everything else.
// The script is DEMO.md's; the questions are saved answers, so they're instant.
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function caption(text) {
  let el = $('demoCaption');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demoCaption';
    el.className = 'demo-caption';
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.classList.remove('show');
  void el.offsetWidth;
  el.textContent = text;
  el.classList.toggle('show', !!text);
}

// `app` is the handful of controls app.js hands over (see the bottom of app.js).
export async function runDemo(app) {
  document.body.classList.add('demo-running');
  const say = async (text, ms) => { caption(text); await wait(ms); };

  // Ask the room a question and wait for its answer; let a real recording that
  // comes with it play for `listen` ms, then stop it so the demo keeps moving.
  const stopRecording = () => document.querySelector('#transcript .archival.playing .archival-play')?.click();
  const ask = async (question, listen = 0) => {
    const answers = () => document.querySelectorAll('#transcript li.a');
    const before = answers().length;
    const button = $('askForm').querySelector('button[type="submit"]');
    $('question').value = question;
    $('askForm').requestSubmit();
    for (let i = 0; i < 80; i++) {
      await wait(250);
      const last = [...answers()].pop();
      const text = (last?.querySelector('.text') || last)?.textContent.trim();
      if (answers().length > before && !button.disabled && text && text !== '…') break;
    }
    await wait(400);
    if (listen) await wait(listen);
    stopRecording();
  };

  await say('October 22, 1962. President Kennedy is on television about Soviet missiles in Cuba.', 4500);
  await say('You are a citizen in your living room. You know 22 facts. 54 haven\'t happened yet, and 26 are secret.', 5000);

  caption('Call the station: "Are we going to war?"');
  await wait(2200);
  await ask('Are we going to war?', 0);
  await say('Every claim cites a real source. And when there is a recording, you hear the real voice from that night.', 9000);
  stopRecording();

  app.role('official');
  await wait(800);
  caption('Same night, same question, inside the government.');
  await wait(2200);
  await ask('Are we going to war?', 0);
  await say('A different person knows different things: the official knows 48 facts, and none are secret from him.', 6000);

  app.role('citizen');
  await wait(800);
  caption('Ask the citizen about the future: "How does this all end?"');
  await wait(2400);
  await ask('How does this all end?');
  await say('The signal drops. Nobody here knows how it ends yet.', 3500);

  document.querySelector('.prop-hit')?.click();
  await say('Everything in the room is real. This is the citizen\'s newspaper for that day.', 5000);
  app.closePaper();

  app.tune('1969');
  await say('July 20, 1969.', 2600);
  $('screen').click();
  await say('Every decade has real public-domain footage. This is NASA\'s broadcast from the Moon.', 6500);
  $('chanUp').click();
  await say('Each room gets its own channels.', 4000);
  app.closeViewer();

  app.tune('1989');
  await say('November 9, 1989.', 2600);
  caption('"What\'s happening at the border tonight?"');
  await wait(2000);
  await ask('What\'s happening at the border tonight?');
  await say('The Berlin Wall is opening, and she is hearing it as it happens.', 6000);

  app.tune('2026');
  await say('And it works on today: this week\'s news, built from Wikipedia and the papers.', 8000);

  if (app.showLatestMemory()) {
    await say('Text the station a photo from your phone. Google Gemini pins captions on what is in it.', 8500);
  } else {
    $('textToggle')?.click();
    await say('Text the station from your own phone: scan the code and ask the room anything.', 6500);
    $('textToggle')?.click();
  }

  caption('');
  document.body.classList.remove('demo-running');
  document.body.classList.add('demo-end');
  const end = document.createElement('div');
  end.className = 'demo-end-card';
  end.innerHTML = '<span class="demo-end-title">Stay Tuned</span><span class="demo-end-sub">The only history class with no spoilers</span>';
  document.body.append(end);
}

// Before the intro: show where the demo starts, and say what to press.
export function prepareDemo(app) {
  app.tune('Oct 22');
  app.role('citizen');
  caption('Press Tune in to start the demo.');
}
