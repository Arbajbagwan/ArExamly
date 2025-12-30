module.exports = async function updateExamStatus(exam) {
  const now = new Date();
  const start = exam.startDateTime;
  const end = exam.endDateTime;

  if (!start || !end) return exam;

  let newStatus = exam.status;

  if (now < start) newStatus = 'scheduled';
  else if (now >= start && now <= end) newStatus = 'active';
  else if (now > end) newStatus = 'completed';

  if (newStatus !== exam.status) {
    exam.status = newStatus;
    await exam.save();
  }

  return exam;
};
