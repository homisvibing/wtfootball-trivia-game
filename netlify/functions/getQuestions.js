// netlify/functions/getQuestions.js
const { MongoClient } = require('mongodb');
require('dotenv').config(); // For local development on your machine

const uri = process.env.MONGODB_URI;

// Helper function to format question details (country, comp, season, stage/week)
function getQuestionDetails(match) {
    const competitionName = match.competition.competition_name;
    const seasonName = match.season.season_name;
    // Prioritize stadium country, then competition country, otherwise empty string
    const countryName = (match.stadium && match.stadium.country && match.stadium.country.name) || match.competition.country_name || '';

    let stageOrWeek = '';
    // Check if it's a specific competition stage (e.g., Final, Group Stage) and not just "Regular Season"
    if (match.competition_stage && match.competition_stage.name && match.competition_stage.name !== 'Regular Season' && match.competition_stage.name !== 'Domestic Cup') {
        stageOrWeek = ` (${match.competition_stage.name})`;
    } else if (match.match_week) {
        // For leagues, include match week
        stageOrWeek = ` Week ${match.match_week}`;
    }

    return `at ${countryName} ${competitionName} ${seasonName}${stageOrWeek}`;
}


// --- Question Type 1: Match Outcome Question ---
async function generateMatchOutcomeQuestion(matchesCollection, sampleMatches) {
    // We can assume sampleMatches[0] is valid due to the initial length check in handler
    const questionMatch = sampleMatches[0];
    const details = getQuestionDetails(questionMatch);

    const questionText = `Who won the match between ${questionMatch.home_team.home_team_name} vs ${questionMatch.away_team.away_team_name} ${details}?`;

    let correctAnswer;
    if (questionMatch.home_score > questionMatch.away_score) {
        correctAnswer = questionMatch.home_team.home_team_name;
    } else if (questionMatch.away_score > questionMatch.home_score) {
        correctAnswer = questionMatch.away_team.away_team_name;
    } else {
        correctAnswer = "It was a draw";
    }

    // --- Options for "Who Won?" question are fixed: Home Team, Away Team, Draw ---
    const potentialOptions = new Set();
    potentialOptions.add(questionMatch.home_team.home_team_name);
    potentialOptions.add(questionMatch.away_team.away_team_name);
    potentialOptions.add("It was a draw");

    // Convert Set to Array to ensure uniqueness and then shuffle
    const allOptions = Array.from(potentialOptions);

    // Shuffle the options to randomize their order
    for (let i = allOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }

    return {
        id: questionMatch.match_id,
        question: questionText,
        options: allOptions,
        correctAnswer: correctAnswer
    };
}

// --- Question Type 2: Score Question ---
async function generateScoreQuestion(matchesCollection, sampleMatches) {
    const questionMatch = sampleMatches[0];
    const details = getQuestionDetails(questionMatch);

    const questionText = `What was the final score of the match between ${questionMatch.home_team.home_team_name} and ${questionMatch.away_team.away_team_name} ${details}?`;

    const correctAnswer = `${questionMatch.home_score} - ${questionMatch.away_score}`;

    const incorrectOptions = new Set();
    const optionsToFind = 2; // We need two incorrect options
    const commonScores = ["0 - 0", "1 - 0", "1 - 1", "2 - 0", "2 - 1", "3 - 0", "0 - 1", "0 - 2", "1 - 2"];

    // Try to generate variations of the correct score
    const [home, away] = [questionMatch.home_score, questionMatch.away_score];

    // Variations around correct score
    const scoreVariations = [
        `${home + 1} - ${away}`, `${home} - ${away + 1}`,
        `${Math.max(0, home - 1)} - ${away}`, `${home} - ${Math.max(0, away - 1)}`,
        `${home + 1} - ${away + 1}`, `${Math.max(0, home - 1)} - ${Math.max(0, away - 1)}`
    ];

    for (const variation of scoreVariations) {
        if (incorrectOptions.size >= optionsToFind) break;
        if (variation !== correctAnswer) {
            incorrectOptions.add(variation);
        }
    }

    // Add random common scores if still needed
    let commonScoresShuffled = [...commonScores].sort(() => 0.5 - Math.random());
    for (const score of commonScoresShuffled) {
        if (incorrectOptions.size >= optionsToFind) break;
        if (score !== correctAnswer) {
            incorrectOptions.add(score);
        }
    }

    // Fallback: Generate completely random scores if still not enough (should be rare)
    while (incorrectOptions.size < optionsToFind) {
        const randHome = Math.floor(Math.random() * 4); // 0-3 goals
        const randAway = Math.floor(Math.random() * 4);
        const randomScore = `${randHome} - ${randAway}`;
        if (randomScore !== correctAnswer) {
            incorrectOptions.add(randomScore);
        }
    }

    const finalIncorrectOptions = Array.from(incorrectOptions).slice(0, optionsToFind); // Ensure exactly 2

    const allOptions = [correctAnswer, ...finalIncorrectOptions].filter(Boolean);
    for (let i = allOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }

    return {
        id: questionMatch.match_id,
        question: questionText,
        options: allOptions,
        correctAnswer: correctAnswer
    };
}


// --- Question Type 3: Goal Scorer Question ---
async function generateGoalScorerQuestion(matchesCollection, eventsCollection, sampleMatches) {
    const questionMatch = sampleMatches[0];
    const details = getQuestionDetails(questionMatch);

    // Fetch events for this specific match to find goal scorers
    // Sort by minute and second to ensure "first goal" is accurate
    const matchEvents = await eventsCollection.find({ match_id: questionMatch.match_id }).sort({ minute: 1, second: 1 }).toArray();

    const goals = matchEvents.filter(event => event.type.name === "Goal" && event.player && event.player.name);

    // If no goals found in events for this match, or not enough data, fall back
    if (goals.length === 0 || !goals[0].player || !goals[0].player.name) {
        console.warn(`No valid goal events found for match_id: ${questionMatch.match_id}. Falling back to Match Outcome question.`);
        return generateMatchOutcomeQuestion(matchesCollection, sampleMatches); // Fallback
    }

    const correctAnswer = goals[0].player.name; // The first goal scorer

    const questionText = `Who scored the first goal in the match between ${questionMatch.home_team.home_team_name} and ${questionMatch.away_team.away_team_name} ${details}?`;

    const incorrectOptionsSet = new Set();
    const optionsToFind = 2;

    // Get all unique players who played in the match (from Starting XI events)
    const playersInMatch = new Set();
    const startingXIEvents = matchEvents.filter(event => event.type.name === "Starting XI");
    startingXIEvents.forEach(event => {
        if (event.tactics && event.tactics.lineup) {
            event.tactics.lineup.forEach(playerData => {
                playersInMatch.add(playerData.player.name);
            });
        }
    });

    // Add other players from the same match (who didn't score first, or didn't score at all)
    const possibleIncorrectPlayers = Array.from(playersInMatch).filter(
        player => player !== correctAnswer
    );

    // Shuffle possible incorrect players
    for (let i = possibleIncorrectPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [possibleIncorrectPlayers[i], possibleIncorrectPlayers[j]] = [possibleIncorrectPlayers[j], possibleIncorrectPlayers[i]];
    }

    for (let i = 0; i < optionsToFind && i < possibleIncorrectPlayers.length; i++) {
        incorrectOptionsSet.add(possibleIncorrectPlayers[i]);
    }

    // Fallback: If not enough unique players from the current match, use generic placeholders.
    // We avoid pulling team names here as they are not relevant player options.
    while (incorrectOptionsSet.size < optionsToFind) {
         incorrectOptionsSet.add(`Random Player ${incorrectOptionsSet.size + 1}`);
    }

    const finalIncorrectOptions = Array.from(incorrectOptionsSet).slice(0, optionsToFind);

    const allOptions = [correctAnswer, ...finalIncorrectOptions].filter(Boolean);
    for (let i = allOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }

    return {
        id: questionMatch.match_id,
        question: questionText,
        options: allOptions,
        correctAnswer: correctAnswer
    };
}


// --- Main Handler ---
exports.handler = async function(event, context) {
    // Ensure only GET requests are allowed for fetching questions (standard practice)
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed. Please use GET.' })
        };
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db("wtfootball-trivia-game"); // Replace with your database name if different
        const matchesCollection = database.collection("matches_data");
        const eventsCollection = database.collection("events_data"); // Ensure this matches your collection name!

        // --- Fetch 10 random matches to get a pool for questions and incorrect answers ---
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

        // Randomly select question type
        // Add more types here as they are implemented (e.g., 'coach', 'ownGoal', 'opponent')
        const questionTypes = ['matchOutcome', 'score', 'goalScorer'];
        const selectedType = questionTypes[Math.floor(Math.random() * questionTypes.length)];

        let triviaQuestion;
        switch (selectedType) {
            case 'matchOutcome':
                triviaQuestion = await generateMatchOutcomeQuestion(matchesCollection, sampleMatches);
                break;
            case 'score':
                triviaQuestion = await generateScoreQuestion(matchesCollection, sampleMatches);
                break;
            case 'goalScorer':
                triviaQuestion = await generateGoalScorerQuestion(matchesCollection, eventsCollection, sampleMatches);
                break;
            default:
                // Fallback to a reliable question type if something goes wrong with selection
                triviaQuestion = await generateMatchOutcomeQuestion(matchesCollection, sampleMatches);
        }

        // Handle potential fallbacks from question generation functions (e.g., if goalScorer couldn't find data)
        if (!triviaQuestion || !triviaQuestion.question || !triviaQuestion.options || !triviaQuestion.correctAnswer) {
             console.warn("Generated question was invalid, falling back to Match Outcome question.");
             triviaQuestion = await generateMatchOutcomeQuestion(matchesCollection, sampleMatches);
        }


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