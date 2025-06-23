// netlify/functions/getQuestions.js
const { MongoClient } = require('mongodb');
require('dotenv').config(); // For local development on your machine

const uri = process.env.MONGODB_URI;

exports.handler = async function(event, context) {
    // Ensure only GET requests are allowed for fetching questions (standard practice)
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed. Please use GET.' })
        };
    }

    const client = new MongoClient(uri); // Client is declared inside the handler

    try {
        await client.connect();
        const database = client.db("wtfootball-trivia-game"); // Replace with your database name if different
        const matchesCollection = database.collection("matches_data");

        // --- Fetch 10 random matches to get a pool for questions and incorrect answers ---
        // This line was the one causing the 'sampleMatches is not defined' error if missing or misplaced.
        const sampleMatches = await matchesCollection.aggregate([
            { $sample: { size: 10 } }
        ]).toArray();

        // Ensure we have enough matches to create a question and options
        if (sampleMatches.length < 4) { // Need at least 1 for question + 3 for options (one correct, two incorrect)
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Not enough unique match data in the database to generate a question. Need at least 4 matches." })
            };
        }

        // --- Select one match to be the basis of the question ---
        const questionMatch = sampleMatches[0];

        // --- Formulate the question ---
        const questionText = `Who won the match between ${questionMatch.home_team.home_team_name} and ${questionMatch.away_team.away_team_name} on ${new Date(questionMatch.match_date).toLocaleDateString()}?`;

        // --- Determine the correct answer ---
        let correctAnswer;
        if (questionMatch.home_score > questionMatch.away_score) {
            correctAnswer = questionMatch.home_team.home_team_name;
        } else if (questionMatch.away_score > questionMatch.home_score) {
            correctAnswer = questionMatch.away_team.away_team_name;
        } else {
            correctAnswer = "It was a draw";
        }

        // --- Generate incorrect options (Simplified approach to avoid large queries) ---
        const incorrectOptionsSet = new Set();
        let optionsToFind = 2; // We need two incorrect options

        // Try to get incorrect team names from other sample matches (from the 10 fetched)
        for (let i = 1; i < sampleMatches.length && incorrectOptionsSet.size < optionsToFind; i++) {
            const match = sampleMatches[i];
            // Add home team if it's not the correct answer and not already in options
            if (match.home_team.home_team_name && match.home_team.home_team_name !== correctAnswer && !incorrectOptionsSet.has(match.home_team.home_team_name)) {
                incorrectOptionsSet.add(match.home_team.home_team_name);
            }
            // Add away team if it's not the correct answer and not already in options
            if (incorrectOptionsSet.size < optionsToFind && match.away_team.away_team_name && match.away_team.away_team_name !== correctAnswer && !incorrectOptionsSet.has(match.away_team.away_team_name)) {
                incorrectOptionsSet.add(match.away_team.away_team_name);
            }
        }

        // If "It was a draw" is not the correct answer, add it as an option if needed
        if (correctAnswer !== "It was a draw" && incorrectOptionsSet.size < optionsToFind) {
            incorrectOptionsSet.add("It was a draw");
        }

        // Convert Set to Array
        const finalIncorrectOptions = Array.from(incorrectOptionsSet);

        // Ensure we have exactly 2 incorrect options. Fill with a fallback if needed.
        while (finalIncorrectOptions.length < optionsToFind) {
            finalIncorrectOptions.push("Random Team"); // Fallback for testing/unlikely scenarios
        }

        // Slice to ensure only 2 are taken if more were somehow generated
        const slicedIncorrectOptions = finalIncorrectOptions.slice(0, optionsToFind);

        // Combine all options and shuffle them
        const allOptions = [correctAnswer, ...slicedIncorrectOptions].filter(Boolean); // Filter out any null/undefined

        // Shuffle function (Fisher-Yates)
        for (let i = allOptions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
        }

        // --- Structure the final question object as your frontend likely expects ---
        const triviaQuestion = {
            id: questionMatch.match_id, // Use match ID as a unique ID for the question
            question: questionText,
            options: allOptions,
            correctAnswer: correctAnswer
        };

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify([triviaQuestion]) // Send an array containing one question object
        };

    } catch (error) {
        console.error("Error fetching or formulating questions:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Error fetching or formulating questions: " + error.message })
        };
    } finally {
        if (client) {
            await client.close();
        }
    }
};