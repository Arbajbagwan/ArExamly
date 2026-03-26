import React, { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Loader from '../../components/common/Loader';
import { attemptService } from '../../services/attemptService';

const MyResults = () => {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openAttemptId, setOpenAttemptId] = useState(null)
  const [expandedRows, setExpandedRows] = useState({})

  const toPlainText = (html) => {
    const raw = String(html || '');
    if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
      const doc = new window.DOMParser().parseFromString(raw, 'text/html');
      return (doc.body.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const resultAttempts = attempts.filter(
    (a) => ['submitted', 'evaluated', 'auto-submitted'].includes(a.status) && Boolean(a.submittedAt)
  );

  useEffect(() => {
    fetchAttempts();
  }, []);

  const fetchAttempts = async () => {
    try {
      const data = await attemptService.getMyAttempts();
      setAttempts(data.attempts || []);
    } catch (error) {
      console.error('Failed to fetch attempts:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadAttemptPDF = async (attempt) => {
    if (attempt.status !== 'evaluated') {
      alert('Result is not evaluated yet.');
      return;
    }

    const jsPDF = (await import('jspdf')).default;
    const doc = new jsPDF();

    const examTitle = attempt.exam.title;
    const username = attempt.examinee?.username || 'user';
    const submittedAt = new Date(attempt.submittedAt).toLocaleString();

    let y = 20;
    const PAGE_HEIGHT = 297;
    const BOTTOM_MARGIN = 20;
    const MAX_Y = PAGE_HEIGHT - BOTTOM_MARGIN;

    const ensureSpace = (needed = 10) => {
      if (y + needed > MAX_Y) {
        doc.addPage();
        y = 20;
      }
    };

    const writeWrapped = (text, x, maxWidth = 170, lineH = 6) => {
      const lines = doc.splitTextToSize(String(text ?? '-'), maxWidth);
      ensureSpace(lines.length * lineH + 2);
      doc.text(lines, x, y);
      y += lines.length * lineH;
    };

    // HEADER
    doc.setFontSize(11);
    doc.text(`Exam: ${examTitle}`, 14, y);
    y += 10;
    doc.text(`Username: ${username}`, 14, y);
    y += 6;
    doc.text(`Submitted At: ${submittedAt}`, 14, y);
    y += 6;
    doc.text(`Score: ${attempt.totalMarksObtained} / ${attempt.totalMarksPossible}`, 14, y);

    y += 10;
    doc.line(14, y, 195, y);
    y += 8;

    // LOOP QUESTIONS
    for (const [index, ans] of attempt.answers.entries()) {

      const q = ans.question;
      doc.setFontSize(12);

      const parser = new DOMParser();
      const htmlDoc = parser.parseFromString(q.question || "", "text/html");

      const img = htmlDoc.querySelector("img");

      if (img && img.src) {
        try {
          const response = await fetch(img.src);
          const blob = await response.blob();

          const reader = new FileReader();

          const base64 = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });

          ensureSpace(60);

          doc.addImage(base64, "PNG", 14, y, 80, 50);
          y += 55;

        } catch (err) {
          console.error("Image load failed:", err);
        }
      }

      const questionText = htmlDoc.body.textContent || "";
      writeWrapped(`Q${index + 1}. ${questionText}`, 14);

      y += 2;
      doc.setFontSize(11);

      // MCQ
      if (q.type === "mcq") {

        for (const [i, opt] of q.options.entries()) {

          const parser = new DOMParser();
          const optDoc = parser.parseFromString(opt || "", "text/html");

          const optImg = optDoc.querySelector("img");
          const optText = optDoc.body.textContent || "";

          const isSelected = ans.selectedOption === i;
          const isCorrect = ans.isCorrect;

          // Color for selected option
          if (isSelected) {
            doc.setTextColor(isCorrect ? 0 : 200, isCorrect ? 150 : 0, 0);
          } else {
            doc.setTextColor(0, 0, 0);
          }

          const marker = isSelected ? " (Selected)" : "";

          writeWrapped(
            `${String.fromCharCode(65 + i)}. ${optText}${marker}`,
            18
          );

          // OPTION IMAGE
          if (optImg && optImg.src) {

            try {

              const response = await fetch(optImg.src);
              const blob = await response.blob();

              const reader = new FileReader();

              const base64 = await new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });

              ensureSpace(40);

              doc.addImage(base64, "PNG", 22, y, 60, 35);
              y += 40;

            } catch (err) {
              console.error("Option image load failed:", err);
            }

          }

          doc.setTextColor(0, 0, 0);

        }

      }

      // THEORY
      if (q.type === 'theory') {
        writeWrapped(`Answer: ${ans.textAnswer || '-'}`, 18);
      }

      // PASSAGE
      if (q.type === 'passage') {

        const passage = q.passageRef || q.passage;

        if (passage?.title)
          writeWrapped(`Passage: ${toPlainText(passage.title)}`, 18);

        if (passage?.text)
          writeWrapped(toPlainText(passage.text), 18);

        (q.subQuestions || []).forEach((sq, sqIndex) => {

          const resp = (ans.passageResponses || []).find(
            (r) => String(r.subQuestionId) === String(sq._id)
          );

          writeWrapped(`${sqIndex + 1}. ${toPlainText(sq.prompt)}`, 18);

          if (sq.type === 'mcq') {
            const picked =
              typeof resp?.selectedOption === 'number'
                ? String.fromCharCode(65 + resp.selectedOption)
                : '-';

            writeWrapped(`Selected: ${picked}`, 20);
          } else {
            writeWrapped(`Answer: ${resp?.textAnswer || '-'}`, 20);
          }

          writeWrapped(`Marks: ${resp?.marksObtained || 0}/${sq.credit}`, 20);

        });

      }

      const correctness =
        q.type === 'mcq'
          ? (ans.isCorrect ? 'Correct' : 'Incorrect')
          : 'Evaluated';

      writeWrapped(`Marks: ${ans.marksObtained} / ${q.credit} | ${correctness}`, 18);

      y += 10;
    }

    const safeExam = examTitle.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`${safeExam}_${username}.pdf`);
  };

  const toggleAttempt = (id) => {
    setOpenAttemptId((prev) => (prev === id ? null : id))
  }

  const toggleRow = (key) => {
    setExpandedRows(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  if (loading) return <Loader />;

  return (
    <div className="flex flex-col h-screen">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 bg-base-200 p-3 overflow-hidden">
          <div className="max-w-7xl mx-auto h-full flex flex-col">

            {/* Header */}
            <h1 className="text-lg font-semibold mb-2">My Exam Results</h1>

            {resultAttempts.length === 0 ? (
              <div className="bg-base-100 rounded border border-base-300 p-3 text-center text-sm">
                No submitted exams yet.
              </div>
            ) : (

              <div className="flex-1 overflow-y-auto pr-1 space-y-3">

                {resultAttempts.map((attempt) => (

                  <div
                    key={attempt._id}
                    className="bg-base-100 border border-base-300 rounded p-3 space-y-2"
                  >

                    {/* Header */}
                    <div className="flex justify-between items-center mb-2">

                      <div>
                        <h3 className="text-sm font-semibold">
                          {attempt.exam.title}
                        </h3>

                        <p className="text-xs text-base-content/60">
                          Attempted on: {new Date(attempt.submittedAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">

                        {/* {attempt.status === "evaluated" && (
                          <button
                            onClick={() => downloadAttemptPDF(attempt)}
                            className="btn btn-primary btn-xs"
                          >
                            PDF
                          </button>
                        )} */}

                        <span
                          className={`badge badge-xs ${attempt.status === "evaluated"
                            ? "badge-success"
                            : "badge-warning"
                            }`}
                        >
                          {attempt.status === "evaluated"
                            ? "Completed"
                            : "Pending"}
                        </span>

                      </div>

                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-xs mb-2">

                      <div className="bg-base-200 p-2 rounded text-center">
                        <p className="text-base-content/60">Total</p>
                        <p className="font-semibold">{attempt.totalMarksPossible ?? attempt.exam.totalMarks ?? 0}</p>
                      </div>

                      {attempt.status === "evaluated" ? (
                        <>
                          <div className="bg-primary/10 p-2 rounded text-center">
                            <p className="text-base-content/60">Obtained</p>
                            <p className="font-semibold">
                              {attempt.totalMarksObtained}
                            </p>
                          </div>

                          <div className="bg-secondary/10 p-2 rounded text-center">
                            <p className="text-base-content/60">%</p>
                            <p className="font-semibold">
                              {attempt.percentage?.toFixed(1)}%
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="col-span-2 bg-warning/10 p-2 rounded text-center text-warning text-xs">
                          Pending evaluation
                        </div>
                      )}

                    </div>

                    {/* Question Analysis */}
                    {/* {attempt.status === "evaluated" && (

                      <div className="mt-2">

                        <button
                          onClick={() => toggleAttempt(attempt._id)}
                          className="btn flex items-center justify-between w-full text-xs font-medium bg-base-200 px-2 py-1 rounded"
                        >
                          <span>Question Analysis</span>

                          <span className="text-base-content/60">
                            {openAttemptId === attempt._id ?
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                              </svg>
                              : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                            }
                          </span>
                        </button>

                      </div>

                    )} */}

                    {attempt.status === "evaluated" && openAttemptId === attempt._id && (

                      <div className="border border-base-300 rounded mt-2 overflow-hidden">

                        <div className="max-h-[260px] overflow-y-auto">

                          <table className="table table-xs table-fixed w-full">

                            <thead className="sticky top-0 bg-base-200 z-10">
                              <tr>
                                <th>#</th>
                                <th className="w-[30%]">Question</th>
                                <th className="w-[25%]">Answer</th>
                                <th>Type</th>
                                <th>Marks</th>
                                {/* <th>Result</th> */}
                                {/* <th>Feedback</th> */}
                              </tr>
                            </thead>

                            <tbody>

                              {attempt.answers.map((answer, index) => {

                                const isCorrect =
                                  answer.marksObtained === answer.question.credit

                                const questionHtml = answer.question.question || ""

                                let answerHtml = "<span>—</span>";

                                if (answer.question.type === "mcq") {
                                  if (typeof answer.selectedOption === "number") {
                                    answerHtml = answer.question.options?.[answer.selectedOption] || "—";
                                  }
                                }

                                if (answer.question.type === "theory") {
                                  answerHtml = answer.textAnswer || "—";
                                }

                                return (

                                  <tr
                                    key={index}
                                    className={isCorrect ? "bg-success/10" : "bg-error/10"}
                                  >

                                    <td>{index + 1}</td>

                                    <td className="text-xs align-top">

                                      <div
                                        className={`exam-image break-words overflow-hidden ${expandedRows[`q-${index}`] ? "" : "line-clamp-2"
                                          }`}
                                        dangerouslySetInnerHTML={{ __html: questionHtml }}
                                      />

                                      {toPlainText(questionHtml).length > 120 && (
                                        <button
                                          onClick={() => toggleRow(`q-${index}`)}
                                          className="text-primary text-xs mt-1"
                                        >
                                          {expandedRows[`q-${index}`] ? "See less" : "See more"}
                                        </button>
                                      )}

                                    </td>

                                    <td className="text-xs align-top">

                                      <div
                                        className={`exam-image break-words overflow-hidden ${expandedRows[`a-${index}`] ? "" : "line-clamp-2"
                                          }`}
                                        dangerouslySetInnerHTML={{ __html: answerHtml }}
                                      />

                                      {toPlainText(answerHtml).length > 120 && (
                                        <button
                                          onClick={() => toggleRow(`a-${index}`)}
                                          className="text-primary text-xs mt-1"
                                        >
                                          {expandedRows[`a-${index}`] ? "See less" : "See more"}
                                        </button>
                                      )}

                                    </td>

                                    <td>
                                      <span className="badge badge-xs">
                                        {answer.question.type}
                                      </span>
                                    </td>

                                    <td>
                                      {answer.marksObtained}/{answer.question.credit}
                                    </td>

                                    {/* <td>
                                      {isCorrect ? "Correct" : "Partial"}
                                    </td> */}

                                    {/* <td className="text-xs max-w-[200px]">
                                      {answer.feedback || "-"}
                                    </td> */}

                                  </tr>

                                )

                              })}

                            </tbody>

                          </table>

                        </div>

                      </div>

                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MyResults;
