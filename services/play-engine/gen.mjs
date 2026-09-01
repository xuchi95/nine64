import { Chess } from "chess.js";
const cands = [
 "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
 "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
 "2r3k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1",
 "6k1/5ppp/8/8/8/7P/5PP1/3q2K1 b - - 0 1",
 "r5rk/5p1p/5R2/4B3/8/8/7P/7K w - - 0 1",
 "5rk1/ppp2ppp/8/8/8/8/PPP2PPP/4R1K1 w - - 0 1",
 "3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
 "7k/6pp/8/8/8/8/6PP/5R1K w - - 0 1",
 "6k1/6pp/8/8/8/8/5PPP/1Q4K1 w - - 0 1",
 "k7/8/1K6/8/8/8/8/7R w - - 0 1",
 "8/8/8/8/8/2k5/1q6/K7 b - - 0 1",
 "1k6/1P6/1K6/8/8/8/8/8 w - - 0 1",
 "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 3",
 "r1b1kb1r/pppp1ppp/2n2n2/4p3/2B1P2q/5P2/PPPP2PP/RNBQK1NR b KQkq - 0 4",
 "8/8/8/8/8/1k6/2q5/K7 b - - 0 1",
];
for (const fen of cands) {
  let c; try { c = new Chess(fen); } catch(e){ console.log("BAD", fen, e.message); continue; }
  const mates = c.moves({verbose:true}).filter(m=>{ const t=new Chess(fen); t.move(m); return t.isCheckmate(); });
  console.log(mates.length, mates.map(m=>m.from+m.to+(m.promotion||"")).join(","), fen);
}
