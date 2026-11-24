import { db, events } from "hatchable";
export const access = "public";
export default async function(req,res) {
  const code = String(req.query.code || "").toUpperCase();
  const playerId = String(req.query.playerId || "");
  const token = String(req.query.token || "");
  if (!/^[A-Z0-9]{6}$/.test(code) || !playerId || !token) return res.status(400).json({error:"Missing room credentials"});
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
  const {rows} = await db.query("SELECT r.id FROM rooms r JOIN players p ON p.room_id=r.id WHERE r.code=$1 AND p.id=$2 AND p.token_hash=$3",[code,playerId,tokenHash]);
  if (!rows.length) return res.status(403).json({error:"Invalid room credentials"});
  res.json(await events.grant(["room:"+code],{ttl:300}));
}