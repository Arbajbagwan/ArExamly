import React, { useState } from 'react';
import API from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';

const BulkUpload = ({ type, onSuccess, subjects = [] }) => {
  const { showAlert } = useAlert();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [subjectId, setSubjectId] = useState('');
  const [elapsedMs, setElapsedMs] = useState(null);
  const [isServerProcessing, setIsServerProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');

  const normalizeUploadResult = (payload = {}) => {
    const created =
      Number(payload.created) ||
      (Array.isArray(payload.createdQuestions) ? payload.createdQuestions.length : 0) ||
      Number(payload.insertedCount) ||
      0;

    const skipped =
      Number(payload.skipped) ||
      (Array.isArray(payload.failedQuestions) ? payload.failedQuestions.length : 0) ||
      (Array.isArray(payload.skippedRows) ? payload.skippedRows.length : 0) ||
      0;

    const total =
      Number(payload.total) ||
      (created + skipped);

    return {
      ...payload,
      created,
      skipped,
      total
    };
  };

  const pollUploadJob = async (endpoint, jobId, startedAt) => {
    const maxPolls = 600; // ~10 minutes at 1s interval
    for (let i = 0; i < maxPolls; i += 1) {
      const delayMs = i < 15 ? 1000 : 2000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const statusRes = await API.get(`${endpoint}/${jobId}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });
      const { status, result: jobResult, error } = statusRes.data || {};

      if (status === 'completed' || status === 'failed') {
        setElapsedMs(Date.now() - startedAt);
        if (status === 'failed') {
          const message = error || jobResult?.message || 'Upload failed';
          throw new Error(message);
        }
        return normalizeUploadResult(jobResult || {});
      }

      setIsServerProcessing(true);
      setProgress(100);
      setStatusText('Upload complete. Processing rows on server...');
    }

    throw new Error('Upload processing timed out. Please check again in a moment.');
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
    setProgress(0);
    setStatusText('');
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    if (!file) return showAlert('Please select a file');

    if (type === 'questions' && !subjectId) {
      return showAlert('Please select a subject');
    }

    setUploading(true);
    setProgress(0);
    setElapsedMs(null);
    setIsServerProcessing(false);
    setStatusText('Uploading file...');
    const startedAt = Date.now();

    const formData = new FormData();
    formData.append('file', file);

    // ✅ THIS LINE IS REQUIRED
    if (type === 'questions') {
      formData.append('subjectId', subjectId);
    }

    const endpoint =
      type === 'questions'
        ? '/questions/bulk-upload'
        : '/users/bulk-upload';

    try {
      const res = await API.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (!evt) return;
          if (typeof evt.total === 'number' && evt.total > 0) {
            const pct = Math.round((evt.loaded * 100) / evt.total);
            if (pct >= 100) {
              setProgress(100);
              setIsServerProcessing(true);
              setStatusText('Upload complete. Processing rows on server...');
            } else {
              setProgress(Math.max(0, Math.min(99, pct)));
              setStatusText(`Uploading file... ${pct}%`);
            }
          } else {
            // total may be unavailable in some browsers/proxy paths
            setProgress((p) => (p < 95 ? p + 10 : p));
            setStatusText('Uploading file...');
          }
        }
      });

      setProgress(100);
      let normalized;

      if (res.data?.jobId) {
        setIsServerProcessing(true);
        setStatusText('Upload complete. Processing rows on server...');
        normalized = await pollUploadJob(endpoint, res.data.jobId, startedAt);
      } else {
        setElapsedMs(Date.now() - startedAt);
        normalized = normalizeUploadResult(res.data);
      }

      setResult(normalized);
      setStatusText('Upload processed. Refreshing list...');
      await showAlert(
        `${normalized?.message || 'Upload completed'}\n` +
        `Created: ${normalized?.created ?? 0}\n` +
        `Skipped: ${normalized?.skipped ?? 0}\n` +
        `Total: ${normalized?.total ?? 0}`,
        { title: 'Upload Result' }
      );
      await Promise.resolve(onSuccess?.(normalized));
      setStatusText('Completed.');
    } catch (err) {
      setStatusText('Upload failed.');
      await showAlert(err.response?.data?.message || err.message || 'Upload failed', { title: 'Upload Failed' });
    } finally {
      setUploading(false);
      setIsServerProcessing(false);
    }
  };

  const TEMPLATE_MAP = {
    questions: {
      filename: 'questions_template.xls',
      csv:
        'type,question,option1,option2,option3,option4,option5,correctOption,credit,topic,difficulty\n' +
        'mcq,What is 2+2?,2,3,4,5,,3,1,Arithmetic,easy\n' +
        'mcq,Is sky blue?,Yes,No,,, ,1,1,General,easy\n' +
        'theory,Explain OOP concepts,,,,,,,5,OOP,medium\n'

    },
    examinees: {
      filename: 'examinees_template.xls',
      csv:
        'firstname,lastname,sbu,group,username,password,email\n' +
        'John,Doe,PPG,Batch-A,john.doe,pass123,john@example.com\n' +
        'Jane,Smith,EPG,Batch-B,jane.smith,pass456,jane@example.com\n',
    },
  };

  const downloadTemplate = () => {
    const tpl = TEMPLATE_MAP[type];

    if (!tpl) {
      showAlert(`Invalid BulkUpload type "${type}". Use "questions" or "examinees".`, { title: 'Invalid Upload Type' });
      return;
    }

    const blob = new Blob([tpl.csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = tpl.filename;
    a.click();

    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-base-100 border border-base-300 rounded-lg p-4">
      {!result && (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-base-content">
                {type === 'questions' ? 'Question Bulk Upload' : 'User Bulk Upload'}
              </h3>
              <p className="text-xs text-base-content/70 mt-1 leading-relaxed">
                Download the template first, fill the required columns, then upload the completed file.
              </p>
            </div>

            <button
              type="button"
              onClick={downloadTemplate}
              className="btn btn-primary btn-sm justify-self-start sm:justify-self-end"
            >
              <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff"><path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z" /></svg>
              Download Template
            </button>
          </div>

          <div className="mt-3 text-[11px] text-base-content/70 space-y-1">
            <p>1. Download the sample template.</p>
            <p>2. Fill the data in the same column format.</p>
            <p>3. Upload the file below.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleUpload} className="space-y-3">

        {/* SUBJECT SELECT */}
        {type === "questions" && (
          <div>
            <label className="text-[11px] text-base-content/70">
              Subject <span className="text-error">*</span>
            </label>

            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              required
              className="select select-bordered select-xs w-full mt-0.5"
            >
              <option value="">Select Subject</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* FILE INPUT */}
        <div className="rounded-lg border border-base-300 bg-base-200/40 p-3">
          <label className="text-[11px] text-base-content/70 block mb-2">
            Upload File
          </label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            disabled={uploading}
            className="file-input file-input-bordered file-input-sm w-full"
          />

          {!file ? (
            <p className="text-xs text-base-content/60 mt-2">
              Accepted formats: `.xlsx`
            </p>
          ) : (
            <div className="mt-2 rounded border border-success/30 bg-success/10 px-3 py-2 text-xs text-success-content">
              Selected file: <span className="font-medium">{file.name}</span>
            </div>
          )}
        </div>

        {/* PROGRESS BAR */}
        {uploading && (
          <div className="w-full bg-base-200 rounded h-2 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${Math.max(progress, 5)}%` }}
            />
          </div>
        )}

        {statusText && (
          <p className="text-xs text-base-content/70">
            {statusText}
          </p>
        )}

        {/* SUBMIT BUTTON */}
        <button
          type="submit"
          disabled={!file || uploading}
          className="btn btn-primary btn-sm w-full"
        >
          {uploading
            ? isServerProcessing
              ? `Processing... (${progress}%)`
              : `Uploading... ${progress}%`
            : type === "questions"
              ? "Upload Questions"
              : "Upload Users"}
        </button>

      </form>

      {/* RESULT */}
      {result && (
        <div
          className={`mt-4 border rounded p-3 text-xs ${result.success
            ? "border-success/40 bg-success/10"
            : "border-error/40 bg-error/10"
            }`}
        >
          <p className="font-medium mb-2">{result.message}</p>

          <div className="grid grid-cols-3 gap-2 text-center">

            <div className="bg-base-100 border border-base-300 rounded p-2">
              <p className="font-semibold text-success text-sm">
                {result.created || 0}
              </p>
              <p className="text-[10px] text-base-content/60">Created</p>
            </div>

            <div className="bg-base-100 border border-base-300 rounded p-2">
              <p className="font-semibold text-warning text-sm">
                {result.skipped || 0}
              </p>
              <p className="text-[10px] text-base-content/60">Skipped</p>
            </div>

            <div className="bg-base-100 border border-base-300 rounded p-2">
              <p className="font-semibold text-info text-sm">
                {result.total || 0}
              </p>
              <p className="text-[10px] text-base-content/60">Total</p>
            </div>

          </div>

          {elapsedMs !== null && (
            <p className="mt-2 text-[11px] text-base-content/70">
              Processed in{" "}
              <span className="font-medium">
                {(elapsedMs / 1000).toFixed(2)}s
              </span>
            </p>
          )}

          {result.tip && (
            <p className="mt-2 text-[11px] text-base-content/70">
              {result.tip}
            </p>
          )}

          {Array.isArray(result.skippedRows) && result.skippedRows.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-medium mb-2">Skipped rows</p>
              <div className="max-h-40 overflow-y-auto rounded border border-base-300 bg-base-100">
                <table className="table table-xs">
                  <thead className="sticky top-0 bg-base-200 z-10">
                    <tr>
                      <th>Row</th>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.skippedRows.map((row, index) => (
                      <tr key={`${row.row}-${row.username}-${index}`}>
                        <td>{row.row}</td>
                        <td>{row.username || '-'}</td>
                        <td>{row.email || '-'}</td>
                        <td>{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.skipped > result.skippedRows.length && (
                <p className="mt-2 text-[11px] text-base-content/70">
                  Showing first {result.skippedRows.length} skipped rows out of {result.skipped}.
                </p>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default BulkUpload;
