import React, { useState } from 'react';
import API from '../../services/api';

const BulkUpload = ({ type, onSuccess, subjects = [] }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [subjectId, setSubjectId] = useState('');
  const [elapsedMs, setElapsedMs] = useState(null);
  const [isServerProcessing, setIsServerProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
    setProgress(0);
    setStatusText('');
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    if (!file) return alert('Please select a file');

    if (type === 'questions' && !subjectId) {
      return alert('Please select a subject');
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
      setElapsedMs(Date.now() - startedAt);
      setResult(res.data);
      setStatusText('Upload processed. Refreshing list...');
      alert(
        `${res.data?.message || 'Bulk upload completed'}\n` +
        `Created: ${res.data?.created ?? 0}\n` +
        `Skipped: ${res.data?.skipped ?? 0}\n` +
        `Total: ${res.data?.total ?? 0}`
      );
      await Promise.resolve(onSuccess?.(res.data));
      setStatusText('Completed.');
    } catch (err) {
      setStatusText('Upload failed.');
      alert(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setIsServerProcessing(false);
    }
  };

  const TEMPLATE_MAP = {
    questions: {
      filename: 'questions_template.xlsx',
      csv:
        'type,question,option1,option2,option3,option4,option5,correctOption,credit,topic,difficulty\n' +
        'mcq,What is 2+2?,2,3,4,5,,3,1,Arithmetic,easy\n' +
        'mcq,Is sky blue?,Yes,No,,, ,1,1,General,easy\n' +
        'theory,Explain OOP concepts,,,,,,,5,OOP,medium\n'

    },
    examinees: {
      filename: 'examinees_template.xlsx',
      csv:
        'firstname,lastname,username,password,email\n' +
        'John,Doe,john.doe,pass123,john@example.com\n' +
        'Jane,Smith,jane.smith,pass456,jane@example.com\n',
    },
  };

  const downloadTemplate = () => {
    const tpl = TEMPLATE_MAP[type];

    if (!tpl) {
      alert(`Invalid BulkUpload type "${type}". Use "questions" or "examinees".`);
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
    <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
      <h3 className="text-2xl font-bold text-gray-800 mb-6">
        Bulk Upload {type === 'examinees' ? 'Examinees' : 'Questions'}
      </h3>

      <div className="mb-6">
        <button
          onClick={downloadTemplate}
          className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
        >
          Download Template (.xlsx)
        </button>
      </div>

      <form onSubmit={handleUpload} className="space-y-6">
        {type === 'questions' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Subject *
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-lg"
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

        <div>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />
          {file && <p className="mt-2 text-sm text-gray-600">Selected: {file.name}</p>}
        </div>

        {uploading && (
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-500"
              style={{ width: `${Math.max(progress, 5)}%` }}
            />
          </div>
        )}
        {statusText && (
          <p className="text-sm text-gray-600 -mt-3">{statusText}</p>
        )}

        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition transform hover:scale-105"
        >
          {uploading
            ? isServerProcessing
              ? `Upload complete. Processing rows on server... (${progress}%)`
              : `Uploading... ${progress}%`
            : type === 'questions'
              ? 'Upload & Create Questions'
              : 'Upload & Create Users'}

        </button>
      </form>

      {result && (
        <div className={`mt-6 p-6 rounded-xl border-2 ${result.success ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
          <h4 className="font-bold text-lg mb-3">{result.message}</h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-white rounded-lg p-4">
              <p className="text-3xl font-bold text-green-600">{result.created || 0}</p>
              <p className="text-sm text-gray-600">Created</p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <p className="text-3xl font-bold text-yellow-600">{result.skipped || 0}</p>
              <p className="text-sm text-gray-600">Skipped</p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <p className="text-3xl font-bold text-blue-600">{result.total}</p>
              <p className="text-sm text-gray-600">Total Rows</p>
            </div>
          </div>
          {elapsedMs !== null && (
            <p className="mt-3 text-sm text-gray-700">
              Processed in <span className="font-semibold">{(elapsedMs / 1000).toFixed(2)}s</span>
            </p>
          )}
          {result.tip && <p className="mt-4 text-sm text-gray-700">{result.tip}</p>}
        </div>
      )}
    </div>
  );
};

export default BulkUpload;
