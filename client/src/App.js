import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [message, setMessage] = useState('');
  const [questions, setQuestions] = useState([]); // NEW: State to store questions

  useEffect(() => {
    const functionsBaseUrl =
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:8888'
        : '';

    fetch(`${functionsBaseUrl}/.netlify/functions/getQuestions`)
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => { throw new Error(err.error || 'Server error'); });
        }
        return response.json();
      })
      .then(data => {
        setMessage(data.message);
        // NEW: Set the questions state if data.questions exists
        if (data.questions) {
          setQuestions(data.questions);
        }
      })
      .catch(error => {
        console.error('Error fetching function:', error);
        setMessage(`Error connecting to backend or fetching questions: ${error.message}`);
        setQuestions([]); // Clear questions on error
      });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={process.env.PUBLIC_URL + '/logo.svg'} className="App-logo" alt="logo" />
        <h1>Football Trivia Game</h1>
        <p>{message}</p> {/* Still display the message from the backend */}

        {/* NEW: Display Questions if any are loaded */}
        {questions.length > 0 && (
          <div className="questions-list">
            <h2>Trivia Questions:</h2>
            {questions.map((q, index) => (
              <div key={q._id || index} className="question-item">
                <h3>{q.question}</h3>
                {q.options && q.options.length > 0 && (
                  <ul>
                    {q.options.map((option, optIndex) => (
                      <li key={optIndex}>{option}</li>
                    ))}
                  </ul>
                )}
                {q.answer && <p><strong>Answer:</strong> {q.answer}</p>}
                <hr /> {/* Separator for questions */}
              </div>
            ))}
          </div>
        )}
        {/* End NEW */}

      </header>
    </div>
  );
}

export default App;