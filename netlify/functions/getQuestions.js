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

        // netlify/functions/getQuestions.js (inside exports.handler try block)
        // ... (keep the initial part where you fetch 10 sample matches)

        // --- Generate incorrect options (Improved Relevance) ---
        const incorrectOptions = new Set();
        const optionsToFind = 2; // We need two incorrect options

        // Fetch the competition details to get its name and ID
        const competitionsCollection = database.collection("competitions_data");
        const competition = await competitionsCollection.findOne(
            { competition_id: questionMatch.competition.competition_id }
        );

        let allTeamsInCompetition = [];
        if (competition && competition.teams) { // Assuming 'teams' array exists in competition document
            allTeamsInCompetition = competition.teams.map(team => team.team_name);
        } else {
            // Fallback: If no teams array in competition, get from sample matches (less ideal)
            sampleMatches.forEach(match => {
                allTeamsInCompetition.push(match.home_team.home_team_name);
                allTeamsInCompetition.push(match.away_team.away_team_name);
            });
            allTeamsInCompetition = [...new Set(allTeamsInCompetition)]; // Get unique names
        }

        const usedOptions = new Set([correctAnswer, questionMatch.home_team.home_team_name, questionMatch.away_team.away_team_name]);

        // Filter out already used options and the question teams
        const possibleIncorrectTeams = allTeamsInCompetition.filter(
            team => !usedOptions.has(team)
        );

        // Shuffle possible incorrect teams for randomness
        for (let i = possibleIncorrectTeams.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [possibleIncorrectTeams[i], possibleIncorrectTeams[j]] = [possibleIncorrectTeams[j], possibleIncorrectTeams[i]];
        }

        // Pick 2 distinct incorrect options from the shuffled list
        for (let i = 0; i < optionsToFind && i < possibleIncorrectTeams.length; i++) {
            incorrectOptions.add(possibleIncorrectTeams[i]);
        }

        // Add "It was a draw" as an option if it's not the correct answer and we still need options
        if (correctAnswer !== "It was a draw" && incorrectOptions.size < optionsToFind) {
            incorrectOptions.add("It was a draw");
        }

        // Fallback for extremely rare cases where not enough unique teams are found
        while (incorrectOptions.size < optionsToFind) {
            incorrectOptions.add(`Random Team ${incorrectOptions.size + 1}`); // Use a placeholder
        }

        const finalIncorrectOptions = Array.from(incorrectOptions);

    // Ensure "It was a draw" isn't duplicated if it was the correct answer.
    if (correctAnswer === "It was a draw") {
        const drawIndex = finalIncorrectOptions.indexOf("It was a draw");
        if (drawIndex > -1) {
            finalIncorrectOptions.splice(drawIndex, 1);
        }
    }

    // --- COMBINE AND SHUFFLE OPTIONS HERE ---
    // This block needs to be placed BEFORE the triviaQuestion object is created.
    const allOptions = [correctAnswer, ...finalIncorrectOptions].filter(Boolean); // Filter out any null/undefined

    // Shuffle function (Fisher-Yates)
    for (let i = allOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }
    // --- END OF COMBINE AND SHUFFLE OPTIONS ---


    // --- Structure the final question object as your frontend likely expects ---
    const triviaQuestion = {
        id: questionMatch.match_id, // Use match ID as a unique ID for the question
        question: questionText,
        options: allOptions, // Now 'allOptions' is defined!
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
// ... (rest of the try-catch-finally block)
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