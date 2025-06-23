// --- Generate incorrect options ---
        const allTeamNamesInCompetition = new Set();
        // Fetch all matches for the target competition to get all team names
        // This is efficient because we already have the matches data in `matchesCollection`
        const allCompetitionMatches = await matchesCollection.find({
            "competition.competition_id": questionMatch.competition.competition_id,
            "season.season_id": questionMatch.season.season_id
        }).project({ "home_team.home_team_name": 1, "away_team.away_team_name": 1, "_id": 0 }).toArray();

        allCompetitionMatches.forEach(match => {
            allTeamNamesInCompetition.add(match.home_team.home_team_name);
            allTeamNamesInCompetition.add(match.away_team.away_team_name);
        });

        const incorrectOptions = [];
        const usedOptions = new Set([correctAnswer, questionMatch.home_team.home_team_name, questionMatch.away_team.away_team_name]); // To avoid using correct answer or teams in the question

        const allPossibleIncorrectTeams = Array.from(allTeamNamesInCompetition).filter(
            team => !usedOptions.has(team)
        );

        // Shuffle possible incorrect teams
        for (let i = allPossibleIncorrectTeams.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allPossibleIncorrectTeams[i], allPossibleIncorrectTeams[j]] = [allPossibleIncorrectTeams[j], allPossibleIncorrectTeams[i]];
        }

        // Pick 2 distinct incorrect options
        for (let i = 0; i < 2 && i < allPossibleIncorrectTeams.length; i++) {
            incorrectOptions.push(allPossibleIncorrectTeams[i]);
        }

        // If we don't have enough teams, or if "It was a draw" is a valid option, add it
        if (incorrectOptions.length < 2 && correctAnswer !== "It was a draw") {
            incorrectOptions.push("It was a draw");
        }
        while (incorrectOptions.length < 2) {
            // Fallback: If still not enough unique teams, use a generic filler (shouldn't happen often with WC data)
            incorrectOptions.push("Other Team");
        }

        // Ensure "It was a draw" is not duplicated if it was the correct answer and accidentally added to incorrect
        if (correctAnswer === "It was a draw") {
            const drawIndex = incorrectOptions.indexOf("It was a draw");
            if (drawIndex > -1) {
                incorrectOptions.splice(drawIndex, 1);
            }
        }