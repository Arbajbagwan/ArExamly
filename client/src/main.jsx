import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { AlertProvider } from './contexts/AlertContext.jsx'

document.documentElement.setAttribute('data-theme', 'arexamly');

createRoot(document.getElementById('root')).render(
  <AlertProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </AlertProvider>,
)
