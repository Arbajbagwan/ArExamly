import { useState } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import AppCard from '../../components/common/AppCard';
import { subjectService } from '../../services/subjectService';
import { useExamContext } from '../../contexts/ExamContext';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6'];

const Subjects = () => {
  const { subjects, refreshSubjects, isReady } = useExamContext();
  const [showModal, setShowModal] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', code: '', color: '#3B82F6' });

  const resetForm = () => {
    setFormData({ name: '', description: '', code: '', color: '#3B82F6' });
    setEditingId(null);
  };

  const openCreateModal = () => { resetForm(); setShowModal(true); };
  const closeModal = () => { setShowModal(false); resetForm(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      if (editingId) await subjectService.updateSubject(editingId, formData);
      else await subjectService.createSubject(formData);
      closeModal();
      refreshSubjects();
    } catch (error) {
      alert(error.response?.data?.message || 'Operation failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (subject) => {
    setFormData({
      name: subject.name || '',
      description: subject.description || '',
      code: subject.code || '',
      color: subject.color || '#3B82F6'
    });
    setEditingId(subject._id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this subject?')) return;
    try {
      await subjectService.deleteSubject(id);
      refreshSubjects();
    } catch (error) {
      alert(error.response?.data?.message || 'Delete failed');
    }
  };

  if (!isReady) return <Loader />;

  return (
    <div className="flex flex-col h-screen bg-base-200">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-3">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold">Subjects</h1>
                <p className="text-base-content/70 mt-1">Organize your questions by subject</p>
              </div>
              <button onClick={openCreateModal} className="btn btn-primary mt-4 md:mt-0">Add Subject</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {subjects.length === 0 ? (
                <div className="col-span-full card bg-base-100 rounded-xl shadow-sm border border-base-300 p-12 text-center">
                  <h3 className="text-lg font-semibold mb-2">No Subjects Found</h3>
                  <p className="text-base-content/70 mb-4">Create subjects to organize your questions.</p>
                  <button onClick={openCreateModal} className="btn btn-primary btn-sm">Add Subject</button>
                </div>
              ) : (
                subjects.map((subject) => (
                  <AppCard key={subject._id} className="h-full hover:shadow-md transition-shadow [&_.card-body]:p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: subject.color }}>
                          {subject.code?.substring(0, 2) || subject.name?.substring(0, 2)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{subject.name}</h3>
                          <p className="text-sm text-base-content/70">{subject.code}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-base-content/70 text-xs mb-3 line-clamp-2">{subject.description || 'No description'}</p>
                    <div className="flex items-center text-base-content/70 mb-3">
                      <span className="font-semibold">{subject.questionCount || 0}</span>
                      <span className="ml-1 text-xs">Questions</span>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => handleEdit(subject)} className="btn btn-ghost btn-xs text-info">Edit</button>
                      <button onClick={() => handleDelete(subject._id)} className="btn btn-ghost btn-xs text-error">Delete</button>
                    </div>
                  </AppCard>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingId ? "Edit Subject" : "Add Subject"}
        size="medium"
      >
        <div className="max-h-[unset] overflow-visible">

          <form onSubmit={handleSubmit} className="space-y-2 text-sm">

            {/* Subject Name */}
            <div>
              <label className="text-[11px] font-medium text-base-content/70">
                Subject Name<span className="text-error">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Mathematics"
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>

            {/* Code */}
            <div>
              <label className="text-[11px] text-base-content/70">
                Subject Code
              </label>
              <input
                type="text"
                placeholder="e.g. MATH"
                className="input input-bordered input-xs w-full h-8 mt-0.5 uppercase"
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase()
                  })
                }
                maxLength={5}
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] text-base-content/70">
                Description
              </label>
              <textarea
                rows="2"
                placeholder="Subject description"
                className="textarea textarea-bordered textarea-xs w-full mt-0.5"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            {/* Color Picker */}
            <div>
              <label className="text-[11px] text-base-content/70">
                Color
              </label>

              <div className="flex flex-wrap gap-1 mt-1">

                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-6 h-6 rounded-full border transition-transform hover:scale-110
              ${formData.color === color
                        ? "border-base-content scale-110"
                        : "border-transparent"
                      }`}
                    style={{ backgroundColor: color }}
                    onClick={() =>
                      setFormData({ ...formData, color })
                    }
                  />
                ))}

              </div>
            </div>

            {/* Preview */}
            <div className="p-2 bg-base-200 rounded">

              <p className="text-[11px] text-base-content/60 mb-1">
                Preview
              </p>

              <div className="flex items-center gap-2">

                <div
                  className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-semibold"
                  style={{ backgroundColor: formData.color }}
                >
                  {formData.code?.substring(0, 2) ||
                    formData.name?.substring(0, 2) ||
                    "XX"}
                </div>

                <div className="leading-tight">
                  <p className="text-sm font-medium">
                    {formData.name || "Subject Name"}
                  </p>
                  <p className="text-xs text-base-content/70">
                    {formData.code || "CODE"}
                  </p>
                </div>

              </div>

            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t border-base-300">

              <button
                type="button"
                onClick={closeModal}
                className="btn btn-ghost btn-xs h-7"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={formLoading}
                className="btn btn-primary btn-xs h-7"
              >
                {formLoading && (
                  <span className="loading loading-spinner loading-xs mr-1"></span>
                )}
                {editingId ? "Update" : "Create"}
              </button>

            </div>

          </form>

        </div>
      </Modal>
    </div>
  );
};

export default Subjects;
