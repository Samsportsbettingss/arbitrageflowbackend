const express = require('express');
const db = require('../database/db');
const { authenticateToken, requireSubscription } = require('../middleware/auth');

const router = express.Router();

// Get all active opportunities
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { sport, minRoi, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT * FROM opportunities 
            WHERE is_active = true AND expires_at > NOW()
        `;
        const params = [];
        let paramCount = 1;

        if (sport) {
            query += ` AND sport = $${paramCount}`;
            params.push(sport);
            paramCount++;
        }

        if (minRoi) {
            query += ` AND roi >= $${paramCount}`;
            params.push(minRoi);
            paramCount++;
        }

        query += ` ORDER BY roi DESC, detected_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        res.json({
            opportunities: result.rows,
            total: result.rows.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get opportunity by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            'SELECT * FROM opportunities WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Opportunity not found' });
        }

        // Increment view count
        await db.query(
            'UPDATE opportunities SET view_count = view_count + 1 WHERE id = $1',
            [id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save opportunity
router.post('/:id/save', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const userId = req.user.id;

        await db.query(
            `INSERT INTO saved_opportunities (user_id, opportunity_id, notes)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, opportunity_id) DO UPDATE SET notes = $3`,
            [userId, id, notes || '']
        );

        // Increment save count
        await db.query(
            'UPDATE opportunities SET save_count = save_count + 1 WHERE id = $1',
            [id]
        );

        res.json({ message: 'Opportunity saved successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get user's saved opportunities
router.get('/saved/list', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await db.query(
            `SELECT o.*, so.notes, so.saved_at
             FROM opportunities o
             JOIN saved_opportunities so ON o.id = so.opportunity_id
             WHERE so.user_id = $1
             ORDER BY so.saved_at DESC`,
            [userId]
        );

        res.json({ savedOpportunities: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

