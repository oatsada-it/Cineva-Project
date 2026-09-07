const express=require("express");
const Database=require("better-sqlite3");
const cookieSession=require("cookie-session");
const crypto=require("crypto");
const path=require("path");

const app=express();
const PORT=process.env.PORT||3000;
const ADMIN_USER=process.env.ADMIN_USER||"admin";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"ChangeMe-123!";
const SESSION_SECRET=process.env.SESSION_SECRET||"change-this-secret";

const db=new Database(path.join(__dirname,"vip.sqlite"));
db.pragma("journal_mode=WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS keys(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 key TEXT UNIQUE NOT NULL,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 first_used_at TEXT
);
`);

app.use(express.json());
app.use(express.urlencoded({extended:false}));
app.use(cookieSession({
 name:"vip_session",
 keys:[SESSION_SECRET],
 httpOnly:true,
 sameSite:"lax",
 secure:false,
 maxAge:1000*60*60*24*7
}));
app.use(express.static(path.join(__dirname,"public")));

const iso=()=>new Date().toISOString();
const valid=(r)=>r && r.active===1 && new Date(r.expires_at).getTime()>Date.now();
function admin(req,res,next){
 if(req.session?.admin===true) return next();
 res.status(401).json({ok:false,message:"UNAUTHORIZED"});
}
function makeKey(){
 const p=()=>crypto.randomBytes(3).toString("hex").toUpperCase();
 return `VIP-${p()}-${p()}-${p()}`;
}

app.post("/api/member/login",(req,res)=>{
 const key=String(req.body.key||"").trim().toUpperCase();
 const row=db.prepare("SELECT * FROM keys WHERE key=?").get(key);
 if(!row || !row.active) return res.status(401).json({ok:false,message:"Key ไม่ถูกต้องหรือถูกปิดใช้งาน"});
 if(!valid(row)) return res.status(401).json({ok:false,message:"Key นี้หมดอายุแล้ว"});
 db.prepare("UPDATE keys SET first_used_at=COALESCE(first_used_at,?) WHERE id=?").run(iso(),row.id);
 req.session.memberKey=row.key;
 res.json({ok:true,expiresAt:row.expires_at});
});

app.get("/api/member/verify",(req,res)=>{
 const key=req.session?.memberKey;
 const row=key && db.prepare("SELECT * FROM keys WHERE key=?").get(key);
 if(!valid(row)){
   req.session.memberKey=null;
   return res.status(401).json({ok:false});
 }
 res.json({ok:true,key:row.key,expiresAt:row.expires_at});
});

app.post("/api/member/logout",(req,res)=>{req.session.memberKey=null;res.json({ok:true});});

app.post("/api/admin/login",(req,res)=>{
 const u=String(req.body.username||""), p=String(req.body.password||"");
 if(u!==ADMIN_USER || p!==ADMIN_PASSWORD) return res.status(401).json({ok:false,message:"Username หรือ Password ไม่ถูกต้อง"});
 req.session.admin=true;
 res.json({ok:true});
});
app.post("/api/admin/logout",admin,(req,res)=>{req.session.admin=null;res.json({ok:true});});

app.get("/api/admin/keys",admin,(req,res)=>{
 const rows=db.prepare("SELECT * FROM keys ORDER BY id DESC").all();
 res.json({ok:true,keys:rows});
});

app.post("/api/admin/keys",admin,(req,res)=>{
 const days=Number(req.body.days);
 if(!Number.isInteger(days)||days<1||days>3650) return res.status(400).json({ok:false,message:"จำนวนวันต้องอยู่ระหว่าง 1-3650"});
 const created=new Date(), expires=new Date(created.getTime()+days*86400000), key=makeKey();
 db.prepare("INSERT INTO keys(key,created_at,expires_at,active) VALUES(?,?,?,1)").run(key,created.toISOString(),expires.toISOString());
 res.json({ok:true,key,expiresAt:expires.toISOString()});
});

app.get("/api/admin/keys/:id",admin,(req,res)=>{
 const row=db.prepare("SELECT * FROM keys WHERE id=?").get(req.params.id);
 if(!row)return res.status(404).json({ok:false,message:"ไม่พบ Key"});
 res.json({ok:true,key:row});
});

app.post("/api/admin/keys/:id/time",admin,(req,res)=>{
 const amount=Number(req.body.days);
 if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>3650) return res.status(400).json({ok:false,message:"จำนวนวันไม่ถูกต้อง"});
 const row=db.prepare("SELECT * FROM keys WHERE id=?").get(req.params.id);
 if(!row)return res.status(404).json({ok:false,message:"ไม่พบ Key"});
 let base=Math.max(Date.now(),new Date(row.expires_at).getTime());
 const next=new Date(base+amount*86400000);
 db.prepare("UPDATE keys SET expires_at=? WHERE id=?").run(next.toISOString(),row.id);
 res.json({ok:true,expiresAt:next.toISOString()});
});

app.post("/api/admin/keys/:id/toggle",admin,(req,res)=>{
 const row=db.prepare("SELECT active FROM keys WHERE id=?").get(req.params.id);
 if(!row)return res.status(404).json({ok:false,message:"ไม่พบ Key"});
 const active=row.active?0:1;
 db.prepare("UPDATE keys SET active=? WHERE id=?").run(active,row.id);
 res.json({ok:true,active});
});

app.delete("/api/admin/keys/:id",admin,(req,res)=>{
 db.prepare("DELETE FROM keys WHERE id=?").run(req.params.id);
 res.json({ok:true});
});

app.get("/api/admin/stats",admin,(req,res)=>{
 const total=db.prepare("SELECT COUNT(*) c FROM keys").get().c;
 const active=db.prepare("SELECT COUNT(*) c FROM keys WHERE active=1 AND expires_at>?").get(iso()).c;
 const expired=db.prepare("SELECT COUNT(*) c FROM keys WHERE expires_at<=?").get(iso()).c;
 res.json({ok:true,total,active,expired});
});

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public/admin.html")));
app.get("/member",(req,res)=>res.sendFile(path.join(__dirname,"public/member.html")));

app.listen(PORT,()=>console.log(`Doซีรี่ย์ VIP: http://localhost:${PORT}`));
