// Course progression: which hole, strokes per hole, and persistence
// (Continue Playing checkpoints + the total-strokes leaderboard).

const PROGRESS_CHANNEL = "course";
const RECORD_CHANNEL = "course_strokes";

function scoreName(strokes, par) {
  if (strokes === 1) return "Hole in one!";
  const diff = strokes - par;
  if (diff <= -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double bogey";
  return `+${diff}`;
}

function totalPar() {
  return LEVELS.reduce((sum, level) => sum + level.par, 0);
}

function createCourse(services) {
  const score = services.createScore();
  const state = { hole: 0, strokes: LEVELS.map(() => 0), ballX: 0, land: null };

  function loadHole(index) {
    state.hole = index;
    state.land = makeLandscape(LEVELS[index]);
    state.ballX = LEVELS[index].start;
  }

  function addStroke(count = 1) {
    state.strokes[state.hole] += count;
    score.add(count, { reason: "stroke" });
  }

  function total() {
    return state.strokes.reduce((a, b) => a + b, 0);
  }

  function isValidSave(saved) {
    const s = saved && saved.resumeEligible === true ? saved.state : null;
    return Boolean(
      s && Number.isInteger(s.hole) && s.hole > 0 && s.hole < LEVELS.length &&
      Array.isArray(s.strokes) && s.strokes.length === LEVELS.length &&
      s.strokes.every(n => Number.isInteger(n) && n >= 0 && n < 100)
    );
  }

  async function restore() {
    try {
      const saved = await services.progress.load(PROGRESS_CHANNEL);
      // Never yank a player to another hole if they already started playing.
      if (!isValidSave(saved) || total() > 0 || state.hole !== 0) return false;
      state.strokes = saved.state.strokes.slice();
      score.set(total(), { reason: "resume" });
      loadHole(saved.state.hole);
      return true;
    } catch (err) {
      return false;
    }
  }

  function checkpoint() {
    const payload = {
      state: { hole: state.hole, strokes: state.strokes.slice() },
      label: `Hole ${state.hole + 1} of ${LEVELS.length}`,
      percent: Math.round((state.hole / LEVELS.length) * 100)
    };
    services.progress.save(PROGRESS_CHANNEL, payload);
  }

  async function finish() {
    const strokes = total();
    const par = totalPar();
    services.progress.complete(PROGRESS_CHANNEL, {
      state: { hole: LEVELS.length - 1, strokes: state.strokes.slice(), finished: true },
      label: "Course complete",
      percent: 100
    });
    let best = false;
    try {
      const result = await score.submit(RECORD_CHANNEL, { label: `${strokes} strokes` });
      best = Boolean(result && result.isPersonalBest);
    } catch (err) {
      best = false;
    }
    services.platform("complete", { score: strokes, par });
    return { strokes, par, best };
  }

  function restartCourse() {
    services.progress.abandon(PROGRESS_CHANNEL);
    state.strokes = LEVELS.map(() => 0);
    score.reset({ reason: "replay" });
    loadHole(0);
  }

  loadHole(0);
  return { state, loadHole, addStroke, total, restore, checkpoint, finish, restartCourse };
}
