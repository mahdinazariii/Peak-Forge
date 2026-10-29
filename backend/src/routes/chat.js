const express = require('express');
const { dbAsync } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Small helpers -----------------------------------------------------------

const fullName = (u) => `${u.first_name} ${u.last_name}`;

// Is `a` linked to `b` in coach_athletes (either direction)?
async function areLinked(aId, bId) {
  const row = await dbAsync.get(
    `SELECT id FROM coach_athletes
     WHERE (coach_id = ? AND athlete_id = ?) OR (coach_id = ? AND athlete_id = ?)`,
    [aId, bId, bId, aId]
  );
  return !!row;
}

// Last DM info + unread / unanswered-priority counters for one peer pair.
// `myCol` is the coach_athletes column holding MY id (coach_id or athlete_id);
// the peer is always u.id. Using column refs keeps params to a single ?.
function peerStatsSql(myCol) {
  return `
  (SELECT text FROM messages m
    WHERE (m.sender_id = u.id AND m.receiver_id = ca.${myCol})
       OR (m.sender_id = ca.${myCol} AND m.receiver_id = u.id)
    ORDER BY m.id DESC LIMIT 1) AS last_text,
  (SELECT created_at FROM messages m
    WHERE (m.sender_id = u.id AND m.receiver_id = ca.${myCol})
       OR (m.sender_id = ca.${myCol} AND m.receiver_id = u.id)
    ORDER BY m.id DESC LIMIT 1) AS last_at,
  (SELECT COUNT(*) FROM messages m
    WHERE m.sender_id = u.id AND m.receiver_id = ca.${myCol} AND m.is_read = 0) AS unread,
  (SELECT COUNT(*) FROM messages m
    WHERE m.sender_id = u.id AND m.receiver_id = ca.${myCol}
      AND m.is_priority = 1 AND m.answered = 0) AS pending`;
}

// ── Conversations list ────────────────────────────────────────────────────────

// GET /api/chat/conversations — coach: linked athletes | athlete: linked coaches
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const me = req.user.id;
    let rows;
    if (req.user.role === 'coach') {
      rows = await dbAsync.all(
        `SELECT u.id, u.first_name, u.last_name, u.tier, ${peerStatsSql('coach_id')}
         FROM coach_athletes ca
         JOIN users u ON u.id = ca.athlete_id
         WHERE ca.coach_id = ?
         ORDER BY (last_at IS NULL), last_at DESC, u.id`,
        [me]
      );
    } else {
      rows = await dbAsync.all(
        `SELECT u.id, u.first_name, u.last_name, u.tier, ${peerStatsSql('athlete_id')}
         FROM coach_athletes ca
         JOIN users u ON u.id = ca.coach_id
         WHERE ca.athlete_id = ?
         ORDER BY (last_at IS NULL), last_at DESC, u.id`,
        [me]
      );
    }
    const conversations = rows.map((r) => ({
      id: r.id,
      name: fullName(r),
      tier: r.tier,
      last_text: r.last_text || null,
      last_at: r.last_at || null,
      unread: r.unread || 0,
      pending_priority: r.pending || 0
    }));
    return res.json({ conversations });
  } catch (err) {
    console.error('GET chat conversations error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Direct messages ───────────────────────────────────────────────────────────

// GET /api/chat/messages/:peerId — DM history with a peer (marks incoming as read)
router.get('/messages/:peerId', authMiddleware, async (req, res) => {
  try {
    const me = req.user.id;
    const peerId = parseInt(req.params.peerId);
    if (!peerId || peerId === me) {
      return res.status(400).json({ error: 'گیرنده نامعتبر است.' });
    }
    if (!(await areLinked(me, peerId))) {
      return res.status(403).json({ error: 'این کاربر در لیست تماس‌های شما نیست.' });
    }

    const rows = await dbAsync.all(
      `SELECT id, sender_id, receiver_id, text, is_priority, is_read, answered, created_at
       FROM messages
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY id ASC`,
      [me, peerId, peerId, me]
    );

    await dbAsync.run(
      `UPDATE messages SET is_read = 1
       WHERE sender_id = ? AND receiver_id = ? AND is_read = 0`,
      [peerId, me]
    );

    const peer = await dbAsync.get('SELECT id, first_name, last_name, tier FROM users WHERE id = ?', [peerId]);
    return res.json({
      peer: peer ? { id: peer.id, name: fullName(peer), tier: peer.tier } : null,
      messages: rows.map((m) => ({ ...m, mine: m.sender_id === me }))
    });
  } catch (err) {
    console.error('GET chat messages error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/chat/messages — send a DM { receiver_id, text, is_priority }
router.post('/messages', authMiddleware, async (req, res) => {
  try {
    const me = req.user.id;
    const { receiver_id, text, is_priority } = req.body;
    if (!receiver_id || !text || !String(text).trim()) {
      return res.status(400).json({ error: 'متن پیام و گیرنده الزامی است.' });
    }
    if (!(await areLinked(me, receiver_id))) {
      return res.status(403).json({ error: 'این کاربر در لیست تماس‌های شما نیست.' });
    }

    const result = await dbAsync.run(
      `INSERT INTO messages (sender_id, receiver_id, text, is_priority)
       VALUES (?, ?, ?, ?)`,
      [me, receiver_id, String(text).trim(), is_priority ? 1 : 0]
    );

    // Coach replied → the athlete's unanswered priority questions are answered
    if (req.user.role === 'coach') {
      await dbAsync.run(
        `UPDATE messages SET answered = 1
         WHERE sender_id = ? AND receiver_id = ? AND is_priority = 1 AND answered = 0`,
        [receiver_id, me]
      );
    }

    const msg = await dbAsync.get(
      'SELECT id, sender_id, receiver_id, text, is_priority, is_read, answered, created_at FROM messages WHERE id = ?',
      [result.lastID]
    );
    return res.status(201).json({ message: 'پیام ارسال شد.', data: { ...msg, mine: true } });
  } catch (err) {
    console.error('POST chat message error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// ── Forums (group rooms per coach) ───────────────────────────────────────────

// GET /api/chat/forums — coach: own forums | athlete: forums of their coaches
router.get('/forums', authMiddleware, async (req, res) => {
  try {
    const me = req.user.id;
    let rows;
    if (req.user.role === 'coach') {
      rows = await dbAsync.all(
        `SELECT f.id, f.name, f.created_at,
                (SELECT COUNT(*) FROM coach_athletes ca WHERE ca.coach_id = f.coach_id) AS members,
                (SELECT text FROM messages m WHERE m.forum_id = f.id ORDER BY m.id DESC LIMIT 1) AS last_text,
                (SELECT created_at FROM messages m WHERE m.forum_id = f.id ORDER BY m.id DESC LIMIT 1) AS last_at
         FROM forums f
         WHERE f.coach_id = ?
         ORDER BY (last_at IS NULL), last_at DESC, f.id`,
        [me]
      );
    } else {
      rows = await dbAsync.all(
        `SELECT f.id, f.name, f.created_at,
                (SELECT COUNT(*) FROM coach_athletes ca WHERE ca.coach_id = f.coach_id) AS members,
                (SELECT text FROM messages m WHERE m.forum_id = f.id ORDER BY m.id DESC LIMIT 1) AS last_text,
                (SELECT created_at FROM messages m WHERE m.forum_id = f.id ORDER BY m.id DESC LIMIT 1) AS last_at
         FROM forums f
         WHERE f.coach_id IN (SELECT coach_id FROM coach_athletes WHERE athlete_id = ?)
         ORDER BY (last_at IS NULL), last_at DESC, f.id`,
        [me]
      );
    }
    const forums = rows.map((f) => ({
      id: f.id,
      name: f.name,
      members: f.members || 0,
      last_text: f.last_text || null,
      last_at: f.last_at || null
    }));
    return res.json({ forums });
  } catch (err) {
    console.error('GET forums error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/chat/forums — coach: create forum { name }
router.post('/forums', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'فقط مربیان می‌توانند تالار بسازند.' });
    }
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'نام تالار الزامی است.' });
    }
    const result = await dbAsync.run(
      'INSERT INTO forums (coach_id, name) VALUES (?, ?)',
      [req.user.id, String(name).trim()]
    );
    const forum = await dbAsync.get('SELECT id, name FROM forums WHERE id = ?', [result.lastID]);
    return res.status(201).json({ message: 'تالار ساخته شد.', forum });
  } catch (err) {
    console.error('POST forum error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// DELETE /api/chat/forums/:id — coach: delete own forum
router.delete('/forums/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'coach') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }
    const forum = await dbAsync.get(
      'SELECT id FROM forums WHERE id = ? AND coach_id = ?',
      [req.params.id, req.user.id]
    );
    if (!forum) return res.status(404).json({ error: 'تالار یافت نشد.' });
    await dbAsync.run('DELETE FROM messages WHERE forum_id = ?', [req.params.id]);
    await dbAsync.run('DELETE FROM forums WHERE id = ?', [req.params.id]);
    return res.json({ message: 'تالار حذف شد.' });
  } catch (err) {
    console.error('DELETE forum error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// Access check for forum read/post
async function canAccessForum(user, forumId) {
  const forum = await dbAsync.get('SELECT id, coach_id, name FROM forums WHERE id = ?', [forumId]);
  if (!forum) return null;
  if (user.role === 'coach') {
    return forum.coach_id === user.id ? forum : null;
  }
  const link = await dbAsync.get(
    'SELECT id FROM coach_athletes WHERE coach_id = ? AND athlete_id = ?',
    [forum.coach_id, user.id]
  );
  return link ? forum : null;
}

// GET /api/chat/forums/:id/messages — forum history (with sender names)
router.get('/forums/:id/messages', authMiddleware, async (req, res) => {
  try {
    const forum = await canAccessForum(req.user, req.params.id);
    if (!forum) return res.status(404).json({ error: 'تالار یافت نشد یا دسترسی ندارید.' });

    const rows = await dbAsync.all(
      `SELECT m.id, m.sender_id, m.text, m.is_priority, m.created_at,
              u.first_name, u.last_name, u.role AS sender_role
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.forum_id = ?
       ORDER BY m.id ASC`,
      [forum.id]
    );
    return res.json({
      forum: { id: forum.id, name: forum.name },
      messages: rows.map((m) => ({
        id: m.id,
        sender_id: m.sender_id,
        sender_name: `${m.first_name} ${m.last_name}`,
        sender_role: m.sender_role,
        text: m.text,
        is_priority: m.is_priority,
        created_at: m.created_at,
        mine: m.sender_id === req.user.id
      }))
    });
  } catch (err) {
    console.error('GET forum messages error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// POST /api/chat/forums/:id/messages — post to forum { text }
router.post('/forums/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'متن پیام الزامی است.' });
    }
    const forum = await canAccessForum(req.user, req.params.id);
    if (!forum) return res.status(404).json({ error: 'تالار یافت نشد یا دسترسی ندارید.' });

    const result = await dbAsync.run(
      `INSERT INTO messages (sender_id, forum_id, text) VALUES (?, ?, ?)`,
      [req.user.id, forum.id, String(text).trim()]
    );
    const msg = await dbAsync.get('SELECT id, sender_id, forum_id, text, created_at FROM messages WHERE id = ?', [result.lastID]);
    return res.status(201).json({ message: 'پیام ارسال شد.', data: { ...msg, mine: true } });
  } catch (err) {
    console.error('POST forum message error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

// GET /api/chat/unread — total unread DM count (for nav badges)
router.get('/unread', authMiddleware, async (req, res) => {
  try {
    const row = await dbAsync.get(
      'SELECT COUNT(*) AS count FROM messages WHERE receiver_id = ? AND is_read = 0 AND forum_id IS NULL',
      [req.user.id]
    );
    return res.json({ unread: row ? row.count : 0 });
  } catch (err) {
    console.error('GET unread error:', err);
    return res.status(500).json({ error: 'خطای سرور.' });
  }
});

module.exports = router;
