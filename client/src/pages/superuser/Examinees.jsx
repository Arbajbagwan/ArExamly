import { useState, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import BulkUpload from '../../components/superuser/BulkUpload';
import { userService } from '../../services/userService';
import { useExamContext } from '../../contexts/ExamContext';

const Examinees = () => {
  const { examinees, refreshExaminees, isReady } = useExamContext();
  const [showModal, setShowModal] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [lastBulkSummary, setLastBulkSummary] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    status: ''
  });

  const [formData, setFormData] = useState({
    firstname: '',
    lastname: '',
    username: '',
    email: '',
    password: ''
  });

  const filteredExaminees = useMemo(() => {
    return examinees.filter((e) => {
      // Search filter
      if (
        filters.search &&
        !`${e.firstname} ${e.lastname} ${e.username} ${e.email || ''}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())
      ) {
        return false;
      }

      // Status filter
      if (filters.status) {
        if (filters.status === 'active' && !e.isActive) return false;
        if (filters.status === 'inactive' && e.isActive) return false;
      }

      return true;
    });
  }, [examinees, filters]);

  const resetForm = () => {
    setFormData({
      firstname: '',
      lastname: '',
      username: '',
      email: '',
      password: ''
    });
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      if (editingId) {
        const updateData = { ...formData };
        if (!updateData.password) delete updateData.password;
        await userService.updateUser(editingId, updateData);
      } else {
        await userService.createUser({ ...formData, role: 'examinee' });
      }
      setSelectedUsers([]);
      closeModal();
      refreshExaminees();
    } catch (error) {
      alert(error.response?.data?.message || 'Operation failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (examinee) => {
    setFormData({
      firstname: examinee.firstname || '',
      lastname: examinee.lastname || '',
      username: examinee.username || '',
      email: examinee.email || '',
      password: ''
    });
    setEditingId(examinee._id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this examinee?')) return;

    try {
      await userService.deleteUser(id);
      setSelectedUsers([]);
      refreshExaminees();
    } catch (error) {
      alert(error.response?.data?.message || 'Delete failed');
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedUsers.length} users?`)) return;

    try {
      await userService.bulkDeleteUsers(selectedUsers);
      setSelectedUsers([]);
      refreshExaminees();
    } catch (error) {
      alert(error.response?.data?.message || 'Bulk delete failed');
    }
  };

  const handleBulkActivate = async () => {
    if (!window.confirm(`Activate ${selectedUsers.length} users?`)) return;

    try {
      await userService.bulkActivateUsers(selectedUsers);
      setSelectedUsers([]);
      refreshExaminees();
    } catch (error) {
      alert(error.response?.data?.message || 'Bulk activate failed');
    }
  };

  const selectedUserObjects = filteredExaminees.filter(user =>
    selectedUsers.includes(user._id)
  );

  const hasActiveSelected = selectedUserObjects.some(user => user.isActive);
  const hasInactiveSelected = selectedUserObjects.some(user => !user.isActive);

  if (!isReady) return <Loader />;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Examinees</h1>
                <p className="text-gray-500 mt-1">Manage examinee accounts</p>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-green-600 text-green-600 font-medium rounded-lg hover:bg-green-50 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Bulk Upload
                </button>
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Examinee
                </button>
              </div>
            </div>

            {/* Filter */}
            {lastBulkSummary && (
              <div className="mb-4 p-4 rounded-lg border border-blue-200 bg-blue-50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <p className="text-sm text-blue-800">
                  Bulk upload done. Created: <b>{lastBulkSummary.created ?? 0}</b>, Skipped: <b>{lastBulkSummary.skipped ?? 0}</b>, Total: <b>{lastBulkSummary.total ?? 0}</b>.
                  {' '}If list is not updated yet, click refresh.
                </p>
                <button
                  onClick={async () => {
                    await refreshExaminees();
                    setLastBulkSummary(null);
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  Refresh Users
                </button>
              </div>
            )}

            {/* Filter */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search by name, username, or email..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-full md:w-80 px-4 py-2 border rounded-lg"
                />

                {/* Status Filter */}
                <select
                  className="px-4 py-2 border rounded-lg"
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>

                {/* Clear Filters (same UX as Questions) */}
                {(filters.search || filters.status) && (
                  <button
                    onClick={() =>
                      setFilters({
                        search: '',
                        status: ''
                      })
                    }
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Clear Filters
                  </button>
                )}

                {/* Bulk Actions */}
                {selectedUsers.length > 0 && (
                  <div className="flex gap-3">
                    {hasActiveSelected && (
                      <button
                        onClick={handleBulkDelete}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        De-Activate Selected
                      </button>
                    )}

                    {hasInactiveSelected && (
                      <button
                        onClick={handleBulkActivate}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Activate Selected
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <p className="text-sm text-gray-500">Total Examinees</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{filteredExaminees.length}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-3xl font-bold text-green-600 mt-1">
                  {filteredExaminees.filter(e => e.isActive).length}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <p className="text-sm text-gray-500">Inactive</p>
                <p className="text-3xl font-bold text-red-600 mt-1">
                  {filteredExaminees.filter(e => !e.isActive).length}
                </p>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={
                            selectedUsers.length === filteredExaminees.length &&
                            filteredExaminees.length > 0
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsers(filteredExaminees.map(u => u._id));
                            } else {
                              setSelectedUsers([]);
                            }
                          }}
                        />
                      </th>

                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Username</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredExaminees.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                          No examinees found. Add your first examinee.
                        </td>
                      </tr>
                    ) : (
                      filteredExaminees.map((examinee) => (
                        <tr key={examinee._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(examinee._id)}
                              onChange={() => {
                                setSelectedUsers(prev =>
                                  prev.includes(examinee._id)
                                    ? prev.filter(id => id !== examinee._id)
                                    : [...prev, examinee._id]
                                );
                              }}
                            />
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-semibold">
                                {examinee.firstname?.charAt(0)}{examinee.lastname?.charAt(0)}
                              </div>
                              <div className="ml-4">
                                <p className="font-medium text-gray-800">{examinee.firstname} {examinee.lastname}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">@{examinee.username}</td>
                          <td className="px-6 py-4 text-gray-600">{examinee.email || 'N/A'}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${examinee.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                              }`}>
                              {examinee.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {examinee.isActive && (
                              <>
                                <button
                                  onClick={() => handleEdit(examinee)}
                                  className="text-blue-600 hover:text-blue-800 font-medium mr-4"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(examinee._id)}
                                  className="text-red-600 hover:text-red-800 font-medium"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingId ? 'Edit Examinee' : 'Add Examinee'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.firstname}
                onChange={(e) => setFormData({ ...formData, firstname: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.lastname}
                onChange={(e) => setFormData({ ...formData, lastname: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {editingId && '(leave blank to keep current)'}
            </label>
            <input
              type="password"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required={!editingId}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center"
            >
              {formLoading && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              )}
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        title="Bulk Upload Examinees"
      >
        <BulkUpload
          type="examinees"
          onSuccess={async (summary) => {
            const total = Number(summary?.total || 0);
            setLastBulkSummary(summary || null);
            // For small uploads, refresh immediately; for large uploads, let user refresh manually.
            if (total > 0 && total <= 200) {
              await refreshExaminees();
              setLastBulkSummary(null);
            } else {
              setShowBulkModal(false);
            }
          }}
        />
      </Modal>
    </div>
  );
};

export default Examinees;
