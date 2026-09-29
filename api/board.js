// Permanent board. One JSON file in this repo. Last higher rev wins.

const REPO = "kb359/survivor-51-snake-draft-state";
const PATH = "board.json";

function blank() {
  return { phase: "setup", players: [], picks: [], out: [], rev: 0 };
}

function headers(extra) {
  const h = {
    Authorization: "Bearer " + process.env.GITHUB_TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": "survivor-51-snake-draft",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (extra) Object.assign(h, extra);
  return h;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function shape(body) {
  if (!body || typeof body !== "object") return null;
  if (!["setup", "draft", "done"].includes(body.phase)) return null;
  if (!Array.isArray(body.players) || !Array.isArray(body.picks) || !Array.isArray(body.out)) return null;
  if (typeof body.rev !== "number" || body.rev < 0 || body.rev > 100000) return null;
  if (body.players.length > 10 || body.picks.length > 20 || body.out.length > 20) return null;
  const players = body.players.slice(0, 10).filter(p => p && typeof p.id === "string" && typeof p.name === "string")
    .map(p => ({ id: p.id.slice(0, 16), name: p.name.slice(0, 28) }));
  const picks = body.picks.filter(x => typeof x === "string").slice(0, 20);
  const out = body.out.filter(x => typeof x === "string").slice(0, 20);
  const saved = { phase: body.phase, players, picks, out, rev: body.rev };
  if (typeof body.nonce === "string") saved.nonce = body.nonce.slice(0, 32);
  return saved;
}

async function readBoard() {
  const r = await fetch("https://api.github.com/repos/" + REPO + "/contents/" + PATH + "?ref=main", { headers: headers() });
  if (r.status === 404) return { board: blank(), sha: null };
  if (!r.ok) throw new Error("read " + r.status);
  const j = await r.json();
  const text = Buffer.from(j.content, "base64").toString("utf8");
  let board = blank();
  try { board = JSON.parse(text); } catch {}
  return { board, sha: j.sha };
}

async function writeBoard(board, sha) {
  const body = {
    message: "Save draft board",
    content: Buffer.from(JSON.stringify(board)).toString("base64"),
    branch: "main",
  };
  if (sha) body.sha = sha;
  const r = await fetch("https://api.github.com/repos/" + REPO + "/contents/" + PATH, {
    method: "PUT",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (r.status === 409 || r.status === 422) return false;
  if (!r.ok) throw new Error("write " + r.status);
  return true;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  try {
    if (req.method === "GET") {
      const { board } = await readBoard();
      res.status(200).json(board);
      return;
    }
    if (req.method === "PUT") {
      const incoming = shape(req.body);
      if (!incoming) { res.status(400).json({ error: "bad board" }); return; }
      for (let attempt = 0; attempt < 3; attempt++) {
        const { board, sha } = await readBoard();
        const curRev = Number(board && board.rev) || 0;
        if (incoming.rev <= curRev) { res.status(409).json(board); return; }
        const ok = await writeBoard(incoming, sha);
        if (ok) { res.status(200).json(incoming); return; }
      }
      const { board } = await readBoard();
      res.status(409).json(board);
      return;
    }
    res.status(405).end();
  } catch (err) {
    res.status(500).json({ error: "save failed" });
  }
};
