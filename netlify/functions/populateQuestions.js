// netlify/functions/populateQuestions.js
const { MongoClient } = require('mongodb');
require('dotenv').config(); // For local development

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') { // It's safer to use POST for data manipulation
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed. Please use POST.' })
        };
    }

    try {
        await client.connect();
        const database = client.db("wtfootball-trivia-game"); // Replace with your database name if different
        const collection = database.collection("football_data"); // This will be your new collection for raw StatsBomb data

        // --- STEP 1: Fetch competitions.json from GitHub ---
        // For simplicity, we'll fetch a specific part of the open data directly.
        // In a real scenario, you'd iterate through competitions.json
        // and then fetch matches and events.
        const competitionsUrl = "https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json";
        const competitionsResponse = await fetch(competitionsUrl);
        const competitionsData = await competitionsResponse.json();

        // Let's just pick one competition to start, e.g., the FIFA World Cup 2022
        // You'll need to find its competition_id and season_id from the competitionsData
        // For FIFA World Cup 2022, looking at the repo, competition_id is 43, season_id is 106.
        const targetCompetitionId = 43; // FIFA World Cup
        const targetSeasonId = 106; // 2022

        // Filter for the specific competition/season if desired
        const worldCup2022 = competitionsData.find(comp => 
            comp.competition_id === targetCompetitionId && comp.season_id === targetSeasonId
        );

        if (!worldCup2022) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "Target competition/season not found in StatsBomb data." })
            };
        }

        // --- STEP 2: Fetch matches for that competition/season ---
        const matchesUrl = `https://raw.githubusercontent.com/statsbomb/open-data/master/data/matches/<span class="math-inline">\{targetCompetitionId\}/</span>{targetSeasonId}.json`;
        const matchesResponse = await fetch(matchesUrl);
        const matchesData = await matchesResponse.json();

        // --- STEP 3: Iterate through matches and fetch events for each (simplified for now) ---
        // This is the part that will require more complex logic for large datasets
        // For now, let's just insert the competitions and matches data to confirm connection

        // Example: Insert competitions data (or just the selected one)
        // await collection.insertOne(worldCup2022); // Or insert many if you process all competitions

        // Example: Insert matches data for the selected season
        // await collection.insertMany(matchesData); // This would insert all matches for WC 2022 into 'football_data'

        // For now, let's just confirm the fetching works and we could insert.
        // We'll replace this with actual data insertion logic.
        const statusMessage = `Successfully fetched data for ${worldCup2022.competition_name} - ${worldCup2022.season_name}. Found ${matchesData.length} matches.`;
        console.log(statusMessage); // This will appear in your Netlify Function logs

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: statusMessage,
                competition: worldCup2022.competition_name,
                season: worldCup2022.season_name,
                matchesCount: matchesData.length
            })
        };

    } catch (error) {
        console.error("Error populating data:", error); // Crucial for debugging
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Failed to populate data", error: error.message })
        };
    } finally {
        await client.close();
    }
};