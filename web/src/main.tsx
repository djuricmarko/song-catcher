import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';

import App from './App';
import { APP_ROOT } from './api/client';
import { QueueProvider } from './hooks/useQueue';
import { useTheme } from './hooks/useTheme';
import { desktopApp } from './lib/desktop';
import { syncWindowChrome } from './lib/windowChrome';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ThemedToaster() {
  const { preference } = useTheme();
  return <Toaster position="bottom-right" theme={preference} richColors />;
}

syncWindowChrome(desktopApp()?.platform);

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={APP_ROOT || '/'}>
        <QueueProvider>
          <App />
        </QueueProvider>
        <ThemedToaster />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
