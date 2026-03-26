import ExamInterface from '../../components/examinee/ExamInterface';
import ProctoringWrapper from '../../components/examinee/ProctoringWrapper';

const TakeExam = () => {
  const handleViolation = (violation) => {
    console.log("Proctoring violation:", violation);

    // Optional: send to backend
    // API.post('/attempts/log-violation', violation)
  };

  return (
    <div className="min-h-screen bg-base-200">
      <ProctoringWrapper onViolation={handleViolation}>
        <ExamInterface />
      </ProctoringWrapper>
    </div>
  );
};

export default TakeExam;