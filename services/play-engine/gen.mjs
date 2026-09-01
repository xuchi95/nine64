import { Chess } from "chess.js";
const cands = [
 "6k1/5p1p/6p1/8/8/8/5PPP/1R4K1 w - - 0 1",
 "7k/5ppp/8/8/8/8/5PPP/1R5K w - - 0 1",
 "5rk1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
 "6k1/4Pppp/8/8/8/8/5PPP/6K1 w - - 0 1",
 "5rk1/4P1pp/8/8/8/8/5PPP/6K1 w - - 0 1",
 "6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1",
 "5rk1/6pp/8/8/8/8/6PP/3Q2K1 w - - 0 1",
 "r4rk1/6pp/8/8/8/8/6PP/3Q2K1 w - - 0 1",
 "7k/8/6QK/8/8/8/8/8 w - - 0 1",
 "3q1k2/8/4N3/8/8/8/8/6K1 w - - 0 1",
 "k7/7R/1K6/8/8/8/8/8 w - - 0 1",
 "8/8/8/8/8/5k2/6q1/7K b - - 0 1",
 "2k5/8/2K5/8/8/8/8/7R w - - 0 1",
 "6k1/5ppp/8/8/8/8/8/R3R1K1 w - - 0 1",
];
for (const fen of cands) {
  let c; try { c = new Chess(fen); } catch(e){ console.log("BAD", fen, e.message); continue; }
  if (c.isCheck()) { console.log("SIDE-IN-CHECK-SKIP?", fen); }
  const mates = c.moves({verbose:true}).filter(m=>{ const t=new Chess(fen); t.move(m); return t.isCheckmate(); });
  console.log(mates.length, mates.map(m=>m.from+m.to+(m.promotion||"")).join(","), fen);
}
