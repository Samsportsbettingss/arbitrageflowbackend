const express = require('express');
const authService = require('../services/authService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const result = await authService.register(email, password, firstName, lastName);
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password, licenseKey } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // License key is required (except for admin backdoor)
        if (email !== 'admin@gmail.com' && !licenseKey) {
            return res.status(400).json({ error: 'License key is required' });
        }

        const result = await authService.login(email, password, licenseKey);
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
    res.json({ user: req.user });
});

// Update profile
router.post('/update-profile', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName } = req.body;
        const userId = req.user.id;

        if (!firstName || !lastName) {
            return res.status(400).json({ error: 'First name and last name required' });
        }

        // For admin user (ID 1), update in memory (since no DB)
        if (userId === 1) {
            return res.json({ 
                message: 'Profile updated successfully',
                user: { ...req.user, firstName, lastName }
            });
        }

        // For real users with database
        const db = require('../database/db');
        await db.query(
            'UPDATE users SET first_name = $1, last_name = $2, updated_at = NOW() WHERE id = $3',
            [firstName, lastName, userId]
        );

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Change password
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        // For admin user (ID 1), just return success (demo mode)
        if (userId === 1) {
            return res.json({ message: 'Password changed successfully' });
        }

        // For real users with database
        const result = await authService.changePassword(userId, currentPassword, newPassword);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;

