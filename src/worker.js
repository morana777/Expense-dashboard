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

        await c.env.DB.prepare(
            "INSERT INTO settings (user_id, monthly_income, savings_goal, opening_balance) VALUES (?, 0, 0, 0)"
        ).bind(userId).run();

        return c.json({ success: true });
    } catch {
        return c.json({ error: "Email already exists." }, 400);
    }
});

// 2. User Login
app.post('/api/login', async (c) => {
    const { email, password } = await c.req.json();
    if (!email || !password) {
        return c.json({ error: "Email and password required." }, 400);
    }
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

    const [expenses, bills, sections, settings, budgets] = await Promise.all([
        c.env.DB.prepare("SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC").bind(userId).all(),
        c.env.DB.prepare("SELECT * FROM bills WHERE user_id = ? ORDER BY due_date ASC").bind(userId).all(),
        c.env.DB.prepare("SELECT * FROM sections WHERE user_id = ?").bind(userId).all(),
        c.env.DB.prepare("SELECT * FROM settings WHERE user_id = ?").bind(userId).first(),
        c.env.DB.prepare("SELECT * FROM budgets WHERE user_id = ?").bind(userId).all(),
    ]);

    return c.json({
        expenses: expenses.results || [],
        bills: bills.results || [],
        sections: sections.results || [],
        settings: settings || { monthly_income: 0, savings_goal: 0, opening_balance: 0 },
        budgets: budgets.results || [],
    });
});

// 4. Add Expense
app.post('/api/expenses', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const { title, amount, category, date, frequency } = await c.req.json();
    const num = Number(amount);
    if (!title || !Number.isFinite(num) || num <= 0 || !date) {
        return c.json({ error: "Valid title, positive amount, and date required." }, 400);
    }

    const result = await c.env.DB.prepare(
        "INSERT INTO expenses (user_id, title, amount, category, date, frequency) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(userId, String(title).trim(), num, category || 'Other', date, frequency || 'One-time').run();

    return c.json({ success: true, id: result.meta.last_row_id });
});

// 5. Update Expense
app.put('/api/expenses/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const { title, amount, category, date, frequency } = await c.req.json();
    const num = Number(amount);
    if (!title || !Number.isFinite(num) || num <= 0 || !date) {
        return c.json({ error: "Valid title, positive amount, and date required." }, 400);
    }

    await c.env.DB.prepare(
        "UPDATE expenses SET title = ?, amount = ?, category = ?, date = ?, frequency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
    ).bind(String(title).trim(), num, category || 'Other', date, frequency || 'One-time', id, userId).run();

    return c.json({ success: true });
});

// 6. Delete Expense
app.delete('/api/expenses/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');

    await c.env.DB.prepare(
        "DELETE FROM expenses WHERE id = ? AND user_id = ?"
    ).bind(id, userId).run();

    return c.json({ success: true });
});

// 7. Update User Settings (Income, Savings Goal, Opening Balance)
app.put('/api/settings', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const { monthly_income, savings_goal, opening_balance } = await c.req.json();
    const income = Math.max(0, Number(monthly_income) || 0);
    const goal = Math.max(0, Number(savings_goal) || 0);
    const opening = Number(opening_balance) || 0;

    await c.env.DB.prepare(
        `INSERT INTO settings (user_id, monthly_income, savings_goal, opening_balance, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
           monthly_income = excluded.monthly_income,
           savings_goal = excluded.savings_goal,
           opening_balance = excluded.opening_balance,
           updated_at = CURRENT_TIMESTAMP`
    ).bind(userId, income, goal, opening).run();

    return c.json({ success: true });
});

// 8. Upsert Category Budget
app.put('/api/budgets', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const { category, limit_amount } = await c.req.json();
    const limit = Math.max(0, Number(limit_amount) || 0);
    if (!category) {
        return c.json({ error: "Category required." }, 400);
    }

    await c.env.DB.prepare(
        `INSERT INTO budgets (user_id, category, limit_amount, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, category) DO UPDATE SET
           limit_amount = excluded.limit_amount,
           updated_at = CURRENT_TIMESTAMP`
    ).bind(userId, String(category), limit).run();

    return c.json({ success: true });
});

// 9. Bills CRUD
app.post('/api/bills', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const { title, amount, due_date, paid } = await c.req.json();
    const num = Number(amount);
    if (!title || !Number.isFinite(num) || num <= 0 || !due_date) {
        return c.json({ error: "Valid title, positive amount, and due_date required." }, 400);
    }

    const result = await c.env.DB.prepare(
        "INSERT INTO bills (user_id, title, amount, due_date, paid) VALUES (?, ?, ?, ?, ?)"
    ).bind(userId, String(title).trim(), num, due_date, paid ? 1 : 0).run();

    return c.json({ success: true, id: result.meta.last_row_id });
});

app.patch('/api/bills/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const { paid } = await c.req.json();

    await c.env.DB.prepare(
        "UPDATE bills SET paid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
    ).bind(paid ? 1 : 0, id, userId).run();

    return c.json({ success: true });
});

app.delete('/api/bills/:id', authMiddleware, async (c) => {
    const userId = c.get('userId');
    const id = c.req.param('id');

    await c.env.DB.prepare(
        "DELETE FROM bills WHERE id = ? AND user_id = ?"
    ).bind(id, userId).run();

    return c.json({ success: true });
});

export default app;