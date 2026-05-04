import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { db } from "./db/index.js";
import { todos } from "./db/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/assets", express.static(path.join(__dirname, "../node_modules/bootstrap/dist")));
app.use(express.static(path.join(__dirname, "../public")));

app.all("/api/auth/*", toNodeHandler(auth));

const getSession = async (req, res, next) => {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = session.user;
  return next();
};

app.get("/api/todos", getSession, async (req, res) => {
  const items = await db.select().from(todos).where(eq(todos.userId, req.user.id));
  res.json(items);
});

app.post("/api/todos", getSession, async (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });
  const [item] = await db.insert(todos).values({ title: title.trim(), userId: req.user.id }).returning();
  res.status(201).json(item);
});

app.patch("/api/todos/:id/toggle", getSession, async (req, res) => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(todos).where(eq(todos.id, id));
  if (!current || current.userId !== req.user.id) return res.status(404).json({ error: "Not found" });
  const [updated] = await db.update(todos).set({ done: !current.done }).where(eq(todos.id, id)).returning();
  res.json(updated);
});

app.delete("/api/todos/:id", getSession, async (req, res) => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(todos).where(eq(todos.id, id));
  if (!current || current.userId !== req.user.id) return res.status(404).json({ error: "Not found" });
  await db.delete(todos).where(eq(todos.id, id));
  res.status(204).send();
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
