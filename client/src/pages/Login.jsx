import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import logo from '../assets/aptara.png';

const Login = () => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(credentials.username, credentials.password);

      if (user.role === 'admin') navigate('/admin/dashboard', { replace: true });
      else if (user.role === 'superuser') navigate('/superuser/dashboard', { replace: true });
      else if (user.role === 'examinee') navigate('/examinee/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen hero bg-base-200 p-4">
      <div className="w-full max-w-md">
        <div className="card bg-base-100 border border-base-300 shadow-xl">
          <div className="card-body p-8">
            <div className="text-center mb-6">
              <img src={logo} alt="Aptara" className="h-10 mx-auto mb-3" />
              <h1 className="text-2xl font-bold">The Aptara Talent Benchmark</h1>
              <p className="text-base-content/70 mt-1">Sign in to your account</p>
            </div>

            {error && (
              <div role="alert" className="alert alert-error mb-5 justify-center text-center text-sm py-2">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">
                  <span className="label-text font-medium">Username</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter your username"
                  className="input input-bordered w-full"
                  value={credentials.username}
                  onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label">
                  <span className="label-text font-medium">Password</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    className="input input-bordered w-full pr-12"
                    value={credentials.password}
                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="btn btn-ghost btn-sm absolute inset-y-0 right-1 my-auto px-2 min-h-0 h-8"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn btn-primary w-full">
                {loading ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-base-content/70 text-sm mt-5">
          © 2026 | Aptara Corp | All Rights Reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
