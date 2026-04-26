import { ExamData, Question, QuestionOption } from '../types';

/**
 * Generate standalone HTML file giống english_exam_quiz_v6.html
 */
export const generateExamHtml = (examData: ExamData): string => {
  const questionsJson = JSON.stringify(examData.questions.map(q => ({
    number: q.number,
    section: q.section,
    part: q.part,
    text: q.text,
    options: q.options,
    correctAnswer: q.correctAnswer,
    type: q.type,
    passage: q.passage
  })));
  
  const answersJson = JSON.stringify(examData.answers);

  return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${examData.title} - Interactive Quiz</title>
    <style>
        :root {
            --teal-50: #f0fdfa;
            --teal-100: #ccfbf1;
            --teal-200: #99f6e4;
            --teal-300: #5eead4;
            --teal-400: #2dd4bf;
            --teal-500: #14b8a6;
            --teal-600: #0d9488;
            --teal-700: #0f766e;
            --teal-800: #115e59;
            --teal-900: #134e4a;
            --green-500: #22c55e;
            --green-100: #dcfce7;
            --red-500: #ef4444;
            --red-100: #fee2e2;
            --orange-50: #fff7ed;
            --orange-100: #ffedd5;
            --orange-400: #fb923c;
            --orange-500: #f97316;
            --orange-700: #c2410c;
            --orange-800: #9a3412;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, var(--teal-50) 0%, var(--teal-100) 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container { max-width: 950px; margin: 0 auto; }

        .header {
            text-align: center;
            padding: 30px;
            background: linear-gradient(135deg, var(--teal-600) 0%, var(--teal-800) 100%);
            border-radius: 20px;
            margin-bottom: 30px;
            box-shadow: 0 10px 40px rgba(13, 148, 136, 0.3);
        }

        .header h1 {
            color: white;
            font-size: 2rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
            font-weight: 700;
        }

        .header p {
            color: var(--teal-100);
            font-size: 1.1rem;
        }

        .score-board {
            background: linear-gradient(135deg, var(--teal-700) 0%, var(--teal-900) 100%);
            border-radius: 16px;
            padding: 25px 30px;
            margin-bottom: 30px;
            color: white;
            box-shadow: 0 8px 30px rgba(0,0,0,0.2);
            position: sticky;
            top: 20px;
            z-index: 100;
        }

        .score-content {
            display: flex;
            justify-content: space-around;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        }

        .score-item { text-align: center; padding: 10px 20px; }
        .score-item .label { font-size: 0.85rem; opacity: 0.9; margin-bottom: 5px; }
        .score-item .value { font-size: 2.2rem; font-weight: bold; }
        .score-item.correct .value { color: #4ade80; }
        .score-item.wrong .value { color: #f87171; }

        .progress-bar {
            width: 100%;
            height: 10px;
            background: rgba(255,255,255,0.2);
            border-radius: 5px;
            margin-top: 20px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4ade80, var(--teal-300));
            border-radius: 5px;
            transition: width 0.5s ease;
        }

        .section {
            background: white;
            border-radius: 16px;
            margin-bottom: 25px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }

        .section-header {
            background: linear-gradient(135deg, var(--orange-500) 0%, var(--orange-700) 100%);
            color: white;
            padding: 20px 25px;
            font-size: 1.2rem;
            font-weight: 700;
            display: flex;
            justify-content: space-between;
            align-items: center;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }

        .section-header .points {
            background: rgba(255,255,255,0.2);
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 500;
        }

        .part-header {
            background: linear-gradient(90deg, var(--orange-100), var(--orange-50));
            color: var(--orange-800);
            padding: 15px 25px;
            font-style: italic;
            border-left: 4px solid var(--orange-500);
            font-size: 0.95rem;
            font-weight: 600;
        }

        .reading-passage {
            background: linear-gradient(135deg, var(--teal-50) 0%, white 100%);
            padding: 25px 30px;
            margin: 20px;
            border-radius: 12px;
            border-left: 5px solid var(--orange-500);
            line-height: 1.9;
            font-size: 1rem;
        }

        .reading-passage h3 {
            color: var(--orange-700);
            margin-bottom: 18px;
            text-align: center;
            font-size: 1.2rem;
            font-weight: 700;
        }

        .reading-passage p { color: var(--teal-900); }

        .question {
            padding: 22px 25px;
            border-bottom: 1px solid var(--teal-100);
            transition: all 0.3s ease;
        }

        .question:last-child { border-bottom: none; }
        .question:hover { background: var(--teal-50); }

        .question.answered-correct {
            background: linear-gradient(90deg, rgba(74, 222, 128, 0.12) 0%, white 100%);
            border-left: 4px solid var(--green-500);
        }

        .question.answered-wrong {
            background: linear-gradient(90deg, rgba(248, 113, 113, 0.12) 0%, white 100%);
            border-left: 4px solid var(--red-500);
        }

        .question-number {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, var(--teal-500) 0%, var(--teal-600) 100%);
            color: white;
            min-width: 38px;
            height: 38px;
            border-radius: 50%;
            font-weight: bold;
            margin-right: 15px;
            font-size: 0.95rem;
            box-shadow: 0 2px 8px rgba(13, 148, 136, 0.3);
        }

        .question-text {
            color: var(--teal-900);
            font-size: 1.05rem;
            margin-bottom: 15px;
            line-height: 1.7;
            display: flex;
            align-items: flex-start;
        }

        .question-content { flex: 1; }

        .blank {
            display: inline-block;
            min-width: 120px;
            border-bottom: 2px dashed var(--teal-400);
            margin: 0 5px;
        }

        .options {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
            margin-top: 15px;
            margin-left: 53px;
        }

        .option {
            display: flex;
            align-items: center;
            padding: 14px 18px;
            background: var(--teal-50);
            border: 2px solid var(--teal-200);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.25s ease;
        }

        .option:hover {
            border-color: var(--teal-400);
            background: var(--teal-100);
            transform: translateX(3px);
        }

        .option.selected {
            border-color: var(--teal-500);
            background: var(--teal-100);
            box-shadow: 0 2px 10px rgba(13, 148, 136, 0.2);
        }

        .option.correct {
            border-color: var(--green-500);
            background: var(--green-100);
        }

        .option.wrong {
            border-color: var(--red-500);
            background: var(--red-100);
        }

        .option.show-correct {
            border-color: var(--green-500);
            background: var(--green-100);
            box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
        }

        .option input[type="radio"] { display: none; }

        .option-label {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: var(--teal-500);
            color: white;
            border-radius: 50%;
            font-weight: bold;
            margin-right: 14px;
            font-size: 0.9rem;
            flex-shrink: 0;
        }

        .option.correct .option-label { background: var(--green-500); }
        .option.wrong .option-label { background: var(--red-500); }

        .option-text {
            flex: 1;
            color: var(--teal-800);
            font-size: 0.98rem;
        }

        .underlined-part {
            text-decoration: underline;
            text-decoration-thickness: 2px;
            font-weight: bold;
        }

        .writing-answer {
            margin-left: 53px;
            margin-top: 10px;
        }

        .writing-input {
            width: 100%;
            padding: 14px 18px;
            border: 2px solid var(--teal-300);
            border-radius: 12px;
            font-size: 1rem;
            transition: all 0.3s ease;
            font-family: inherit;
        }

        .writing-input:focus {
            outline: none;
            border-color: var(--teal-500);
            box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.15);
        }

        .writing-input.correct {
            border-color: var(--green-500);
            background: var(--green-100);
        }

        .writing-input.wrong {
            border-color: var(--red-500);
            background: var(--red-100);
        }

        .feedback {
            margin-top: 12px;
            margin-left: 53px;
            padding: 12px 18px;
            border-radius: 10px;
            font-weight: 500;
            display: none;
            font-size: 0.95rem;
        }

        .feedback.show { display: block; }

        .feedback.correct {
            background: var(--green-100);
            color: #15803d;
            border-left: 4px solid var(--green-500);
        }

        .feedback.wrong {
            background: var(--red-100);
            color: #b91c1c;
            border-left: 4px solid var(--red-500);
        }

        .btn-wrapper {
            text-align: center;
            padding: 35px 20px;
        }

        .check-btn {
            padding: 18px 60px;
            background: linear-gradient(135deg, var(--teal-500) 0%, var(--teal-600) 100%);
            color: white;
            border: none;
            border-radius: 50px;
            font-size: 1.2rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 6px 25px rgba(13, 148, 136, 0.4);
        }

        .check-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 35px rgba(13, 148, 136, 0.5);
        }

        .reset-btn {
            padding: 16px 40px;
            background: transparent;
            color: var(--teal-600);
            border: 2px solid var(--teal-400);
            border-radius: 50px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            margin-left: 15px;
            transition: all 0.3s ease;
        }

        .reset-btn:hover {
            background: var(--teal-100);
            border-color: var(--teal-500);
        }

        .toast {
            position: fixed;
            bottom: 30px;
            right: 30px;
            padding: 18px 30px;
            border-radius: 12px;
            color: white;
            font-weight: 600;
            box-shadow: 0 6px 30px rgba(0,0,0,0.25);
            transform: translateX(150%);
            transition: transform 0.4s ease;
            z-index: 1000;
            font-size: 1.05rem;
        }

        .toast.show { transform: translateX(0); }
        .toast.success { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); }
        .toast.error { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }

        @media (max-width: 768px) {
            .header h1 { font-size: 1.5rem; }
            .options { grid-template-columns: 1fr; margin-left: 0; }
            .score-content { flex-direction: column; gap: 10px; }
            .score-item { padding: 8px 15px; }
            .score-item .value { font-size: 1.8rem; }
            .question-text { flex-direction: column; }
            .question-number { margin-bottom: 10px; }
            .writing-answer, .feedback { margin-left: 0; }
            .btn-wrapper { padding: 25px 10px; }
            .check-btn, .reset-btn {
                display: block;
                width: 100%;
                margin: 10px 0;
            }
        }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>📚 ${examData.title}</h1>
        <p>Bài thi tiếng Anh tương tác</p>
    </div>

    <div class="score-board" id="scoreBoard">
        <div class="score-content">
            <div class="score-item">
                <div class="label">📝 Tổng câu hỏi</div>
                <div class="value" id="totalQuestions">${examData.questions.length}</div>
            </div>
            <div class="score-item correct">
                <div class="label">✔ Trả lời đúng</div>
                <div class="value" id="correctCount">0</div>
            </div>
            <div class="score-item wrong">
                <div class="label">✗ Sai / bỏ trống</div>
                <div class="value" id="wrongCount">0</div>
            </div>
            <div class="score-item">
                <div class="label">🎯 Điểm số</div>
                <div class="value" id="scorePercent">0%</div>
            </div>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
    </div>

    <div class="quiz-content" id="quizContent"></div>

    <div class="btn-wrapper" id="btnWrapper">
        <button class="check-btn" onclick="checkAllAnswers()">✔ Kiểm tra đáp án</button>
        <button class="reset-btn" onclick="resetQuiz()">↻ Làm lại</button>
    </div>
</div>

<div class="toast" id="toast"></div>

<script>
    const examData = {
        questions: ${questionsJson},
        answers: ${answersJson}
    };
    let userAnswers = {};

    // Build Quiz UI
    function buildQuizUI() {
        const container = document.getElementById('quizContent');
        container.innerHTML = '';

        let currentSectionLetter = null;
        let currentPartText = null;
        let sectionDiv = null;
        let questionsContainer = null;
        const printedPassages = new Set();

        examData.questions.forEach(q => {
            if (q.section && q.section.letter !== currentSectionLetter) {
                currentSectionLetter = q.section.letter;
                currentPartText = null;

                sectionDiv = document.createElement('div');
                sectionDiv.className = 'section';

                const header = document.createElement('div');
                header.className = 'section-header';
                header.innerHTML = \`
                    <span><strong>SECTION \${q.section.letter}.</strong> \${q.section.name.toUpperCase()}</span>
                    <span class="points">\${q.section.points}</span>
                \`;
                sectionDiv.appendChild(header);

                questionsContainer = document.createElement('div');
                sectionDiv.appendChild(questionsContainer);
                container.appendChild(sectionDiv);
            }

            if (q.part && q.part !== currentPartText) {
                currentPartText = q.part;

                const partDiv = document.createElement('div');
                partDiv.className = 'part-header';
                partDiv.innerHTML = \`<strong>\${q.part}</strong>\`;
                if (questionsContainer) questionsContainer.appendChild(partDiv);
            }

            if (q.passage && q.passage.trim() && !printedPassages.has(q.passage)) {
                const passageDiv = document.createElement('div');
                passageDiv.className = 'reading-passage';

                const lines = q.passage.split('\\n');
                const title = lines[0];
                const body = lines.slice(1).join('<br>');

                passageDiv.innerHTML = \`
                    <h3>\${title}</h3>
                    <p>\${body}</p>
                \`;
                printedPassages.add(q.passage);
                if (questionsContainer) questionsContainer.appendChild(passageDiv);
            }

            const qDiv = document.createElement('div');
            qDiv.className = 'question';
            qDiv.id = \`question-\${q.number}\`;

            const stemText = getQuestionStem(q);
            const stemHtml = stemText
                ? \`<span class="question-content">\${formatQuestionText(stemText)}</span>\`
                : '';

            let html = \`
                <div class="question-text">
                    <span class="question-number">\${q.number}</span>
                    \${stemHtml}
                </div>
            \`;

            if (q.type === 'writing') {
                html += \`
                    <div class="writing-answer">
                        <input type="text" class="writing-input"
                               id="answer-\${q.number}"
                               placeholder="Nhập câu trả lời..."
                               data-qnum="\${q.number}">
                    </div>
                \`;
            } else {
                const isPhonetics = q.section && q.section.name && /phonetics/i.test(q.section.name);

                html += '<div class="options">';
                q.options.forEach(opt => {
                    const displayText = isPhonetics && opt.textWithUnderline 
                        ? opt.textWithUnderline 
                        : escapeHtml(opt.text);
                    
                    html += \`
                        <label class="option" id="option-\${q.number}-\${opt.letter}">
                            <input type="radio" name="q\${q.number}" value="\${opt.letter}" data-qnum="\${q.number}">
                            <span class="option-label">\${opt.letter}</span>
                            <span class="option-text">\${displayText}</span>
                        </label>
                    \`;
                });
                html += '</div>';
            }

            html += \`<div class="feedback" id="feedback-\${q.number}"></div>\`;

            qDiv.innerHTML = html;

            if (questionsContainer) questionsContainer.appendChild(qDiv);
            else container.appendChild(qDiv);
        });

        // Add event listeners
        document.querySelectorAll('input[type="radio"]').forEach(input => {
            input.addEventListener('change', e => {
                const qnum = parseInt(e.target.dataset.qnum, 10);
                userAnswers[qnum] = e.target.value;

                document.querySelectorAll(\`[name="q\${qnum}"]\`).forEach(r => {
                    r.closest('.option').classList.remove('selected');
                });
                e.target.closest('.option').classList.add('selected');

                updateProgress();
            });
        });

        document.querySelectorAll('.writing-input').forEach(input => {
            input.addEventListener('input', e => {
                const qnum = parseInt(e.target.dataset.qnum, 10);
                userAnswers[qnum] = e.target.value;
                updateProgress();
            });
        });
    }

    function getQuestionStem(q) {
        if (!q.text) return '';
        if (q.type === 'multiple_choice') {
            const re = /([A-D])[\\.\\)]/;
            const m = re.exec(q.text);
            if (m && m.index <= 2) {
                return q.text.slice(0, m.index).trim();
            }
        }
        return q.text;
    }

    function formatQuestionText(text) {
        if (!text) return '';
        return text
            .replace(/_+/g, '<span class="blank"></span>')
            .replace(/\\n/g, '<br>')
            .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function updateProgress() {
        const total = examData.questions.length;
        const answered = Object.keys(userAnswers).filter(k => userAnswers[k]).length;
        const progress = total > 0 ? (answered / total) * 100 : 0;
        document.getElementById('progressFill').style.width = progress + '%';
    }

    function normalizeText(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/['']/g, "'")
            .replace(/\\s+/g, ' ')
            .replace(/[.,!?;:]/g, '')
            .trim();
    }

    function checkAllAnswers() {
        let correct = 0;
        let wrong = 0;

        examData.questions.forEach(q => {
            const userAns = userAnswers[q.number];
            const correctAns = q.correctAnswer;
            const qDiv = document.getElementById(\`question-\${q.number}\`);
            const feedbackDiv = document.getElementById(\`feedback-\${q.number}\`);

            qDiv.classList.remove('answered-correct', 'answered-wrong');

            if (q.type === 'writing') {
                const input = document.getElementById(\`answer-\${q.number}\`);
                input.classList.remove('correct', 'wrong');

                if (userAns && correctAns) {
                    const isCorrect = normalizeText(userAns) === normalizeText(correctAns);

                    if (isCorrect) {
                        correct++;
                        input.classList.add('correct');
                        qDiv.classList.add('answered-correct');
                        feedbackDiv.className = 'feedback show correct';
                        feedbackDiv.innerHTML = '✔ Chính xác!';
                    } else {
                        wrong++;
                        input.classList.add('wrong');
                        qDiv.classList.add('answered-wrong');
                        feedbackDiv.className = 'feedback show wrong';
                        feedbackDiv.innerHTML = \`✗ Chưa đúng. Đáp án: <strong>\${correctAns}</strong>\`;
                    }
                } else {
                    wrong++;
                    feedbackDiv.className = 'feedback show wrong';
                    feedbackDiv.innerHTML = correctAns ? \`Đáp án: <strong>\${correctAns}</strong>\` : 'Chưa có đáp án';
                }
            } else {
                q.options.forEach(opt => {
                    const optDiv = document.getElementById(\`option-\${q.number}-\${opt.letter}\`);
                    if (optDiv) {
                        optDiv.classList.remove('selected', 'correct', 'wrong', 'show-correct');
                    }
                });

                if (correctAns) {
                    const correctOptDiv = document.getElementById(\`option-\${q.number}-\${correctAns}\`);
                    if (correctOptDiv) correctOptDiv.classList.add('show-correct');
                }

                if (userAns) {
                    const selectedOptDiv = document.getElementById(\`option-\${q.number}-\${userAns}\`);
                    if (selectedOptDiv) selectedOptDiv.classList.add('selected');

                    if (userAns === correctAns) {
                        correct++;
                        qDiv.classList.add('answered-correct');
                        if (selectedOptDiv) selectedOptDiv.classList.add('correct');
                        feedbackDiv.className = 'feedback show correct';
                        feedbackDiv.innerHTML = '✔ Chính xác!';
                    } else {
                        wrong++;
                        qDiv.classList.add('answered-wrong');
                        if (selectedOptDiv) selectedOptDiv.classList.add('wrong');
                        feedbackDiv.className = 'feedback show wrong';
                        feedbackDiv.innerHTML = \`✗ Sai. Đáp án đúng: <strong>\${correctAns || 'N/A'}</strong>\`;
                    }
                } else {
                    wrong++;
                    feedbackDiv.className = 'feedback show wrong';
                    feedbackDiv.innerHTML = \`Đáp án: <strong>\${correctAns || 'N/A'}</strong>\`;
                }
            }
        });

        document.getElementById('correctCount').textContent = correct;
        document.getElementById('wrongCount').textContent = wrong;

        const total = examData.questions.length;
        const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
        document.getElementById('scorePercent').textContent = percent + '%';
        document.getElementById('progressFill').style.width = percent + '%';

        if (percent >= 80) {
            showToast(\`🎉 Xuất sắc! Bạn đạt \${correct}/\${total} câu (\${percent}%)\`, 'success');
        } else if (percent >= 50) {
            showToast(\`👍 Khá tốt! Bạn đạt \${correct}/\${total} câu (\${percent}%)\`, 'success');
        } else {
            showToast(\`💪 Cần cố gắng thêm! \${correct}/\${total} câu (\${percent}%)\`, 'error');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function resetQuiz() {
        userAnswers = {};

        document.querySelectorAll('input[type="radio"]').forEach(input => {
            input.checked = false;
        });

        document.querySelectorAll('.writing-input').forEach(input => {
            input.value = '';
            input.classList.remove('correct', 'wrong');
        });

        document.querySelectorAll('.question').forEach(q => {
            q.classList.remove('answered-correct', 'answered-wrong');
        });

        document.querySelectorAll('.option').forEach(opt => {
            opt.classList.remove('selected', 'correct', 'wrong', 'show-correct');
        });

        document.querySelectorAll('.feedback').forEach(fb => {
            fb.className = 'feedback';
            fb.innerHTML = '';
        });

        document.getElementById('correctCount').textContent = '0';
        document.getElementById('wrongCount').textContent = '0';
        document.getElementById('scorePercent').textContent = '0%';
        document.getElementById('progressFill').style.width = '0%';

        showToast('Đã làm mới bài thi!', 'success');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showToast(message, type) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = \`toast \${type} show\`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    // Initialize
    buildQuizUI();
    updateProgress();
</script>
</body>
</html>`;
};

/**
 * Download HTML file
 */
export const downloadHtmlFile = (examData: ExamData, filename: string = 'exam_quiz.html') => {
  const htmlContent = generateExamHtml(examData);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};
