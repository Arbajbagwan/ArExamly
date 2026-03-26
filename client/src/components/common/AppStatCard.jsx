import { Link } from 'react-router-dom';
import AppCard from './AppCard';

const AppStatCard = ({ title, value, hint, to, tone = 'primary' }) => {
  const toneClass = {
    primary: 'text-primary',
    secondary: 'text-secondary',
    success: 'text-success',
    warning: 'text-warning'
  }[tone] || 'text-primary';

  const body = (
    <AppCard className="h-full hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-base-content/70">{title}</p>
          <p className={`text-4xl font-bold mt-2 ${toneClass}`}>{value}</p>
        </div>
        {/* <div className={`badge badge-outline ${toneClass}`}>Stats</div> */}
      </div>
      {hint && <p className="text-sm text-blue-800 mt-3 link">{hint}</p>}
    </AppCard>
  );

  if (to) return <Link to={to}>{body}</Link>;
  return body;
};

export default AppStatCard;

