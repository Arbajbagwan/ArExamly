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
  const [showPasswords, setShowPasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmNewPassword: false
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
    <div className="flex flex-col h-screen bg-base-200">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex items-center justify-center overflow-hidden p-3 bg-gradient-to-br from-base-200 via-base-200 to-base-300">
          <div className="w-full max-w-md">

            {/* Card */}
            <div className="bg-base-100 border border-base-300 rounded-xl shadow-md p-4">

              {/* Header */}
              <div className="text-center mb-3">
                <h1 className="text-xl font-semibold">Change Password</h1>
                <p className="text-xs text-base-content/60">
                  Update your account password
                </p>
              </div>

              <div className="bg-base-100 border border-base-300 rounded p-3">

                {error && (
                  <div className="alert justify-center alert-error py-2 mb-2 text-xs">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="alert justify-center alert-success py-2 mb-2 text-xs">
                    {success}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-2 text-sm">

                  {/* Current Password */}
                  <div>
                    <label className="text-[11px] text-base-content/70">
                      Current Password
                    </label>

                    <div className="relative">
                      <input
                        type={showPasswords.currentPassword ? "text" : "password"}
                        name="currentPassword"
                        value={passwords.currentPassword}
                        onChange={handleInputChange}
                        className="input input-bordered input-xs w-full h-8 mt-0.5 pr-12"
                        required
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowPasswords((p) => ({
                            ...p,
                            currentPassword: !p.currentPassword
                          }))
                        }
                        className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs h-6"
                      >
                        {showPasswords.currentPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>


                  {/* New Password */}
                  <div>
                    <label className="text-[11px] text-base-content/70">
                      New Password
                    </label>

                    <div className="relative">
                      <input
                        type={showPasswords.newPassword ? "text" : "password"}
                        name="newPassword"
                        value={passwords.newPassword}
                        onChange={handleInputChange}
                        className="input input-bordered input-xs w-full h-8 mt-0.5 pr-12"
                        required
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowPasswords((p) => ({
                            ...p,
                            newPassword: !p.newPassword
                          }))
                        }
                        className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs h-6"
                      >
                        {showPasswords.newPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>


                  {/* Confirm Password */}
                  <div>
                    <label className="text-[11px] text-base-content/70">
                      Confirm New Password
                    </label>

                    <div className="relative">
                      <input
                        type={showPasswords.confirmNewPassword ? "text" : "password"}
                        name="confirmNewPassword"
                        value={passwords.confirmNewPassword}
                        onChange={handleInputChange}
                        className="input input-bordered input-xs w-full h-8 mt-0.5 pr-12"
                        required
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowPasswords((p) => ({
                            ...p,
                            confirmNewPassword: !p.confirmNewPassword
                          }))
                        }
                        className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs h-6"
                      >
                        {showPasswords.confirmNewPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>


                  {/* Submit */}
                  <div className="flex justify-end pt-2 border-t border-base-300">

                    <button
                      type="submit"
                      disabled={loading || success}
                      className="btn btn-primary btn-xs h-7"
                    >
                      {loading && (
                        <span className="loading loading-spinner loading-xs mr-1"></span>
                      )}
                      {loading ? "Updating..." : "Update Password"}
                    </button>

                  </div>

                </form>

              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ChangePassword;