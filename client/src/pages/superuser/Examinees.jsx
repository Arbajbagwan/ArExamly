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
  const [filters, setFilters] = useState({ search: '', status: '', sbu: '', group: '' });
  const [formData, setFormData] = useState({ firstname: '', lastname: '', sbu: '', group: '', username: '', email: '', password: '' });

  const filteredExaminees = useMemo(() => {
    return examinees.filter((e) => {
      if (
        filters.search &&
        !`${e.firstname} ${e.lastname} ${e.sbu || ''} ${e.group || ''} ${e.username} ${e.email || ''}`.toLowerCase().includes(filters.search.toLowerCase())
      ) return false;

      if (filters.status) {
        if (filters.status === 'active' && !e.isActive) return false;
        if (filters.status === 'inactive' && e.isActive) return false;
      }

      if (filters.sbu && String(e.sbu || '') !== filters.sbu) return false;
      if (filters.group && String(e.group || '') !== filters.group) return false;
      return true;
    });
  }, [examinees, filters]);

  const sbuOptions = useMemo(() => {
    return [...new Set(examinees.map((e) => String(e.sbu || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [examinees]);

  const groupOptions = useMemo(() => {
    return [...new Set(examinees.map((e) => String(e.group || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, [examinees]);

  const resetForm = () => {
    setFormData({ firstname: '', lastname: '', sbu: '', group: '', username: '', email: '', password: '' });
    setEditingId(null);
  };

  const openCreateModal = () => { resetForm(); setShowModal(true); };
  const closeModal = () => { setShowModal(false); resetForm(); };

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
      sbu: examinee.sbu || '',
      group: examinee.group || '',
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

  const selectedUserObjects = filteredExaminees.filter((u) => selectedUsers.includes(u._id));
  const hasActiveSelected = selectedUserObjects.some((u) => u.isActive);
  const hasInactiveSelected = selectedUserObjects.some((u) => !u.isActive);

  if (!isReady) return <Loader />;

  return (
    <div className="flex flex-col h-screen bg-base-200">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden p-3">
          <div className="flex flex-col flex-1 min-h-0 max-w-7xl mx-auto w-full">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold">Users</h1>
                <p className="text-base-content/70 mt-1">Manage examinee accounts</p>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
                <button onClick={() => setShowBulkModal(true)} className="btn btn-outline btn-success"><svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>Upload Users</button>
                <button onClick={openCreateModal} className="btn btn-primary"><svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>Add Users</button>
              </div>
            </div>

            {lastBulkSummary && (
              <div className="mb-4 p-4 rounded-lg border border-info/30 bg-info/10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <p className="text-sm text-info-content">
                  Bulk upload done. Created: <b>{lastBulkSummary.created ?? 0}</b>, Skipped: <b>{lastBulkSummary.skipped ?? 0}</b>, Total: <b>{lastBulkSummary.total ?? 0}</b>. If list is not updated yet, click refresh.
                </p>
                <button
                  onClick={async () => { await refreshExaminees(); setLastBulkSummary(null); }}
                  className="btn btn-info btn-sm text-white"
                >
                  Refresh Users
                </button>
              </div>
            )}

            {/* Filters */}
            <div className="bg-base-100 border border-base-300 rounded px-2 py-2 mb-2">

              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">

                <input
                  type="text"
                  placeholder="Search user..."
                  className="input input-bordered input-xs w-full"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />

                <select
                  className="select select-bordered select-xs w-full"
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                >
                  <option value="">Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>

                <select
                  className="select select-bordered select-xs w-full"
                  value={filters.sbu}
                  onChange={(e) => setFilters({ ...filters, sbu: e.target.value })}
                >
                  <option value="">All SBU</option>
                  {sbuOptions.map((sbu) => (
                    <option key={sbu} value={sbu}>{sbu}</option>
                  ))}
                </select>

                <select
                  className="select select-bordered select-xs w-full"
                  value={filters.group}
                  onChange={(e) => setFilters({ ...filters, group: e.target.value })}
                >
                  <option value="">All Group</option>
                  {groupOptions.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>

                <div className="col-span-2 flex gap-1">
                  {selectedUsers.length > 0 && hasActiveSelected && (
                    <button
                      onClick={handleBulkDelete}
                      className="btn btn-error btn-xs flex-1 text-white"
                    >
                      Deactivate
                    </button>
                  )}

                  {selectedUsers.length > 0 && hasInactiveSelected && (
                    <button
                      onClick={handleBulkActivate}
                      className="btn btn-success btn-xs flex-1 text-white"
                    >
                      Activate
                    </button>
                  )}

                  <button
                    onClick={() => setFilters({ search: "", status: "", sbu: '', group: '' })}
                    className="btn btn-ghost btn-xs flex-1"
                  >
                    Clear
                  </button>
                </div>

              </div>

            </div>

            {/* Filters */}
            <div className="grid grid-cols-3 gap-2 mb-2 text-xs">

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">Total</p>
                <p className="font-semibold">{filteredExaminees.length}</p>
              </div>

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">Active</p>
                <p className="font-semibold text-success">
                  {filteredExaminees.filter(e => e.isActive).length}
                </p>
              </div>

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">Inactive</p>
                <p className="font-semibold text-error">
                  {filteredExaminees.filter(e => !e.isActive).length}
                </p>
              </div>

            </div>

            {/* Examinees Table */}
            <div className="bg-base-100 border border-base-300 rounded flex flex-col flex-1 overflow-hidden">
              <div className="overflow-auto flex-1">
                <table className="table table-xs table-zebra">
                  <thead className="bg-base-200 sticky top-0 z-10">
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={selectedUsers.length === filteredExaminees.length && filteredExaminees.length > 0}
                          onChange={(e) => setSelectedUsers(e.target.checked ? filteredExaminees.map((u) => u._id) : [])}
                        />
                      </th>
                      <th className="text-left text-xs font-semibold uppercase tracking-wider">User</th>
                      <th className="text-left text-xs font-semibold uppercase tracking-wider">Username</th>
                      <th className="text-left text-xs font-semibold uppercase tracking-wider">SBU</th>
                      <th className="text-left text-xs font-semibold uppercase tracking-wider">Group</th>
                      <th className="text-left text-xs font-semibold uppercase tracking-wider">Email</th>
                      <th className="text-left text-xs font-semibold uppercase tracking-wider">Status</th>
                      <th className="text-right text-xs font-semibold uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExaminees.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-12 text-center text-base-content/70">No examinees found. Add your first examinee.</td>
                      </tr>
                    ) : (
                      filteredExaminees.map((examinee) => (
                        <tr key={examinee._id} className="hover">
                          <td>
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm"
                              checked={selectedUsers.includes(examinee._id)}
                              onChange={() => setSelectedUsers((prev) => prev.includes(examinee._id) ? prev.filter((id) => id !== examinee._id) : [...prev, examinee._id])}
                            />
                          </td>
                          <td>
                            <div className="flex items-center">
                              <div className="w-10 h-10 bg-success rounded-full flex items-center justify-center text-white font-semibold">
                                {examinee.firstname?.charAt(0)}{examinee.lastname?.charAt(0)}
                              </div>
                              <div className="ml-4">
                                <p className="font-medium">{examinee.firstname} {examinee.lastname}</p>
                              </div>
                            </div>
                          </td>
                          <td className="text-base-content/70">@{examinee.username}</td>
                          <td className="text-base-content/70">{examinee.sbu || 'N/A'}</td>
                          <td className="text-base-content/70">{examinee.group || 'N/A'}</td>
                          <td className="text-base-content/70">{examinee.email || 'N/A'}</td>
                          <td>
                            <span className={`badge badge-sm ${examinee.isActive ? 'badge-success' : 'badge-error'}`}>
                              {examinee.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="text-right">
                            {examinee.isActive && (
                              <>
                                <button onClick={() => handleEdit(examinee)} className="btn btn-ghost btn-xs text-info mr-2">Edit</button>
                                <button onClick={() => handleDelete(examinee._id)} className="btn btn-ghost btn-xs text-error">Delete</button>
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

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingId ? "Edit Examinee" : "Add Users"}
        size="medium"
      >
        <div className="max-h-[unset] overflow-visible">

          <form onSubmit={handleSubmit} className="space-y-2 text-sm">

            {/* Name Row */}
            <div className="grid grid-cols-2 gap-2">

              <div>
                <label className="text-[11px] font-medium text-base-content/70">
                  First Name<span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered input-xs w-full h-8 mt-0.5"
                  value={formData.firstname}
                  onChange={(e) =>
                    setFormData({ ...formData, firstname: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-base-content/70">
                  Last Name
                </label>
                <input
                  type="text"
                  className="input input-bordered input-xs w-full h-8 mt-0.5"
                  value={formData.lastname}
                  onChange={(e) =>
                    setFormData({ ...formData, lastname: e.target.value })
                  }
                />
              </div>

            </div>

            <div className="grid grid-cols-2 gap-2">

              <div>
                <label className="text-[11px] text-base-content/70">
                  SBU
                </label>
                <input
                  type="text"
                  className="input input-bordered input-xs w-full h-8 mt-0.5"
                  value={formData.sbu}
                  onChange={(e) =>
                    setFormData({ ...formData, sbu: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-[11px] text-base-content/70">
                  Group
                </label>
                <input
                  type="text"
                  className="input input-bordered input-xs w-full h-8 mt-0.5"
                  value={formData.group}
                  onChange={(e) =>
                    setFormData({ ...formData, group: e.target.value })
                  }
                />
              </div>

            </div>

            {/* Username */}
            <div>
              <label className="text-[11px] text-base-content/70">
                Username<span className="text-error">*</span>
              </label>
              <input
                type="text"
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-[11px] text-base-content/70">
                Email
              </label>
              <input
                type="email"
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-[11px] text-base-content/70">
                Password<span className="text-error">*</span> {editingId && "(leave blank to keep current)"}
              </label>
              <input
                type="password"
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required={!editingId}
              />
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

      <Modal isOpen={showBulkModal} onClose={() => setShowBulkModal(false)} title="Upload Users">
        <BulkUpload
          type="examinees"
          onSuccess={async (summary) => {
            const total = Number(summary?.total || 0);
            setLastBulkSummary(summary || null);
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
