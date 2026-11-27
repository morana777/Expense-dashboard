import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';

const app = new Hono();

// Enable CORS for your frontend domain
app.use('/api/*', cors());

// Password hashing helper (Web Crypto)
async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 1. User Signup
app.post('/api/signup', async (c) => {
    const { email, password } = await c.req.json();
    if (!email || !password || password.length < 6) {
        return c.json({ error: "Valid email and password (min 6 chars) required." }, 400);
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    try {
        await c.env.DB.prepare(
            "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)"
        ).bind(userId, email.toLowerCase().trim(), passwordHash).run();

        // Initialize empty settings row
        await c.env.DB.prepare(
            "INSERT INTO settings (user_id, monthly_income, savings_goal, opening_balance) VALUES (?, 0, 0, 0)"
        ).bind(userId).run();

        return c.json({ success: true });
    } catch (e) {
        return c.json({ error: "Email already exists." }, 400);
    }
});

// 2. User Login
app.post('/api/login', async (c) => {
    const { email, password } = await c.req.json();
    const passwordHash = await hashPassword(password);

    const user = await c.env.DB.prepare(
        "SELECT id, email FROM users WHERE email = ? AND password_hash = ?"
    ).bind(email.toLowerCase().trim(), passwordHash).first();

    if (!user) {
        return c.json({ error: "Invalid email or password." }, 401);
    }

    const token = await sign(
        { sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
        c.env.JWT_SECRET
    );

    return c.json({ success: true, token, user });
});

// Auth Middleware for protected routes
const authMiddleware = async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    try {
        const token = authHeader.split(' ')[1];
        const payload = await verify(token, c.env.JWT_SECRET);
        c.set('userId', payload.sub);
        await next();
    } catch {
        return c.json({ error: "Invalid or expired token" }, 401);
    }
};

// 3. Get All User Data
app.get('/api/data', authMiddleware, async (c) => {
    const userId = c.get('userId');

    const [expenses, bills, sections, settings] = await Promise.all([
        c.env.DB.prepare("SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC").bind(userId).all(),
        c.env.DB.prepare("SELECT * FROM bills WHERE user_id = ? ORDER BY due_date ASC").bind(userId).all(),
        c.env.DB.prepare("SELECT * FROM sections WHERE user_id = ?").bind(userId).all(),
        c.env.DB.prepare("SELECT * FROM settings WHERE user_id = ?").bind(userId).first(),
    ]);

    return c.json({
        expenses: expenses.results || [],
        bills: bills.results || [],
        sections: sections.results || [],
        settings: settings || { monthly_income: 0, savings_goal: 0, opening_balance: 0 }
    });
});

// 4. Add Expense
app.post('/api/expenses', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const { title, amount, category, date, frequency } = await c.req.json();

    const result = await c.env.DB.prepare(
        "INSERT INTO expenses (user_id, title, amount, category, date, frequency) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(userId, title, amount, category || 'Other', date, frequency || 'One-time').run();

    return c.json({ success: true, id: result.meta.last_row_id });
});

// 5. Delete Expense
app.delete('/api/expenses/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');

    await c.env.DB.prepare(
        "DELETE FROM expenses WHERE id = ? AND user_id = ?"
    ).bind(id, userId).run();

    return c.json({ success: true });
});

export default app;