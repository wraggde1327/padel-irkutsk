import { useNavigate } from 'react-router-dom';
import { ru } from './i18n/ru';

export function PageHeader({ title, backTo = '/' }: { title: string; backTo?: string }) {
  const navigate = useNavigate();
  return (
    <div className="page-head">
      <button type="button" className="back" onClick={() => navigate(backTo)}>
        ← {ru.register.back}
      </button>
      <div className="title">{title}</div>
    </div>
  );
}
