import React, { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import { userService } from '../../services/userService';

const AdminDashboard = () => {
  const [superusers, setSuperusers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    firstname: '',
    lastname: '',
    sbu: '',
    group: '',
    username: '',
    email: '',
    password: ''
  });

  useEffect(() => {
    fetchSuperusers();
  }, []);

  const fetchSuperusers = async () => {
    try {
      const data = await userService.getUsers();
      setSuperusers(data.users || []);
    } catch (error) {
      console.error('Failed to fetch superusers:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      firstname: '',
      lastname: '',
      sbu: '',
      group: '',
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
        await userService.createUser({ ...formData, role: 'superuser' });
      }
      closeModal();
      fetchSuperusers();
    } catch (error) {
      alert(error.response?.data?.message || 'Operation failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (user) => {
    setFormData({
      firstname: user.firstname || '',
      lastname: user.lastname || '',
      sbu: user.sbu || '',
      group: user.group || '',
      username: user.username || '',
      email: user.email || '',
      password: ''
    });
    setEditingId(user._id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this Super User?')) return;

    try {
      await userService.deleteUser(id);
      fetchSuperusers();
    } catch (error) {
      alert(error.response?.data?.message || 'Delete failed');
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="flex flex-col h-screen bg-base-200">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex flex-col overflow-hidden p-3">
          <div className="flex flex-col flex-1 min-h-0 max-w-7xl mx-auto w-full">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold">Super Users</h1>
                <p className="text-base-content/70 mt-1">
                  Manage super user accounts
                </p>
              </div>

              <button
                onClick={openCreateModal}
                className="btn btn-primary mt-4 md:mt-0"
              >
                Add Super User
              </button>
            </div>


            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-2 text-xs">

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">Total</p>
                <p className="font-semibold">{superusers.length}</p>
              </div>

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">Active</p>
                <p className="font-semibold text-success">
                  {superusers.filter(u => u.isActive).length}
                </p>
              </div>

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">Inactive</p>
                <p className="font-semibold text-error">
                  {superusers.filter(u => !u.isActive).length}
                </p>
              </div>

            </div>


            {/* Table */}
            <div className="bg-base-100 border border-base-300 rounded flex flex-col flex-1 overflow-hidden">

              <div className="overflow-auto flex-1">

                <table className="table table-xs table-zebra">

                  <thead className="bg-base-200 sticky top-0 z-10">
                    <tr>
                      <th>User</th>
                      <th>Username</th>
                      <th>SBU</th>
                      <th>Group</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody>

                    {superusers.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-12 text-center text-base-content/70">
                          No super users found.
                        </td>
                      </tr>
                    ) : (
                      superusers.map((user) => (
                        <tr key={user._id} className="hover">

                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-xs font-semibold">
                                {user.firstname?.charAt(0)}
                                {user.lastname?.charAt(0)}
                              </div>

                              <div>
                                <p className="font-medium">
                                  {user.firstname} {user.lastname}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="text-base-content/70">
                            @{user.username}
                          </td>

                          <td className="text-base-content/70">
                            {user.sbu || 'N/A'}
                          </td>

                          <td className="text-base-content/70">
                            {user.group || 'N/A'}
                          </td>

                          <td className="text-base-content/70">
                            {user.email || "N/A"}
                          </td>

                          <td>
                            <span
                              className={`badge badge-sm ${user.isActive
                                  ? "badge-success"
                                  : "badge-error"
                                }`}
                            >
                              {user.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>

                          <td className="text-right">

                            <button
                              onClick={() => handleEdit(user)}
                              className="btn btn-ghost btn-xs text-info mr-2"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDelete(user._id)}
                              className="btn btn-ghost btn-xs text-error"
                            >
                              Delete
                            </button>
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
        title={editingId ? "Edit Super User" : "Add Super User"}
        size="medium"
      >

        <form onSubmit={handleSubmit} className="space-y-2 text-sm">

          <div className="grid grid-cols-2 gap-2">

            <div>
              <label className="text-[11px] text-base-content/70">
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
              <label className="text-[11px] text-base-content/70">
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

          <div>
            <label className="text-[11px] text-base-content/70">SBU</label>
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
            <label className="text-[11px] text-base-content/70">Group</label>
            <input
              type="text"
              className="input input-bordered input-xs w-full h-8 mt-0.5"
              value={formData.group}
              onChange={(e) =>
                setFormData({ ...formData, group: e.target.value })
              }
            />
          </div>


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


          <div>
            <label className="text-[11px] text-base-content/70">Email</label>
            <input
              type="email"
              className="input input-bordered input-xs w-full h-8 mt-0.5"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </div>


          <div>
            <label className="text-[11px] text-base-content/70">
              Password<span class="text-error">*</span> {editingId && "(leave blank to keep current)"}
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

      </Modal>

    </div>
  );
};

export default AdminDashboard;
