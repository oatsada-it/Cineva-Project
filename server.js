const express=require("express");
const {Pool}=require("pg");
const cookieSession=require("cookie-session");
const crypto=require("crypto");
const path=require("path");

const app=express();
const PORT=process.env.PORT||3000;
const ADMIN_USER=process.env.ADMIN_USER||"admin";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"ChangeMe-123!";
const SESSION_SECRET=process.env.SESSION_SECRET||"change-this-secret";

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5
    })
  : null;

async function initDb(){
  if(!pool){
    throw new Error("DATABASE_URL is required. Connect this app to a PostgreSQL database (for example Supabase or Neon).");
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS keys(
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      first_used_at TIMESTAMPTZ
    );
  `);
}

const db={
  query:(text,params=[])=>pool.query(text,params)
};

app.use(express.json());
app.use(express.urlencoded({extended:false}));
app.use(cookieSession({
 name:"vip_session",
 keys:[SESSION_SECRET],
 httpOnly:true,
 sameSite:"lax",
 secure:process.env.NODE_ENV==="production" || process.env.RENDER==="true",
 maxAge:1000*60*60*24*7
}));
app.use(express.static(path.join(__dirname,"public")));

const iso=()=>new Date().toISOString();
const valid=(r)=>r && r.active===true && new Date(r.expires_at).getTime()>Date.now();
function admin(req,res,next){
 if(req.session?.admin===true) return next();
 res.status(401).json({ok:false,message:"UNAUTHORIZED"});
}
function makeKey(){
 const p=()=>crypto.randomBytes(3).toString("hex").toUpperCase();
 return `VIP-${p()}-${p()}-${p()}`;
}

app.post("/api/member/login",async (req,res)=>{
 const key=String(req.body.key||"").trim().toUpperCase();
 const {rows:[row]}=await db.query("SELECT * FROM keys WHERE key=$1",[key]);
 if(!row || !row.active) return res.status(401).json({ok:false,message:"Key ไม่ถูกต้องหรือถูกปิดใช้งาน"});
 if(!valid(row)) return res.status(401).json({ok:false,message:"Key นี้หมดอายุแล้ว"});
 await db.query("UPDATE keys SET first_used_at=COALESCE(first_used_at,$1) WHERE id=$2",[iso(),row.id]);
 req.session.memberKey=row.key;
 res.json({ok:true,expiresAt:row.expires_at});
});

app.get("/api/member/verify",async (req,res)=>{
 const key=req.session?.memberKey;
 const {rows:[row]}=key ? await db.query("SELECT * FROM keys WHERE key=$1",[key]) : {rows:[]};
 if(!valid(row)){
   req.session.memberKey=null;
   return res.status(401).json({ok:false});
 }
 res.json({ok:true,key:row.key,expiresAt:row.expires_at});
});

app.post("/api/member/logout",(req,res)=>{req.session.memberKey=null;res.json({ok:true});});

app.post("/api/admin/login",async (req,res)=>{
 const u=String(req.body.username||""), p=String(req.body.password||"");
 if(u!==ADMIN_USER || p!==ADMIN_PASSWORD) return res.status(401).json({ok:false,message:"Username หรือ Password ไม่ถูกต้อง"});
 req.session.admin=true;
 res.json({ok:true});
});
app.post("/api/admin/logout",admin,(req,res)=>{req.session.admin=null;res.json({ok:true});});

app.get("/api/admin/keys",admin,async (req,res)=>{
 const {rows}=await db.query("SELECT id,key,created_at,expires_at,active,first_used_at FROM keys ORDER BY id DESC");
 res.json({ok:true,keys:rows});
});

app.post("/api/admin/keys",admin,async (req,res)=>{
 const days=Number(req.body.days);
 if(!Number.isInteger(days)||days<1||days>3650) return res.status(400).json({ok:false,message:"จำนวนวันต้องอยู่ระหว่าง 1-3650"});
 const created=new Date(), expires=new Date(created.getTime()+days*86400000), key=makeKey();
 await db.query("INSERT INTO keys(key,created_at,expires_at,active) VALUES($1,$2,$3,TRUE)",[key,created.toISOString(),expires.toISOString()]);
 res.json({ok:true,key,expiresAt:expires.toISOString()});
});

app.get("/api/admin/keys/:id",admin,async (req,res)=>{
 const {rows:[row]}=await db.query("SELECT * FROM keys WHERE id=$1",[req.params.id]);
 if(!row)return res.status(404).json({ok:false,message:"ไม่พบ Key"});
 res.json({ok:true,key:row});
});

app.post("/api/admin/keys/:id/time",admin,async (req,res)=>{
 const amount=Number(req.body.days);
 if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>3650) return res.status(400).json({ok:false,message:"จำนวนวันไม่ถูกต้อง"});
 const {rows:[row]}=await db.query("SELECT * FROM keys WHERE id=$1",[req.params.id]);
 if(!row)return res.status(404).json({ok:false,message:"ไม่พบ Key"});
 let base=Math.max(Date.now(),new Date(row.expires_at).getTime());
 const next=new Date(base+amount*86400000);
 await db.query("UPDATE keys SET expires_at=$1 WHERE id=$2",[next.toISOString(),row.id]);
 res.json({ok:true,expiresAt:next.toISOString()});
});

app.post("/api/admin/keys/:id/toggle",admin,async (req,res)=>{
 const {rows:[row]}=await db.query("SELECT active FROM keys WHERE id=$1",[req.params.id]);
 if(!row)return res.status(404).json({ok:false,message:"ไม่พบ Key"});
 const active=!row.active;
 await db.query("UPDATE keys SET active=$1 WHERE id=$2",[active,row.id]);
 res.json({ok:true,active});
});

app.delete("/api/admin/keys/:id",admin,async (req,res)=>{
 await db.query("DELETE FROM keys WHERE id=$1",[req.params.id]);
 res.json({ok:true});
});

app.get("/api/admin/stats",admin,async (req,res)=>{
 const {rows:[stats]}=await db.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE active=TRUE AND expires_at>$1)::int AS active, COUNT(*) FILTER (WHERE expires_at<=$1)::int AS expired FROM keys`,[iso()]);
 res.json({ok:true,total:stats.total,active:stats.active,expired:stats.expired});
});

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public/admin.html")));
app.get("/member",(req,res)=>res.sendFile(path.join(__dirname,"public/member.html")));

initDb().then(()=>{
 app.listen(PORT,"0.0.0.0",()=>console.log(`Doซีรี่ย์ VIP: http://localhost:${PORT}`));
}).catch(err=>{
 console.error("Database initialization failed:",err);
 process.exit(1);
});
