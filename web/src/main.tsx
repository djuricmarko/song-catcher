import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';

import App from './App';
import { APP_ROOT } from './api/client';
import { useTheme } from './hooks/useTheme';
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
  return <Toaster position="bottom-right" theme={preference} />;
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={APP_ROOT || '/'}>
        <App />
        <ThemedToaster />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
