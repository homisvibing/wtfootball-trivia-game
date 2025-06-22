// netlify/functions/populateQuestions.js
const { MongoClient } = require('mongodb');
require('dotenv').config(); // For local development

const uri = process.env.MONGODB_URI;
// const client = new MongoClient(uri); // <-- REMOVE or COMMENT OUT THIS GLOBAL DECLARATION of client


exports.handler = async function(event, context) {
    // Declare client INSIDE the handler, so connect() is always awaited within an async context
    const client = new MongoClient(uri); // Declare client here

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed. Please use POST.' })
        };
    }

    try {
        await client.connect(); // <-- AWAIT IS NOW CORRECTLY INSIDE THE ASYNC FUNCTION
        const database = client.db("wtfootball-trivia-game"); // Replace with your database name if different
        const collection = database.collection("football_data"); // This will be your new collection for raw StatsBomb data

        // --- STEP 1: Fetch competitions.json from GitHub ---
        const competitionsUrl = "https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json";
        const competitionsResponse = await fetch(competitionsUrl);

        // Check if the response was successful before parsing JSON
        if (!competitionsResponse.ok) {
            const errorText = await competitionsResponse.text();
            console.error(`Error fetching competitions: Status ${competitionsResponse.status}, Body: ${errorText}`);
            return {
                statusCode: competitionsResponse.status,
                body: JSON.stringify({ message: `Failed to fetch competitions data from GitHub: Status ${competitionsResponse.status}`, error: errorText })
            };
        }
        const competitionsData = await competitionsResponse.json();

        const targetCompetitionId = 43; // FIFA World Cup
        const targetSeasonId = 106; // 2022

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

        // Check if the response was successful before parsing JSON
        if (!matchesResponse.ok) {
            const errorText = await matchesResponse.text();
            console.error(`Error fetching matches: Status ${matchesResponse.status}, Body: ${errorText}`);
            return {
                statusCode: matchesResponse.status,
                body: JSON.stringify({ message: `Failed to fetch matches data from GitHub: Status ${matchesResponse.status}`, error: errorText })
            };
        }
        const matchesData = await matchesResponse.json();


        const statusMessage = `Successfully fetched data for ${worldCup2022.competition_name} - ${worldCup2022.season_name}. Found ${matchesData.length} matches.`;
        console.log(statusMessage);

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
        console.error("Error populating data:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Failed to populate data", error: error.message })
        };
    } finally {
        await client.close(); // Make sure client.close() is also awaited
    }
};