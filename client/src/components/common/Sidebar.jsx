import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const Sidebar = () => {
  const { user } = useAuth();

  const getMenuItems = () => {
    switch (user?.role) {
      case 'admin':
        return [
          { path: '/admin/dashboard', label: 'Dashboard', icon: '📊' }
        ];
      case 'superuser':
        return [
          { path: '/superuser/dashboard', label: 'Dashboard', icon: '📊' },
          { path: '/superuser/exams', label: 'Exams', icon: '📝' },
          { path: '/superuser/subjects', label: 'Subjects', icon: '📚' },
          { path: '/superuser/questions', label: 'Questions', icon: '❓' },
          { path: '/superuser/examinees', label: 'Examinees', icon: '👥' }
        ];
      case 'examinee':
        return [
          { path: '/examinee/dashboard', label: 'Dashboard', icon: '📊' },
          { path: '/examinee/results', label: 'My Results', icon: '📈' }
        ];
      default:
        return [];
    }
  };

  const menuItems = getMenuItems();

  return (
    <aside className="w-64 bg-gray-900 min-h-screen">
      <nav className="p-4 space-y-2">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;