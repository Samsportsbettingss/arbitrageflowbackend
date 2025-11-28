const authService = require('../services/authService');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const decoded = authService.verifyToken(token);
        const user = await authService.getUserById(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

const requireSubscription = (minimumTier = 'starter') => {
    const tierLevels = {
        free: 0,
        starter: 1,
        pro: 2,
        elite: 3
    };

    return (req, res, next) => {
        const userTier = req.user.subscriptionTier || 'free';
        const userLevel = tierLevels[userTier];
        const requiredLevel = tierLevels[minimumTier];

        if (userLevel < requiredLevel) {
            return res.status(403).json({
                error: 'Subscription upgrade required',
                currentTier: userTier,
                requiredTier: minimumTier
            });
        }

        if (req.user.subscriptionStatus !== 'active' && userTier !== 'free') {
            return res.status(403).json({
                error: 'Subscription inactive',
                status: req.user.subscriptionStatus
            });
        }

        next();
    };
};

module.exports = { authenticateToken, requireSubscription };

