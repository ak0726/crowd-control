import { db, events } from "hatchable";
export const access = "public";
const QUESTIONS = {
 most: [
  "Who is most likely to accidentally send a screenshot to the person they're talking about?",
  "Who would survive the longest in a zombie apocalypse?",
  "Who is most likely to become famous for something ridiculous?",
  "Who would forget their own birthday?",
  "Who is most likely to laugh at the worst possible moment?",
  "Who would accidentally reveal a secret?",
  "Who is most likely to become a millionaire and still split the bill?",
  "Who would get lost using GPS?"
 ],
 would: [
  ["Read everyone's WhatsApp messages publicly","Let everyone read your search history"],
  ["Never use social media again","Never watch movies or TV again"],
  ["Have a rewind button for life","Have a pause button for life"],
  ["Always speak your thoughts out loud","Never speak again"],
  ["Be 10 minutes late everywhere","Be 30 minutes early everywhere"],
  ["Give up pizza forever","Give up burgers forever"]
 ],
 team: [
  "Agree unanimously: who would be the worst secret agent?",
  "As a team, choose one person to negotiate with aliens.",
  "Agree unanimously: who would accidentally start a viral trend?",
  "Choose the teammate most likely to win a reality show."
 ]
};
const AVATARS = ["🦊","🐸","🐼","🐯","🐙","🦄","🐵","🐧","🐨","🦁","🐻","🐹"];
const hashToken = async token => {
 const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
 return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
const clean = (v,n=40)=>String(v||"").trim().replace(/[<>]/g,"").slice(0,n);
async function auth(code,playerId,token) {
 const {rows}=await db.query("SELECT r.*,p.id AS pid,p.nickname,p.score,p.team FROM rooms r JOIN players p ON p.room_id=r.id WHERE r.code=$1 AND p.id=$2 AND p.token_hash=$3",[code,playerId,await hashToken(token||"")]);
 return rows[0]||null;
}
async function snapshot(code,viewerId) {
 const {rows:rr}=await db.query("SELECT * FROM rooms WHERE code=$1",[code]); if(!rr.length)return null;
 const room=rr[0];
 const {rows:players}=await db.query("SELECT id,nickname,avatar,score,team,connected,joined_at FROM players WHERE room_id=$1 ORDER BY joined_at",[room.id]);
 const {rows:entries}=await db.query("SELECT e.player_id,e.entry_type,e.value,p.nickname FROM round_entries e JOIN players p ON p.id=e.player_id WHERE e.room_id=$1 AND e.round_number=$2",[room.id,room.round_number]);
 const {rows:messages}=await db.query("SELECT id,player_id,nickname,body,kind,created_at FROM chat_messages WHERE room_id=$1 ORDER BY created_at DESC LIMIT 40",[room.id]);
 const {rows:me}=await db.query("SELECT id,nickname,avatar,score,team FROM players WHERE id=$1",[viewerId]);
 const {rows:host}=await db.query("SELECT id FROM players WHERE id=$1",[room.host_player_id]);
 const visibleEntries=room.status==="playing"?entries.filter(e=>e.player_id===viewerId):entries;
 const submitted=entries.filter(e=>e.entry_type==="answer").map(e=>e.player_id);
 return {room:{code:room.code,status:room.status,settings:room.settings,roundNumber:room.round_number,roundType:room.round_type,roundData:room.round_data,roundDeadline:room.round_deadline,hostPlayerId:room.host_player_id},players,entries:visibleEntries,submitted,messages:messages.reverse(),me:me[0]||null};
}
async function emit(code,event="changed") { await events.publish("room:"+code,event,{at:Date.now()}); }
export default async function(req,res) {
 try {
  const b=req.body||{}, action=clean(b.action,24), code=clean(b.code,6).toUpperCase();
  if(req.method!=="POST") return res.status(405).json({error:"Use POST"});
  if(action==="create") {
   const nickname=clean(b.nickname,18), avatar=AVATARS.includes(b.avatar)?b.avatar:"🦊";
   if(!nickname)return res.status(400).json({error:"Choose a nickname"});
   let roomCode;
   for(let i=0;i<8;i++){roomCode=Math.random().toString(36).slice(2,8).toUpperCase();const x=await db.query("SELECT id FROM rooms WHERE code=$1",[roomCode]);if(!x.rows.length)break;}
   const {rows:r}=await db.query("INSERT INTO rooms(code,status,settings) VALUES($1,'lobby',$2::jsonb) RETURNING id",[roomCode,JSON.stringify({timer:20,teamEvery:3,modes:["most","would","team"]})]);
   const token=crypto.randomUUID()+crypto.randomUUID();
   const {rows:p}=await db.query("INSERT INTO players(room_id,nickname,avatar,token_hash) VALUES($1,$2,$3,$4) RETURNING id",[r[0].id,nickname,avatar,await hashToken(token)]);
   await db.query("UPDATE rooms SET host_player_id=$1 WHERE id=$2",[p[0].id,r[0].id]);
   await emit(roomCode); return res.json({code:roomCode,playerId:p[0].id,token});
  }
  if(action==="join") {
   const nickname=clean(b.nickname,18),avatar=AVATARS.includes(b.avatar)?b.avatar:"🦊";
   const {rows:r}=await db.query("SELECT id,status FROM rooms WHERE code=$1",[code]);
   if(!r.length||r[0].status!=="lobby")return res.status(404).json({error:"Room not found or game already started"});
   if(!nickname)return res.status(400).json({error:"Choose a nickname"});
   const {rows:c}=await db.query("SELECT count(*)::int AS n FROM players WHERE room_id=$1",[r[0].id]);
   if(c[0].n>=8)return res.status(409).json({error:"Room is full"});
   const token=crypto.randomUUID()+crypto.randomUUID();
   const {rows:p}=await db.query("INSERT INTO players(room_id,nickname,avatar,token_hash) VALUES($1,$2,$3,$4) RETURNING id",[r[0].id,nickname,avatar,await hashToken(token)]);
   await emit(code); return res.json({code,playerId:p[0].id,token});
  }
  const room=await auth(code,b.playerId,b.token);
  if(!room)return res.status(403).json({error:"Room credentials are invalid"});
  await db.query("UPDATE players SET connected=true WHERE id=$1",[b.playerId]);
  if(action==="state")return res.json(await snapshot(code,b.playerId));
  const isHost=room.host_player_id===b.playerId;
  if(action==="leave") {
   await db.query("UPDATE players SET connected=false WHERE id=$1",[b.playerId]);
   if(isHost){const {rows:next}=await db.query("SELECT id FROM players WHERE room_id=$1 AND id<>$2 AND connected=true ORDER BY joined_at LIMIT 1",[room.id,b.playerId]);if(next.length)await db.query("UPDATE rooms SET host_player_id=$1 WHERE id=$2",[next[0].id,room.id]);}
   await emit(code);return res.json({ok:true});
  }
  if(action==="settings") {
   if(!isHost)return res.status(403).json({error:"Only the host can change settings"});
   const settings={timer:[15,20,30,45].includes(Number(b.timer))?Number(b.timer):20,teamEvery:[2,3,4,5].includes(Number(b.teamEvery))?Number(b.teamEvery):3,modes:Array.isArray(b.modes)?b.modes.filter(x=>["most","would","team"].includes(x)):["most","would","team"]};
   await db.query("UPDATE rooms SET settings=$1::jsonb,updated_at=now() WHERE id=$2",[JSON.stringify(settings),room.id]);await emit(code);return res.json({ok:true});
  }
  if(action==="teams") {
   if(!isHost)return res.status(403).json({error:"Only the host can assign teams"});
   const assignments=Array.isArray(b.assignments)?b.assignments:[];
   const {rows:ps}=await db.query("SELECT id FROM players WHERE room_id=$1",[room.id]);
   for(const p of ps){const team=assignments.find(x=>x.id===p.id)?.team;await db.query("UPDATE players SET team=$1 WHERE id=$2",[team==="B"?"B":team==="A"?"A":null,p.id]);}
   await emit(code);return res.json({ok:true});
  }
  if(action==="start"||action==="next") {
   if(!isHost)return res.status(403).json({error:"Only the host can control rounds"});
   if(action==="start"&&room.status!=="lobby")return res.status(409).json({error:"Game already started"});
   if(action==="next"&&room.status!=="playing"&&room.status!=="reveal"&&room.status!=="scored")return res.status(409).json({error:"Cannot advance right now"});
   const {rows:ps}=await db.query("SELECT id,team FROM players WHERE room_id=$1 ORDER BY joined_at",[room.id]);
   if(ps.length<2)return res.status(409).json({error:"At least two players are required"});
   const number=room.round_number+1, modes=(room.settings.modes||["most","would","team"]).filter(m=>m==="team"?ps.every(p=>p.team):true);
   const mode=ps.every(p=>p.team)?(number%(Number(room.settings.teamEvery)||3)===0?"team":(number%2===0?"would":"most")):(number%2===0?"would":"most");
   const data=mode==="most"?{question:QUESTIONS.most[Math.floor(Math.random()*QUESTIONS.most.length)]}:mode==="would"?{choices:QUESTIONS.would[Math.floor(Math.random()*QUESTIONS.would.length)]}:{question:QUESTIONS.team[Math.floor(Math.random()*QUESTIONS.team.length)]};
   await db.query("DELETE FROM round_entries WHERE room_id=$1 AND round_number=$2",[room.id,number]);
   await db.query("UPDATE rooms SET status='playing',round_number=$1,round_type=$2,round_data=$3::jsonb,round_deadline=now()+($4||' seconds')::interval,updated_at=now() WHERE id=$5",[number,mode,JSON.stringify(data),String(room.settings.timer||20),room.id]);
   await emit(code);return res.json({ok:true});
  }
  if(action==="answer") {
   if(room.status!=="playing")return res.status(409).json({error:"This round is not accepting answers"});
   if(room.round_deadline&&Date.now()>new Date(room.round_deadline).getTime()){await db.query("UPDATE rooms SET status='reveal' WHERE id=$1",[room.id]);await emit(code);return res.status(409).json({error:"Time is up. Waiting for the reveal."});}
   const value=clean(b.value,80);
   if(!value)return res.status(400).json({error:"Choose an answer"});
   if(room.round_type==="most"&&value===b.playerId)return res.status(400).json({error:"You cannot vote for yourself"});
   if(room.round_type==="most") {const {rows:v}=await db.query("SELECT id FROM players WHERE id=$1 AND room_id=$2",[value,room.id]);if(!v.length)return res.status(400).json({error:"Invalid player"});}
   if(room.round_type==="would"&&!["A","B"].includes(value))return res.status(400).json({error:"Choose A or B"});
   if(room.round_type==="team"&&!["A","B","PASS"].includes(value))return res.status(400).json({error:"Invalid team response"});
   const type=room.round_type==="would"?"answer":room.round_type==="most"?"answer":"answer";
   await db.query("INSERT INTO round_entries(room_id,round_number,player_id,entry_type,value) VALUES($1,$2,$3,$4,$5) ON CONFLICT(room_id,round_number,player_id,entry_type) DO UPDATE SET value=EXCLUDED.value",[room.id,room.round_number,b.playerId,type,value]);
   const {rows:counts}=await db.query("SELECT count(*)::int AS n FROM round_entries WHERE room_id=$1 AND round_number=$2 AND entry_type='answer'",[room.id,room.round_number]);
   const {rows:total}=await db.query("SELECT count(*)::int AS n FROM players WHERE room_id=$1",[room.id]);
   if(counts[0].n>=total[0].n)await db.query("UPDATE rooms SET status='reveal' WHERE id=$1",[room.id]);
   await emit(code);return res.json({ok:true});
  }
  if(action==="predict") {
   if(room.status!=="playing"||room.round_type!=="most"&&room.round_type!=="would")return res.status(409).json({error:"Prediction unavailable"});
   const value=clean(b.value,40);
   if(room.round_type==="would"&&!["A","B"].includes(value))return res.status(400).json({error:"Invalid prediction"});
   await db.query("INSERT INTO round_entries(room_id,round_number,player_id,entry_type,value) VALUES($1,$2,$3,'prediction',$4) ON CONFLICT(room_id,round_number,player_id,entry_type) DO UPDATE SET value=EXCLUDED.value",[room.id,room.round_number,b.playerId,value]);
   await emit(code);return res.json({ok:true});
  }
  if(action==="score") {
   if(!isHost)return res.status(403).json({error:"Only the host can reveal and score"});
   if(room.status!=="playing"&&room.status!=="reveal")return res.status(409).json({error:"This round has already been scored"});
   const {rows:ans}=await db.query("SELECT player_id,value FROM round_entries WHERE room_id=$1 AND round_number=$2 AND entry_type='answer'",[room.id,room.round_number]);
   const {rows:pred}=await db.query("SELECT player_id,value FROM round_entries WHERE room_id=$1 AND round_number=$2 AND entry_type='prediction'",[room.id,room.round_number]);
   const points={};
   if(room.round_type==="most"){
    const counts={};for(const a of ans)counts[a.value]=(counts[a.value]||0)+1;
    const max=Math.max(0,...Object.values(counts)),winners=Object.keys(counts).filter(k=>counts[k]===max);
    for(const a of ans)points[a.value]=(points[a.value]||0)+1;
    for(const p of pred)if(winners.includes(p.value))points[p.player_id]=(points[p.player_id]||0)+2;
   } else if(room.round_type==="would"){
    const a=ans.filter(x=>x.value==="A").length,bn=ans.filter(x=>x.value==="B").length,majority=a===bn?null:a>bn?"A":"B";
    for(const x of ans)points[x.player_id]=(points[x.player_id]||0)+(majority===null?1:x.value===majority?1:2);
    for(const p of pred)if(majority&&p.value===majority)points[p.player_id]=(points[p.player_id]||0)+2;
   } else {
    const {rows:teams}=await db.query("SELECT id,team FROM players WHERE room_id=$1",[room.id]);
    for(const t of ["A","B"]){const members=teams.filter(x=>x.team===t),votes=ans.filter(x=>members.some(m=>m.id===x.player_id));if(members.length&&votes.length===members.length&&votes.every(x=>x.value===votes[0].value&&x.value!=="PASS"))for(const m of members)points[m.id]=5;}
   }
   for(const [id,score] of Object.entries(points))await db.query("UPDATE players SET score=score+$1 WHERE id=$2",[score,id]);
   await db.query("UPDATE rooms SET status='scored',updated_at=now() WHERE id=$1",[room.id]);
   await emit(code);return res.json({ok:true,points});
  }
  if(action==="chat"||action==="react") {
   const body=clean(b.body,action==="chat"?240:8);
   if(!body)return res.status(400).json({error:"Message is empty"});
   if(action==="react"&&!["😂","😭","🔥","👀","👏","💀","❤️","😱"].includes(body))return res.status(400).json({error:"Reaction not supported"});
   await db.query("INSERT INTO chat_messages(room_id,player_id,nickname,body,kind) VALUES($1,$2,$3,$4,$5)",[room.id,b.playerId,room.nickname,body,action==="chat"?"chat":"reaction"]);
   await emit(code,"message");return res.json({ok:true});
  }
  if(action==="end"||action==="rematch") {
   if(!isHost)return res.status(403).json({error:"Only the host can do that"});
   if(action==="end")await db.query("UPDATE rooms SET status='ended' WHERE id=$1",[room.id]);
   else {await db.query("UPDATE players SET score=0 WHERE room_id=$1",[room.id]);await db.query("DELETE FROM round_entries WHERE room_id=$1",[room.id]);await db.query("UPDATE rooms SET status='lobby',round_number=0,round_type=NULL,round_data=NULL,round_deadline=NULL WHERE id=$1",[room.id]);}
   await emit(code);return res.json({ok:true});
  }
  return res.status(400).json({error:"Unknown action"});
 } catch(e) { console.error("game error",e);return res.status(500).json({error:"Something went wrong. Please try again."}); }
}