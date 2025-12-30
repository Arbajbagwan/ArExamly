// Utility to sync exam status based on current time
module.exports = async function syncExamStatus(exam) {
    if (!exam.scheduledDate || !exam.startTime || !exam.endTime) {
        return exam;
    }

    const now = new Date();

    const start = new Date(exam.scheduledDate);
    const [sh, sm] = exam.startTime.split(':');
    start.setHours(sh, sm, 0, 0);

    const end = new Date(exam.scheduledDate);
    const [eh, em] = exam.endTime.split(':');
    end.setHours(eh, em, 0, 0);

    let newStatus = exam.status;

    if (exam.status !== 'cancelled') {
        if (now < start) newStatus = 'scheduled';
        else if (now >= start && now <= end) newStatus = 'active';
        else if (now > end) newStatus = 'completed';
    }

    if (newStatus !== exam.status) {
        exam.status = newStatus;
        await exam.save({ validateBeforeSave: false });
    }

    return exam;
};
