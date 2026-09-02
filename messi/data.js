/* ─────────────────────────────────────────────────────────────
   Messi 2006–2026 — the timeline (the film's screenplay)
   Times are seconds on the audio clock: the complete, uncut《牵丝戏dj》0.8x (卡卡の小曲, Bilibili BV1aDxkeFEzq), 251 s.
   Music map: pre-chorus 0–17 · chorus 18–36 · interlude 36–57 · verse 57–92.5 · pre-chorus 93–111 ·
   chorus 112–129.4 · interlude 129.4–169 · bridge 169–186 · verse 187.6–204 · coda 205.7–223 · coda 223.8–241.4 · outro.
   Chapters: prólogo · 2006 (interlude I + verse) · 2008 · 2014/2018 · 2021 + Finalissima (chorus II) ·
   2022 road, trophy, parade (interlude II, 13 bars) · 2024 (3 bars) · 2026 run (bridge) · 2026 final (verse) ·
   after the whistle (coda I) · epílogo: letter, trophies, numbers (coda II).
   Beat grid: 105 bpm → 0.5716 s, bar 2.2864 s, downbeats at 1.745 + k·2.2864.

   shot:  { t0, t1, src, kind:'img'|'video', pos:'x% y%' (focus), kb:[scale0, scale1, x0, y0, x1, y1] (Ken Burns),
            in:{fx,d}, out:{fx,d}, grade, mask, z, start (video offset s), rate (video speed) }
   lyric: { t0, t1, zh, es, at, size, anim, color, font, vert }
   extra: year | tag | stat | title | quote     event: flash | letterbox
   ───────────────────────────────────────────────────────────── */
(() => {
const IMG = n => `assets/img/${n}.webp`, CLIP = n => `assets/clip/${n}.mp4`;
const img = (id, t0, t1, name, pos, kb, inn, out, grade, extra = {}) => ({ id, t0, t1, src: IMG(name), kind: 'img', pos, kb, in: inn, out, grade, ...extra });
const vid = (id, t0, t1, name, start, inn, out, grade, extra = {}) => ({ id, t0, t1, src: CLIP(name), kind: 'video', start, in: inn, out, grade, kb: [1.02, 1.06], ...extra });
const F = { fade: d => ({ fx: 'fade', d }), blur: d => ({ fx: 'blur', d }), cut: () => ({ fx: 'cut', d: .01 }), dark: d => ({ fx: 'dark', d }) };
const W = (fx, d) => ({ fx, d });
const BAR = 2.2864, DB = k => 1.745 + k * BAR;   // k-th downbeat

let z = 1; const Z = () => z++;   // later shots stack above earlier ones

const shots = [
  /* ── prólogo · pre-chorus (0–17) ── */
  img('op_face',   0,     5.2,  'face26_profile', '30% 35%', [1.2, 1.06, 2, 0, 0, 0], F.blur(1.5), W('wipe-l', .8), 'blue', { z: Z() }),
  img('op_lusail', 4.6,   9.4,  'lusail_alone',   '72% 45%', [1.0, 1.18, 0, 0, -3, 1], W('diag', .9), F.fade(.7), 'night', { z: Z() }),
  img('op_tears',  9.1,   11.7, 'tears24_bench',  '55% 50%', [1.3, 1.42, 0, -7, 0, -9], W('wipe-r', .6), F.fade(.5), 'grey', { z: Z() }),
  img('op_bao',    11.3,  14.0, 'bao14',          '60% 50%', [1.26, 1.38, 3, 0, 0, 0], W('wipe-l', .6), F.blur(.7), 'grey', { z: Z() }),
  img('op_behind', 13.6,  17.9, 'behind_lusail',  '50% 45%', [1.24, 1.0], F.blur(1.2), F.dark(.6), 'night', { z: Z() }),

  /* ── obertura · chorus I (17.7–36): one bar per year ── */
  img('ov06', DB(7),  DB(8) + .1,  'serbia06',           '22% 45%', [1.04, 1.16], W('bars', .45), F.cut(), 'grey', { z: Z() }),
  img('ov08', DB(8),  DB(9) + .1,  'medal08_aguero',     '55% 40%', [1.16, 1.04], W('wipe-u', .4), F.cut(), 'gold', { z: Z() }),
  img('ov14', DB(9),  DB(10) + .1, 'tears14_medal',      '48% 40%', [1.04, 1.16], W('diag', .45), F.cut(), 'grey', { z: Z() }),
  img('ov18', DB(10), DB(11) + .1, 'iceland18_headdown', '50% 50%', [1.16, 1.04], W('iris', .5), F.cut(), 'night', { z: Z() }),
  img('ov21', DB(11), DB(12) + .1, 'copa21_lift_close',  '58% 40%', [1.04, 1.16], W('wipe-r', .4), F.cut(), 'gold', { z: Z() }),
  img('ov22', DB(12), DB(13) + .1, 'wc22_lift_shirt',    '50% 40%', [1.16, 1.04], W('splitx', .45), F.cut(), 'gold', { z: Z() }),
  img('ov24', DB(13), DB(14) + .1, 'copa24_podium',      '50% 50%', [1.04, 1.16], W('hbars', .45), F.cut(), 'gold', { z: Z() }),
  img('ov26', DB(14), DB(15) + .3, 'wc26_medal_tears',   '32% 40%', [1.18, 1.04], W('zoom', .5), F.blur(.7), 'grey', { z: Z() }),

  /* ── I · Alemania 2006 · interlude I + verse (36–75) ── */
  img('s06_kid',    DB(15), 41.4, 'kid06_autograph', '68% 35%', [1.04, 1.14, 0, 0, 1, 0], W('bars', .6), F.fade(.5), 'grey', { z: Z() }),
  img('s06_poster', 41.0,  45.8, 'poster06',        '50% 40%', [1.02, 1.14, 0, 0, 0, -3], W('wipe-r', .7), F.fade(.5), 'grey', { z: Z() }),
  vid('s06_bench',  45.5,  50.2, 'c06_bench', .1, W('wipe-l', .7), F.fade(.5), 'blue', { z: Z() }),
  vid('s06_sub',    50.3,  56.4, 'c06_sub',   .1, W('push-l', .7), F.fade(.4), 'blue', { z: Z() }),
  vid('s06_enter',  56.2,  62.2, 'c06_enter', .2, W('wipe-u', .5), F.fade(.4), 'night', { z: Z() }),
  vid('s06_touch',  62.0,  66.2, 'c06_touch', .1, W('iris', .7), F.fade(.4), 'blue', { z: Z() }),
  vid('s06_assist', 65.8,  71.0, 'c06_assist', .2, W('wipe-r', .7), F.fade(.4), 'blue', { z: Z() }),
  vid('s06_goal',   70.6,  75.6, 'c06_goal',  .6, F.cut(), F.blur(.7), 'gold', { z: Z() }),

  /* ── II · Pekín 2008 (76–93) ── */
  vid('s08_goal',   75.9,  84.3, 'c08_goal',   0,  W('iris', .9), F.fade(.6), 'blue', { z: Z() }),
  vid('s08_aguero', 84.2,  89.5, 'c08_aguero', .1, W('wipe-u', .6), F.fade(.5), 'gold', { z: Z(), rate: .9 }),
  vid('s08_medal',  89.3,  93.4, 'c08_medal',  .2, F.blur(.5), F.dark(.8), 'gold', { z: Z() }),

  /* ── III · Maracanã 2014 (93–102.6) ── */
  vid('s14_stare', 93.26, 98.5,  'c14_stare', 0,  F.fade(.6), F.fade(.5), 'grey', { z: Z(), rate: .75 }),
  vid('s14_walk',  98.4,  102.8, 'c14_walk',  .1, W('wipe-r', .5), F.blur(.6), 'grey', { z: Z() }),

  /* ── IV · Kazán 2018 (102.6–111.7) ── */
  vid('s18_anthem',  102.6, 105.3, 'c18_anthem',     .1, W('splitx', .5), F.cut(), 'night', { z: Z() }),
  vid('s18_nigeria', 105.1, 107.7, 'c18_nigeria',    .1, F.cut(), F.fade(.4), 'gold', { z: Z() }),
  vid('s18_kazan_f', 107.4, 111.9, 'c18_kazan_face', .1, F.blur(.7), F.dark(.8), 'grey', { z: Z(), mask: 'b', kb: [1.0, 1.1] }),

  /* ── V · Maracanã 2021 · Wembley 2022 · chorus II (111.8–129.4) ── */
  vid('s21_chip',    111.76, 116.4, 'c21_chip',    .5, W('diag', .8), F.fade(.5), 'blue', { z: Z() }),
  vid('s21_whistle', 116.2,  120.9, 'c21_whistle', .1, W('wipe-u', .6), F.fade(.5), 'blue', { z: Z() }),
  img('s21_air',     120.6,  124.0, 'copa21_air', '50% 40%', [1.0, 1.14], W('iris', .6), F.fade(.4), 'gold', { z: Z() }),
  vid('s21_neymar',  123.6,  126.3, 'c21_neymar',  .2, W('wipe-l', .5), F.blur(.6), 'grey', { z: Z() }),
  vid('s22f_lift',   126.0,  130.0, 'c22f_lift',   .3, F.blur(.9), F.fade(.6), 'gold', { z: Z() }),

  /* ── VI · Qatar 2022 · interlude II (129.4–159.5, 13 bars): the road, the trophy, the parade — cut on the bar ── */
  img('m_saudi',     129.8,    DB(57) + .1,   'nameplate22', '55% 40%', [1.1, 1.2], F.cut(), F.cut(), 'grey', { z: Z() }),
  vid('m_mexico',    DB(57),   DB(58) + .1,   'c22_mexico',   .4, W('bars', .4), F.cut(), 'blue', { z: Z() }),
  img('m_ned',       DB(58),   DB(59) + .1,   'ned22_net',   '50% 55%', [1.04, 1.16], W('wipe-r', .4), F.cut(), 'blue', { z: Z() }),
  vid('m_croatia',   DB(59),   DB(60.5) + .1, 'c22_gvardiol', .3, W('diag', .45), F.cut(), 'blue', { z: Z() }),
  vid('m_pen',       DB(60.5), DB(61.5) + .1, 'c22_pen',      .4, W('splitx', .4), F.cut(), 'gold', { z: Z() }),
  vid('m_save',      DB(61.5), DB(62.5) + .1, 'c22_save',     .3, W('wipe-u', .4), F.cut(), 'blue', { z: Z() }),
  vid('m_arms',      DB(62.5), DB(63.5) + .1, 'c22_arms',     .2, W('iris', .45), F.cut(), 'gold', { z: Z() }),
  vid('m_bisht',     DB(63.5), DB(65) + .1,   'c22_bisht',    .3, W('wipe-l', .45), F.cut(), 'gold', { z: Z() }),
  vid('m_shoulders', DB(65),   DB(66) + .1,   'c22_shoulders', .2, W('hbars', .4), F.cut(), 'gold', { z: Z() }),
  img('m_kiss',      DB(66),   DB(67) + .1,   'wc22_bisht_kiss', '62% 45%', [1.12, 1.02], W('zoom', .45), F.cut(), 'gold', { z: Z() }),
  vid('m_obelisco',  DB(67),   DB(68) + .1,   'c22_obelisco', .1, W('wipe-r', .4), F.cut(), 'night', { z: Z() }),
  img('m_bus',       DB(68),   DB(69) + .1,   'bus22',       '65% 40%', [1.0, 1.12, 0, 0, -2, -2], W('bars', .4), F.cut(), 'gold', { z: Z() }),
  /* ── VII · Miami 2024 (159.5–169.2, 3 bars + lead-in) ── */
  vid('m_tears24',   DB(69),   DB(70) + .1,   'c24_tears',    .3, W('wipe-l', .4), F.cut(), 'grey', { z: Z() }),
  vid('m_lift24',    DB(70),   DB(71) + .1,   'c24_lift',     .2, W('hbars', .4), F.cut(), 'gold', { z: Z() }),
  img('m_dimaria24', DB(71),   DB(72) + .1,   'copa24_dimaria', '50% 55%', [1.06, 1.16], W('wipe-u', .4), F.cut(), 'gold', { z: Z() }),
  img('m_podium24',  DB(72),   169.7,         'copa24_podium',  '50% 50%', [1.04, 1.14], W('zoom', .5), F.blur(.6), 'gold', { z: Z() }),

  /* ── VIII · Estados Unidos 2026 · the run · bridge (169.2–187): Austria, the Egypt comeback, the England winner ── */
  vid('b_austria',  169.2, 173.9, 'c26_austria',       .8, W('wipe-r', .7), F.fade(.5), 'blue', { z: Z() }),
  vid('b_egypt',    173.6, 178.4, 'c26_egypt',         .6, W('wipe-l', .7), F.cut(), 'gold', { z: Z() }),
  vid('b_egypt_w',  178.1, 181.0, 'c26_egypt_whistle', 0,  F.cut(), F.fade(.4), 'gold', { z: Z() }),
  vid('b_england',  180.7, 183.4, 'c26_england',       .3, W('wipe-u', .4), F.fade(.4), 'blue', { z: Z() }),
  vid('b_sf_w',     183.0, 185.3, 'c26_sf_whistle',    0,  F.blur(.6), F.cut(), 'night', { z: Z() }),
  img('b_england_s', 185.0, 187.9, 'england26', '45% 40%', [1.04, 1.14], W('zoom', .5), F.fade(.6), 'gold', { z: Z() }),

  /* ── VIII · MetLife 2026 · the final · verse (187.3–205.6) ── */
  img('v_alone26', 187.3, 190.6, 'alone26', '50% 45%', [1.02, 1.14, 0, 0, 0, -2], W('iris', .6), F.fade(.5), 'night', { z: Z() }),
  vid('v_save',    190.3, 192.7, 'c26_save',    1.0, W('wipe-l', .5), F.cut(), 'blue', { z: Z() }),
  vid('v_torres',  192.4, 195.9, 'c26_torres',  .2,  F.cut(), F.fade(.4), 'night', { z: Z() }),
  vid('v_whistle', 195.8, 199.4, 'c26_whistle', .1,  F.cut(), F.fade(.4), 'grey', { z: Z() }),
  vid('v_yamal',   199.1, 201.6, 'c26_yamal',   .8,  W('wipe-r', .6), F.fade(.4), 'grey', { z: Z() }),
  vid('v_medal',   201.3, 205.6, 'c26_medal',   .2,  F.blur(.9), F.dark(1.0), 'grey', { z: Z(), kb: [1.06, 1.0] }),

  /* ── after the whistle · coda I (205.5–224) ── */
  vid('a_alone',   205.5, 210.6, 'c26_alone',   .3, F.blur(1.0), F.fade(.5), 'grey', { z: Z() }),
  vid('a_fans',    210.3, 214.9, 'c26_fans_ba', .2, W('wipe-u', .5), F.fade(.5), 'night', { z: Z() }),
  vid('a_walkoff', 214.6, 217.8, 'c26_walkoff', .3, F.blur(.5), F.fade(.5), 'grey', { z: Z() }),
  vid('a_tunnel',  217.4, 220.4, 'c26_tunnel',  .3, W('wipe-l', .6), F.fade(.6), 'night', { z: Z() }),
  img('a_tears',   219.6, 224.3, 'wc26_medal_tears', '32% 40%', [1.16, 1.04], F.blur(1.2), F.fade(.8), 'grey', { z: Z() }),

  /* ── epílogo · coda II (223.8–242): the letter, the trophies, the numbers ── */
  vid('e_letter', 223.6, 235.0, 'c26_letter', 0, F.blur(1.2), F.fade(.8), 'night', { z: Z(), mask: 'l', dim: .3, rate: .78 }),
  img('e_t08',  DB(102),           DB(102) + BAR / 2 + .1, 'podium08',        '50% 50%', [1.04, 1.1], W('bars', .35), F.cut(), 'gold', { z: Z() }),
  img('e_t21',  DB(102) + BAR / 2, DB(103) + .1,           'copa21_lift_team', '50% 40%', [1.1, 1.04], W('wipe-r', .35), F.cut(), 'gold', { z: Z() }),
  img('e_t22f', DB(103),           DB(103) + BAR / 2 + .1, 'fin22_lift',      '50% 40%', [1.04, 1.1], W('wipe-l', .35), F.cut(), 'gold', { z: Z() }),
  img('e_t22',  DB(103) + BAR / 2, DB(104) + .1,           'wc22_bisht_lift',  '50% 30%', [1.1, 1.04], W('splitx', .35), F.cut(), 'gold', { z: Z() }),
  img('e_t24',  DB(104),           240.7,                  'copa24_podium',    '50% 50%', [1.04, 1.1], W('hbars', .35), F.blur(.5), 'gold', { z: Z() }),
  img('e_behind', 240.4, 243.6, 'behind_metlife', '50% 45%', [1.22, 1.0], F.blur(1.0), F.dark(1.1), 'night', { z: Z() }),
];

/* keep every outgoing shot alive underneath the next one's entrance, so wipes never reveal black
   (except where the outgoing shot deliberately fades to black with F.dark) */
for (let i = 0; i + 1 < shots.length; i++) {
  const a = shots[i], b = shots[i + 1];
  if (a.out && a.out.fx === 'dark') continue;
  const need = b.t0 + (b.in?.d ?? .8) + .08;
  if (a.t1 < need) a.t1 = need;
}

/* year numerals for the overture, one per bar, tucked into alternating corners under the chorus lyrics */
const overture = [[7, '2006', 'br'], [8, '2008', 'tr'], [9, '2014', 'bl'], [10, '2018', 'tl'], [11, '2021', 'br'], [12, '2022', 'tr'], [13, '2024', 'bl'], [14, '2026', 'br']];
const extras = [
  ...overture.map(([k, y, at], i) => ({ kind: 'year', text: y, at, color: i % 2 ? 'white' : '', op: .3, grow: .06, t0: DB(k), t1: DB(k + 1) + .06, in: .25, out: .2 })),
  { kind: 'year', text: '2006', at: 'tl', op: .18, t0: 13.9, t1: 17.7, in: .8, out: .5, drift: [0, 0, -2, 0] },
  { kind: 'year', text: '2026', at: 'br', op: .18, t0: 14.5, t1: 17.7, in: .8, out: .5, drift: [0, 0, 2, 0] },
  { kind: 'tag', text: 'Prólogo · 2006 — 2026', cn: '序', t0: 1.2, t1: 35.6 },

  { kind: 'year', text: '2006', at: 'br', op: .14, t0: 36.2, t1: 75.6, drift: [0, 0, -3, 0] },
  { kind: 'tag', text: 'Cap. I · Gelsenkirchen 2006 · 18 años', cn: '少年', t0: 36.6, t1: 75.4 },
  { kind: 'year', text: '2008', at: 'tr', op: .14, t0: 76.2, t1: 93.1, drift: [0, 0, 3, 0] },
  { kind: 'tag', text: 'Cap. II · Pekín 2008 · oro olímpico', cn: '金', t0: 76.6, t1: 92.9 },
  { kind: 'year', text: '2014', at: 'br', op: .14, t0: 93.5, t1: 102.4, drift: [0, 0, -3, 0], color: 'white' },
  { kind: 'tag', text: 'Cap. III · Maracanã 2014 · 0–1', cn: '遺憾', t0: 93.8, t1: 102.3 },
  { kind: 'year', text: '2018', at: 'bl', op: .14, t0: 102.7, t1: 111.5, drift: [0, 0, 3, 0], color: 'white' },
  { kind: 'tag', text: 'Cap. IV · Kazán 2018 · 3–4', cn: '宿命', t0: 102.9, t1: 111.4 },
  { kind: 'year', text: '2021', at: 'tr', op: .14, t0: 111.9, t1: 125.8, drift: [0, 0, 3, 0] },
  { kind: 'tag', text: 'Cap. V · Maracanã 2021 · 1–0 Brasil', cn: '破曉', t0: 112.2, t1: 125.7 },
  { kind: 'tag', text: 'Wembley 2022 · Finalissima · 3–0 Italia', cn: '歐美盃', t0: 126.2, t1: 129.6 },
  { kind: 'year', text: '2022', at: 'br', op: .14, t0: 129.9, t1: 159.3, drift: [0, 0, -4, 0] },
  { kind: 'tag', text: 'Cap. VI · Lusail 2022 · campeones del mundo', cn: '加冕', t0: 130.2, t1: 154.7 },
  { kind: 'tag', text: 'Buenos Aires · 20.12.2022 · cinco millones', cn: '凱旋', t0: 155.0, t1: 159.3 },
  { kind: 'year', text: '2024', at: 'tr', op: .14, t0: 159.7, t1: 169.0, drift: [0, 0, 3, 0] },
  { kind: 'tag', text: 'Cap. VII · Miami 2024 · cuatro títulos', cn: '四連冠', t0: 159.7, t1: 169.0 },
  { kind: 'year', text: '2026', at: 'br', op: .14, t0: 169.5, t1: 205.3, drift: [0, 0, -3, 0], color: 'white' },
  { kind: 'tag', text: 'Cap. VIII · Estados Unidos 2026 · el último baile', cn: '最後一舞', t0: 169.5, t1: 187.2 },
  { kind: 'tag', text: 'MetLife · 19.07.2026 · la final · 0–1 España', cn: '謝幕', t0: 187.6, t1: 205.3 },
  { kind: 'tag', text: 'MetLife · después del silbato', cn: '終場', t0: 205.8, t1: 223.4 },
  { kind: 'tag', text: 'Epílogo · 31.08.2026', cn: '告別', t0: 223.9, t1: 238.0 },

  { kind: 'quote', x: '7vw', y: '40%', w: '44vw', typeD: 5.4, t0: 224.0, t1: 234.7, in: .8, out: .6,
    q: 'Después del tiempo que pasó desde la final, y después de pensarlo mucho, quiero que todos sepan que me retiro de la Selección.',
    cn: '決賽過去了這麼久，經過深思熟慮，我想讓所有人知道：我將從國家隊退役。這是一個心痛的決定，至今仍痛在心底，但我明白，時候到了。',
    who: 'Lionel Messi · Instagram · 31.08.2026' },

  { kind: 'stat', n: '207', c: 'partidos', cn: '場', x: '9vw', y: '13vh', t0: 240.7, t1: 243.4, in: .8, out: .7 },
  { kind: 'stat', n: '125', c: 'goles', cn: '球', x: '50%', y: '13vh', align: 'center', t0: 241.0, t1: 243.4, in: .8, out: .7 },
  { kind: 'stat', n: '20', c: 'años', cn: '年', x: '77vw', y: '13vh', t0: 241.3, t1: 243.4, in: .8, out: .7 },

  { kind: 'title', h: '謝謝你，里奧', p: 'Gracias, Leo. Por veinte años de pena y de dicha.', m: '2006 — 2026', t0: 243.4, t1: 251.1, in: 1.4, out: 1.4 },
];

const flashes = [[4.74, .6, .5, '#f4dc8c'], [70.9, .6, .7, '#ffffff'], [105.1, .4, .35, '#f4dc8c'], [111.76, .5, .5, '#f4dc8c'], [178.26, .8, .7, '#f4dc8c'], [219.72, .6, .4, '#f4dc8c']];
const bars = [7, 8, 9, 10, 11, 12, 13, 14, 57, 58, 59, 60.5, 61.5, 62.5, 63.5, 65, 66, 67, 68, 69, 70, 71, 72, 102, 102.5, 103, 103.5, 104].map(DB);
const events = [
  ...flashes.map(([t, d, op, color]) => ({ kind: 'flash', t, d, op, color })),
  ...bars.map(t => ({ kind: 'flash', t, d: .3, op: .28, color: '#f4dc8c' })),
  { kind: 'letterbox', t: 0, px: 0 }, { kind: 'letterbox', t: 93.2, px: 8 }, { kind: 'letterbox', t: 111.7, px: 0 },
  { kind: 'letterbox', t: 187.4, px: 8 }, { kind: 'letterbox', t: 223.6, px: 0 }, { kind: 'letterbox', t: 240.4, px: 8 },
];

window.FILM = {
  audio: [{ src: 'assets/audio/qiansixi.m4a', type: 'audio/mp4' }, { src: 'assets/audio/qiansixi.mp3', type: 'audio/mpeg' }],
  end: 251.1,
  chapters: [
    { t0: 0,      t1: 36,     year: '序' },   { t0: 36,     t1: 75.9,   year: '2006' }, { t0: 75.9,   t1: 93.3,   year: '2008' },
    { t0: 93.3,   t1: 102.6,  year: '2014' }, { t0: 102.6,  t1: 111.7,  year: '2018' }, { t0: 111.7,  t1: 129.4,  year: '2021' },
    { t0: 129.4,  t1: 159.51, year: '2022' }, { t0: 159.51, t1: 169.2,  year: '2024' }, { t0: 169.2,  t1: 205.5,  year: '2026' }, { t0: 205.5, t1: 251.1, year: '終' },
  ],
  shots, extras, events,
  lyrics: [
    /* ── pre-chorus · prólogo ── */
    { t0: 0.05,  t1: 4.4,  zh: '是你吻開筆墨 染我眼角珠淚', es: 'Fue tu beso el que abrió la tinta y me tiñó de lágrimas', at: 'br', size: 'l', anim: 'ink' },
    { t0: 4.74,  t1: 7.9,  zh: '演離合相遇悲喜為誰', es: '¿Para quién actúo encuentros y adioses, penas y alegrías?', at: 'tl', size: 'l', anim: 'rise', color: 'gold' },
    { t0: 9.34,  t1: 13.5, zh: '他們迂迴誤會 我卻只由你支配', es: 'Ellos dan rodeos y malentienden; yo solo obedezco a tu mano', at: 'bl', size: 'm', anim: 'sweep', color: 'grey' },
    { t0: 13.8,  t1: 17.4, zh: '問世間哪有更完美', es: '¿Dónde hay en el mundo algo más perfecto?', at: 'c', size: 'xl', anim: 'zoom', color: 'gold', in: 1 },

    /* ── chorus I · obertura ── */
    { t0: 17.72, t1: 21.6, zh: '蘭花指捻紅塵似水', es: 'Con dedos de orquídea hilo este mundo como agua', at: 'tl', size: 'xl', anim: 'ink' },
    { t0: 22.78, t1: 26.4, zh: '三尺紅臺 萬事入歌吹', es: 'Tres pies de escenario rojo, y todo se vuelve canción', at: 'bl', size: 'l', anim: 'rise', color: 'gold' },
    { t0: 26.68, t1: 29.6, zh: '唱別久悲不成悲', es: 'Canto el adiós; la larga pena ya no es pena', at: 'vr', vert: true, size: 'l', anim: 'drop' },
    { t0: 29.94, t1: 31.9, zh: '十分紅處竟成灰', es: 'Donde más ardía el rojo, quedó ceniza', at: 'vl', vert: true, size: 'l', anim: 'drop', color: 'grey' },
    { t0: 32.22, t1: 36.0, zh: '願誰記得誰 最好的年歲', es: 'Que alguien recuerde a alguien en sus mejores años', at: 'c', size: 'xxl', anim: 'zoom', color: 'gold', in: 1.1, out: .9 },

    /* ── verse · 2006 ── */
    { t0: 57.42, t1: 60.9, zh: '嘲笑誰恃美揚威', es: 'Se burlan de quien presume su gracia', at: 'tl', size: 'l', anim: 'sweep' },
    { t0: 62.32, t1: 65.4, zh: '沒了心如何相配', es: 'Sin corazón, ¿cómo íbamos a ser pareja?', at: 'br', size: 'l', anim: 'ink' },
    { t0: 65.94, t1: 70.5, zh: '盤鈴聲清脆 帷幕間燈火幽微', es: 'Tintinean los cascabeles; entre telones, la luz es tenue', at: 'ml', size: 'm', anim: 'rise', color: 'blue' },
    { t0: 70.9,  t1: 74.6, zh: '我和你 最天生一對', es: 'Tú y yo, nacidos el uno para el otro', at: 'c', size: 'xl', anim: 'zoom', color: 'gold', in: 1 },

    /* ── verse · 2008 ── */
    { t0: 76.08, t1: 79.3, zh: '沒了你才算原罪', es: 'Sin ti, ese sí sería el pecado original', at: 'tr', size: 'l', anim: 'ink' },
    { t0: 80.27, t1: 83.6, zh: '沒了心才好相配', es: 'Solo sin corazón seríamos pareja perfecta', at: 'bl', size: 'l', anim: 'rise' },
    { t0: 84.32, t1: 89.0, zh: '你襤褸我彩繪 並肩行過山與水', es: 'Tú en harapos, yo pintado; cruzamos juntos montes y ríos', at: 'tc', size: 'm', anim: 'sweep', color: 'blue' },
    { t0: 89.34, t1: 92.8, zh: '你憔悴 我替你明媚', es: 'Si te marchitas, yo seré luminoso por ti', at: 'bc', size: 'xl', anim: 'ink', color: 'gold' },

    /* ── pre-chorus · 2014 / 2018 ── */
    { t0: 93.32, t1: 98.2, zh: '是你吻開筆墨 染我眼角珠淚', es: 'Fue tu beso el que abrió la tinta y me tiñó de lágrimas', at: 'tl', size: 'l', anim: 'ink', color: 'grey' },
    { t0: 98.5,  t1: 102.2, zh: '演離合相遇悲喜為誰', es: '¿Para quién actúo encuentros y adioses, penas y alegrías?', at: 'br', size: 'l', anim: 'drop' },
    { t0: 102.62, t1: 104.9, zh: '他們迂迴誤會', es: 'Ellos dan rodeos y malentienden', at: 'ml', size: 'l', anim: 'sweep', color: 'grey' },
    { t0: 105.22, t1: 107.3, zh: '我卻只由你支配', es: 'Pero yo solo obedezco a tu mano', at: 'mr', size: 'l', anim: 'sweep', color: 'gold' },
    { t0: 107.52, t1: 111.1, zh: '問世間哪有更完美', es: '¿Dónde hay en el mundo algo más perfecto?', at: 'c', size: 'xl', anim: 'zoom', color: 'gold', in: 1 },

    /* ── chorus II · 2021 / Finalissima ── */
    { t0: 111.76, t1: 115.4, zh: '蘭花指捻紅塵似水', es: 'Con dedos de orquídea hilo este mundo como agua', at: 'bl', size: 'xl', anim: 'ink' },
    { t0: 116.22, t1: 119.9, zh: '三尺紅臺 萬事入歌吹', es: 'Tres pies de escenario rojo, y todo se vuelve canción', at: 'tr', size: 'l', anim: 'rise', color: 'blue' },
    { t0: 120.64, t1: 123.4, zh: '唱別久悲不成悲', es: 'Canto el adiós; la larga pena ya no es pena', at: 'vr', vert: true, size: 'l', anim: 'drop', color: 'gold' },
    { t0: 123.66, t1: 125.6, zh: '十分紅處竟成灰', es: 'Donde más ardía el rojo, quedó ceniza', at: 'vl', vert: true, size: 'l', anim: 'drop' },
    { t0: 125.98, t1: 129.6, zh: '願誰記得誰 最好的年歲', es: 'Que alguien recuerde a alguien en sus mejores años', at: 'c', size: 'xxl', anim: 'zoom', color: 'gold', in: 1.1, out: .9 },

    /* ── bridge · the 2026 run ── */
    { t0: 169.22, t1: 173.3, zh: '你一牽我舞如飛', es: 'Tiras del hilo y bailo como si volara', at: 'tl', size: 'xl', anim: 'sweep' },
    { t0: 173.66, t1: 177.5, zh: '你一引我懂進退', es: 'Me guías y sé cuándo avanzar y cuándo ceder', at: 'br', size: 'xl', anim: 'sweep' },
    { t0: 178.26, t1: 180.5, zh: '苦樂都跟隨', es: 'En la pena y en la dicha, te sigo', at: 'c', size: 'xxl', anim: 'zoom', color: 'gold', in: .8, out: .5 },
    { t0: 180.74, t1: 182.8, zh: '舉手投足不違背', es: 'Ni un gesto mío te contradice', at: 'bc', size: 'm', anim: 'rise' },
    { t0: 183.08, t1: 186.4, zh: '將謙卑 溫柔成絕對', es: 'Y la humildad se vuelve ternura absoluta', at: 'ml', size: 'l', anim: 'ink', color: 'gold' },

    /* ── verse · the 2026 final ── */
    { t0: 187.64, t1: 191.9, zh: '你錯我不肯對 你懵懂我蒙昧', es: 'Si tú yerras, no acierto; si tú ignoras, no entiendo', at: 'tr', size: 'm', anim: 'rise' },
    { t0: 192.2,  t1: 195.5, zh: '心火怎甘心揚湯止沸', es: '¿Cómo aplacar con agua tibia el fuego del pecho?', at: 'bl', size: 'l', anim: 'ink', color: 'gold' },
    { t0: 196.66, t1: 198.9, zh: '你枯我不曾萎', es: 'Si te secas, yo no me marchito', at: 'mr', size: 'l', anim: 'sweep', color: 'grey' },
    { t0: 199.12, t1: 201.1, zh: '你倦我也不敢累', es: 'Si te cansas, no me atrevo a cansarme', at: 'tr', size: 'l', anim: 'sweep', color: 'grey' },
    { t0: 201.3,  t1: 204.6, zh: '用什麼暖你一千歲', es: '¿Con qué podré abrigarte mil años?', at: 'c', size: 'xl', anim: 'zoom', color: 'gold', in: 1 },

    /* ── coda I · after the whistle ── */
    { t0: 205.72, t1: 209.4, zh: '風雪依稀秋白髮尾', es: 'Viento y nieve, apenas; el otoño encanece el cabello', at: 'tl', size: 'l', anim: 'ink', color: 'grey' },
    { t0: 210.28, t1: 213.8, zh: '燈火葳蕤 揉皺你眼眉', es: 'Florecen las luces y arrugan tu ceño', at: 'br', size: 'l', anim: 'drop' },
    { t0: 214.8,  t1: 217.1, zh: '假如你捨一滴淚', es: 'Si me concedes una sola lágrima', at: 'vr', vert: true, size: 'l', anim: 'ink' },
    { t0: 217.42, t1: 219.5, zh: '假如老去我能陪', es: 'Si al envejecer puedo acompañarte', at: 'vl', vert: true, size: 'l', anim: 'ink', color: 'gold' },
    { t0: 219.72, t1: 223.3, zh: '煙波裡成灰 也去得完美', es: 'Volverse ceniza entre la bruma también es un final perfecto', at: 'bc', size: 'xl', anim: 'zoom', color: 'gold', in: 1 },

    /* ── coda II · epílogo ── */
    { t0: 223.8,  t1: 227.6, zh: '風雪依稀秋白髮尾', es: 'Viento y nieve, apenas; el otoño encanece el cabello', at: 'bl', size: 's', anim: 'rise', color: 'grey' },
    { t0: 228.44, t1: 232.0, zh: '燈火葳蕤 揉皺你眼眉', es: 'Florecen las luces y arrugan tu ceño', at: 'bl', size: 's', anim: 'rise' },
    { t0: 232.22, t1: 234.6, zh: '假如你捨一滴淚', es: 'Si me concedes una sola lágrima', at: 'br', size: 'l', anim: 'ink' },
    { t0: 235.28, t1: 237.8, zh: '假如老去我能陪', es: 'Si al envejecer puedo acompañarte', at: 'mr', size: 'l', anim: 'ink', color: 'gold' },
    { t0: 238.0,  t1: 242.4, zh: '煙波裡成灰 也去得完美', es: 'Volverse ceniza entre la bruma también es un final perfecto', at: 'bc', size: 'xl', anim: 'zoom', color: 'gold', in: 1.2, out: 1.2 },
  ],
};
})();
