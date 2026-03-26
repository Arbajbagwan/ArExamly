// Utility to sync exam status based on current time
module.exports = async function syncExamStatus(exam) {
    const resolveWindow = (e) => {
        if (e.startAt && e.endAt) {
            return { start: new Date(e.startAt), end: new Date(e.endAt) };
        }
        if (e.scheduledDate && e.startTime && e.endTime) {
            const start = new Date(e.scheduledDate);
            const [sh, sm] = String(e.startTime).split(':');
            start.setHours(Number(sh), Number(sm), 0, 0);
            const end = new Date(e.scheduledDate);
            const [eh, em] = String(e.endTime).split(':');
            end.setHours(Number(eh), Number(em), 0, 0);
            return { start, end };
        }
        return { start: null, end: null };
    };

    const { start, end } = resolveWindow(exam);
    if (!start || !end) {
        return exam;
    }

    const now = new Date();

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
