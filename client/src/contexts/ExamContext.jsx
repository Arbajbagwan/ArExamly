import { createContext, useContext, useEffect, useRef, useState } from "react";
import { examService } from "../services/examService";
import { questionService } from "../services/questionService";
import { subjectService } from "../services/subjectService";
import { userService } from "../services/userService";

const ExamContext = createContext(null);

export const ExamProvider = ({ children }) => {
  const fetchedRef = useRef(false); // 🔒 StrictMode protection

  // ---------- STATE ----------
  const [exams, setExams] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [examinees, setExaminees] = useState([]);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  // ---------- INDIVIDUAL FETCHERS ----------
  const fetchExams = async () => {
    const res = await examService.getExams();
    setExams(res.exams || []);
  };

  const fetchQuestions = async () => {
    const res = await questionService.getQuestions();
    setQuestions(res.questions || []);
  };

  const fetchSubjects = async () => {
    const res = await subjectService.getSubjects();
    setSubjects(res.subjects || []);
  };

  const fetchExaminees = async () => {
    const res = await userService.getUsers();
    setExaminees(res.users || []);
  };

  // ---------- INITIAL LOAD (ONLY ONCE) ----------
  const fetchAll = async () => {
    try {
      setError(null);

      await Promise.all([
        fetchExams(),
        fetchQuestions(),
        fetchSubjects(),
        fetchExaminees(),
      ]);
    } catch (err) {
      console.error("ExamContext fetch error:", err);
      setError(err);
    } finally {
      setIsReady(true); // 🔑 GUARANTEED loader exit
    }
  };

  useEffect(() => {
    if (fetchedRef.current) return; // 🔒 prevents double fetch in StrictMode
    fetchedRef.current = true;

    fetchAll();
  }, []);

  // ---------- CONTEXT VALUE ----------
  const value = {
    // data
    exams,
    questions,
    subjects,
    examinees,

    // status
    isReady,
    error,

    // refreshers
    refreshAll: fetchAll,
    refreshExams: fetchExams,
    refreshQuestions: fetchQuestions,
    refreshSubjects: fetchSubjects,
    refreshExaminees: fetchExaminees,
  };

  return (
    <ExamContext.Provider value={value}>
      {children}
    </ExamContext.Provider>
  );
};

export const useExamContext = () => {
  const ctx = useContext(ExamContext);
  if (!ctx) {
    throw new Error("useExamContext must be used inside ExamProvider");
  }
  return ctx;
};
