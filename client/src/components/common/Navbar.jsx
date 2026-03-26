import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import logo from '../../assets/aptara.png';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getRoleBadge = () => {
    const roleStyles = {
      admin: 'badge-error',
      superuser: 'badge-info',
      examinee: 'badge-success'
    };

    return (
      <span className={`badge badge-sm uppercase ${roleStyles[user?.role] || 'badge-neutral'}`}>
        {user?.role}
      </span>
    );
  };

  return (
    <nav className="navbar bg-base-100 border-b border-base-300 px-4 md:px-6">
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src={logo}
            alt="Exam Portal Logo"
            className="h-6 object-contain"
          />
        </div>

        <div className="flex items-center gap-3 md:gap-4 ml-auto">
          {getRoleBadge()}

          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="btn btn-ghost btn-sm h-auto min-h-0 px-2"
            >
              <div className="avatar placeholder">
                <div className="bg-primary text-primary-content rounded-full w-10 h-10 flex items-center justify-center leading-none font-semibold">
                  {user?.firstname?.charAt(0)}{user?.lastname?.charAt(0)}
                </div>
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium">
                  {user?.firstname} {user?.lastname}
                </p>
                <p className="text-xs text-base-content/60">@{user?.username}</p>
              </div>
              <svg className="w-4 h-4 text-base-content/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                ></div>
                <div className="absolute right-0 mt-2 w-52 menu bg-base-100 rounded-box shadow-lg border border-base-300 z-20 p-2">
                    <button
                      onClick={() => {
                        navigate('/change-password');
                        setDropdownOpen(false);
                      }}
                      className="btn btn-ghost btn-sm justify-start"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>Change Password</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="btn btn-ghost btn-sm justify-start text-error hover:text-error"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span>Logout</span>
                    </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
