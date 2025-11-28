const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// ============================================
// GET ALL SPORTSBOOK ACCOUNTS FOR USER
// ============================================
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const result = await db.query(
            `SELECT 
                id,
                sportsbook_name,
                account_balance,
                account_username,
                account_notes,
                is_active,
                added_at,
                updated_at
            FROM sportsbook_accounts
            WHERE user_id = $1
            ORDER BY sportsbook_name ASC`,
            [userId]
        );
        
        res.json({
            accounts: result.rows,
            totalBankroll: result.rows.reduce((sum, acc) => sum + parseFloat(acc.account_balance || 0), 0)
        });
    } catch (error) {
        console.error('Error fetching sportsbook accounts:', error);
        res.status(500).json({ error: 'Failed to fetch sportsbook accounts' });
    }
});

// ============================================
// ADD NEW SPORTSBOOK ACCOUNT
// ============================================
router.post('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { sportsbookName, balance, username, notes } = req.body;
        
        if (!sportsbookName) {
            return res.status(400).json({ error: 'Sportsbook name is required' });
        }
        
        const result = await db.query(
            `INSERT INTO sportsbook_accounts 
                (user_id, sportsbook_name, account_balance, account_username, account_notes)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, sportsbook_name) 
            DO UPDATE SET 
                account_balance = EXCLUDED.account_balance,
                account_username = EXCLUDED.account_username,
                account_notes = EXCLUDED.account_notes,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *`,
            [userId, sportsbookName, balance || 0, username || null, notes || null]
        );
        
        // Log transaction if balance > 0
        if (balance && balance > 0) {
            await db.query(
                `INSERT INTO transactions 
                    (user_id, sportsbook_account_id, transaction_type, amount, balance_after, description)
                VALUES ($1, $2, 'deposit', $3, $4, $5)`,
                [userId, result.rows[0].id, balance, balance, 'Initial deposit']
            );
        }
        
        res.json({ 
            success: true, 
            account: result.rows[0],
            message: 'Sportsbook account added successfully'
        });
    } catch (error) {
        console.error('Error adding sportsbook account:', error);
        res.status(500).json({ error: 'Failed to add sportsbook account' });
    }
});

// ============================================
// UPDATE SPORTSBOOK ACCOUNT
// ============================================
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const accountId = req.params.id;
        const { balance, username, notes, isActive } = req.body;
        
        // Get current balance for transaction logging
        const current = await db.query(
            'SELECT account_balance FROM sportsbook_accounts WHERE id = $1 AND user_id = $2',
            [accountId, userId]
        );
        
        if (current.rows.length === 0) {
            return res.status(404).json({ error: 'Account not found' });
        }
        
        const oldBalance = parseFloat(current.rows[0].account_balance);
        const newBalance = balance !== undefined ? parseFloat(balance) : oldBalance;
        
        // Update account
        const result = await db.query(
            `UPDATE sportsbook_accounts 
            SET account_balance = $1,
                account_username = COALESCE($2, account_username),
                account_notes = COALESCE($3, account_notes),
                is_active = COALESCE($4, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5 AND user_id = $6
            RETURNING *`,
            [newBalance, username, notes, isActive, accountId, userId]
        );
        
        // Log balance change as transaction
        if (newBalance !== oldBalance) {
            const difference = newBalance - oldBalance;
            const transactionType = difference > 0 ? 'deposit' : 'withdrawal';
            const description = difference > 0 
                ? `Manual deposit of $${Math.abs(difference).toFixed(2)}`
                : `Manual withdrawal of $${Math.abs(difference).toFixed(2)}`;
            
            await db.query(
                `INSERT INTO transactions 
                    (user_id, sportsbook_account_id, transaction_type, amount, balance_after, description)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, accountId, transactionType, Math.abs(difference), newBalance, description]
            );
        }
        
        res.json({ 
            success: true, 
            account: result.rows[0],
            message: 'Account updated successfully'
        });
    } catch (error) {
        console.error('Error updating sportsbook account:', error);
        res.status(500).json({ error: 'Failed to update account' });
    }
});

// ============================================
// DELETE SPORTSBOOK ACCOUNT
// ============================================
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const accountId = req.params.id;
        
        const result = await db.query(
            'DELETE FROM sportsbook_accounts WHERE id = $1 AND user_id = $2 RETURNING *',
            [accountId, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Account not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Account deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting sportsbook account:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

// ============================================
// GET TRANSACTIONS HISTORY
// ============================================
router.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 50;
        
        const result = await db.query(
            `SELECT 
                t.id,
                t.transaction_type,
                t.amount,
                t.balance_after,
                t.description,
                t.transaction_date,
                sa.sportsbook_name
            FROM transactions t
            LEFT JOIN sportsbook_accounts sa ON t.sportsbook_account_id = sa.id
            WHERE t.user_id = $1
            ORDER BY t.transaction_date DESC
            LIMIT $2`,
            [userId, limit]
        );
        
        res.json({ transactions: result.rows });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// ============================================
// TRANSFER FUNDS BETWEEN SPORTSBOOKS
// ============================================
router.post('/transfer', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { fromAccountId, toAccountId, amount } = req.body;
        
        if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid transfer parameters' });
        }
        
        if (fromAccountId === toAccountId) {
            return res.status(400).json({ error: 'Cannot transfer to the same account' });
        }
        
        // Get both accounts
        const accounts = await db.query(
            'SELECT * FROM sportsbook_accounts WHERE id = ANY($1) AND user_id = $2',
            [[fromAccountId, toAccountId], userId]
        );
        
        if (accounts.rows.length !== 2) {
            return res.status(404).json({ error: 'One or both accounts not found' });
        }
        
        const fromAccount = accounts.rows.find(a => a.id === parseInt(fromAccountId));
        const toAccount = accounts.rows.find(a => a.id === parseInt(toAccountId));
        
        if (parseFloat(fromAccount.account_balance) < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        // Update balances
        const newFromBalance = parseFloat(fromAccount.account_balance) - amount;
        const newToBalance = parseFloat(toAccount.account_balance) + amount;
        
        await db.query(
            'UPDATE sportsbook_accounts SET account_balance = $1 WHERE id = $2',
            [newFromBalance, fromAccountId]
        );
        
        await db.query(
            'UPDATE sportsbook_accounts SET account_balance = $1 WHERE id = $2',
            [newToBalance, toAccountId]
        );
        
        // Log transactions
        await db.query(
            `INSERT INTO transactions 
                (user_id, sportsbook_account_id, transaction_type, amount, balance_after, description)
            VALUES 
                ($1, $2, 'withdrawal', $3, $4, $5),
                ($1, $6, 'deposit', $3, $7, $8)`,
            [
                userId, 
                fromAccountId, 
                amount, 
                newFromBalance, 
                `Transfer to ${toAccount.sportsbook_name}`,
                toAccountId,
                newToBalance,
                `Transfer from ${fromAccount.sportsbook_name}`
            ]
        );
        
        res.json({ 
            success: true, 
            message: `Transferred $${amount.toFixed(2)} from ${fromAccount.sportsbook_name} to ${toAccount.sportsbook_name}`
        });
    } catch (error) {
        console.error('Error transferring funds:', error);
        res.status(500).json({ error: 'Failed to transfer funds' });
    }
});

// ============================================
// RECORD WITHDRAWAL
// ============================================
router.post('/withdrawal', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { accountId, amount, completed } = req.body;
        
        if (!accountId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid withdrawal parameters' });
        }
        
        const account = await db.query(
            'SELECT * FROM sportsbook_accounts WHERE id = $1 AND user_id = $2',
            [accountId, userId]
        );
        
        if (account.rows.length === 0) {
            return res.status(404).json({ error: 'Account not found' });
        }
        
        const currentBalance = parseFloat(account.rows[0].account_balance);
        
        if (currentBalance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        let newBalance = currentBalance;
        let description = `Withdrawal of $${amount.toFixed(2)}`;
        
        // If withdrawal is completed, deduct from balance
        if (completed) {
            newBalance = currentBalance - amount;
            description += ' (completed)';
            
            await db.query(
                'UPDATE sportsbook_accounts SET account_balance = $1 WHERE id = $2',
                [newBalance, accountId]
            );
        } else {
            description += ' (pending)';
        }
        
        // Log transaction
        await db.query(
            `INSERT INTO transactions 
                (user_id, sportsbook_account_id, transaction_type, amount, balance_after, description)
            VALUES ($1, $2, 'withdrawal', $3, $4, $5)`,
            [userId, accountId, amount, newBalance, description]
        );
        
        res.json({ 
            success: true, 
            message: completed 
                ? `Withdrawal of $${amount.toFixed(2)} completed` 
                : `Withdrawal of $${amount.toFixed(2)} recorded as pending`
        });
    } catch (error) {
        console.error('Error recording withdrawal:', error);
        res.status(500).json({ error: 'Failed to record withdrawal' });
    }
});

// ============================================
// GET BANKROLL GROWTH DATA (for chart)
// ============================================
router.get('/growth', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const days = parseInt(req.query.days) || 30;
        
        const result = await db.query(
            `WITH daily_balances AS (
                SELECT 
                    DATE(transaction_date) as date,
                    MAX(balance_after) as balance
                FROM transactions t
                JOIN sportsbook_accounts sa ON t.sportsbook_account_id = sa.id
                WHERE t.user_id = $1 
                    AND transaction_date >= CURRENT_DATE - INTERVAL '${days} days'
                GROUP BY DATE(transaction_date), sa.id
            )
            SELECT 
                date,
                SUM(balance) as total_bankroll
            FROM daily_balances
            GROUP BY date
            ORDER BY date ASC`,
            [userId]
        );
        
        res.json({ growth: result.rows });
    } catch (error) {
        console.error('Error fetching bankroll growth:', error);
        res.status(500).json({ error: 'Failed to fetch bankroll growth' });
    }
});

module.exports = router;

