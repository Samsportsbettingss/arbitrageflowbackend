const axios = require('axios');
const db = require('../database/db');

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4';

class OddsService {
    constructor() {
        this.sports = [
            'basketball_nba',
            'americanfootball_nfl',
            'icehockey_nhl',
            'baseball_mlb',
            'soccer_usa_mls',
            'basketball_ncaab',
            'americanfootball_ncaaf'
        ];
        this.regions = 'us';
        this.markets = 'h2h,spreads,totals';
        this.oddsFormat = 'american';
    }

    async fetchLiveOdds(sport) {
        try {
            const response = await axios.get(`${ODDS_API_BASE}/sports/${sport}/odds`, {
                params: {
                    apiKey: ODDS_API_KEY,
                    regions: this.regions,
                    markets: this.markets,
                    oddsFormat: this.oddsFormat
                },
                timeout: 10000
            });

            const remainingRequests = response.headers['x-requests-remaining'];
            const usedRequests = response.headers['x-requests-used'];
            
            console.log(`[ODDS API] Sport: ${sport} | Remaining: ${remainingRequests} | Used: ${usedRequests}`);
            
            return response.data;
        } catch (error) {
            console.error(`Error fetching odds for ${sport}:`, error.message);
            return [];
        }
    }

    async fetchAllSports() {
        const allOdds = [];
        
        for (const sport of this.sports) {
            const odds = await this.fetchLiveOdds(sport);
            allOdds.push(...odds);
            
            // Rate limiting: wait 1 second between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        return allOdds;
    }

    americanToDecimal(americanOdds) {
        const odds = parseFloat(americanOdds);
        if (odds >= 0) {
            return (odds / 100) + 1;
        } else {
            return (100 / Math.abs(odds)) + 1;
        }
    }

    detectArbitrage(game) {
        const opportunities = [];
        
        if (!game.bookmakers || game.bookmakers.length < 2) {
            return opportunities;
        }

        // Get all markets from first bookmaker as reference
        const markets = game.bookmakers[0].markets || [];

        markets.forEach(market => {
            const outcomes = market.outcomes;
            
            // Only handle 2-way markets for now
            if (outcomes.length !== 2) return;

            // Find best odds for each outcome across all bookmakers
            let bestOutcomes = outcomes.map(outcome => ({
                name: outcome.name,
                bestOdds: -Infinity,
                bestBook: '',
                point: outcome.point || null
            }));

            game.bookmakers.forEach(bookmaker => {
                const bookMarket = bookmaker.markets.find(m => m.key === market.key);
                if (!bookMarket) return;

                bookMarket.outcomes.forEach(outcome => {
                    const outcomeIndex = bestOutcomes.findIndex(bo => bo.name === outcome.name);
                    if (outcomeIndex !== -1 && outcome.price > bestOutcomes[outcomeIndex].bestOdds) {
                        bestOutcomes[outcomeIndex].bestOdds = outcome.price;
                        bestOutcomes[outcomeIndex].bestBook = bookmaker.key;
                    }
                });
            });

            // Check if all outcomes have valid odds
            if (bestOutcomes.some(o => o.bestOdds === -Infinity)) return;

            // Calculate arbitrage
            const decimalOdds = bestOutcomes.map(o => this.americanToDecimal(o.bestOdds));
            const impliedProbs = decimalOdds.map(d => 1 / d);
            const totalImpliedProb = impliedProbs.reduce((sum, prob) => sum + prob, 0);

            if (totalImpliedProb < 1) {
                const roi = ((1 - totalImpliedProb) / totalImpliedProb) * 100;
                const profitPer1000 = (1000 / totalImpliedProb) - 1000;

                opportunities.push({
                    sport: game.sport_title,
                    league: game.sport_key,
                    eventName: `${game.home_team} vs ${game.away_team}`,
                    homeTeam: game.home_team,
                    awayTeam: game.away_team,
                    marketType: market.key,
                    marketKey: market.key,
                    
                    book1Name: bestOutcomes[0].bestBook,
                    book1Outcome: bestOutcomes[0].name + (bestOutcomes[0].point ? ` ${bestOutcomes[0].point}` : ''),
                    book1Odds: bestOutcomes[0].bestOdds,
                    book1DecimalOdds: decimalOdds[0],
                    
                    book2Name: bestOutcomes[1].bestBook,
                    book2Outcome: bestOutcomes[1].name + (bestOutcomes[1].point ? ` ${bestOutcomes[1].point}` : ''),
                    book2Odds: bestOutcomes[1].bestOdds,
                    book2DecimalOdds: decimalOdds[1],
                    
                    roi: roi.toFixed(2),
                    profitPer1000: profitPer1000.toFixed(2),
                    impliedProbabilityTotal: totalImpliedProb.toFixed(4),
                    
                    commenceTime: new Date(game.commence_time),
                    expiresAt: new Date(Date.now() + (10 * 60 * 1000)), // 10 minutes
                    oddsLastUpdated: new Date()
                });
            }
        });

        return opportunities;
    }

    async saveOpportunity(opportunity) {
        const minRoi = parseFloat(process.env.MIN_ROI_THRESHOLD || 1.0);
        
        if (parseFloat(opportunity.roi) < minRoi) {
            return null;
        }

        try {
            const query = `
                INSERT INTO opportunities (
                    sport, league, event_name, home_team, away_team,
                    market_type, market_key,
                    book1_name, book1_outcome, book1_odds, book1_decimal_odds,
                    book2_name, book2_outcome, book2_odds, book2_decimal_odds,
                    roi, profit_per_1000, implied_probability_total,
                    commence_time, expires_at, odds_last_updated
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                RETURNING id
            `;

            const values = [
                opportunity.sport,
                opportunity.league,
                opportunity.eventName,
                opportunity.homeTeam,
                opportunity.awayTeam,
                opportunity.marketType,
                opportunity.marketKey,
                opportunity.book1Name,
                opportunity.book1Outcome,
                opportunity.book1Odds,
                opportunity.book1DecimalOdds,
                opportunity.book2Name,
                opportunity.book2Outcome,
                opportunity.book2Odds,
                opportunity.book2DecimalOdds,
                opportunity.roi,
                opportunity.profitPer1000,
                opportunity.impliedProbabilityTotal,
                opportunity.commenceTime,
                opportunity.expiresAt,
                opportunity.oddsLastUpdated
            ];

            const result = await db.query(query, values);
            return result.rows[0].id;
        } catch (error) {
            if (error.code === '23505') {
                // Duplicate entry, ignore
                return null;
            }
            console.error('Error saving opportunity:', error);
            throw error;
        }
    }

    async cleanupExpiredOpportunities() {
        try {
            const query = `
                UPDATE opportunities 
                SET is_active = false 
                WHERE expires_at < NOW() AND is_active = true
            `;
            
            const result = await db.query(query);
            console.log(`[CLEANUP] Deactivated ${result.rowCount} expired opportunities`);
        } catch (error) {
            console.error('Error cleaning up opportunities:', error);
        }
    }
}

module.exports = new OddsService();

