import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const Icon = ({ type }) => {
  if (type === 'dashboard') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-10h8V3h-8v8Z" />
      </svg>
    );
  }
  if (type === 'exams') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 3h8m-7 4h6m-9 14h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z" />
      </svg>
    );
  }
  if (type === 'subjects') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 5h16M4 12h16M4 19h10" />
      </svg>
    );
  }
  if (type === 'questions') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
      </svg>

    );
  }
  if (type === 'examinees') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>

    );
  }
  if (type === 'results') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 19V5m0 14h16M8 15l3-3 2 2 5-5" />
      </svg>
    );
  }
  if (type === 'help') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>

    );
  }
  return null;
};

const Sidebar = () => {
  const { user } = useAuth();

  const getMenuItems = () => {
    switch (user?.role) {
      case 'admin':
        return [
          { path: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
          { path: '/admin/help', label: 'Help', icon: 'help' }
        ];
      case 'superuser':
        return [
          { path: '/superuser/dashboard', label: 'Dashboard', icon: 'dashboard' },
          { path: '/superuser/exams', label: 'Exams', icon: 'exams' },
          { path: '/superuser/subjects', label: 'Subjects', icon: 'subjects' },
          { path: '/superuser/questions', label: 'Questions', icon: 'questions' },
          { path: '/superuser/examinees', label: 'Users', icon: 'examinees' },
          { path: '/superuser/help', label: 'Help', icon: 'help' }
        ];
      case 'examinee':
        return [
          { path: '/examinee/dashboard', label: 'Dashboard', icon: 'dashboard' },
          { path: '/examinee/results', label: 'My Results', icon: 'results' }
        ];
      default:
        return [];
    }
  };

  const menuItems = getMenuItems();

  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 min-h-screen">
      <nav className="p-3 space-y-3">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-100 transition-colors duration-300 ${isActive
                ? 'ring-1 ring-gray-400'
                : ''
              }`
            }
          >
            <Icon type={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
