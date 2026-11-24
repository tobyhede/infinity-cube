import { createRoot } from 'react-dom/client';
import './tailwind.css';
import { StartPage } from './components/StartPage';

// The desktop shell's Start window (`start.html`, built by
// `desktop-shell-build.config.ts`).
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');
createRoot(rootElement).render(<StartPage />);
