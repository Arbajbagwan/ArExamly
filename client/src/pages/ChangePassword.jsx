import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/authService';
import Navbar from '../components/common/Navbar';
import Sidebar from '../components/common/Sidebar';
import { useNavigate } from 'react-router-dom';

const ChangePassword = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPasswords(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Frontend validation
    if (passwords.newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (passwords.newPassword !== passwords.confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword(passwords.currentPassword, passwords.newPassword);
      setSuccess('Password changed successfully! You will be logged out to sign in again.');
      
      // Log out user after a short delay
      setTimeout(() => {
        logout();
        navigate('/login');
      }, 3000);

    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h1 className="text-2xl font-bold text-gray-800 mb-6">Change Password</h1>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                  {success}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    name="currentPassword"
                    value={passwords.currentPassword}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    name="newPassword"
                    value={passwords.newPassword}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    name="confirmNewPassword"
                    value={passwords.confirmNewPassword}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading || success}
                    className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center justify-center"
                  >
                    {loading && (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    )}
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ChangePassword;