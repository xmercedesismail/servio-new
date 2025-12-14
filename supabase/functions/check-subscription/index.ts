import { Hono } from 'npm:hono';

const app = new Hono();

// Minimal test route
app.get('/', (c) => {
  console.log("HANDLER REACHED: check-subscription test");
  return c.json({ status: "ok", message: "Edge function is working!" });
});

export default app.fetch;